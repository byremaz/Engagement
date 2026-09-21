/**
 * Default content bank (spec §6.7, §7.3, §8.3, §8.4, §9.3, §10.4).
 * A started session stores an immutable copy of the selected content (§10),
 * so this module is the *source*, not the runtime record.
 *
 * Correct orders are server-side solutions: the API must strip `correctOrder`
 * and `explanation` before sending ORDER content to participants (§8.4, §12.6).
 */
import {
  GEO_ROUND_DURATION_MS,
  ORDER_ROUND_DURATION_MS,
  ORDER_TIEBREAK_DURATION_MS,
  RLGL_PRACTICE_DURATION_MS,
  RLGL_RACE_DURATION_MS,
  RLGL_RED_TOLERANCE_MS,
  RLGL_SPEED_UNITS_PER_SEC,
  RLGL_TRACK_LENGTH,
  SCORING_RULE_VERSION,
  validateOrderContent,
} from './scoring';

export const CONTENT_VERSION = '1.2.0';

// ---------------------------------------------------------------------------
// Game 1: races (§6.7, §10.1)
// ---------------------------------------------------------------------------

export interface RaceContent {
  id: string;
  title: string;
  scene: string;
  durationMs: number;
  speedUnitsPerSec: number;
  trackLength: number;
  /** Auto-mode interval ranges in ms (server-generated schedule, §6.7). */
  autoGreenMs: [number, number];
  autoRedMs: [number, number];
  redToleranceMs: number;
  /** Chance (0..1) that a GREEN is a short fake-out; its length range in ms. */
  autoFakeoutChance?: number;
  autoFakeoutGreenMs?: [number, number];
  scoringRuleVersion: string;
  purpose: 'practice' | 'scored';
  deathAnimation: string;
  deathSound: string;
}

const raceDefaults = {
  speedUnitsPerSec: RLGL_SPEED_UNITS_PER_SEC,
  trackLength: RLGL_TRACK_LENGTH,
  redToleranceMs: RLGL_RED_TOLERANCE_MS,
  scoringRuleVersion: SCORING_RULE_VERSION,
  deathAnimation: 'collapse-fade',
  deathSound: 'elimination-short',
} as const;

export const RLGL_PRACTICE: RaceContent = {
  id: 'RACE-P',
  title: 'Practice Run',
  scene: 'Cartoon office corridor',
  durationMs: RLGL_PRACTICE_DURATION_MS,
  autoGreenMs: [3000, 5000],
  autoRedMs: [1500, 2500],
  purpose: 'practice',
  ...raceDefaults,
  redToleranceMs: 700, // forgiving while people learn the pad
};

export const RLGL_RACES: RaceContent[] = [
  {
    id: 'RACE-1',
    title: 'Warm-up Run',
    scene: 'Cartoon office corridor',
    // Owner request: the first (warm-up) race lasts exactly one minute.
    // Still winnable: the 60 % green guarantee gives 36 s of green vs the
    // 33.3 s of pure hold a finish needs (see RLGL_AUTO_MIN_GREEN_FRACTION).
    durationMs: 60_000,
    autoGreenMs: [2500, 4500],
    autoRedMs: [1000, 2000],
    purpose: 'scored',
    ...raceDefaults,
    redToleranceMs: 650,
  },
  {
    id: 'RACE-2',
    title: 'Stay Sharp',
    scene: 'Break-area courtyard',
    durationMs: RLGL_RACE_DURATION_MS,
    autoGreenMs: [1500, 3500],
    autoRedMs: [900, 1800],
    autoFakeoutChance: 0.15,
    autoFakeoutGreenMs: [600, 900],
    purpose: 'scored',
    ...raceDefaults,
    redToleranceMs: 600,
  },
  {
    id: 'RACE-3',
    title: 'Final Dash',
    scene: 'Finish-line corridor',
    durationMs: RLGL_RACE_DURATION_MS,
    autoGreenMs: [1200, 3000],
    autoRedMs: [800, 1500],
    autoFakeoutChance: 0.25,
    autoFakeoutGreenMs: [600, 900],
    purpose: 'scored',
    ...raceDefaults,
    redToleranceMs: 550,
  },
];

/**
 * Minimum total green time an uninterrupted full-race Auto schedule must
 * provide. Finishing needs 33.3 s of pure hold; humans lose ~0.4 s reacting
 * to each GREEN, so 48 s (60 % of the race) keeps the finish reachable.
 */
export const RLGL_AUTO_MIN_GREEN_MS = 48_000;
/** Same guarantee expressed as a fraction of the remaining race time. */
export const RLGL_AUTO_MIN_GREEN_FRACTION = 0.6;

// ---------------------------------------------------------------------------
// Game 2: countries (§7.3, §10.2, §10.4)
// ---------------------------------------------------------------------------

export type GeoDifficulty = 'Easy' | 'Medium' | 'Moderately challenging';

export interface CountryContent {
  /** ISO 3166-1 alpha-3, used as the content code and geometry key. */
  code: string;
  name: string;
  difficulty: GeoDifficulty;
  purpose: 'practice' | 'scored' | 'spare';
  durationMs: number;
  /** Reveal camera target (lat, lng, zoom) - never sent before reveal. */
  revealView: { lat: number; lng: number; zoom: number };
  note: string;
}

export const GEO_PRACTICE: CountryContent = {
  code: 'SAU',
  name: 'Saudi Arabia',
  difficulty: 'Easy',
  purpose: 'practice',
  durationMs: GEO_ROUND_DURATION_MS,
  revealView: { lat: 24, lng: 45, zoom: 3 },
  note: 'Unscored practice',
};

export const GEO_COUNTRIES: CountryContent[] = [
  { code: 'EGY', name: 'Egypt', difficulty: 'Easy', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: 26.8, lng: 30.8, zoom: 4 }, note: 'Familiar regional starting point' },
  { code: 'BRA', name: 'Brazil', difficulty: 'Easy', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: -10, lng: -53, zoom: 3 }, note: 'Large country on another continent' },
  { code: 'AUS', name: 'Australia', difficulty: 'Easy', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: -25, lng: 134, zoom: 3 }, note: 'Distinctive outline' },
  { code: 'JPN', name: 'Japan', difficulty: 'Medium', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: 36.5, lng: 138, zoom: 4 }, note: 'Island geography' },
  { code: 'ITA', name: 'Italy', difficulty: 'Medium', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: 42.5, lng: 12.5, zoom: 4.5 }, note: 'Smaller, recognizable shape' },
  { code: 'CAN', name: 'Canada', difficulty: 'Medium', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: 60, lng: -96, zoom: 2.5 }, note: 'Large northern country' },
  { code: 'MDG', name: 'Madagascar', difficulty: 'Medium', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: -19, lng: 46.5, zoom: 4.5 }, note: 'Island off Africa' },
  // The hardest target closes the game so difficulty rises to the final round.
  { code: 'NOR', name: 'Norway', difficulty: 'Moderately challenging', purpose: 'scored', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: 64.5, lng: 12, zoom: 3.5 }, note: 'Long, narrow geography' },
];

export const GEO_SPARES: CountryContent[] = [
  { code: 'ARG', name: 'Argentina', difficulty: 'Easy', purpose: 'spare', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: -35, lng: -65, zoom: 3 }, note: 'Spare with reviewed boundaries' },
  { code: 'DEU', name: 'Germany', difficulty: 'Medium', purpose: 'spare', durationMs: GEO_ROUND_DURATION_MS, revealView: { lat: 51, lng: 10.4, zoom: 4.5 }, note: 'Spare with reviewed boundaries' },
];

// ---------------------------------------------------------------------------
// Game 3: ordering questions (§8.3, §8.4, §9.3, §10.3, §10.4)
// ---------------------------------------------------------------------------

export type OrderDifficulty = 'Easy' | 'Easy-medium' | 'Medium';
export type OrderPurpose = 'practice' | 'scored' | 'spare' | 'tie-break';

export interface OrderOption {
  id: string;
  label: string;
}

export interface OrderContent {
  id: string;
  prompt: string;
  /** Explicit direction shown on the phone, e.g. "Smallest at the top -> Largest at the bottom". */
  direction: string;
  options: OrderOption[];
  /** Server-side solution: option IDs top to bottom. Never sent before reveal. */
  correctOrder: string[];
  explanation: string;
  difficulty: OrderDifficulty;
  durationMs: number;
  purpose: OrderPurpose;
}

/** Builds a question whose options are given in correct order; IDs are `${id}-a..d`. */
function q(
  id: string,
  prompt: string,
  direction: string,
  labelsInCorrectOrder: [string, string, string, string],
  explanation: string,
  difficulty: OrderDifficulty,
  purpose: OrderPurpose = 'scored',
  durationMs = ORDER_ROUND_DURATION_MS,
): OrderContent {
  const suffixes = ['a', 'b', 'c', 'd'];
  const options = labelsInCorrectOrder.map((label, i) => ({ id: `${id}-${suffixes[i]}`, label }));
  return {
    id,
    prompt,
    direction,
    options,
    correctOrder: options.map((o) => o.id),
    explanation,
    difficulty,
    durationMs,
    purpose,
  };
}

const ASC = 'Smallest at the top → Largest at the bottom';
const SHORT_LONG = 'Shortest at the top → Longest at the bottom';
const EARLIEST = 'Earliest at the top → Latest at the bottom';

export const ORDER_PRACTICE: OrderContent = q(
  'SORT-P',
  'Order these time units from shortest to longest.',
  SHORT_LONG,
  ['Second', 'Minute', 'Hour', 'Day'],
  'A second is shortest, then a minute, an hour, and a day.',
  'Easy',
  'practice',
);

export const ORDER_QUESTIONS: OrderContent[] = [
  // Five scored rounds (owner decision, 20 Sep 2026): easy -> medium, varied domains, nothing purely numeric.
  q('SORT-01', 'Order these healthy adult animals by number of legs, fewest first.', 'Fewest legs at the top → Most legs at the bottom', ['Chicken', 'Cat', 'Ant', 'Spider'], '2, 4, 6, 8 legs.', 'Easy'),
  q('SORT-02', 'Put these Hijri months in calendar order.', EARLIEST, ['Rajab', "Sha'ban", 'Ramadan', 'Shawwal'], 'Months 7, 8, 9, 10.', 'Easy'),
  q('SORT-09', "Order the stages of a butterfly's life, earliest first.", EARLIEST, ['Egg', 'Caterpillar', 'Chrysalis', 'Butterfly'], 'Egg, caterpillar, chrysalis, then butterfly.', 'Easy-medium'),
  q('SORT-03', 'Order these storage units from smallest to largest.', ASC, ['Kilobyte', 'Megabyte', 'Gigabyte', 'Terabyte'], 'Increasing storage unit size.', 'Easy-medium'),
  q('SORT-08', 'Order these planets from nearest to farthest from the Sun.', 'Nearest to the Sun at the top → Farthest at the bottom', ['Earth', 'Mars', 'Jupiter', 'Neptune'], 'The 3rd, 4th, 5th and 8th planets from the Sun.', 'Medium'),
];

export const ORDER_SPARES: OrderContent[] = [
  q('SPARE-01', 'Put these days in order, starting from Saturday.', 'Saturday first at the top → Latest at the bottom', ['Saturday', 'Sunday', 'Tuesday', 'Thursday'], 'Saturday, Sunday, Tuesday, Thursday in weekly order.', 'Easy', 'spare'),
  q('SPARE-02', 'Order these values from smallest to largest.', ASC, ['0.1', '0.3', '0.6', '0.9'], '0.1 < 0.3 < 0.6 < 0.9.', 'Easy', 'spare'),
  // Former scored rounds, kept as spares.
  q('SORT-04', 'Order these values from smallest to largest.', ASC, ['0.25', 'One third', 'One half', '0.75'], '0.25 < 1/3 < 0.5 < 0.75.', 'Medium', 'spare'),
  q('SORT-05', 'Put these months in calendar order.', EARLIEST, ['March', 'June', 'September', 'December'], 'Months 3, 6, 9, 12.', 'Easy', 'spare'),
  q('SORT-06', 'Order these distances from shortest to longest.', SHORT_LONG, ['100 metres', 'Half a kilometre', '750 metres', 'One kilometre'], '100, 500, 750, 1000 metres.', 'Medium', 'spare'),
  q('SORT-07', 'Put these letters in English alphabetical order.', 'A–Z: first letter at the top', ['B', 'G', 'S', 'W'], 'B comes before G, then S, then W.', 'Easy-medium', 'spare'),
  q('SORT-10', 'Order these durations from shortest to longest.', SHORT_LONG, ['45 seconds', 'One minute', '90 seconds', 'Two minutes'], '45, 60, 90, 120 seconds.', 'Medium', 'spare'),
];

export const ORDER_TIEBREAKS: OrderContent[] = [
  q('TIE-01', 'Order these values from smallest to largest.', ASC, ['0.2', 'One quarter', 'One third', '0.4'], '0.2 < 0.25 < 0.333 < 0.4.', 'Medium', 'tie-break', ORDER_TIEBREAK_DURATION_MS),
  q('TIE-02', 'Order these durations from shortest to longest.', SHORT_LONG, ['Half a minute', '45 seconds', 'One minute and a quarter', '90 seconds'], '30, 45, 75, 90 seconds.', 'Medium', 'tie-break', ORDER_TIEBREAK_DURATION_MS),
];

// ---------------------------------------------------------------------------
// Instructions (§4.4, §6.1, §7.1, §8.1)
// ---------------------------------------------------------------------------

export interface HowToPlay {
  title: string;
  headline: string;
  steps: [string, string, string];
  scoringNote: string;
  example: 'rlgl' | 'geo' | 'order';
}

export const HOW_TO_PLAY: Record<'RLGL' | 'GEO' | 'ORDER', HowToPlay> = {
  RLGL: {
    title: 'Red Light, Green Light',
    headline: "Hold on GREEN. Release on RED. Move on RED and you're eliminated!",
    steps: [
      'Hold the button on GREEN to move.',
      'Release on RED; moving gets you eliminated.',
      'Reach the finish to score. Eliminated players return next race.',
    ],
    scoringNote: 'Finish = 80 points + up to 20 for speed. Alive at the end = up to 60. Eliminated = 0 this race; earlier points stay safe.',
    example: 'rlgl',
  },
  GEO: {
    title: 'Pin the Country',
    headline: 'Rotate the globe and pin the country. Inside its borders earns full points; closer guesses earn more.',
    steps: [
      'Rotate the globe to find the country.',
      'Tap to place your pin, then lock it.',
      'Inside the country earns full points; lock fast for a speed bonus.',
    ],
    scoringNote: 'Inside the country = 80 + up to 20 for speed. Outside: every 500 km costs 10 points.',
    example: 'geo',
  },
  ORDER: {
    title: 'Order It!',
    headline: 'Put the four cards in the requested order, top to bottom. Lock your answer before time runs out.',
    steps: [
      'Read the requested order.',
      'Move the four cards from top to bottom.',
      'Lock your answer. Each correct position earns 20 points.',
    ],
    scoringNote: 'Each card in its correct position earns 20 points. All four correct + a fast lock adds up to 20 more.',
    example: 'order',
  },
};

// ---------------------------------------------------------------------------
// Frozen session configuration (§10)
// ---------------------------------------------------------------------------

export interface FrozenContent {
  contentVersion: string;
  scoringRuleVersion: string;
  races: { practice: RaceContent; scored: RaceContent[] };
  countries: { practice: CountryContent; scored: CountryContent[]; spares: CountryContent[] };
  ordering: { practice: OrderContent; scored: OrderContent[]; spares: OrderContent[]; tieBreaks: OrderContent[] };
}

export function defaultFrozenContent(): FrozenContent {
  return structuredClone({
    contentVersion: CONTENT_VERSION,
    scoringRuleVersion: SCORING_RULE_VERSION,
    races: { practice: RLGL_PRACTICE, scored: RLGL_RACES },
    countries: { practice: GEO_PRACTICE, scored: GEO_COUNTRIES, spares: GEO_SPARES },
    ordering: { practice: ORDER_PRACTICE, scored: ORDER_QUESTIONS, spares: ORDER_SPARES, tieBreaks: ORDER_TIEBREAKS },
  });
}

/** Content-bank self-check used by tests and at API startup. */
export function validateContentBank(): string[] {
  const errors: string[] = [];
  const all = [ORDER_PRACTICE, ...ORDER_QUESTIONS, ...ORDER_SPARES, ...ORDER_TIEBREAKS];
  const ids = new Set<string>();
  for (const item of all) {
    if (ids.has(item.id)) errors.push(`Duplicate ordering ID ${item.id}`);
    ids.add(item.id);
    for (const e of validateOrderContent(item.options.map((o) => o.id), item.correctOrder)) {
      errors.push(`${item.id}: ${e}`);
    }
    if (new Set(item.options.map((o) => o.label)).size !== 4) errors.push(`${item.id}: option labels must be distinct.`);
  }
  if (ORDER_QUESTIONS.length !== 5) errors.push('Expected 5 scored ordering questions.');
  if (GEO_COUNTRIES.length !== 8) errors.push('Expected 8 scored countries.');
  if (RLGL_RACES.length !== 3) errors.push('Expected 3 scored races.');
  const codes = new Set([GEO_PRACTICE, ...GEO_COUNTRIES, ...GEO_SPARES].map((c) => c.code));
  if (codes.size !== 1 + GEO_COUNTRIES.length + GEO_SPARES.length) errors.push('Country codes must be unique.');
  return errors;
}
