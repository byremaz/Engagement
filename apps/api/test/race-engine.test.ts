/**
 * Unit tests for the server-authoritative Red Light, Green Light engine (spec §6.4, §6.5, §6.9, §11).
 * Pure in-memory: no database or sockets required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RLGL_RED_TOLERANCE_MS, RLGL_TRACK_LENGTH } from '@asas/shared';
import { RaceEngine } from '../src/games/race-engine';

const T0 = 1_000_000;
/** Phones send hold heartbeats well inside the 500 ms stale-hold window (§6.9). */
const HEARTBEAT_MS = 250;

function engine(ids: string[] = ['a', 'b']): RaceEngine {
  return new RaceEngine(ids, T0);
}

/** Simulates a continuous hold with heartbeats from `from` to `to` inclusive. */
function hold(e: RaceEngine, id: string, from: number, to: number): void {
  for (let t = from; t <= to; t += HEARTBEAT_MS) e.input(id, true, t);
  if ((to - from) % HEARTBEAT_MS !== 0) e.input(id, true, to);
}

describe('RaceEngine signals (§6.2, §6.5)', () => {
  it('starts on RED and ignores repeated colours so tolerance is never restarted', () => {
    const e = engine();
    assert.equal(e.signal.color, 'RED');
    assert.equal(e.setSignal('RED', T0 + 100, 'MANUAL'), null);
    const green = e.setSignal('GREEN', T0 + 200, 'MANUAL');
    assert.ok(green);
    assert.equal(green!.eventId, 2);
    assert.equal(e.signals.length, 2);
  });
});

describe('RaceEngine movement (§6.4)', () => {
  it('moves only while holding on GREEN and finishes at the track length', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0, 'MANUAL');
    // 3 units/s -> 10 s = 30 units
    hold(e, 'a', T0, T0 + 10_000);
    const p = e.players.get('a')!;
    assert.ok(Math.abs(p.progress - 30) < 1e-6, `progress ${p.progress}`);
    // Release: no more progress.
    e.input('a', false, T0 + 10_000);
    e.tick(T0 + 20_000);
    assert.ok(Math.abs(p.progress - 30) < 1e-6);
    // Hold again to the end.
    hold(e, 'a', T0 + 20_000, T0 + 60_000);
    assert.equal(p.state, 'finished');
    assert.equal(p.progress, RLGL_TRACK_LENGTH);
    assert.ok(p.finishedAt !== null);
    assert.equal(e.noRacerCanContinue(), true);
  });

  it('a hold without heartbeats goes stale and stops granting distance (§6.9)', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0, 'MANUAL');
    e.input('a', true, T0);
    e.tick(T0 + 10_000); // 10 s of silence: treated as released, no 30 units awarded
    const p = e.players.get('a')!;
    assert.equal(p.holding, false);
    assert.equal(p.progress, 0);
    assert.equal(p.state, 'alive');
  });

  it('does not grant distance for a hold that started before GREEN became effective', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0 + 5_000, 'AUTO');
    // Press exactly when green becomes effective and hold for 1 s -> 3 units.
    hold(e, 'a', T0 + 5_000, T0 + 6_000);
    assert.ok(Math.abs(e.players.get('a')!.progress - 3) < 1e-6);
  });
});

describe('RaceEngine elimination (§6.4, §6.9)', () => {
  it('eliminates a new press on established RED and reports each victim once', () => {
    const e = engine(['a', 'b']);
    const redAt = T0 + 1_000;
    // Already RED from the start; a fresh press well after tolerance is fatal.
    const ev = e.input('a', true, redAt + RLGL_RED_TOLERANCE_MS + 1);
    assert.ok(ev);
    assert.deepEqual(ev!.participantIds, ['a']);
    assert.equal(e.players.get('a')!.state, 'eliminated');
    assert.equal(e.players.get('a')!.death?.reason, 'new press on red');
    // Further input from an eliminated player is ignored.
    assert.equal(e.input('a', true, redAt + 5_000), null);
    assert.equal(e.eliminations.length, 1);
  });

  it('allows releasing within the shared tolerance window after GREEN -> RED', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0, 'MANUAL');
    const redAt = T0 + 10_000;
    hold(e, 'a', T0, redAt);
    e.setSignal('RED', redAt, 'MANUAL');
    // Heartbeat still holding 100 ms into red: inside tolerance, no death yet.
    assert.equal(e.input('a', true, redAt + 100), null);
    assert.equal(e.players.get('a')!.state, 'alive');
    // Release at 150 ms: safe.
    e.input('a', false, redAt + 150);
    e.tick(redAt + 1_000);
    assert.equal(e.players.get('a')!.state, 'alive');
  });

  it('eliminates a hold that outlasts the red tolerance', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0, 'MANUAL');
    const redAt = T0 + 10_000;
    hold(e, 'a', T0, redAt);
    e.setSignal('RED', redAt, 'MANUAL');
    e.input('a', true, redAt + 50);
    const ev = e.tick(redAt + RLGL_RED_TOLERANCE_MS);
    assert.ok(ev);
    assert.deepEqual(ev!.participantIds, ['a']);
    assert.equal(e.players.get('a')!.death?.reason, 'continued hold on red');
  });

  it('treats a stale hold (no heartbeat > 500 ms) as released rather than as a red violation', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0, 'MANUAL');
    e.input('a', true, T0);
    // Connection drops; no heartbeat for 2 s, then RED.
    e.tick(T0 + 2_000);
    assert.equal(e.players.get('a')!.holding, false);
    e.setSignal('RED', T0 + 2_000, 'MANUAL');
    assert.equal(e.tick(T0 + 5_000), null);
    assert.equal(e.players.get('a')!.state, 'alive');
  });
});

/**
 * The remaining Section 9.9 required scenarios, at the layer that actually
 * owns the outcome. The client-side half (refresh / locale / reconnect never
 * reviving) is proven in `packages/shared/test/life.test.ts`.
 */
describe('Section 9.9 required scenarios', () => {
  it('keeps the player dead when the signal changes again after death', () => {
    const e = engine(['a']);
    // Killed by a fresh press on established red.
    e.input('a', true, T0 + RLGL_RED_TOLERANCE_MS + 1);
    assert.equal(e.players.get('a')!.state, 'eliminated');

    // The race continues: green, red, green again.
    e.setSignal('GREEN', T0 + 2_000, 'MANUAL');
    e.tick(T0 + 3_000);
    e.setSignal('RED', T0 + 4_000, 'MANUAL');
    e.tick(T0 + 5_000);
    e.setSignal('GREEN', T0 + 6_000, 'MANUAL');
    e.tick(T0 + 7_000);

    const p = e.players.get('a')!;
    assert.equal(p.state, 'eliminated', 'a later GREEN must not revive');
    assert.equal(p.progress, 0, 'an eliminated player never gains distance');
    // And the death is still reported exactly once, not re-emitted per signal.
    assert.equal(e.eliminations.length, 1);
  });

  it('holding through green does not revive an already-eliminated player', () => {
    const e = engine(['a']);
    e.input('a', true, T0 + RLGL_RED_TOLERANCE_MS + 1);
    e.setSignal('GREEN', T0 + 2_000, 'MANUAL');
    hold(e, 'a', T0 + 2_000, T0 + 12_000);
    assert.equal(e.players.get('a')!.state, 'eliminated');
    assert.equal(e.players.get('a')!.progress, 0);
  });

  it('a new attempt restores eligibility, and only a new attempt does', () => {
    const dead = engine(['a']);
    dead.input('a', true, T0 + RLGL_RED_TOLERANCE_MS + 1);
    assert.equal(dead.players.get('a')!.state, 'eliminated');

    // A new host-authorized attempt is a NEW engine: the only sanctioned path
    // back to alive (plan §1).
    const fresh = new RaceEngine(['a'], T0 + 100_000);
    assert.equal(fresh.players.get('a')!.state, 'alive');
    assert.equal(fresh.players.get('a')!.progress, 0);
  });

  it('surviving the timeout is a different state from elimination', () => {
    const e = engine(['a', 'b']);
    e.setSignal('GREEN', T0, 'MANUAL');
    // `a` walks a little and stops; `b` presses on red and dies.
    hold(e, 'a', T0, T0 + 2_000);
    e.input('a', false, T0 + 2_000);
    e.setSignal('RED', T0 + 3_000, 'MANUAL');
    e.input('b', true, T0 + 3_000 + RLGL_RED_TOLERANCE_MS + 1);

    const a = e.players.get('a')!;
    const b = e.players.get('b')!;
    assert.equal(a.state, 'alive', 'survivor is not eliminated');
    assert.ok(a.progress > 0, 'survivor keeps their confirmed progress');
    assert.equal(b.state, 'eliminated');
    // A survivor who never reached the line is NOT a finisher either.
    assert.equal(a.finishedAt, null);
  });

  it('the last survivor is not auto-declared a finisher', () => {
    const e = engine(['a', 'b']);
    e.input('b', true, T0 + RLGL_RED_TOLERANCE_MS + 1);
    assert.equal(e.players.get('b')!.state, 'eliminated');
    // One player remains, mid-track: the race continues until they finish or
    // time runs out, so they must not be marked finished here.
    const a = e.players.get('a')!;
    assert.equal(a.state, 'alive');
    assert.equal(a.finishedAt, null);
    assert.equal(e.noRacerCanContinue(), false);
  });
});

describe('RaceEngine pause (§11)', () => {
  it('freezes movement, clears holds and never kills on resume', () => {
    const e = engine(['a']);
    e.setSignal('GREEN', T0, 'MANUAL');
    hold(e, 'a', T0, T0 + 1_000);
    e.setPaused(true, T0 + 1_000);
    const p = e.players.get('a')!;
    const frozen = p.progress;
    assert.ok(Math.abs(frozen - 3) < 1e-6, `progress ${frozen}`);
    assert.equal(p.holding, false);
    // Input while paused is ignored.
    assert.equal(e.input('a', true, T0 + 2_000), null);
    e.tick(T0 + 5_000);
    assert.equal(p.progress, frozen);
    // Switch to RED while paused, resume: nobody is holding so nobody dies.
    e.setSignal('RED', T0 + 5_000, 'MANUAL');
    e.setPaused(false, T0 + 6_000);
    assert.equal(e.tick(T0 + 7_000), null);
    assert.equal(p.state, 'alive');
  });
});
