import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { DeviceInfo, ParticipantHostView, SessionState } from '@asas/shared';
import { defaultFrozenContent } from '@asas/shared';
import type { FrozenContent } from '@asas/shared';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { DbService } from '../db/db.service';
import { hashRecoveryCode, newControllerId, randomCode, signToken } from './tokens';

export interface SessionRow {
  id: string;
  join_code: string;
  title: string;
  capacity: number;
  state: SessionState;
  join_open: boolean;
  paused: boolean;
  game_index: number;
  round_index: number;
  ceremony_step: number;
  standings_page: number;
  signal_mode: 'MANUAL' | 'AUTO';
  content_frozen: boolean;
  event_started_at: Date | null;
  created_at: Date;
  closed_at: Date | null;
  current_attempt_id: string | null;
  seq: string | number;
  content: FrozenContent;
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  number: number;
  name: string;
  avatar: string;
  controller_id: string | null;
  device: DeviceInfo;
  ready: boolean;
  connected: boolean;
  is_simulated: boolean;
  joined_at: Date;
}

export interface JoinResult {
  participant: { id: string; number: number; name: string; avatar: string; displayName: string };
  /** Shown once to the participant; only its hash is stored. */
  recoveryCode: string;
  token: string;
}

export interface RestoreResult {
  participant: { id: string; number: number; name: string; avatar: string; displayName: string };
  token: string;
  controllerTransferred: boolean;
}

const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦉', '🐧', '🦄', '🐢', '🐝', '🦋', '🐬', '🦜', '🐨', '🦖', '🐳'];

@Injectable()
export class SessionsService {
  constructor(
    private readonly db: DbService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------- sessions

  async create(title: string, capacity = 100): Promise<SessionRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const joinCode = randomCode(6);
      const row = await this.db.one<SessionRow>(
        `INSERT INTO sessions (join_code, title, capacity, state, content)
         VALUES ($1, $2, $3, 'Lobby', $4::jsonb)
         ON CONFLICT (join_code) DO NOTHING
         RETURNING *`,
        // Immutable copy of the content bank + scoring version, frozen for this session (§10).
        [joinCode, title, capacity, JSON.stringify(defaultFrozenContent())],
      );
      if (row) {
        await this.audit(row.id, 'CREATE_SESSION', { title, capacity });
        return row;
      }
    }
    throw new ConflictException('could not allocate a unique join code');
  }

  async list(cursor: string | undefined, limit: number): Promise<{ items: SessionRow[]; nextCursor: string | null }> {
    const rows = await this.db.query<SessionRow>(
      `SELECT * FROM sessions
       WHERE ($1::timestamptz IS NULL OR created_at < $1::timestamptz)
       ORDER BY created_at DESC
       LIMIT $2`,
      [cursor ? decodeCursor(cursor) : null, limit + 1],
    );
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeCursor(last.created_at) : null };
  }

  async getById(id: string): Promise<SessionRow> {
    const row = await this.db.one<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
    if (!row) throw new NotFoundException('session not found');
    return row;
  }

  async getByJoinCode(code: string): Promise<SessionRow> {
    const row = await this.db.one<SessionRow>('SELECT * FROM sessions WHERE join_code = $1 AND closed_at IS NULL', [
      code.toUpperCase(),
    ]);
    if (!row) throw new NotFoundException('session not found');
    return row;
  }

  async setJoinOpen(sessionId: string, open: boolean): Promise<SessionRow> {
    const row = await this.db.one<SessionRow>('UPDATE sessions SET join_open = $2 WHERE id = $1 RETURNING *', [
      sessionId,
      open,
    ]);
    if (!row) throw new NotFoundException('session not found');
    await this.audit(sessionId, open ? 'OPEN_JOIN' : 'CLOSE_JOIN', {});
    return row;
  }

  async setSignalMode(sessionId: string, mode: 'MANUAL' | 'AUTO'): Promise<SessionRow> {
    const row = await this.db.one<SessionRow>('UPDATE sessions SET signal_mode = $2 WHERE id = $1 RETURNING *', [
      sessionId,
      mode,
    ]);
    if (!row) throw new NotFoundException('session not found');
    await this.audit(sessionId, 'SET_SIGNAL_MODE', { mode });
    return row;
  }

  async close(sessionId: string): Promise<SessionRow> {
    const row = await this.db.one<SessionRow>(
      `UPDATE sessions SET state = 'Closed', closed_at = now(), join_open = false WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    if (!row) throw new NotFoundException('session not found');
    await this.audit(sessionId, 'CLOSE_SESSION', {});
    return row;
  }

  displayToken(sessionId: string): string {
    return signToken({ role: 'display', sessionId }, this.config.tokenSecret);
  }

  // ------------------------------------------------------------ participants

  async join(joinCode: string, name: string, device: DeviceInfo): Promise<JoinResult> {
    const session = await this.getByJoinCode(joinCode);
    if (!session.join_open || session.state === 'Closed') {
      throw new ForbiddenException('joining is closed');
    }
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const recoveryCode = randomCode(8);
    const controllerId = newControllerId();

    const participant = await this.db.tx(async (client) => {
      // Serialize numbering per session so 100 phones joining at once get unique numbers.
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [session.id]);
      const countRes = await client.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM participants WHERE session_id = $1 AND removed_at IS NULL',
        [session.id],
      );
      if (Number(countRes.rows[0]?.n ?? 0) >= session.capacity) {
        throw new ConflictException('session is full');
      }
      const maxRes = await client.query<{ m: number | null }>(
        'SELECT max(number) AS m FROM participants WHERE session_id = $1',
        [session.id],
      );
      const number = (maxRes.rows[0]?.m ?? 0) + 1;
      const avatar = AVATARS[(number - 1) % AVATARS.length] ?? AVATARS[0]!;
      const res = await client.query<ParticipantRow>(
        `INSERT INTO participants (session_id, number, name, avatar, recovery_hash, controller_id, device, device_history, connected)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, true)
         RETURNING *`,
        [
          session.id,
          number,
          cleanName,
          avatar,
          hashRecoveryCode(recoveryCode, session.id),
          controllerId,
          JSON.stringify(device),
          JSON.stringify([{ at: new Date().toISOString(), device }]),
        ],
      );
      return res.rows[0]!;
    });

    const token = signToken(
      { role: 'participant', sessionId: session.id, participantId: participant.id, controllerId },
      this.config.tokenSecret,
    );
    return { participant: await this.publicShape(participant), recoveryCode, token };
  }

  /** Recovery code on another device: transfers control and invalidates the old controller (spec §5.1.8). */
  async restore(joinCode: string, recoveryCode: string, device: DeviceInfo): Promise<RestoreResult> {
    const session = await this.getByJoinCode(joinCode);
    const hash = hashRecoveryCode(recoveryCode, session.id);
    const existing = await this.db.one<ParticipantRow>(
      'SELECT * FROM participants WHERE session_id = $1 AND recovery_hash = $2 AND removed_at IS NULL',
      [session.id, hash],
    );
    if (!existing) throw new UnauthorizedException('invalid recovery code');

    const controllerId = newControllerId();
    const updated = await this.db.one<ParticipantRow>(
      `UPDATE participants
         SET controller_id = $2,
             device = $3::jsonb,
             device_history = device_history || $4::jsonb,
             connected = true
       WHERE id = $1
       RETURNING *`,
      [existing.id, controllerId, JSON.stringify(device), JSON.stringify([{ at: new Date().toISOString(), device }])],
    );
    const token = signToken(
      { role: 'participant', sessionId: session.id, participantId: existing.id, controllerId },
      this.config.tokenSecret,
    );
    return {
      participant: await this.publicShape(updated!),
      token,
      controllerTransferred: existing.controller_id !== null && existing.controller_id !== controllerId,
    };
  }

  async isActiveController(participantId: string, controllerId: string): Promise<boolean> {
    const row = await this.db.one<{ ok: boolean }>(
      'SELECT controller_id = $2 AS ok FROM participants WHERE id = $1 AND removed_at IS NULL',
      [participantId, controllerId],
    );
    return row?.ok === true;
  }

  async roster(sessionId: string): Promise<ParticipantHostView[]> {
    const rows = await this.db.query<ParticipantRow>(
      `SELECT * FROM participants WHERE session_id = $1 AND removed_at IS NULL ORDER BY number`,
      [sessionId],
    );
    const dupes = duplicateNames(rows);
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      name: dupes.has(r.name) ? `${r.name} #${r.number}` : r.name,
      avatar: r.avatar,
      connected: r.connected,
      ready: r.ready,
      device: r.device,
      joinedAt: r.joined_at.toISOString(),
      isSimulated: r.is_simulated,
    }));
  }

  async rename(sessionId: string, participantId: string, name: string): Promise<void> {
    const res = await this.db.query(
      'UPDATE participants SET name = $3 WHERE id = $2 AND session_id = $1 AND removed_at IS NULL RETURNING id',
      [sessionId, participantId, name.trim().replace(/\s+/g, ' ')],
    );
    if (res.length === 0) throw new NotFoundException('participant not found');
    await this.audit(sessionId, 'RENAME_PARTICIPANT', { participantId, name });
  }

  async remove(sessionId: string, participantId: string): Promise<void> {
    const res = await this.db.query(
      'UPDATE participants SET removed_at = now(), controller_id = NULL WHERE id = $2 AND session_id = $1 AND removed_at IS NULL RETURNING id',
      [sessionId, participantId],
    );
    if (res.length === 0) throw new NotFoundException('participant not found');
    await this.audit(sessionId, 'REMOVE_PARTICIPANT', { participantId });
  }

  async setReady(participantId: string, ready: boolean): Promise<void> {
    await this.db.query('UPDATE participants SET ready = $2 WHERE id = $1', [participantId, ready]);
  }

  async setConnected(participantId: string, connected: boolean): Promise<void> {
    await this.db.query('UPDATE participants SET connected = $2 WHERE id = $1', [participantId, connected]);
  }

  async counts(sessionId: string): Promise<{ participants: number; ready: number }> {
    const row = await this.db.one<{ participants: string; ready: string }>(
      `SELECT count(*)::text AS participants, count(*) FILTER (WHERE ready)::text AS ready
       FROM participants WHERE session_id = $1 AND removed_at IS NULL`,
      [sessionId],
    );
    return { participants: Number(row?.participants ?? 0), ready: Number(row?.ready ?? 0) };
  }

  // -------------------------------------------------------------------- misc

  async audit(sessionId: string, action: string, detail: Record<string, unknown>): Promise<void> {
    await this.db.query('INSERT INTO host_audit (session_id, action, detail) VALUES ($1, $2, $3::jsonb)', [
      sessionId,
      action,
      JSON.stringify(detail),
    ]);
  }

  private async publicShape(p: ParticipantRow): Promise<JoinResult['participant']> {
    const dup = await this.db.one<{ n: string }>(
      'SELECT count(*)::text AS n FROM participants WHERE session_id = $1 AND name = $2 AND removed_at IS NULL',
      [p.session_id, p.name],
    );
    const displayName = Number(dup?.n ?? 1) > 1 ? `${p.name} #${p.number}` : p.name;
    return { id: p.id, number: p.number, name: p.name, avatar: p.avatar, displayName };
  }
}

function duplicateNames(rows: { name: string }[]): Set<string> {
  const seen = new Map<string, number>();
  for (const r of rows) seen.set(r.name, (seen.get(r.name) ?? 0) + 1);
  return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
}

function encodeCursor(d: Date): string {
  return Buffer.from(d.toISOString()).toString('base64url');
}

function decodeCursor(c: string): string | null {
  const s = Buffer.from(c, 'base64url').toString('utf8');
  return Number.isNaN(Date.parse(s)) ? null : s;
}
