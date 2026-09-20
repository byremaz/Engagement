/**
 * In-memory doubles for RoundsService / RaceController / ParticipationService
 * tests. They implement exactly the surface those services use, so the stage
 * engine can be exercised without PostgreSQL, sockets or real timers.
 */
import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import type { GameType } from '@asas/shared';
import { defaultFrozenContent } from '@asas/shared';
import { LiveRuntime, type LiveAttempt } from '../../src/rounds/live-runtime';
import type { AnswerRow, AttemptRow } from '../../src/rounds/round-repo';
import type { SessionRow } from '../../src/sessions/sessions.service';

let ids = 0;
export const uuid = (): string => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

export interface Person {
  id: string;
  number: number;
  name: string;
  avatar: string;
}

export function makeSession(over: Partial<SessionRow> = {}): SessionRow {
  return {
    id: uuid(),
    join_code: 'TEST01',
    title: 'Test',
    capacity: 100,
    state: 'Lobby',
    join_open: true,
    paused: false,
    game_index: -1,
    round_index: -1,
    ceremony_step: 0,
    standings_page: 0,
    podium_step: 0,
    display_lang: 'en',
    default_participant_lang: 'en',
    signal_mode: 'MANUAL',
    content_frozen: false,
    event_started_at: null,
    created_at: new Date(),
    closed_at: null,
    current_attempt_id: null,
    seq: 0,
    content: defaultFrozenContent(),
    ...over,
  };
}

/** Only the handful of raw SQL statements the services run directly are interpreted. */
export class FakeDb {
  queryCount = 0;
  tieBreaks = new Map<string, number>();
  tieBreakClears = 0;

  constructor(
    readonly sessions: SessionRow[],
    readonly people: Person[],
  ) {}

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
    this.queryCount++;
    const sql = text.replace(/\s+/g, ' ').trim();
    const sessionOf = (id: unknown): SessionRow => {
      const s = this.sessions.find((x) => x.id === id);
      if (!s) throw new NotFoundException('session not found');
      return s;
    };
    const m = /^UPDATE sessions SET (.+), seq = seq \+ 1 WHERE id = \$1$/.exec(sql);
    if (m) {
      const s = sessionOf(params[0]);
      for (const assignment of m[1]!.split(', ')) {
        const [key, ref] = assignment.split(' = ');
        (s as unknown as Record<string, unknown>)[key!.trim()] = params[Number(ref!.trim().slice(1)) - 1];
      }
      s.seq = Number(s.seq) + 1;
      return [];
    }
    if (sql.startsWith('UPDATE sessions SET event_started_at')) {
      const s = sessionOf(params[0]);
      s.event_started_at = new Date();
      s.content_frozen = true;
      return [];
    }
    if (sql.startsWith('SELECT id, name FROM participants')) return this.people.map((p) => ({ id: p.id, name: p.name })) as T[];
    if (sql.startsWith('SELECT id, number, name, avatar FROM participants')) return this.people.map((p) => ({ ...p })) as T[];
    if (sql.startsWith('UPDATE participants SET tie_break = NULL')) {
      this.tieBreakClears++;
      this.tieBreaks.clear();
      return [];
    }
    if (sql.startsWith('UPDATE participants SET tie_break')) {
      this.tieBreaks.set(String(params[0]), Number(params[1]));
      return [];
    }
    if (sql.startsWith('UPDATE participants SET ready')) return [];
    if (sql.startsWith('INSERT INTO signal_events')) return [];
    throw new Error(`FakeDb: unexpected SQL: ${sql}`);
  }

  async one<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
    return (await this.query<T>(text, params))[0] ?? null;
  }

  async tx<T>(fn: (client: FakeDb) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

export class FakeSessions {
  audits: { sessionId: string; action: string; detail: Record<string, unknown> }[] = [];

  constructor(
    readonly db: FakeDb,
    readonly sessions: SessionRow[],
  ) {}

  async getById(id: string): Promise<SessionRow> {
    const s = this.sessions.find((x) => x.id === id);
    if (!s) throw new NotFoundException('session not found');
    return s;
  }

  async counts(): Promise<{ participants: number; ready: number }> {
    return { participants: this.db.people.length, ready: 0 };
  }

  async audit(sessionId: string, action: string, detail: Record<string, unknown>): Promise<void> {
    this.audits.push({ sessionId, action, detail });
  }

  async close(sessionId: string): Promise<SessionRow> {
    const s = await this.getById(sessionId);
    s.state = 'Closed';
    s.closed_at = new Date();
    return s;
  }

  async isActiveController(): Promise<boolean> {
    return true;
  }

  async setReady(): Promise<void> {}
  async setConnected(): Promise<void> {}
}

export class FakeRoundRepo {
  readonly attempts = new Map<string, AttemptRow>();
  readonly answerRows = new Map<string, Map<string, AnswerRow>>();
  readonly raceOutcomes: { attemptId: string; participantId: string; payload: Record<string, unknown> }[] = [];

  constructor(readonly sessions: SessionRow[]) {}

  private row(id: string): AttemptRow {
    const a = this.attempts.get(id);
    if (!a) throw new Error(`no attempt ${id}`);
    return a;
  }

  private bucket(attemptId: string): Map<string, AnswerRow> {
    let m = this.answerRows.get(attemptId);
    if (!m) {
      m = new Map();
      this.answerRows.set(attemptId, m);
    }
    return m;
  }

  private upsert(attemptId: string, participantId: string, patch: Partial<AnswerRow>): AnswerRow {
    const b = this.bucket(attemptId);
    const cur = b.get(participantId) ?? { attempt_id: attemptId, participant_id: participantId, payload: {}, saved_at: null, locked_at: null, raw_score: null, detail: null, time_ms: null };
    const next = { ...cur, ...patch };
    b.set(participantId, next);
    return next;
  }

  async get(id: string): Promise<AttemptRow | null> {
    return this.attempts.get(id) ?? null;
  }

  async create(input: { sessionId: string; gameType: GameType; roundIndex: number; contentId: string; isPractice: boolean; content: unknown; durationMs: number; isTiebreak?: boolean; tiebreakParticipants?: string[] | null; scoringRuleVersion?: string | null }): Promise<AttemptRow> {
    const siblings = [...this.attempts.values()].filter((a) => a.session_id === input.sessionId && a.game_type === input.gameType && a.round_index === input.roundIndex && a.is_practice === input.isPractice);
    const row: AttemptRow = {
      id: uuid(),
      session_id: input.sessionId,
      game_type: input.gameType,
      round_index: input.roundIndex,
      content_id: input.contentId,
      is_practice: input.isPractice,
      attempt_no: siblings.length + 1,
      started_at: null,
      deadline_at: null,
      closed_at: null,
      revealed_at: null,
      voided_at: null,
      void_reason: null,
      seed: 7,
      content: input.content as Record<string, unknown>,
      duration_ms: input.durationMs,
      countdown_ends_at: null,
      paused_remaining_ms: null,
      pause_records: [],
      participant_count: null,
      interrupted: false,
      is_tiebreak: input.isTiebreak ?? false,
      tiebreak_participants: input.tiebreakParticipants ?? null,
      scoring_rule_version: input.scoringRuleVersion ?? null,
    };
    this.attempts.set(row.id, row);
    return row;
  }

  async start(id: string, countdownEndsAt: Date, deadlineAt: Date, participantCount: number): Promise<void> {
    Object.assign(this.row(id), { started_at: new Date(), countdown_ends_at: countdownEndsAt, deadline_at: deadlineAt, participant_count: participantCount });
  }

  async pause(id: string, remainingMs: number): Promise<void> {
    const a = this.row(id);
    a.paused_remaining_ms = remainingMs;
    a.pause_records.push({ pausedAt: new Date().toISOString(), resumedAt: null });
  }

  async resume(id: string, countdownEndsAt: Date, deadlineAt: Date): Promise<void> {
    const a = this.row(id);
    a.paused_remaining_ms = null;
    a.countdown_ends_at = countdownEndsAt;
    a.deadline_at = deadlineAt;
    const last = a.pause_records[a.pause_records.length - 1];
    if (last) last.resumedAt = new Date().toISOString();
  }

  async close(id: string): Promise<void> {
    const a = this.row(id);
    a.closed_at ??= new Date();
  }

  async markRevealed(id: string): Promise<boolean> {
    const a = this.row(id);
    if (a.revealed_at) return false;
    a.revealed_at = new Date();
    return true;
  }

  async void(id: string, reason: string): Promise<void> {
    Object.assign(this.row(id), { voided_at: new Date(), void_reason: reason });
  }

  async markInterrupted(id: string): Promise<void> {
    const a = this.row(id);
    a.interrupted = true;
    a.closed_at ??= new Date();
  }

  async tiebreakCount(sessionId: string): Promise<number> {
    return [...this.attempts.values()].filter((a) => a.session_id === sessionId && a.is_tiebreak).length;
  }

  async liveAttempts(): Promise<(AttemptRow & { session_state: string; session_paused: boolean })[]> {
    const out: (AttemptRow & { session_state: string; session_paused: boolean })[] = [];
    for (const s of this.sessions) {
      if (s.closed_at || !['Countdown', 'RoundActive'].includes(s.state) || !s.current_attempt_id) continue;
      const a = this.attempts.get(s.current_attempt_id);
      if (a) out.push({ ...a, session_state: s.state, session_paused: s.paused });
    }
    return out;
  }

  async answers(attemptId: string): Promise<AnswerRow[]> {
    return [...this.bucket(attemptId).values()];
  }

  async answerFor(attemptId: string, participantId: string): Promise<AnswerRow | null> {
    return this.bucket(attemptId).get(participantId) ?? null;
  }

  async responseCount(attemptId: string): Promise<number> {
    return [...this.bucket(attemptId).values()].filter((a) => a.locked_at).length;
  }

  async save(attemptId: string, participantId: string, payload: unknown): Promise<boolean> {
    if (this.bucket(attemptId).get(participantId)?.locked_at) return false;
    this.upsert(attemptId, participantId, { payload: payload as Record<string, unknown>, saved_at: new Date() });
    return true;
  }

  async lock(attemptId: string, participantId: string, payload: unknown, timeMs: number | null = null): Promise<boolean> {
    if (this.bucket(attemptId).get(participantId)?.locked_at) return false;
    this.upsert(attemptId, participantId, { payload: payload as Record<string, unknown>, saved_at: new Date(), locked_at: new Date(), time_ms: timeMs });
    return true;
  }

  async writeRaceOutcome(attemptId: string, participantId: string, payload: unknown): Promise<void> {
    this.raceOutcomes.push({ attemptId, participantId, payload: payload as Record<string, unknown> });
    this.upsert(attemptId, participantId, { payload: payload as Record<string, unknown>, saved_at: new Date(), locked_at: new Date() });
  }

  async writeScore(attemptId: string, participantId: string, raw: number, detail: unknown): Promise<void> {
    this.upsert(attemptId, participantId, { raw_score: raw.toFixed(3), detail: detail as Record<string, unknown> });
  }

  private latestRevealed(sessionId: string, gameType: GameType): AttemptRow[] {
    const byRound = new Map<number, AttemptRow>();
    for (const a of this.attempts.values()) {
      if (a.session_id !== sessionId || a.game_type !== gameType || a.is_practice || a.is_tiebreak || a.voided_at || !a.revealed_at) continue;
      const cur = byRound.get(a.round_index);
      if (!cur || cur.attempt_no < a.attempt_no) byRound.set(a.round_index, a);
    }
    return [...byRound.values()];
  }

  async gameRawTotals(sessionId: string, gameType: GameType): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const a of this.latestRevealed(sessionId, gameType)) {
      for (const ans of this.bucket(a.id).values()) out.set(ans.participant_id, (out.get(ans.participant_id) ?? 0) + Number(ans.raw_score ?? 0));
    }
    return out;
  }

  async revealedRoundCount(sessionId: string, gameType: GameType): Promise<number> {
    return this.latestRevealed(sessionId, gameType).length;
  }

  async attemptsForExport(): Promise<never[]> {
    return [];
  }
}

export class FakeStandings {
  async gameScores(): Promise<Map<string, number> | null> {
    return null;
  }
  async tournament(): Promise<never[]> {
    return [];
  }
  async forGame(): Promise<never[]> {
    return [];
  }
}

/** Timers are recorded instead of scheduled so a test fires them explicitly. */
export class FakeLiveRuntime extends LiveRuntime {
  timers: { live: LiveAttempt; ms: number; fn: () => void }[] = [];
  readonly ticks = new Map<string, () => void>();

  override after(live: LiveAttempt, ms: number, fn: () => void): void {
    this.timers.push({ live, ms, fn });
  }

  override every(live: LiveAttempt, _ms: number, fn: () => void): void {
    this.ticks.set(live.sessionId, fn);
  }

  override cancelTimers(sessionId: string): void {
    super.cancelTimers(sessionId);
    this.timers = this.timers.filter((t) => t.live.sessionId !== sessionId);
    this.ticks.delete(sessionId);
  }

  /** Fires the earliest pending timer of a session (countdown before deadline, as armed). */
  fireNext(sessionId: string): void {
    const i = this.timers.findIndex((t) => t.live.sessionId === sessionId);
    if (i < 0) throw new Error('no pending timer');
    const [t] = this.timers.splice(i, 1);
    t!.fn();
  }

  pending(sessionId: string): number {
    return this.timers.filter((t) => t.live.sessionId === sessionId).length;
  }
}
