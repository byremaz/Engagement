/**
 * Stage-engine tests for the defects fixed by redesign plan v2 (docs/redesign-plan-v2.md §9):
 *  A  race outcomes persisted for every attempt, not only the first one
 *  B  a stale race engine never leaks into a globe/ordering round
 *  E  a scored round can never be counted twice
 *  D  tie-breaks rotate questions; voiding one clears its ordering value
 *  F  restart recovery
 *  G  race ticks do no database work
 *  H  every phone gets a fresh personal state on a new attempt
 * No database, sockets or real timers: see ./support/fakes.ts.
 */
import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SessionRow } from '../src/sessions/sessions.service';
import { RaceController } from '../src/rounds/race.controller';
import { RoundsEventBus, type AttemptEventReason } from '../src/rounds/rounds.events';
import { RoundsService } from '../src/rounds/rounds.service';
import { ParticipationService } from '../src/rounds/participation.service';
import { FakeDb, FakeLiveRuntime, FakeRoundRepo, FakeSessions, FakeStandings, makeSession, type Person } from './support/fakes';

const PEOPLE: Person[] = [
  { id: '00000000-0000-4000-8000-00000000aaaa', number: 1, name: 'Sara', avatar: '🦊' },
  { id: '00000000-0000-4000-8000-00000000bbbb', number: 2, name: 'Omar', avatar: '🐼' },
];

function world(over: Partial<SessionRow> = {}) {
  const session = makeSession(over);
  const sessions: SessionRow[] = [session];
  const db = new FakeDb(sessions, PEOPLE);
  const sessionsSvc = new FakeSessions(db, sessions);
  const repo = new FakeRoundRepo(sessions);
  const standings = new FakeStandings();
  const live = new FakeLiveRuntime();
  const bus = new RoundsEventBus();
  const race = new RaceController(db as never, repo as never, live, bus);
  const rounds = new RoundsService(db as never, sessionsSvc as never, repo as never, standings as never, live, race, bus);
  const participation = new ParticipationService(sessionsSvc as never, repo as never, rounds, race, bus, standings as never);
  const attemptEvents: { attemptId: string; reason: AttemptEventReason }[] = [];
  bus.on('attempt', (_sid, attemptId, reason) => attemptEvents.push({ attemptId, reason }));
  let raceEvents = 0;
  bus.on('race', () => raceEvents++);
  const drain = () => rounds.serial(session.id, async () => undefined);
  const act = (action: Parameters<RoundsService['act']>[1], payload?: Parameters<RoundsService['act']>[2]) => rounds.act(session.id, action, payload);
  return { session, db, sessionsSvc, repo, live, bus, race, rounds, participation, attemptEvents, raceEvents: () => raceEvents, drain, act };
}

describe('Race outcomes survive across attempts (BUG-A)', () => {
  it('persists the scored race after a practice race and closes early when everyone is done', async () => {
    const w = world();
    await w.act('SHOW_INSTRUCTIONS');
    await w.act('START_PRACTICE');
    const practiceId = w.session.current_attempt_id!;
    assert.equal(w.session.state, 'Countdown');
    w.live.fireNext(w.session.id); // countdown → RoundActive, engine created
    await w.drain();
    assert.equal(w.session.state, 'RoundActive');
    w.live.fireNext(w.session.id); // deadline → InputLocked
    await w.drain();
    assert.equal(w.session.state, 'InputLocked');
    assert.equal(w.repo.raceOutcomes.filter((o) => o.attemptId === practiceId).length, PEOPLE.length, 'practice outcomes written');

    await w.act('REVEAL_PRACTICE');
    await w.act('START_GAME');
    const raceId = w.session.current_attempt_id!;
    assert.notEqual(raceId, practiceId);
    assert.equal(w.race.snapshot(w.session.id, raceId), null, 'a prepared round never shows the previous engine');

    await w.act('START_ROUND');
    assert.equal(w.live.get(w.session.id)?.attemptId, raceId, 'runtime belongs to the scored attempt');
    w.live.fireNext(w.session.id); // countdown
    await w.drain();
    const engine = w.live.get(w.session.id)!.engine!;
    // Sara finishes at 30 s of active time, Omar stays alive at 50 %.
    Object.assign(engine.players.get(PEOPLE[0]!.id)!, { state: 'finished', progress: 100, finishActiveMs: 30_000, holding: false });
    Object.assign(engine.players.get(PEOPLE[1]!.id)!, { state: 'alive', progress: 50, holding: false });

    w.live.fireNext(w.session.id); // deadline
    await w.drain();
    const outcomes = w.repo.raceOutcomes.filter((o) => o.attemptId === raceId);
    assert.equal(outcomes.length, PEOPLE.length, 'scored race outcomes are written (was 0 before the fix)');

    await w.act('REVEAL_RESULTS');
    const sara = await w.repo.answerFor(raceId, PEOPLE[0]!.id);
    const omar = await w.repo.answerFor(raceId, PEOPLE[1]!.id);
    assert.equal(Number(sara!.raw_score), 100); // first finisher, v2
    assert.equal(Number(omar!.raw_score), 30); // 60 × 0.5
    assert.equal((sara!.detail as { speed: number }).speed, 20);
    const snap = await w.rounds.snapshot(w.session.id);
    assert.equal(snap.reveal?.type, 'RLGL');
    assert.equal(snap.scoringRuleVersion, '2.0.0');
  });

  it('closes the race as soon as no racer can continue, using the CURRENT attempt id', async () => {
    const w = world();
    await w.act('SHOW_INSTRUCTIONS');
    await w.act('START_PRACTICE');
    w.live.fireNext(w.session.id);
    await w.drain();
    w.live.fireNext(w.session.id);
    await w.drain();
    await w.act('REVEAL_PRACTICE');
    await w.act('START_GAME');
    await w.act('START_ROUND');
    w.live.fireNext(w.session.id);
    await w.drain();
    const engine = w.live.get(w.session.id)!.engine!;
    for (const p of engine.players.values()) Object.assign(p, { state: 'eliminated', holding: false });
    w.live.ticks.get(w.session.id)!();
    await w.drain();
    assert.equal(w.session.state, 'InputLocked', 'tick closed the round without waiting for the deadline');
  });
});

describe('Stale race state never leaks into other games (BUG-B)', () => {
  it('myState() reads the race engine only for a race attempt', async () => {
    const w = world();
    await w.act('SHOW_INSTRUCTIONS');
    await w.act('START_PRACTICE');
    w.live.fireNext(w.session.id);
    await w.drain();
    const raceAttempt = (await w.repo.get(w.session.current_attempt_id!))!;
    const mine = await w.participation.myState(raceAttempt, PEOPLE[0]!.id);
    assert.ok(mine.race, 'race attempt exposes the live race state');
    const geo = await w.repo.create({ sessionId: w.session.id, gameType: 'GEO', roundIndex: 0, contentId: 'EGY', isPractice: false, content: w.session.content.countries.scored[0], durationMs: 25_000 });
    const geoState = await w.participation.myState(geo, PEOPLE[0]!.id);
    assert.equal(geoState.race, null, 'a globe round never carries race life state');
    assert.equal(geoState.attemptId, geo.id);
  });
});

describe('A scored round is never counted twice (BUG-E)', () => {
  it('rejects START_GAME after a scored reveal and sums only the latest attempt per round', async () => {
    const w = world();
    await w.act('SHOW_INSTRUCTIONS');
    await w.act('START_GAME');
    await w.act('START_ROUND');
    w.live.fireNext(w.session.id);
    await w.drain();
    w.live.fireNext(w.session.id);
    await w.drain();
    await w.act('REVEAL_RESULTS');
    await assert.rejects(w.act('START_GAME'), /not allowed after a scored round/);
    // Two revealed attempts for round 0 (a replay after a void of a revealed round): only the latest counts.
    const first = (await w.repo.get(w.session.current_attempt_id!))!;
    await w.act('VOID_ROUND', { reason: 'unfair start' });
    assert.ok(first.voided_at);
    assert.equal(w.session.state, 'Ready');
    const replay = (await w.repo.get(w.session.current_attempt_id!))!;
    assert.equal(replay.round_index, 0);
    assert.equal(replay.attempt_no, 2);
    await w.repo.writeScore(replay.id, PEOPLE[0]!.id, 80, {});
    await w.repo.markRevealed(replay.id);
    const totals = await w.repo.gameRawTotals(w.session.id, 'RLGL');
    assert.equal(totals.get(PEOPLE[0]!.id), 80);
    assert.equal(await w.repo.revealedRoundCount(w.session.id, 'RLGL'), 1);
  });
});

describe('Tie-breaks (BUG-D)', () => {
  it('rotates through the prepared questions and clears the ordering value when voided', async () => {
    const w = world({ state: 'TournamentResults', game_index: 2 });
    const ids = PEOPLE.map((p) => p.id);
    await w.act('START_TIEBREAK', { participantIds: ids });
    const first = (await w.repo.get(w.session.current_attempt_id!))!;
    assert.equal(first.content_id, 'TIE-01');
    assert.ok(first.is_tiebreak);
    w.db.tieBreaks.set(ids[0]!, 4001);
    await w.act('START_ROUND');
    await w.act('VOID_ROUND', { reason: 'phone dropped' });
    assert.equal(w.db.tieBreakClears, 1, 'a voided tie-break stops influencing the ranking');
    const replay = (await w.repo.get(w.session.current_attempt_id!))!;
    assert.equal(replay.content_id, 'TIE-02', 'the replay uses the next unused question');
    assert.deepEqual(replay.tiebreak_participants, ids);
    assert.equal(w.session.state, 'Ready');
  });
});

describe('Restart recovery (BUG-F)', () => {
  it('voids and replays a live race, and pauses a live globe round', async () => {
    const w = world({ state: 'RoundActive', game_index: 0, round_index: 0 });
    const raceAttempt = await w.repo.create({ sessionId: w.session.id, gameType: 'RLGL', roundIndex: 0, contentId: 'RACE-1', isPractice: false, content: w.session.content.races.scored[0], durationMs: 80_000 });
    await w.repo.start(raceAttempt.id, new Date(), new Date(Date.now() + 80_000), 2);
    w.session.current_attempt_id = raceAttempt.id;
    await w.rounds.recoverAfterRestart();
    assert.ok(raceAttempt.voided_at && raceAttempt.interrupted, 'the interrupted race is voided');
    assert.equal(w.session.state, 'Ready');
    assert.notEqual(w.session.current_attempt_id, raceAttempt.id);
    assert.ok(w.sessionsSvc.audits.some((a) => a.action === 'RECOVER_RESTART'));

    const g = world({ state: 'RoundActive', game_index: 1, round_index: 0 });
    const geo = await g.repo.create({ sessionId: g.session.id, gameType: 'GEO', roundIndex: 0, contentId: 'EGY', isPractice: false, content: g.session.content.countries.scored[0], durationMs: 25_000 });
    await g.repo.start(geo.id, new Date(), new Date(Date.now() + 25_000), 2);
    g.session.current_attempt_id = geo.id;
    await g.rounds.recoverAfterRestart();
    assert.equal(g.session.paused, true, 'answers are in the database: the host simply resumes');
    assert.equal(g.session.current_attempt_id, geo.id);
    assert.ok(geo.paused_remaining_ms !== null);
  });
});

describe('Race ticks are cheap (BUG-G)', () => {
  it('emits race position events without touching the database', async () => {
    const w = world();
    await w.act('SHOW_INSTRUCTIONS');
    await w.act('START_PRACTICE');
    w.live.fireNext(w.session.id);
    await w.drain();
    const tick = w.live.ticks.get(w.session.id)!;
    const before = w.db.queryCount;
    for (let i = 0; i < 6; i++) tick();
    await w.drain();
    assert.equal(w.db.queryCount, before, 'no queries per tick');
    assert.ok(w.raceEvents() >= 3, `race events ${w.raceEvents()}`);
  });
});

describe('Fresh personal state per attempt (BUG-H)', () => {
  it('announces ready, countdown and resume so the gateway can re-issue `me`', async () => {
    const w = world();
    await w.act('SHOW_INSTRUCTIONS');
    await w.act('START_GAME');
    await w.act('START_ROUND');
    await w.act('PAUSE');
    await w.act('RESUME');
    assert.deepEqual(w.attemptEvents.map((e) => e.reason), ['ready', 'countdown', 'resume']);
    assert.ok(w.attemptEvents.every((e) => e.attemptId === w.session.current_attempt_id));
  });

  it('resets the podium and standings page when game results open, and steps the podium', async () => {
    const w = world({ state: 'Reveal', game_index: 0, round_index: 2, standings_page: 3, podium_step: 4 });
    await w.act('SHOW_GAME_RESULTS');
    assert.equal(w.session.state, 'GameResults');
    assert.equal(w.session.podium_step, 0);
    assert.equal(w.session.standings_page, 0);
    await w.act('PODIUM_STEP', { step: 3 });
    assert.equal(w.session.podium_step, 3);
    const snap = await w.rounds.snapshot(w.session.id);
    assert.equal(snap.podiumStep, 3);
    assert.equal(snap.displayLang, 'en');
  });
});
