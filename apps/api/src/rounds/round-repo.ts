/**
 * Persistence for round attempts and answers (spec §12.1).
 * All SQL is parameterized; scores are written only by the server.
 */
import { Injectable } from '@nestjs/common';
import type { GameType } from '@asas/shared';
import { DbService } from '../db/db.service';

export interface AttemptRow {
  id: string;
  session_id: string;
  game_type: GameType;
  round_index: number;
  content_id: string;
  is_practice: boolean;
  attempt_no: number;
  started_at: Date | null;
  deadline_at: Date | null;
  closed_at: Date | null;
  revealed_at: Date | null;
  voided_at: Date | null;
  void_reason: string | null;
  seed: number;
  content: Record<string, unknown>;
  duration_ms: number;
  countdown_ends_at: Date | null;
  paused_remaining_ms: number | null;
  pause_records: { pausedAt: string; resumedAt: string | null }[];
  participant_count: number | null;
  interrupted: boolean;
  is_tiebreak: boolean;
  tiebreak_participants: string[] | null;
}

export interface AnswerRow {
  attempt_id: string;
  participant_id: string;
  payload: Record<string, unknown>;
  saved_at: Date | null;
  locked_at: Date | null;
  raw_score: string | null;
  detail: Record<string, unknown> | null;
}

@Injectable()
export class RoundRepo {
  constructor(private readonly db: DbService) {}

  async get(id: string): Promise<AttemptRow | null> {
    return this.db.one<AttemptRow>('SELECT * FROM round_attempts WHERE id = $1', [id]);
  }

  /** Creates the next attempt number for a (game, round, practice) triple. */
  async create(input: {
    sessionId: string;
    gameType: GameType;
    roundIndex: number;
    contentId: string;
    isPractice: boolean;
    content: unknown;
    durationMs: number;
    isTiebreak?: boolean;
    tiebreakParticipants?: string[] | null;
  }): Promise<AttemptRow> {
    const row = await this.db.one<AttemptRow>(
      `INSERT INTO round_attempts
         (session_id, game_type, round_index, content_id, is_practice, attempt_no, content, duration_ms, seed,
          is_tiebreak, tiebreak_participants)
       VALUES ($1, $2, $3, $4, $5,
               COALESCE((SELECT max(attempt_no) FROM round_attempts
                          WHERE session_id = $1 AND game_type = $2 AND round_index = $3 AND is_practice = $5), 0) + 1,
               $6::jsonb, $7, floor(random() * 2147483647)::int, $8, $9::jsonb)
       RETURNING *`,
      [
        input.sessionId,
        input.gameType,
        input.roundIndex,
        input.contentId,
        input.isPractice,
        JSON.stringify(input.content),
        input.durationMs,
        input.isTiebreak ?? false,
        input.tiebreakParticipants ? JSON.stringify(input.tiebreakParticipants) : null,
      ],
    );
    return row!;
  }

  async start(id: string, countdownEndsAt: Date, deadlineAt: Date, participantCount: number): Promise<void> {
    await this.db.query(
      `UPDATE round_attempts SET started_at = now(), countdown_ends_at = $2, deadline_at = $3, participant_count = $4
       WHERE id = $1`,
      [id, countdownEndsAt, deadlineAt, participantCount],
    );
  }

  async pause(id: string, remainingMs: number): Promise<void> {
    await this.db.query(
      `UPDATE round_attempts
         SET paused_remaining_ms = $2,
             pause_records = pause_records || jsonb_build_array(jsonb_build_object('pausedAt', now(), 'resumedAt', null))
       WHERE id = $1`,
      [id, remainingMs],
    );
  }

  async resume(id: string, countdownEndsAt: Date, deadlineAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE round_attempts
         SET paused_remaining_ms = NULL, countdown_ends_at = $2, deadline_at = $3,
             pause_records = (
               SELECT COALESCE(jsonb_agg(CASE WHEN ord = cnt THEN r || jsonb_build_object('resumedAt', now()) ELSE r END), '[]'::jsonb)
               FROM jsonb_array_elements(pause_records) WITH ORDINALITY AS t(r, ord),
                    (SELECT jsonb_array_length(pause_records) AS cnt FROM round_attempts WHERE id = $1) c
             )
       WHERE id = $1`,
      [id, countdownEndsAt, deadlineAt],
    );
  }

  /** Idempotent: closing twice never changes closed_at (§12.9). */
  async close(id: string): Promise<void> {
    await this.db.query('UPDATE round_attempts SET closed_at = COALESCE(closed_at, now()) WHERE id = $1', [id]);
  }

  async markRevealed(id: string): Promise<boolean> {
    const rows = await this.db.query(
      'UPDATE round_attempts SET revealed_at = now() WHERE id = $1 AND revealed_at IS NULL RETURNING id',
      [id],
    );
    return rows.length > 0;
  }

  async void(id: string, reason: string): Promise<void> {
    await this.db.query('UPDATE round_attempts SET voided_at = now(), void_reason = $2 WHERE id = $1', [id, reason]);
  }

  async markInterrupted(id: string): Promise<void> {
    await this.db.query('UPDATE round_attempts SET interrupted = true, closed_at = COALESCE(closed_at, now()) WHERE id = $1', [id]);
  }

  // ------------------------------------------------------------------ answers

  async answers(attemptId: string): Promise<AnswerRow[]> {
    return this.db.query<AnswerRow>('SELECT * FROM answers WHERE attempt_id = $1', [attemptId]);
  }

  async answerFor(attemptId: string, participantId: string): Promise<AnswerRow | null> {
    return this.db.one<AnswerRow>('SELECT * FROM answers WHERE attempt_id = $1 AND participant_id = $2', [
      attemptId,
      participantId,
    ]);
  }

  async responseCount(attemptId: string): Promise<number> {
    const row = await this.db.one<{ n: string }>(
      'SELECT count(*)::text AS n FROM answers WHERE attempt_id = $1 AND locked_at IS NOT NULL',
      [attemptId],
    );
    return Number(row?.n ?? 0);
  }

  /** Saves a draft; refused once the answer is locked (never overwrite newer/locked state, §12.4). */
  async save(attemptId: string, participantId: string, payload: unknown): Promise<boolean> {
    const rows = await this.db.query(
      `INSERT INTO answers (attempt_id, participant_id, payload, saved_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (attempt_id, participant_id)
       DO UPDATE SET payload = EXCLUDED.payload, saved_at = now()
       WHERE answers.locked_at IS NULL
       RETURNING attempt_id`,
      [attemptId, participantId, JSON.stringify(payload)],
    );
    return rows.length > 0;
  }

  async lock(attemptId: string, participantId: string, payload: unknown): Promise<boolean> {
    const rows = await this.db.query(
      `INSERT INTO answers (attempt_id, participant_id, payload, saved_at, locked_at)
       VALUES ($1, $2, $3::jsonb, now(), now())
       ON CONFLICT (attempt_id, participant_id)
       DO UPDATE SET payload = EXCLUDED.payload, saved_at = now(), locked_at = now()
       WHERE answers.locked_at IS NULL
       RETURNING attempt_id`,
      [attemptId, participantId, JSON.stringify(payload)],
    );
    return rows.length > 0;
  }

  /** Race outcome written by the server engine at close; upsert is idempotent. */
  async writeRaceOutcome(attemptId: string, participantId: string, payload: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO answers (attempt_id, participant_id, payload, saved_at, locked_at)
       VALUES ($1, $2, $3::jsonb, now(), now())
       ON CONFLICT (attempt_id, participant_id) DO UPDATE SET payload = EXCLUDED.payload, locked_at = now()`,
      [attemptId, participantId, JSON.stringify(payload)],
    );
  }

  async writeScore(attemptId: string, participantId: string, raw: number, detail: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO answers (attempt_id, participant_id, payload, raw_score, detail)
       VALUES ($1, $2, '{}'::jsonb, $3, $4::jsonb)
       ON CONFLICT (attempt_id, participant_id) DO UPDATE SET raw_score = EXCLUDED.raw_score, detail = EXCLUDED.detail`,
      [attemptId, participantId, raw, JSON.stringify(detail)],
    );
  }

  /** Per-participant raw sums for revealed, non-voided, scored attempts of a game. */
  async gameRawTotals(sessionId: string, gameType: GameType): Promise<Map<string, number>> {
    const rows = await this.db.query<{ participant_id: string; total: string }>(
      `SELECT a.participant_id, COALESCE(sum(a.raw_score), 0)::text AS total
       FROM answers a
       JOIN round_attempts r ON r.id = a.attempt_id
       WHERE r.session_id = $1 AND r.game_type = $2 AND r.is_practice = false AND r.is_tiebreak = false
         AND r.voided_at IS NULL AND r.revealed_at IS NOT NULL
       GROUP BY a.participant_id`,
      [sessionId, gameType],
    );
    return new Map(rows.map((r) => [r.participant_id, Number(r.total)]));
  }

  async revealedRoundCount(sessionId: string, gameType: GameType): Promise<number> {
    const row = await this.db.one<{ n: string }>(
      `SELECT count(*)::text AS n FROM round_attempts
       WHERE session_id = $1 AND game_type = $2 AND is_practice = false AND is_tiebreak = false
         AND voided_at IS NULL AND revealed_at IS NOT NULL`,
      [sessionId, gameType],
    );
    return Number(row?.n ?? 0);
  }

  async attemptsForExport(sessionId: string): Promise<(AttemptRow & { participant_id: string; name: string; number: number; raw_score: string | null; locked_at: Date | null })[]> {
    return this.db.query(
      `SELECT r.*, a.participant_id, p.name, p.number, a.raw_score, a.locked_at
       FROM round_attempts r
       JOIN answers a ON a.attempt_id = r.id
       JOIN participants p ON p.id = a.participant_id
       WHERE r.session_id = $1
       ORDER BY r.game_type, r.round_index, r.attempt_no, p.number`,
      [sessionId],
    );
  }
}
