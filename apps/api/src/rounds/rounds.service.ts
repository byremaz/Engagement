/**
 * Stage engine: executes host actions (§4.5), owns timers (§11) and publishes
 * each round's score exactly once (§12.9). Timers only close input.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { GameType, HostAction, HostActionPayload, SessionSnapshot, SessionState } from '@asas/shared';
import { GAME_ORDER, tieBreakValues, type OrderContent } from '@asas/shared';
import { DbService } from '../db/db.service';
import { SessionsService, type SessionRow } from '../sessions/sessions.service';
import { RaceController } from './race.controller';
import { RoundRepo, type AttemptRow } from './round-repo';
import { scoreGeoRound, scoreOrderRound, scoreRaceRound, type RoundScoreResult } from './round-scoring';
import { RoundsEventBus } from './rounds.events';
import { buildSnapshot, gameTypeAt, roundCountFor } from './snapshot';
import { StandingsService } from './standings.service';
import { COUNTDOWN_MS, canTransition } from './transitions';
import { LiveRuntime } from './live-runtime';

@Injectable()
export class RoundsService {
  private readonly log = new Logger(RoundsService.name);
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionsService,
    private readonly repo: RoundRepo,
    private readonly standings: StandingsService,
    private readonly live: LiveRuntime,
    private readonly race: RaceController,
    private readonly bus: RoundsEventBus,
  ) {
    race.attach(this);
  }

  /** Serializes commands per session so two host dashboards cannot interleave (§11). */
  serial<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(sessionId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.locks.set(sessionId, next);
    return next;
  }

  async act(sessionId: string, action: HostAction, payload: HostActionPayload = {}): Promise<SessionSnapshot> {
    return this.serial(sessionId, async () => {
      const s = await this.sessions.getById(sessionId);
      const err = canTransition(action, s.state, s.paused);
      if (err) throw new BadRequestException(err);
      await this.sessions.audit(sessionId, action, payload as Record<string, unknown>);
      await this.dispatch(s, action, payload);
      return this.publish(sessionId);
    });
  }

  private async dispatch(s: SessionRow, action: HostAction, p: HostActionPayload): Promise<void> {
    const attempt = s.current_attempt_id ? await this.repo.get(s.current_attempt_id) : null;
    switch (action) {
      case 'SHOW_INSTRUCTIONS': {
        const gi = s.state === 'Lobby' ? 0 : s.game_index;
        await this.update(s.id, { state: 'Instructions', game_index: gi, round_index: -1, current_attempt_id: null });
        await this.db.query('UPDATE participants SET ready = false WHERE session_id = $1', [s.id]);
        if (!s.event_started_at) await this.db.query('UPDATE sessions SET event_started_at = now(), content_frozen = true WHERE id = $1', [s.id]);
        return;
      }
      case 'START_PRACTICE': {
        const a = await this.prepare(s, gameTypeAt(s.game_index)!, 0, true);
        await this.begin(s, a);
        return;
      }
      case 'START_GAME': {
        const a = await this.prepare(s, gameTypeAt(s.game_index)!, 0, false);
        await this.update(s.id, { state: 'Ready', round_index: 0, current_attempt_id: a.id });
        return;
      }
      case 'START_ROUND':
        if (!attempt) throw new BadRequestException('no prepared round');
        await this.begin(s, attempt);
        return;
      case 'PAUSE': {
        if (!attempt) return;
        const remaining = Math.max(0, (attempt.deadline_at?.getTime() ?? Date.now()) - Date.now());
        this.live.cancelTimers(s.id);
        this.race.onPause(s.id);
        await this.repo.pause(attempt.id, remaining);
        await this.update(s.id, { paused: true });
        return;
      }
      case 'RESUME': {
        if (!attempt) return;
        const now = Date.now();
        const countdownEnds = new Date(now + COUNTDOWN_MS);
        const deadline = new Date(now + COUNTDOWN_MS + (attempt.paused_remaining_ms ?? attempt.duration_ms));
        await this.repo.resume(attempt.id, countdownEnds, deadline);
        await this.update(s.id, { paused: false, state: 'Countdown' });
        this.armTimers(s.id, attempt.id, countdownEnds.getTime(), deadline.getTime(), attempt, true);
        return;
      }
      case 'REVEAL_PRACTICE':
      case 'REVEAL_RESULTS':
        if (!attempt) throw new BadRequestException('no closed round');
        await this.reveal(s, attempt);
        return;
      case 'NEXT_ROUND': {
        const game = gameTypeAt(s.game_index)!;
        const next = attempt?.is_practice ? 0 : s.round_index + 1;
        if (next >= roundCountFor(s, game)) throw new BadRequestException('no more rounds; show game results');
        const a = await this.prepare(s, game, next, false);
        await this.update(s.id, { state: 'Ready', round_index: next, current_attempt_id: a.id });
        return;
      }
      case 'SHOW_GAME_RESULTS':
        await this.update(s.id, { state: 'GameResults', current_attempt_id: null });
        return;
      case 'NEXT_GAME': {
        if (s.game_index + 1 >= GAME_ORDER.length) throw new BadRequestException('no next game; show final results');
        await this.update(s.id, { state: 'Instructions', game_index: s.game_index + 1, round_index: -1, current_attempt_id: null });
        await this.db.query('UPDATE participants SET ready = false WHERE session_id = $1', [s.id]);
        return;
      }
      case 'SHOW_FINAL_RESULTS':
        await this.update(s.id, { state: 'TournamentResults', current_attempt_id: null, ceremony_step: 0 });
        return;
      case 'CEREMONY_STEP':
        await this.update(s.id, { ceremony_step: Math.min(4, Math.max(0, Math.trunc(p.step ?? 0))) });
        return;
      case 'STANDINGS_PAGE':
        await this.update(s.id, { standings_page: Math.min(99, Math.max(0, Math.trunc(p.page ?? 0))) });
        return;
      case 'VOID_ROUND': {
        if (!attempt) throw new BadRequestException('no active round');
        if (!p.reason?.trim()) throw new BadRequestException('a reason is required to void a round');
        this.live.clear(s.id);
        await this.repo.void(attempt.id, p.reason.trim());
        const replay = await this.prepare(s, attempt.game_type, attempt.round_index, attempt.is_practice, attempt.is_tiebreak, attempt.tiebreak_participants);
        await this.update(s.id, { state: attempt.is_practice ? 'Instructions' : 'Ready', paused: false, current_attempt_id: replay.id });
        return;
      }
      case 'START_TIEBREAK': {
        const ids = (p.participantIds ?? []).filter((x) => typeof x === 'string');
        if (ids.length < 2) throw new BadRequestException('a tie-break needs at least two participants');
        const q = s.content.ordering.tieBreaks[0];
        if (!q) throw new BadRequestException('no tie-break content');
        const a = await this.repo.create({ sessionId: s.id, gameType: 'ORDER', roundIndex: 900, contentId: q.id, isPractice: false, content: q, durationMs: q.durationMs, isTiebreak: true, tiebreakParticipants: ids });
        await this.update(s.id, { state: 'Ready', current_attempt_id: a.id });
        return;
      }
      case 'CLOSE_SESSION':
        this.live.clear(s.id);
        await this.sessions.close(s.id);
        return;
      default:
        return;
    }
  }

  private async prepare(s: SessionRow, game: GameType, roundIndex: number, practice: boolean, tiebreak = false, tieIds: string[] | null = null): Promise<AttemptRow> {
    const c = s.content;
    const content = game === 'RLGL' ? (practice ? c.races.practice : c.races.scored[roundIndex])
      : game === 'GEO' ? (practice ? c.countries.practice : c.countries.scored[roundIndex])
      : (practice ? c.ordering.practice : c.ordering.scored[roundIndex]);
    if (!content) throw new BadRequestException('round content missing');
    const id = 'id' in content ? content.id : content.code;
    return this.repo.create({ sessionId: s.id, gameType: game, roundIndex, contentId: id, isPractice: practice, content, durationMs: content.durationMs, isTiebreak: tiebreak, tiebreakParticipants: tieIds });
  }

  /** Start Practice / Start Round: shared 3 s countdown, then the round (§4.5). */
  private async begin(s: SessionRow, a: AttemptRow): Promise<void> {
    const now = Date.now();
    const countdownEnds = now + COUNTDOWN_MS;
    const deadline = countdownEnds + a.duration_ms;
    const n = (await this.sessions.counts(s.id)).participants;
    await this.repo.start(a.id, new Date(countdownEnds), new Date(deadline), n);
    await this.update(s.id, { state: 'Countdown', paused: false, current_attempt_id: a.id });
    this.armTimers(s.id, a.id, countdownEnds, deadline, a, false);
  }

  private armTimers(sessionId: string, attemptId: string, countdownEnds: number, deadline: number, a: AttemptRow, resumed: boolean): void {
    const live = this.live.get(sessionId) ?? this.live.create(sessionId, attemptId, null);
    this.live.after(live, countdownEnds - Date.now(), () => void this.serial(sessionId, async () => {
      const s = await this.sessions.getById(sessionId);
      if (s.current_attempt_id !== attemptId || s.paused) return;
      await this.update(sessionId, { state: 'RoundActive' });
      if (a.game_type === 'RLGL') await this.race.onActive(s, a, live, resumed, deadline);
      await this.publish(sessionId);
    }));
    this.live.after(live, deadline - Date.now(), () => void this.closeRound(sessionId, attemptId));
  }

  /** Timer expiry, all locked, or no racer can continue → InputLocked + "Waiting for the host". */
  async closeRound(sessionId: string, attemptId: string): Promise<void> {
    await this.serial(sessionId, async () => {
      const s = await this.sessions.getById(sessionId);
      if (s.current_attempt_id !== attemptId || s.paused || !['Countdown', 'RoundActive'].includes(s.state)) return;
      await this.race.onClose(sessionId, attemptId);
      this.live.cancelTimers(sessionId);
      await this.repo.close(attemptId);
      await this.update(sessionId, { state: 'InputLocked' });
      await this.publish(sessionId);
    });
  }

  /** Scores and publishes once; a retried Reveal is a no-op (§12.9). */
  private async reveal(s: SessionRow, a: AttemptRow): Promise<void> {
    if (await this.repo.markRevealed(a.id)) {
      const people = await this.db.query<{ id: string; name: string }>(
        'SELECT id, name FROM participants WHERE session_id = $1 AND removed_at IS NULL ORDER BY number', [s.id]);
      const scope = a.tiebreak_participants ? people.filter((p) => a.tiebreak_participants!.includes(p.id)) : people;
      const answers = await this.repo.answers(a.id);
      const r: RoundScoreResult = a.game_type === 'ORDER' ? scoreOrderRound(a.content as unknown as OrderContent, answers, scope)
        : a.game_type === 'GEO' ? scoreGeoRound(a.content as never, answers, scope)
        : scoreRaceRound(answers, scope);
      for (const e of r.entries) await this.repo.writeScore(a.id, e.participantId, a.is_practice ? 0 : e.raw, e.detail);
      if (a.is_tiebreak) {
        const started = a.countdown_ends_at?.getTime() ?? 0;
        const values = tieBreakValues(r.entries.map((e) => ({ participantId: e.participantId, correctPositions: Number(e.detail['correctPositions'] ?? 0), lockedAt: answers.find((x) => x.participant_id === e.participantId)?.locked_at?.getTime() ?? null, roundStartedAt: started })));
        for (const [pid, v] of values) await this.db.query('UPDATE participants SET tie_break = $2 WHERE id = $1', [pid, v]);
      }
      for (const e of r.entries) this.bus.emit('personal', e.participantId, { attemptId: a.id, result: { raw: e.raw, label: e.detail['label'] } });
    }
    await this.update(s.id, { state: a.is_tiebreak ? 'TournamentResults' : 'Reveal' });
  }

  async update(sessionId: string, patch: Partial<Pick<SessionRow, 'state' | 'paused' | 'game_index' | 'round_index' | 'ceremony_step' | 'standings_page' | 'current_attempt_id'>>): Promise<void> {
    const keys = Object.keys(patch) as (keyof typeof patch)[];
    if (!keys.length) return;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    await this.db.query(`UPDATE sessions SET ${sets}, seq = seq + 1 WHERE id = $1`, [sessionId, ...keys.map((k) => patch[k])]);
  }

  async snapshot(sessionId: string): Promise<SessionSnapshot> {
    const s = await this.sessions.getById(sessionId);
    const a = s.current_attempt_id ? await this.repo.get(s.current_attempt_id) : null;
    const counts = await this.sessions.counts(s.id);
    const game = gameTypeAt(s.game_index);
    const showStandings = ['GameResults', 'TournamentResults'].includes(s.state);
    const standings = s.state === 'GameResults' && game ? await this.standings.forGame(s, game)
      : s.state === 'TournamentResults' ? await this.standings.tournament(s) : null;
    const reveal = a && a.revealed_at && !a.voided_at ? await this.revealPayload(s, a) : null;
    return buildSnapshot(s, a, {
      responseCount: a ? await this.repo.responseCount(a.id) : 0,
      participantCount: counts.participants,
      readyCount: counts.ready,
      reveal,
      standings: showStandings ? standings : null,
      race: a?.game_type === 'RLGL' ? this.race.snapshot(s.id) : null,
    });
  }

  private async revealPayload(s: SessionRow, a: AttemptRow): Promise<SessionSnapshot['reveal']> {
    const people = await this.db.query<{ id: string; name: string }>('SELECT id, name FROM participants WHERE session_id = $1 AND removed_at IS NULL', [s.id]);
    const answers = await this.repo.answers(a.id);
    if (a.game_type === 'ORDER') return scoreOrderRound(a.content as unknown as OrderContent, answers, people).reveal;
    if (a.game_type === 'GEO') return scoreGeoRound(a.content as never, answers, people).reveal;
    return scoreRaceRound(answers, people).reveal;
  }

  async publish(sessionId: string): Promise<SessionSnapshot> {
    const snap = await this.snapshot(sessionId);
    this.bus.emit('snapshot', sessionId, snap);
    return snap;
  }

  stateOf(s: SessionRow): SessionState {
    return s.state;
  }
}
