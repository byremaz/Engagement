/**
 * Personal race life-state resolution (plan §1).
 *
 * This lives in the shared package rather than inside the Angular service so
 * the "never revive" rule is unit-testable: an elimination that reached the
 * phone must survive release, refresh, locale change, pause/resume and
 * reconnect, and may be cleared ONLY when the host starts a new attempt.
 */
import type { RaceLifeState } from './types';

/**
 * `unknown` is a real, distinct value. Before the first authoritative personal
 * payload arrives we must never claim `alive`, because claiming `alive` is
 * exactly how an elimination gets hidden from the player.
 */
export type MyLife = RaceLifeState | 'unknown';

/** Higher rank wins a merge. A known outcome always beats `alive`. */
const LIFE_RANK: Record<MyLife, number> = {
  unknown: 0,
  alive: 1,
  finished: 2,
  eliminated: 3,
};

/** Returns whichever of the two states is the stronger (more certain) outcome. */
export function strongerLife(a: MyLife, b: MyLife): MyLife {
  return LIFE_RANK[b] > LIFE_RANK[a] ? b : a;
}

/**
 * Merges every source the phone has for its own life state.
 * `eliminated`/`finished` win; unknown never resolves to `alive`.
 */
export function resolveLife(sources: readonly (MyLife | null | undefined)[]): MyLife {
  let out: MyLife = 'unknown';
  for (const s of sources) if (s) out = strongerLife(out, s);
  return out;
}

/** Movement is permitted only on a positively-known `alive`. */
export function canMove(life: MyLife): boolean {
  return life === 'alive';
}

/**
 * The only sanctioned reset: a different host-authorized attempt id.
 * Anything else (release, refresh, locale switch, reconnect, pause) keeps the
 * outcome, so no path can accidentally revive an eliminated player.
 */
export function shouldResetLife(previousAttemptId: string | null, nextAttemptId: string | null): boolean {
  return previousAttemptId !== nextAttemptId;
}
