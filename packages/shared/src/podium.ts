/**
 * Podium reveal logic shared by the display, the phone and the host stepper
 * (plan v2 §8). Steps: 0 nothing, 1 third place, 2 + second, 3 + first,
 * 4 full table. Ranks are the REAL competition ranks (1, 2, 2, 4), so a tie
 * is shown as one band and nobody is hidden or picked arbitrarily.
 */

export interface RankedRow {
  rank: number;
}

export const PODIUM_STEP_NONE = 0;
export const PODIUM_STEP_THIRD = 1;
export const PODIUM_STEP_SECOND = 2;
export const PODIUM_STEP_FIRST = 3;
export const PODIUM_STEP_TABLE = 4;

/** Distinct top-three ranks that actually exist in the rows (e.g. [1, 2] when two are tied for 2nd). */
export function podiumRanks(rows: readonly RankedRow[]): number[] {
  const present = new Set<number>();
  for (const r of rows) if (r.rank >= 1 && r.rank <= 3) present.add(r.rank);
  return [...present].sort((a, b) => a - b);
}

/** The rank a given step reveals (3 → 1), or null when that step has nothing to show. */
export function podiumRankForStep(rows: readonly RankedRow[], step: number): number | null {
  if (step < PODIUM_STEP_THIRD || step > PODIUM_STEP_FIRST) return null;
  const rank = 4 - step;
  return podiumRanks(rows).includes(rank) ? rank : null;
}

/** Ranks revealed at `step`, in reveal order (third first, champion last). */
export function podiumRevealRanks(rows: readonly RankedRow[], step: number): number[] {
  if (step <= PODIUM_STEP_NONE) return [];
  const threshold = step >= PODIUM_STEP_FIRST ? 1 : 4 - step;
  return podiumRanks(rows)
    .filter((r) => r >= threshold)
    .sort((a, b) => b - a);
}

/** Groups rows by rank for the revealed ranks; each band keeps every tied participant. */
export function podiumBands<T extends RankedRow>(rows: readonly T[], step: number): { rank: number; rows: T[] }[] {
  return podiumRevealRanks(rows, step).map((rank) => ({ rank, rows: rows.filter((r) => r.rank === rank) }));
}
