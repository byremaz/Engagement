/**
 * Deterministic scoring engine for the ASAS Challenge.
 * Pure functions only: the API calls these on the server (spec §12.5 -
 * never accept a client-provided score). Full precision is kept until the
 * single game-level rounding step (spec §9.1).
 */
import { ROUND_HALF_UP, RaceLifeState, StandingRow } from './types';

export const SCORING_RULE_VERSION = '1.2.0';

export const GAME_MAX = 1000;
export const TOURNAMENT_MAX = 3000;

// ---------------------------------------------------------------------------
// Game 1: Red Light, Green Light (spec §6.4, §6.8)
// ---------------------------------------------------------------------------

export const RLGL_TRACK_LENGTH = 100;
export const RLGL_SPEED_UNITS_PER_SEC = 3;
export const RLGL_RACE_DURATION_MS = 80_000;
export const RLGL_PRACTICE_DURATION_MS = 20_000;
export const RLGL_RED_TOLERANCE_MS = 200;
export const RLGL_HEARTBEAT_TIMEOUT_MS = 500;
export const RLGL_SCORED_RACES = 3;
/** Finishes within the same 0.1 s bucket share a rank (§6.8). */
export const RLGL_FINISH_BUCKET_MS = 100;

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
 * Compute raw race scores (0-100) for every registered participant.
 * `participations` must include everyone registered at race start (N),
 * including players who disconnected later (§6.8).
 */
export function scoreRace(participations: RaceParticipation[]): RaceRawResult[] {
  const n = participations.length;
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

export function orderResultLabel(score: OrderScore): string {
  const n = score.correctPositions;
  const cards = n === 1 ? 'card' : 'cards';
  return `${n} ${cards} in the correct ${n === 1 ? 'position' : 'positions'}: ${score.raw}/100`;
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
  /** Server lock time (ms); null when the arrangement was saved but never locked. */
  lockedAt: number | null;
  roundStartedAt: number;
}

/**
 * Converts tie-break answers into an ordering value (higher = better).
 * Correct cards first; lock time compared only for fully correct, manually
 * locked answers; differences under 0.5 s are treated as equal (§9.3).
 */
export function tieBreakValues(answers: TieBreakAnswer[]): Map<string, number> {
  const result = new Map<string, number>();
  const perfectLocked = answers
    .filter((a) => a.correctPositions === 4 && a.lockedAt !== null)
    .sort((a, b) => (a.lockedAt as number) - (b.lockedAt as number));

  // Bucket perfect answers by lock time with 0.5 s equality.
  const speedTier = new Map<string, number>();
  let tier = 0;
  let anchor: number | null = null;
  for (const a of perfectLocked) {
    const t = (a.lockedAt as number) - a.roundStartedAt;
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
