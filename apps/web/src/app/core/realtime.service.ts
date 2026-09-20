/**
 * Socket.IO client wrapper. Applies snapshots monotonically by `seq` (§12.4)
 * and exposes signals for templates. One instance per browser tab.
 *
 * Personal state (`me`) belongs to ONE attempt: a new host-authorized attempt
 * resets it entirely (lock, pin, order, result, life), so nothing from the
 * previous round can block the next one (plan v2, BUG-H). The server also
 * re-issues `me` at every round start, tagged with its `attemptId`; a payload
 * for another attempt is ignored.
 */
import { Injectable, NgZone, signal, computed } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import type { MyLife, MyRoundState, RaceLifeState, RaceSnapshot, SessionSnapshot, SignalColor, HostAction, HostActionPayload } from '@asas/shared';
import { emptyMyRoundState, resolveLife, shouldResetLife, strongerLife } from '@asas/shared';

export type ConnState = 'connecting' | 'connected' | 'disconnected' | 'replaced' | 'unauthorized';

export interface SignalEvent { color: SignalColor; eventId: number; effectiveAt: number; }
export interface EliminatedEvent { eventId: number; count: number; }

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket: Socket | null = null;
  private lastSeq = -1;
  private seenElimination = new Set<number>();
  /** Attempt the life state below belongs to; a new attempt is the ONLY reset. */
  private lifeAttemptId: string | null = null;

  /**
   * Strongest life state ever confirmed for this attempt. Survives release,
   * refresh, locale change, pause/resume and reconnect; cleared only when the
   * host starts a new authorized attempt.
   */
  private readonly lifeFromEvent = signal<MyLife>('unknown');

  /** Set once the phone knows its own participant id, for snapshot matching. */
  readonly myParticipantId = signal<string | null>(null);

  readonly snapshot = signal<SessionSnapshot | null>(null);
  readonly me = signal<MyRoundState | null>(null);
  readonly conn = signal<ConnState>('disconnected');
  readonly lastSignal = signal<SignalEvent | null>(null);
  readonly elimination = signal<EliminatedEvent | null>(null);
  readonly personalEliminated = signal<number | null>(null);
  /** serverTime - Date.now(), smoothed, so countdowns stay in sync (§12.4). */
  readonly clockOffset = signal(0);

  readonly state = computed(() => this.snapshot()?.state ?? null);

  /**
   * Authoritative personal life state for the current attempt. Merges the
   * one-shot `me` event with the snapshot under "eliminated/finished wins".
   * Unknown NEVER resolves to `alive` [secure-coding].
   */
  readonly myLife = computed<MyLife>(() => {
    const fromEvent = this.lifeFromEvent();
    const fromMe = this.me()?.race?.state ?? 'unknown';
    const pid = this.myParticipantId();
    const fromSnap = pid ? this.snapshot()?.race?.players.find((p) => p.participantId === pid)?.state : undefined;
    return resolveLife([fromEvent, fromMe, fromSnap]);
  });

  /** True only when the server has positively confirmed the player is out. */
  readonly amEliminated = computed(() => this.myLife() === 'eliminated');
  readonly amFinished = computed(() => this.myLife() === 'finished');
  /** Movement is allowed only on a positively-known `alive`. */
  readonly canMove = computed(() => this.myLife() === 'alive');

  constructor(private readonly zone: NgZone) {}

  /**
   * `participantId` is required for snapshot-based life recovery: without it a
   * refresh mid-race cannot match the player's own lane and the elimination
   * would appear to vanish.
   */
  connectParticipant(token: string, participantId?: string): void {
    if (participantId) this.myParticipantId.set(participantId);
    this.connect({ token });
  }

  connectDisplay(token: string): void {
    this.connect({ token });
  }

  connectHost(sessionId: string, hostKey: string): void {
    this.connect({ hostKey, sessionId });
  }

  private connect(auth: Record<string, string>): void {
    this.disconnect();
    this.lastSeq = -1;
    this.conn.set('connecting');
    const s = io({ path: '/v1/socket.io', auth, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelayMax: 3000 });
    this.socket = s;
    const run = (fn: () => void) => this.zone.run(fn);
    s.on('connect', () => run(() => this.conn.set('connected')));
    s.on('disconnect', () => run(() => { if (this.conn() === 'connected' || this.conn() === 'connecting') this.conn.set('disconnected'); }));
    s.on('connect_error', () => run(() => { if (this.conn() !== 'replaced' && this.conn() !== 'unauthorized') this.conn.set('disconnected'); }));
    s.on('error', (e: { code?: string }) => run(() => {
      if (e?.code === 'CONTROLLER_REPLACED') { this.conn.set('replaced'); s.disconnect(); }
      else if (e?.code === 'UNAUTHORIZED') { this.conn.set('unauthorized'); s.disconnect(); }
    }));
    s.on('snapshot', (snap: SessionSnapshot) => run(() => {
      if (snap.seq < this.lastSeq) return;
      this.lastSeq = snap.seq;
      const offset = snap.serverTime - Date.now();
      this.clockOffset.set(this.snapshot() ? this.clockOffset() * 0.7 + offset * 0.3 : offset);

      // A new host-authorized attempt is the ONLY path that clears personal state.
      if (shouldResetLife(this.lifeAttemptId, snap.attemptId)) this.resetForAttempt(snap.attemptId);

      // Reconnect recovery: the snapshot carries authoritative life state for
      // every racer, so a refresh mid-race restores the outcome even if the
      // one-shot `me` elimination event was missed entirely.
      this.applyRaceLife(snap.race);
      this.snapshot.set(snap);
    }));
    s.on('race', (ev: { attemptId: string; race: RaceSnapshot }) => run(() => {
      // Lightweight position update (5 Hz): patches the current snapshot only
      // when it belongs to the same attempt, so a late tick never resurrects a
      // finished race on screen.
      const cur = this.snapshot();
      if (!cur || cur.attemptId !== ev.attemptId) return;
      this.applyRaceLife(ev.race);
      this.snapshot.set({ ...cur, race: ev.race });
    }));
    s.on('me', (payload: Partial<MyRoundState> & { eliminated?: boolean; eventId?: number }) => run(() => {
      if (payload.eliminated) {
        // The authoritative outcome is applied FIRST and unconditionally, so it
        // can never be dropped because `me()` or `me().race` was still null
        // (the default after a refresh/reconnect). `seenElimination` gates only
        // the one-shot animation + sound, never the state itself.
        const cur = this.me() ?? emptyMe(this.lifeAttemptId);
        this.me.set({ ...cur, race: { progress: cur.race?.progress ?? 0, state: 'eliminated' } });
        this.lifeFromEvent.set('eliminated');
        if (payload.eventId !== undefined && !this.seenElimination.has(payload.eventId)) {
          this.seenElimination.add(payload.eventId);
          this.personalEliminated.set(payload.eventId);
        }
        return;
      }
      // A payload for a different attempt is stale (or early); the snapshot that
      // introduces the attempt will reset state and the server re-issues `me`.
      const current = this.snapshot()?.attemptId ?? this.lifeAttemptId;
      if (payload.attemptId && current && payload.attemptId !== current) return;
      const merged: MyRoundState = { ...(this.me() ?? emptyMe(this.lifeAttemptId)), ...payload };
      // A server payload must never walk a known outcome back to `alive`.
      const strongest = strongerLife(this.lifeFromEvent(), merged.race?.state ?? 'unknown');
      if (merged.race && strongest !== 'unknown' && merged.race.state !== strongest) {
        merged.race = { ...merged.race, state: strongest as RaceLifeState };
      }
      if (strongest === 'eliminated' || strongest === 'finished') this.lifeFromEvent.set(strongest);
      this.me.set(merged);
    }));
    s.on('signal', (ev: SignalEvent) => run(() => this.lastSignal.set(ev)));
    s.on('eliminated', (ev: EliminatedEvent) => run(() => this.elimination.set(ev)));
  }

  /** Everything personal starts over for a new attempt (BUG-H). */
  private resetForAttempt(attemptId: string | null): void {
    this.lifeAttemptId = attemptId;
    this.lifeFromEvent.set('unknown');
    this.seenElimination.clear();
    this.personalEliminated.set(null);
    this.lastSignal.set(null);
    this.elimination.set(null);
    this.me.set(emptyMe(attemptId));
  }

  /** Merges the player's own lane from a race payload under "never revive". */
  private applyRaceLife(race: RaceSnapshot | null | undefined): void {
    const pid = this.myParticipantId();
    const mine = pid ? race?.players.find((p) => p.participantId === pid) ?? null : null;
    if (!mine) return;
    const strongest = strongerLife(this.lifeFromEvent(), mine.state);
    if (strongest === 'unknown') return;
    this.lifeFromEvent.set(strongest);
    const cur = this.me() ?? emptyMe(this.lifeAttemptId);
    if (cur.race?.state !== strongest || cur.race?.progress !== mine.progress) {
      this.me.set({ ...cur, race: { progress: mine.progress, state: strongest as RaceLifeState } });
    }
    // Restored from a snapshot: show the card, never replay the sound.
    if (strongest === 'eliminated') this.seenElimination.add(-1);
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Server "now" for timers. */
  now(): number { return Date.now() + this.clockOffset(); }

  private emitAck<T>(event: string, body: unknown): Promise<T> {
    return new Promise((resolve) => {
      if (!this.socket) { resolve({ ok: false, error: 'not connected' } as unknown as T); return; }
      this.socket.timeout(4000).emit(event, body, (err: unknown, res: T) => resolve(err ? ({ ok: false, error: 'timeout' } as unknown as T) : res));
    });
  }

  // participant
  setReady(ready: boolean) { return this.emitAck<{ ok: boolean }>('me:ready', { ready }); }
  sendPin(lat: number, lng: number, lock: boolean) { return this.emitAck<{ ok: boolean; state?: MyRoundState; error?: string }>('me:pin', { lat, lng, lock }); }
  sendOrder(order: string[], lock: boolean) { return this.emitAck<{ ok: boolean; state?: MyRoundState; error?: string }>('me:order', { order, lock }); }
  /** Hold heartbeat; the ack carries the player's own progress so the phone track moves at once. */
  sendHold(holding: boolean): void {
    if (!this.socket) return;
    this.socket.emit('me:hold', { holding }, (res: { progress: number; state: RaceLifeState } | null) => {
      if (!res) return;
      this.zone.run(() => {
        const strongest = strongerLife(this.lifeFromEvent(), res.state);
        const state = (strongest === 'unknown' ? res.state : strongest) as RaceLifeState;
        const cur = this.me() ?? emptyMe(this.lifeAttemptId);
        this.me.set({ ...cur, race: { progress: res.progress, state } });
        if (strongest === 'eliminated' || strongest === 'finished') this.lifeFromEvent.set(strongest);
      });
    });
  }

  // host
  hostAction(action: HostAction, payload: HostActionPayload = {}) { return this.emitAck<{ ok: boolean; error?: string }>('host:action', { action, payload }); }
  hostSignal(color: SignalColor) { return this.emitAck<{ ok: boolean; error?: string }>('host:signal', { color }); }
}

export function emptyMe(attemptId: string | null = null): MyRoundState {
  return emptyMyRoundState(attemptId);
}
