/**
 * Deterministic scoring engine for the ASAS Challenge.
 * Pure functions only: the API calls these on the server (spec §12.5 -
 * never accept a client-provided score). Full precision is kept until the
 * single game-level rounding step (spec §9.1).
 */
import { ROUND_HALF_UP, RaceLifeState, StandingRow } from './types';

/**
 * Scoring rule version frozen into every NEW session (redesign plan v2 §7).
 * Sessions created under 1.2.0 keep the v1 formulas via `scoringRules()`.
 */
export const SCORING_RULE_VERSION = '2.0.0';
export const SCORING_RULE_VERSION_V1 = '1.2.0';

export const GAME_MAX = 1000;
export const TOURNAMENT_MAX = 3000;

// ---------------------------------------------------------------------------
// v2 shared rule: every round = up to 80 "achievement" + up to 20 "speed";
// speed is granted only with the full achievement (finish / inside / 4 of 4)
// and only for a manual lock, so a fast wrong answer can never beat a slow
// right one (plan §7.1).
// ---------------------------------------------------------------------------

export const BASE_MAX = 80;
export const SPEED_MAX = 20;
/** Lock / finish times are compared in 100 ms buckets (same bucket = same points). */
export const SPEED_BUCKET_MS = 100;

export interface RoundScoreParts {
  raw: number;
  base: number;
  speed: number;
}

/** Floors a duration to the shared 100 ms bucket; negative or invalid → 0. */
export function bucketMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / SPEED_BUCKET_MS) * SPEED_BUCKET_MS;
}

/**
 * Speed bonus (0-20): linear from 20 at t=0 to 0 at t=windowMs.
 * `null` (never locked / never finished) → 0.
 */
export function speedBonus(timeMs: number | null, windowMs: number): number {
  if (timeMs === null || !Number.isFinite(timeMs) || windowMs <= 0) return 0;
  return SPEED_MAX * Math.max(0, 1 - bucketMs(timeMs) / windowMs);
}

// ---------------------------------------------------------------------------
// Game 1: Red Light, Green Light (spec §6.4, §6.8; v2 in plan §7.2)
// ---------------------------------------------------------------------------

export const RLGL_TRACK_LENGTH = 100;
export const RLGL_SPEED_UNITS_PER_SEC = 3;
export const RLGL_RACE_DURATION_MS = 80_000;
export const RLGL_PRACTICE_DURATION_MS = 20_000;
/**
 * Shared synchronization tolerance after a RED signal. 700 ms covers a human
 * reaction (300-450 ms) plus venue network latency; the rule "moving on RED
 * eliminates" is unchanged, only its fairness (plan decision, 20 Sep 2026).
 */
export const RLGL_RED_TOLERANCE_MS = 700;
export const RLGL_HEARTBEAT_TIMEOUT_MS = 500;
export const RLGL_SCORED_RACES = 3;
/** Finishes within the same 0.1 s bucket share a rank (§6.8). */
export const RLGL_FINISH_BUCKET_MS = 100;
/** v2: finishing within this window after the first finisher still earns speed points. */
export const RLGL_SPEED_WINDOW_MS = 15_000;
/** v2: a survivor who never reached the line earns at most 60 (finishing is always worth more). */
export const RLGL_TIMEOUT_MAX = 60;

export interface RaceParticipation {
  participantId: string;
  state: RaceLifeState;
  /** Final progress in track units (0-100). */
  progress: number;
  /** Server time (ms) when the finish line was reached; null unless finished. */
  finishedAt: number | null;
}

export interface RaceRawResult {
  participantId: string;
  state: RaceLifeState;
  progress: number;
  rank: number | null;
  raw: number;
}

/**
 * Compute raw race scores (0-100) for every registered participant (v1 rule).
 * `n` is the number registered at race start, including players who
 * disconnected later (§6.8); defaults to the participations given.
 */
export function scoreRace(participations: RaceParticipation[], registered?: number): RaceRawResult[] {
  const n = registered ?? participations.length;
  const finishers = participations
    .filter((p) => p.state === 'finished' && p.finishedAt !== null)
    .sort((a, b) => (a.finishedAt as number) - (b.finishedAt as number));

  // Competition ranking with 0.1 s buckets: equal bucket -> shared rank,
  // next distinct bucket -> rank = 1 + number of players ranked ahead.
  const rankById = new Map<string, number>();
  let currentRank = 0;
  let previousBucket: number | null = null;
  finishers.forEach((f, index) => {
    const bucket = Math.floor((f.finishedAt as number) / RLGL_FINISH_BUCKET_MS);
    if (previousBucket === null || bucket !== previousBucket) {
      currentRank = index + 1;
      previousBucket = bucket;
    }
    rankById.set(f.participantId, currentRank);
  });

  return participations.map((p) => {
    const progressRatio = clamp(p.progress / RLGL_TRACK_LENGTH, 0, 1);
    if (p.state === 'eliminated') {
      return { participantId: p.participantId, state: p.state, progress: p.progress, rank: null, raw: 0 };
    }
    if (p.state === 'finished') {
      const rank = rankById.get(p.participantId) ?? 1;
      const raw = n > 1 ? 80 + (20 * (n - rank)) / (n - 1) : 100;
      return { participantId: p.participantId, state: p.state, progress: RLGL_TRACK_LENGTH, rank, raw };
    }
    // alive at timeout, not finished
    return { participantId: p.participantId, state: p.state, progress: p.progress, rank: null, raw: 80 * progressRatio };
  });
}

/** Game score = round_half_up(1000 * sum(raw) / 300) over the planned 3 races (§6.8). */
export function rlglGameScore(rawRaceScores: number[], plannedRaces = RLGL_SCORED_RACES): number {
  const denominator = 100 * plannedRaces;
  return ROUND_HALF_UP((GAME_MAX * sum(rawRaceScores)) / denominator);
}

export interface RaceParticipationV2 {
  participantId: string;
  state: RaceLifeState;
  progress: number;
  /** Active (unpaused) ms from race start to the finish line; null unless finished. */
  finishActiveMs: number | null;
}

export interface RaceRawResultV2 extends RaceRawResult, RoundScoreParts {
  finishActiveMs: number | null;
}

/**
 * v2 race scoring (plan §7.2):
 *  finished   → 80 + 20 · max(0, 1 − (t − t_first) / 15 s), 100 ms buckets
 *  alive      → 60 · progress / 100
 *  eliminated → 0, regardless of progress
 * Independent of how many people were registered, so a late joiner never
 * changes anyone else's points.
 */
export function scoreRaceV2(participations: RaceParticipationV2[]): RaceRawResultV2[] {
  const finishers = participations
    .filter((p) => p.state === 'finished' && p.finishActiveMs !== null)
    .sort((a, b) => (a.finishActiveMs as number) - (b.finishActiveMs as number));
  const first = finishers.length ? bucketMs(finishers[0]!.finishActiveMs as number) : 0;

  const rankById = new Map<string, number>();
  let currentRank = 0;
  let previousBucket: number | null = null;
  finishers.forEach((f, index) => {
    const bucket = bucketMs(f.finishActiveMs as number);
    if (previousBucket === null || bucket !== previousBucket) {
      currentRank = index + 1;
      previousBucket = bucket;
    }
    rankById.set(f.participantId, currentRank);
  });

  return participations.map((p) => {
    const ratio = clamp(p.progress / RLGL_TRACK_LENGTH, 0, 1);
    if (p.state === 'eliminated') {
      return { participantId: p.participantId, state: p.state, progress: p.progress, rank: null, raw: 0, base: 0, speed: 0, finishActiveMs: null };
    }
    if (p.state === 'finished' && p.finishActiveMs !== null) {
      const gap = bucketMs(p.finishActiveMs) - first;
      const speed = SPEED_MAX * Math.max(0, 1 - gap / RLGL_SPEED_WINDOW_MS);
      return {
        participantId: p.participantId,
        state: p.state,
        progress: RLGL_TRACK_LENGTH,
        rank: rankById.get(p.participantId) ?? 1,
        raw: BASE_MAX + speed,
        base: BASE_MAX,
        speed,
        finishActiveMs: p.finishActiveMs,
      };
    }
    const base = RLGL_TIMEOUT_MAX * ratio;
    return { participantId: p.participantId, state: 'alive', progress: p.progress, rank: null, raw: base, base, speed: 0, finishActiveMs: null };
  });
}

// ---------------------------------------------------------------------------
// Game 2: Pin the Country (spec §7.5)
// ---------------------------------------------------------------------------

export const GEO_ROUNDS = 8;
export const GEO_ROUND_DURATION_MS = 25_000;
export const GEO_ZERO_DISTANCE_KM = 5000;

/** Raw round score = max(0, 100 * (1 - d / 5000)); d = 0 inside/on boundary. */
export function geoRoundScore(distanceKm: number | null): number {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return 0; // no pin
  const d = Math.max(0, distanceKm);
  return Math.max(0, 100 * (1 - d / GEO_ZERO_DISTANCE_KM));
}

/** Game score = round_half_up(1000 * sum(raw) / 800) over the planned 8 rounds. */
export function geoGameScore(rawRoundScores: number[], plannedRounds = GEO_ROUNDS): number {
  const denominator = 100 * plannedRounds;
  return ROUND_HALF_UP((GAME_MAX * sum(rawRoundScores)) / denominator);
}

/** v2: outside the country costs 10 points per 500 km from a base of 80 (0 at 4000 km). */
export const GEO_KM_PER_POINT = 50;
export const GEO_ZERO_DISTANCE_KM_V2 = BASE_MAX * GEO_KM_PER_POINT;

export interface GeoScoreInput {
  /** null = no pin. 0 when inside or on the boundary. */
  distanceKm: number | null;
  inside: boolean;
  /** Active ms from input opening to a MANUAL lock; null when never locked. */
  timeMs: number | null;
  lockedManually: boolean;
  /** Round duration (the speed window). */
  windowMs: number;
}

/**
 * v2 geo scoring (plan §7.3):
 *  inside  → 80 + speed (speed only with a manual lock)
 *  outside → max(0, 80 − d / 50)   (no speed bonus)
 *  no pin  → 0
 */
export function geoRoundScoreV2(input: GeoScoreInput): RoundScoreParts {
  if (input.distanceKm === null || !Number.isFinite(input.distanceKm)) return { raw: 0, base: 0, speed: 0 };
  if (input.inside || input.distanceKm <= 0) {
    const speed = input.lockedManually ? speedBonus(input.timeMs, input.windowMs) : 0;
    return { raw: BASE_MAX + speed, base: BASE_MAX, speed };
  }
  const base = Math.max(0, BASE_MAX - Math.max(0, input.distanceKm) / GEO_KM_PER_POINT);
  return { raw: base, base, speed: 0 };
}

/** Phone label, e.g. "Inside the country: 100/100" or "640 km away: 87/100" (§7.4). */
export function geoResultLabel(distanceKm: number | null, raw: number): string {
  if (distanceKm === null) return 'No pin placed: 0/100';
  if (distanceKm <= 0) return `Inside the country: ${Math.round(raw)}/100`;
  return `${Math.round(distanceKm).toLocaleString('en-US')} km away: ${Math.round(raw)}/100`;
}

// ---------------------------------------------------------------------------
// Game 3: Order It! (spec §8.5)
// ---------------------------------------------------------------------------

export const ORDER_ROUNDS = 10;
export const ORDER_ROUND_DURATION_MS = 20_000;
export const ORDER_TIEBREAK_DURATION_MS = 15_000;
export const ORDER_POINTS_PER_CARD = 25;

export interface OrderScore {
  correctPositions: number;
  raw: number;
  /** Per-position correctness, top to bottom. */
  positions: boolean[];
}

/**
 * Absolute-position scoring: 25 points per card in its exact slot.
 * `answer === null` means the participant never interacted (zero, §8.2).
 */
export function scoreOrder(correctOrder: string[], answer: string[] | null): OrderScore {
  if (!answer || answer.length !== correctOrder.length) {
    return { correctPositions: 0, raw: 0, positions: correctOrder.map(() => false) };
  }
  const positions = correctOrder.map((id, i) => answer[i] === id);
  const correctPositions = positions.filter(Boolean).length;
  return { correctPositions, raw: correctPositions * ORDER_POINTS_PER_CARD, positions };
}

/** Ten rounds at 100 -> 1000; integer already, but normalize defensively. */
export function orderGameScore(rawRoundScores: number[], plannedRounds = ORDER_ROUNDS): number {
  const denominator = 100 * plannedRounds;
  return ROUND_HALF_UP((GAME_MAX * sum(rawRoundScores)) / denominator);
}

/** v2: 20 per card (0/20/40/80); a perfect, manually locked order adds up to 20 for speed. */
export const ORDER_POINTS_PER_CARD_V2 = 20;

export interface OrderScoreInput {
  correctOrder: string[];
  answer: string[] | null;
  timeMs: number | null;
  lockedManually: boolean;
  windowMs: number;
}

export interface OrderScoreV2 extends OrderScore, RoundScoreParts {}

/** v2 ordering score (plan §7.4). 3 of 4 is impossible, so possible bases are 0/20/40/80. */
export function scoreOrderV2(input: OrderScoreInput): OrderScoreV2 {
  const s = scoreOrder(input.correctOrder, input.answer);
  const base = s.correctPositions * ORDER_POINTS_PER_CARD_V2;
  const perfect = s.correctPositions === input.correctOrder.length && input.correctOrder.length > 0;
  const speed = perfect && input.lockedManually ? speedBonus(input.timeMs, input.windowMs) : 0;
  return { ...s, raw: base + speed, base, speed };
}

export function orderResultLabel(score: OrderScore): string {
  const n = score.correctPositions;
  const cards = n === 1 ? 'card' : 'cards';
  return `${n} ${cards} in the correct ${n === 1 ? 'position' : 'positions'}: ${Math.round(score.raw)}/100`;
}

// ---------------------------------------------------------------------------
// Rule set selection by frozen session version (plan §7.7)
// ---------------------------------------------------------------------------

export interface ScoringRules {
  version: string;
  /** Points per correctly placed card, for instruction copy. */
  orderPointsPerCard: number;
  race(participations: RaceParticipationV2[], registered?: number): RaceRawResultV2[];
  geo(input: GeoScoreInput): RoundScoreParts;
  order(input: OrderScoreInput): OrderScoreV2;
}

const RULES_V1: ScoringRules = {
  version: SCORING_RULE_VERSION_V1,
  orderPointsPerCard: ORDER_POINTS_PER_CARD,
  race: (ps, registered) =>
    scoreRace(ps.map((p) => ({ participantId: p.participantId, state: p.state, progress: p.progress, finishedAt: p.finishActiveMs })), registered)
      .map((r, i) => ({ ...r, base: r.raw, speed: 0, finishActiveMs: ps[i]!.finishActiveMs })),
  geo: (input) => {
    const raw = geoRoundScore(input.distanceKm);
    return { raw, base: raw, speed: 0 };
  },
  order: (input) => {
    const s = scoreOrder(input.correctOrder, input.answer);
    return { ...s, base: s.raw, speed: 0 };
  },
};

const RULES_V2: ScoringRules = {
  version: SCORING_RULE_VERSION,
  orderPointsPerCard: ORDER_POINTS_PER_CARD_V2,
  race: (ps) => scoreRaceV2(ps),
  geo: geoRoundScoreV2,
  order: scoreOrderV2,
};

/** Returns the frozen rule set for a session; unknown/missing versions fall back to v1 (the older contract). */
export function scoringRules(version: string | null | undefined): ScoringRules {
  return version === SCORING_RULE_VERSION ? RULES_V2 : RULES_V1;
}

/** Validates ordering content: exactly four unique options, answer uses each once (§10.3). */
export function validateOrderContent(optionIds: string[], correctOrder: string[]): string[] {
  const errors: string[] = [];
  if (optionIds.length !== 4) errors.push('Exactly four options are required.');
  if (new Set(optionIds).size !== optionIds.length) errors.push('Option IDs must be unique.');
  if (correctOrder.length !== optionIds.length) errors.push('Correct order must contain every option once.');
  const optionSet = new Set(optionIds);
  if (new Set(correctOrder).size !== correctOrder.length || !correctOrder.every((id) => optionSet.has(id))) {
    errors.push('Correct order must be a permutation of the option IDs.');
  }
  return errors;
}

/**
 * Deterministic shuffled starting order shared by everyone in a question.
 * Guaranteed not to equal the complete correct answer (§8.2).
 */
export function initialOrderFor(correctOrder: string[], seed: string): string[] {
  const ids = [...correctOrder];
  let state = hashString(seed) || 1;
  const next = (): number => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let attempt = 0; attempt < 16; attempt++) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (!arraysEqual(ids, correctOrder)) return ids;
  }
  // Fallback: rotate by one, which can never equal the original for length >= 2.
  return [...correctOrder.slice(1), correctOrder[0]];
}

// ---------------------------------------------------------------------------
// Tournament standings and ties (spec §9.1-9.3)
// ---------------------------------------------------------------------------

export interface TournamentInput {
  participantId: string;
  number: number;
  name: string;
  avatar: string;
  /** Displayed (already rounded) game scores; null = game not yet revealed/published. */
  rlgl: number | null;
  geo: number | null;
  order: number | null;
  /** Tie-break ordering value from a host-run Order It! tie-break (higher is better); null if none. */
  tieBreak: number | null;
}

/**
 * Builds standings using displayed integer totals only (no hidden fractions),
 * ranking ties by number of perfect (1000) games, then tie-break value,
 * then a shared rank (competition ranking).
 */
export function buildStandings(inputs: TournamentInput[]): StandingRow[] {
  const rows = inputs.map((p) => {
    const rlgl = p.rlgl ?? 0;
    const geo = p.geo ?? 0;
    const order = p.order ?? 0;
    const perfectGames = [rlgl, geo, order].filter((s) => s === GAME_MAX).length;
    return {
      rank: 0,
      participantId: p.participantId,
      number: p.number,
      name: p.name,
      avatar: p.avatar,
      rlgl,
      geo,
      order,
      total: rlgl + geo + order,
      tieBreak: p.tieBreak,
      perfectGames,
    } as StandingRow;
  });

  rows.sort(compareStanding);

  let rank = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i === 0 || compareStanding(rows[i - 1], rows[i]) !== 0) rank = i + 1;
    rows[i].rank = rank;
  }
  return rows;
}

export function compareStanding(a: StandingRow, b: StandingRow): number {
  if (b.total !== a.total) return b.total - a.total;
  if (b.perfectGames !== a.perfectGames) return b.perfectGames - a.perfectGames;
  const ta = a.tieBreak ?? Number.NEGATIVE_INFINITY;
  const tb = b.tieBreak ?? Number.NEGATIVE_INFINITY;
  if (tb !== ta) return tb - ta;
  return 0; // shared rank: never select by name or entry number (§9.3)
}

/** Participants sharing a rank within the top three -> host may run a tie-break (§9.3). */
export function topThreeTies(standings: StandingRow[]): string[][] {
  const groups = new Map<number, string[]>();
  for (const row of standings) {
    if (row.rank > 3) continue;
    const list = groups.get(row.rank) ?? [];
    list.push(row.participantId);
    groups.set(row.rank, list);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

export const TIEBREAK_LOCK_EPSILON_MS = 500;

export interface TieBreakAnswer {
  participantId: string;
  correctPositions: number;
  /** Active ms from input opening to the MANUAL lock; null when saved but never locked. */
  timeMs: number | null;
}

/**
 * Converts tie-break answers into an ordering value (higher = better).
 * Correct cards first; lock time compared only for fully correct, manually
 * locked answers; differences under 0.5 s are treated as equal (§9.3).
 */
export function tieBreakValues(answers: TieBreakAnswer[]): Map<string, number> {
  const result = new Map<string, number>();
  const perfectLocked = answers
    .filter((a) => a.correctPositions === 4 && a.timeMs !== null)
    .sort((a, b) => (a.timeMs as number) - (b.timeMs as number));

  // Bucket perfect answers by lock time with 0.5 s equality.
  const speedTier = new Map<string, number>();
  let tier = 0;
  let anchor: number | null = null;
  for (const a of perfectLocked) {
    const t = a.timeMs as number;
    if (anchor === null || t - anchor >= TIEBREAK_LOCK_EPSILON_MS) {
      tier += 1;
      anchor = t;
    }
    speedTier.set(a.participantId, tier);
  }
  const maxTier = tier + 1;

  for (const a of answers) {
    const base = a.correctPositions * 1000;
    const speed = speedTier.has(a.participantId) ? maxTier - (speedTier.get(a.participantId) as number) : 0;
    result.set(a.participantId, base + speed);
  }
  return result;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
