/**
 * Active round time for speed scoring (plan v2 §7.5).
 *
 * The API rewrites `countdown_ends_at` on every RESUME and inserts a fresh
 * 3 s countdown that is neither "paused" nor "active", so subtracting the
 * pause records from `countdown_ends_at` is wrong after a resume. The
 * deadline, however, is always re-derived as `now + countdown + remaining`,
 * which makes `duration − (deadline − at)` exact for any instant that falls
 * inside an unpaused RoundActive window.
 */
import { bucketMs } from './scoring';

export interface AttemptClock {
  /** Current deadline (server ms) — already shifted by every pause/resume. */
  deadlineAt: number;
  /** Planned round duration in ms. */
  durationMs: number;
}

/** Active (unpaused, post-countdown) ms elapsed at `at`. Never negative. */
export function activeElapsedMs(clock: AttemptClock, at: number): number {
  if (!Number.isFinite(clock.deadlineAt) || !Number.isFinite(clock.durationMs)) return 0;
  return Math.max(0, clock.durationMs - (clock.deadlineAt - at));
}

/** Bucketed lock time for scoring; null when the answer was never locked. */
export function lockTimeMs(clock: AttemptClock, lockedAt: number | null): number | null {
  if (lockedAt === null) return null;
  return bucketMs(activeElapsedMs(clock, lockedAt));
}

export interface PauseRecord {
  pausedAt: number;
  resumedAt: number | null;
}

/**
 * Cross-check oracle used by tests: the same quantity derived from the
 * ORIGINAL round start, the pause records and the countdown re-inserted at
 * every resume. Not used for scoring.
 */
export function activeElapsedFromRecords(originalCountdownEndsAt: number, records: PauseRecord[], countdownMs: number, at: number): number {
  let dead = 0;
  for (const r of records) {
    const resumed = r.resumedAt ?? at;
    dead += Math.max(0, Math.min(resumed, at) - r.pausedAt);
    if (r.resumedAt !== null && r.resumedAt < at) dead += Math.min(countdownMs, at - r.resumedAt);
  }
  return Math.max(0, at - originalCountdownEndsAt - dead);
}
