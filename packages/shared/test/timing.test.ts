import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activeElapsedFromRecords, activeElapsedMs, lockTimeMs } from '../src/timing';

const COUNTDOWN = 3_000;

describe('Active round time (plan §7.5)', () => {
  it('without a pause, elapsed = at − countdownEnds', () => {
    const start = 1_000_000;
    const clock = { deadlineAt: start + 25_000, durationMs: 25_000 };
    assert.equal(activeElapsedMs(clock, start), 0);
    assert.equal(activeElapsedMs(clock, start + 4_200), 4_200);
    assert.equal(activeElapsedMs(clock, start - 500), 0); // before input opened: clamped
  });

  it('a pause + resume (with its 3 s countdown) is excluded from the active time', () => {
    const start = 1_000_000;
    const duration = 25_000;
    // Round runs 6 s, pause of 10 s, resume inserts a 3 s countdown: deadline shifts by 13 s.
    const pausedAt = start + 6_000;
    const resumedAt = pausedAt + 10_000;
    const clock = { deadlineAt: start + duration + 10_000 + COUNTDOWN, durationMs: duration };
    const lockAt = resumedAt + COUNTDOWN + 2_000; // 2 s after play resumed → 8 s active
    assert.equal(activeElapsedMs(clock, lockAt), 8_000);
    const oracle = activeElapsedFromRecords(start, [{ pausedAt, resumedAt }], COUNTDOWN, lockAt);
    assert.equal(oracle, 8_000);
  });

  it('lockTimeMs buckets to 100 ms and is null when never locked', () => {
    const clock = { deadlineAt: 50_000, durationMs: 20_000 };
    assert.equal(lockTimeMs(clock, null), null);
    assert.equal(lockTimeMs(clock, 30_000 + 4_270), 4_200);
  });

  it('agrees with the pause-record oracle across two pauses', () => {
    const start = 0;
    const duration = 20_000;
    const p1 = { pausedAt: 2_000, resumedAt: 5_000 };
    const p2 = { pausedAt: 12_000, resumedAt: 20_000 };
    // After p1: deadline = 5_000 + 3_000 + (20_000 − 2_000) = 26_000.
    // After p2: remaining at pause = 26_000 − 12_000 = 14_000 → deadline = 20_000 + 3_000 + 14_000 = 37_000.
    const clock = { deadlineAt: 37_000, durationMs: duration };
    const at = 30_000;
    assert.equal(activeElapsedMs(clock, at), activeElapsedFromRecords(start, [p1, p2], COUNTDOWN, at));
    assert.equal(activeElapsedMs(clock, at), 13_000);
  });
});
