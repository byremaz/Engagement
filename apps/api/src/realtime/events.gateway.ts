/**
 * Real-time channel for host, display and phones (§12.2, §12.4, §12.6).
 * - Clients authenticate with a signed participant/display token or the host key.
 * - Every state change is broadcast as a full SessionSnapshot with `seq`;
 *   clients ignore snapshots with a lower seq than one already applied.
 * - Host disconnect > 2 s pauses an active round (§11).
 */
import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { HostAction, HostActionPayload } from '@asas/shared';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { ParticipationService } from '../rounds/participation.service';
import { RaceController } from '../rounds/race.controller';
import { RoundRepo } from '../rounds/round-repo';
import { RoundsEventBus } from '../rounds/rounds.events';
import { RoundsService } from '../rounds/rounds.service';
import { safeEqual } from '../sessions/host.guard';
import { SessionsService } from '../sessions/sessions.service';
import { verifyToken } from '../sessions/tokens';

interface Auth {
  role: 'host' | 'display' | 'participant';
  sessionId: string;
  participantId?: string;
  controllerId?: string;
}

const HOST_GRACE_MS = 2000;

@WebSocketGateway({ cors: { origin: true, credentials: true }, path: '/v1/socket.io' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(EventsGateway.name);
  private readonly hostTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: SessionsService,
    private readonly rounds: RoundsService,
    private readonly participation: ParticipationService,
    private readonly race: RaceController,
    private readonly repo: RoundRepo,
    bus: RoundsEventBus,
  ) {
    bus.on('snapshot', (sid, snap) => this.server.to(`s:${sid}`).emit('snapshot', snap));
    bus.on('personal', (pid, payload) => this.server.to(`p:${pid}`).emit('me', payload));
    bus.on('eliminated', (sid, ids, eventId) => {
      this.server.to(`s:${sid}`).emit('eliminated', { eventId, count: ids.length });
      for (const id of ids) this.server.to(`p:${id}`).emit('me', { eliminated: true, eventId });
    });
    bus.on('signal', (sid, color, eventId, effectiveAt) => this.server.to(`s:${sid}`).emit('signal', { color, eventId, effectiveAt }));
  }

  private authOf(client: Socket): Auth | null {
    return (client.data as { auth?: Auth }).auth ?? null;
  }

  async handleConnection(client: Socket): Promise<void> {
    const { token, hostKey, sessionId } = client.handshake.auth as { token?: string; hostKey?: string; sessionId?: string };
    let auth: Auth | null = null;
    if (hostKey && sessionId && safeEqual(hostKey, this.config.hostAccessKey)) {
      auth = { role: 'host', sessionId };
    } else if (token) {
      const claims = verifyToken(token, this.config.tokenSecret);
      if (claims) auth = { role: claims.role, sessionId: claims.sessionId, participantId: claims.participantId, controllerId: claims.controllerId };
    }
    if (!auth) {
      client.emit('error', { code: 'UNAUTHORIZED' });
      client.disconnect(true);
      return;
    }
    // One active controller per identity (§5.1.9): stale controllers are refused.
    if (auth.role === 'participant' && auth.participantId && auth.controllerId) {
      if (!(await this.sessions.isActiveController(auth.participantId, auth.controllerId))) {
        client.emit('error', { code: 'CONTROLLER_REPLACED', message: 'This identity is now controlled from another device.' });
        client.disconnect(true);
        return;
      }
      await this.sessions.setConnected(auth.participantId, true);
      await client.join(`p:${auth.participantId}`);
    }
    if (auth.role === 'host') {
      const t = this.hostTimers.get(auth.sessionId);
      if (t) { clearTimeout(t); this.hostTimers.delete(auth.sessionId); }
      await client.join(`h:${auth.sessionId}`);
    }
    (client.data as { auth?: Auth }).auth = auth;
    await client.join(`s:${auth.sessionId}`);
    try {
      const snap = await this.rounds.snapshot(auth.sessionId);
      client.emit('snapshot', snap);
      if (auth.participantId) {
        const a = snap.attemptId ? await this.repo.get(snap.attemptId) : null;
        client.emit('me', await this.participation.myState(a, auth.participantId));
      }
    } catch (err) {
      this.log.warn(`snapshot on connect failed: ${(err as Error).message}`);
    }
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const auth = this.authOf(client);
    if (!auth) return;
    if (auth.role === 'participant' && auth.participantId) {
      await this.sessions.setConnected(auth.participantId, false);
      // Stop a disconnected racer; absence alone never eliminates (§6.9, §11).
      this.race.input(auth.sessionId, auth.participantId, false);
      void this.rounds.publish(auth.sessionId).catch(() => undefined);
    }
    if (auth.role === 'host') {
      const room = this.server.sockets.adapter.rooms.get(`h:${auth.sessionId}`);
      if (room && room.size > 0) return; // another host dashboard is still connected
      this.hostTimers.set(auth.sessionId, setTimeout(() => void this.autoPause(auth.sessionId), HOST_GRACE_MS));
    }
  }

  private async autoPause(sessionId: string): Promise<void> {
    this.hostTimers.delete(sessionId);
    try {
      const s = await this.sessions.getById(sessionId);
      if (['Countdown', 'RoundActive'].includes(s.state) && !s.paused) {
        await this.sessions.audit(sessionId, 'AUTO_PAUSE_HOST_DISCONNECT', {});
        await this.rounds.act(sessionId, 'PAUSE');
      }
    } catch (err) {
      this.log.warn(`auto-pause failed: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------- host

  @SubscribeMessage('host:action')
  async hostAction(@ConnectedSocket() client: Socket, @MessageBody() body: { action: HostAction; payload?: HostActionPayload }) {
    const auth = this.authOf(client);
    if (auth?.role !== 'host') return { ok: false, error: 'host only' };
    try {
      const snap = await this.rounds.act(auth.sessionId, body.action, body.payload ?? {});
      return { ok: true, seq: snap.seq };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('host:signal')
  async hostSignal(@ConnectedSocket() client: Socket, @MessageBody() body: { color: 'RED' | 'GREEN' }) {
    const auth = this.authOf(client);
    if (auth?.role !== 'host') return { ok: false, error: 'host only' };
    if (body.color !== 'RED' && body.color !== 'GREEN') return { ok: false, error: 'invalid colour' };
    try {
      await this.race.hostSignal(auth.sessionId, body.color);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  // ------------------------------------------------------------ participant

  private participant(client: Socket): Required<Pick<Auth, 'sessionId' | 'participantId' | 'controllerId'>> | null {
    const a = this.authOf(client);
    return a?.role === 'participant' && a.participantId && a.controllerId
      ? { sessionId: a.sessionId, participantId: a.participantId, controllerId: a.controllerId }
      : null;
  }

  @SubscribeMessage('me:ready')
  async ready(@ConnectedSocket() client: Socket, @MessageBody() body: { ready: boolean }) {
    const p = this.participant(client);
    if (!p) return { ok: false };
    await this.participation.setReady(p.sessionId, p.participantId, body.ready === true);
    return { ok: true };
  }

  @SubscribeMessage('me:pin')
  async pin(@ConnectedSocket() client: Socket, @MessageBody() body: { lat: number; lng: number; lock?: boolean }) {
    const p = this.participant(client);
    if (!p) return { ok: false, error: 'not a participant' };
    try {
      return { ok: true, state: await this.participation.savePin(p.sessionId, p.participantId, p.controllerId, Number(body.lat), Number(body.lng), body.lock === true) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  @SubscribeMessage('me:order')
  async order(@ConnectedSocket() client: Socket, @MessageBody() body: { order: string[]; lock?: boolean }) {
    const p = this.participant(client);
    if (!p) return { ok: false, error: 'not a participant' };
    try {
      return { ok: true, state: await this.participation.saveOrder(p.sessionId, p.participantId, p.controllerId, body.order, body.lock === true) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Hold heartbeat (~every 250 ms while holding, and once on release). */
  @SubscribeMessage('me:hold')
  async hold(@ConnectedSocket() client: Socket, @MessageBody() body: { holding: boolean }) {
    const p = this.participant(client);
    if (!p) return null;
    return this.participation.raceInput(p.sessionId, p.participantId, p.controllerId, body.holding === true);
  }
}
