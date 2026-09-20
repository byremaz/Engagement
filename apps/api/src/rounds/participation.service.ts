/**
 * Participant inputs: save/lock pins and orders, race hold input, readiness.
 * Validates identity, stage, coordinates and card IDs; rejects late input
 * using server time only (§12.3, §12.8). Scores are never accepted from clients.
 */
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { MyRoundState, OrderContent, RaceLifeState, RoundResultDetail } from '@asas/shared';
import { GAME_MAX, emptyMyRoundState, lockTimeMs } from '@asas/shared';
import { SessionsService } from '../sessions/sessions.service';
import { RaceController } from './race.controller';
import { RoundRepo, type AttemptRow } from './round-repo';
import { RoundsEventBus } from './rounds.events';
import { RoundsService } from './rounds.service';
import { StandingsService } from './standings.service';

/** Every game awards at most 100 raw points per round (§6.8, §7.5, §8.5). */
const ROUND_RAW_MAX = 100;

@Injectable()
export class ParticipationService {
  private readonly lastInput = new Map<string, number>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly repo: RoundRepo,
    private readonly rounds: RoundsService,
    private readonly race: RaceController,
    private readonly bus: RoundsEventBus,
    private readonly standings: StandingsService,
  ) {}

  /** Basic per-participant rate limit (§12.8): at most one save per 150 ms. */
  private throttle(participantId: string, minMs = 150): void {
    const now = Date.now();
    const last = this.lastInput.get(participantId) ?? 0;
    if (now - last < minMs) throw new BadRequestException('too many inputs');
    this.lastInput.set(participantId, now);
  }

  private async openAttempt(sessionId: string, participantId: string, controllerId: string): Promise<AttemptRow> {
    if (!(await this.sessions.isActiveController(participantId, controllerId))) {
      throw new ForbiddenException('this device is no longer the active controller');
    }
    const s = await this.sessions.getById(sessionId);
    if (s.state !== 'RoundActive' || s.paused || !s.current_attempt_id) throw new BadRequestException('input is closed');
    const a = await this.repo.get(s.current_attempt_id);
    if (!a || a.voided_at || a.closed_at) throw new BadRequestException('input is closed');
    if (a.deadline_at && a.deadline_at.getTime() < Date.now()) throw new BadRequestException('too late');
    if (a.tiebreak_participants && !a.tiebreak_participants.includes(participantId)) throw new ForbiddenException('not in this tie-break');
    return a;
  }

  /** Active round time at this instant, measured on the API clock (plan §7.5). */
  private lockTime(a: AttemptRow): number | null {
    if (!a.deadline_at) return null;
    return lockTimeMs({ deadlineAt: a.deadline_at.getTime(), durationMs: a.duration_ms }, Date.now());
  }

  async savePin(sessionId: string, participantId: string, controllerId: string, lat: number, lng: number, lock: boolean): Promise<MyRoundState> {
    this.throttle(participantId);
    const a = await this.openAttempt(sessionId, participantId, controllerId);
    if (a.game_type !== 'GEO') throw new BadRequestException('not a globe round');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new BadRequestException('invalid coordinates');
    }
    const payload = { pin: { lat, lng } };
    const ok = lock ? await this.repo.lock(a.id, participantId, payload, this.lockTime(a)) : await this.repo.save(a.id, participantId, payload);
    if (!ok) throw new BadRequestException('answer already locked');
    return this.afterInput(sessionId, a, participantId);
  }

  async saveOrder(sessionId: string, participantId: string, controllerId: string, order: string[], lock: boolean): Promise<MyRoundState> {
    this.throttle(participantId);
    const a = await this.openAttempt(sessionId, participantId, controllerId);
    if (a.game_type !== 'ORDER') throw new BadRequestException('not an ordering round');
    const q = a.content as unknown as OrderContent;
    const ids = q.options.map((o) => o.id);
    if (!Array.isArray(order) || order.length !== 4 || new Set(order).size !== 4 || !order.every((id) => ids.includes(id))) {
      throw new BadRequestException('order must contain each of the four card IDs exactly once');
    }
    const ok = lock ? await this.repo.lock(a.id, participantId, { order }, this.lockTime(a)) : await this.repo.save(a.id, participantId, { order });
    if (!ok) throw new BadRequestException('answer already locked');
    return this.afterInput(sessionId, a, participantId);
  }

  private async afterInput(sessionId: string, a: AttemptRow, participantId: string): Promise<MyRoundState> {
    const state = await this.myState(a, participantId);
    if (state.locked) {
      // Everyone registered at round start must lock before the round auto-closes;
      // a late joiner never blocks the room (uses the count captured at start).
      const n = a.participant_count ?? (await this.sessions.counts(sessionId)).participants;
      const locked = await this.repo.responseCount(a.id);
      const expected = a.tiebreak_participants?.length ?? n;
      if (locked >= expected) await this.rounds.closeRound(sessionId, a.id); // all locked → close (§4.5)
      else this.bus.emit('snapshot', sessionId, await this.rounds.snapshot(sessionId));
    }
    return state;
  }

  /** Hold-button heartbeat for the race; ignored outside RoundActive. */
  async raceInput(sessionId: string, participantId: string, controllerId: string, holding: boolean): Promise<MyRoundState['race']> {
    if (!(await this.sessions.isActiveController(participantId, controllerId))) return null;
    const r = this.race.input(sessionId, participantId, holding);
    return r ? { progress: r.progress, state: r.state as RaceLifeState } : null;
  }

  async setReady(sessionId: string, participantId: string, ready: boolean): Promise<void> {
    await this.sessions.setReady(participantId, ready);
    this.bus.emit('snapshot', sessionId, await this.rounds.snapshot(sessionId));
  }

  /** Personal state after reconnect: locked answer, saved draft, race life state, own result (§11). */
  async myState(a: AttemptRow | null, participantId: string): Promise<MyRoundState> {
    if (!a) return emptyMyRoundState(null);
    const row = await this.repo.answerFor(a.id, participantId);
    // Only a RACE attempt may read the live race engine: a stale engine must never
    // leak an old life state into a globe or ordering round (BUG-B).
    const raceSnap = a.game_type === 'RLGL'
      ? this.race.snapshot(a.session_id, a.id)?.players.find((p) => p.participantId === participantId) ?? null
      : null;
    const payload = (row?.payload ?? {}) as { pin?: { lat: number; lng: number }; order?: string[]; progress?: number; state?: RaceLifeState };
    return {
      attemptId: a.id,
      locked: !!row?.locked_at,
      saved: !!row?.saved_at,
      pin: payload.pin ?? null,
      order: payload.order ?? null,
      race: raceSnap ? { progress: raceSnap.progress, state: raceSnap.state }
        : a.game_type === 'RLGL' && payload.state ? { progress: payload.progress ?? 0, state: payload.state } : null,
      result: row?.raw_score !== null && row?.raw_score !== undefined && a.revealed_at
        ? await this.resultBreakdown(a, participantId, Number(row.raw_score), row.detail ?? {})
        : null,
    };
  }

  /**
   * Personal result hierarchy: this round (base + speed) → this game → tournament.
   * Every number is read back from the existing scoring and standings services;
   * no scoring math is duplicated and nothing is invented here (§9.1, §12.5).
   */
  private async resultBreakdown(
    a: AttemptRow,
    participantId: string,
    raw: number,
    detail: Record<string, unknown>,
  ): Promise<NonNullable<MyRoundState['result']>> {
    const { label, positions: _positions, ...rest } = detail as Record<string, unknown> & { label?: string; positions?: unknown };
    const parts = rest as RoundResultDetail;
    const base = { raw, label: String(label ?? ''), roundPoints: Math.round(raw), roundMax: ROUND_RAW_MAX, ...parts };
    if (a.is_practice) return base; // practice contributes to no total
    try {
      const session = await this.sessions.getById(a.session_id);
      const [gameScores, standings, gameRows] = await Promise.all([
        this.standings.gameScores(session, a.game_type),
        this.standings.tournament(session),
        this.standings.forGame(session, a.game_type),
      ]);
      const mine = standings.find((r) => r.participantId === participantId);
      const mineGame = gameRows.find((r) => r.participantId === participantId);
      return {
        ...base,
        gamePoints: gameScores?.get(participantId) ?? 0,
        gameMax: GAME_MAX,
        gameRank: mineGame?.rank ?? 0,
        tournamentTotal: mine?.total ?? 0,
        tournamentRank: mine?.rank ?? 0,
      };
    } catch {
      // The breakdown is additive context: never fail the participant's own state for it.
      return base;
    }
  }
}
