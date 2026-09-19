/**
 * Shared domain types for the ASAS Challenge event (spec §11, §12.1).
 * Used by the NestJS API and the Angular web app.
 */

export type GameType = 'RLGL' | 'GEO' | 'ORDER';

export const GAME_ORDER: GameType[] = ['RLGL', 'GEO', 'ORDER'];

/** Arabic game titles. `GameType` remains the only language-independent key. */
export const GAME_TITLES_AR: Record<GameType, string> = {
  RLGL: 'امش… وقف!',
  GEO: 'وين الدولة؟',
  ORDER: 'رتّبها!',
};

export type Lang = 'en' | 'ar';

/** Picks the localized game title without duplicating the lookup everywhere. */
export function gameTitle(game: GameType, lang: Lang): string {
  return lang === 'ar' ? GAME_TITLES_AR[game] : GAME_TITLES[game];
}

export const GAME_TITLES: Record<GameType, string> = {
  RLGL: 'Red Light, Green Light',
  GEO: 'Pin the Country',
  ORDER: 'Order It!',
};

/** Explicit session states (spec §11). Pause is an overlay, not a state. */
export type SessionState =
  | 'Draft'
  | 'Lobby'
  | 'Instructions'
  | 'Practice'
  | 'Ready'
  | 'Countdown'
  | 'RoundActive'
  | 'InputLocked'
  | 'Reveal'
  | 'GameResults'
  | 'TournamentResults'
  | 'Closed';

export type SignalColor = 'RED' | 'GREEN';
export type SignalMode = 'MANUAL' | 'AUTO';

export type RaceLifeState = 'alive' | 'eliminated' | 'finished';

export type DeviceType =
  | 'iPhone'
  | 'Android phone'
  | 'iPad or tablet'
  | 'Desktop or laptop'
  | 'Unknown';

export interface DeviceInfo {
  deviceType: DeviceType;
  model: string | null;
  os: string | null;
  browser: string | null;
  detectionSource: 'client-hints' | 'user-agent' | 'none';
}

export interface ParticipantPublic {
  id: string;
  number: number;
  name: string;
  avatar: string;
  connected: boolean;
  ready: boolean;
}

export interface ParticipantHostView extends ParticipantPublic {
  device: DeviceInfo;
  joinedAt: string;
  isSimulated: boolean;
}

/** Host-only action names (spec §4.5). */
export type HostAction =
  | 'SHOW_INSTRUCTIONS'
  | 'START_PRACTICE'
  | 'REVEAL_PRACTICE'
  | 'START_GAME'
  | 'START_ROUND'
  | 'PAUSE'
  | 'RESUME'
  | 'REVEAL_RESULTS'
  | 'NEXT_ROUND'
  | 'SHOW_GAME_RESULTS'
  | 'NEXT_GAME'
  | 'SHOW_FINAL_RESULTS'
  | 'VOID_ROUND'
  | 'OPEN_JOIN'
  | 'CLOSE_JOIN'
  | 'CEREMONY_STEP'
  | 'CLOSE_SESSION'
  | 'START_TIEBREAK'
  /** Host-driven leaderboard paging on the shared display (plan section 4). */
  | 'STANDINGS_PAGE';

/** Payload accepted with a host action (validated server-side). */
export interface HostActionPayload {
  /** VOID_ROUND: mandatory reason, retained for audit. */
  reason?: string;
  /** CEREMONY_STEP: 0 intro, 1 third, 2 second, 3 first, 4 full table. */
  step?: number;
  /** START_TIEBREAK: participants sharing a top-three rank. */
  participantIds?: string[];
  /** STANDINGS_PAGE: zero-based standings page to show on the display. */
  page?: number;
}

export interface StandingRow {
  rank: number;
  participantId: string;
  number: number;
  name: string;
  avatar: string;
  rlgl: number;
  geo: number;
  order: number;
  total: number;
  tieBreak: number | null;
  perfectGames: number;
}

/** Snapshot sent to every client on connect / state change. */
export interface SessionSnapshot {
  sessionId: string;
  title: string;
  joinCode: string;
  state: SessionState;
  paused: boolean;
  joinOpen: boolean;
  seq: number;
  serverTime: number;
  gameType: GameType | null;
  gameIndex: number;
  roundNumber: number;
  roundCount: number;
  attemptId: string | null;
  isPractice: boolean;
  countdownEndsAt: number | null;
  deadlineAt: number | null;
  remainingMs: number | null;
  responseCount: number;
  participantCount: number;
  readyCount: number;
  ceremonyStep: number;
  /** Zero-based standings page for the shared display; host-set, seq-ordered. */
  standingsPage: number;
  eventStartedAt: number | null;
  /** Round content visible to participants (never includes solutions before reveal). */
  roundPublic: RoundPublic | null;
  /** Populated only in Reveal / results states. */
  reveal: RevealPayload | null;
  standings: StandingRow[] | null;
  race: RaceSnapshot | null;
}

/**
 * Round content visible to participants. Arabic labels travel alongside the
 * English ones so a language switch never needs a new request; IDs, country
 * codes and option IDs stay language-independent [secure-coding].
 */
export type RoundPublic =
  | {
      type: 'RLGL';
      title: string;
      titleAr: string;
      scene: string;
      sceneAr: string;
      durationMs: number;
      trackLength: number;
    }
  | { type: 'GEO'; countryName: string; countryNameAr: string; durationMs: number }
  | {
      type: 'ORDER';
      questionId: string;
      prompt: string;
      direction: string;
      promptAr: string;
      directionAr: string;
      options: { id: string; label: string; labelAr: string }[];
      durationMs: number;
    };

export type RevealPayload =
  | {
      type: 'ORDER';
      correctOrder: string[];
      explanation: string;
      explanationAr: string;
      perfectCount: number;
      topFive: { name: string; score: number }[];
    }
  | {
      type: 'GEO';
      countryCode: string;
      countryName: string;
      countryNameAr: string;
      insideCount: number;
      topFive: { name: string; score: number }[];
      pins: { participantId: string; name: string; lat: number; lng: number; distanceKm: number; score: number }[];
    }
  | {
      type: 'RLGL';
      results: { participantId: string; name: string; state: RaceLifeState; progress: number; rank: number | null; raw: number }[];
    };

export interface RaceSnapshot {
  signal: SignalColor;
  signalEventId: number;
  signalEffectiveAt: number;
  mode: SignalMode;
  raceStartedAt: number | null;
  players: RacePlayerPublic[];
  eliminationsFeed: { eventId: number; names: string[]; at: number }[];
}

export interface RacePlayerPublic {
  participantId: string;
  number: number;
  name: string;
  avatar: string;
  progress: number;
  state: RaceLifeState;
  holding: boolean;
}

/** Personal (private) round state for the participant's own phone. */
export interface MyRoundState {
  locked: boolean;
  saved: boolean;
  pin: { lat: number; lng: number } | null;
  order: string[] | null;
  race: { progress: number; state: RaceLifeState } | null;
  /**
   * Personal result breakdown, populated only after the host reveals.
   * The extra fields are optional so an older client can never crash on a
   * newer server; all values come from the existing scoring / standings
   * services — the client never invents a score.
   */
  result: {
    raw: number;
    label: string;
    /** Points earned in this round and the maximum this round could award. */
    roundPoints?: number;
    roundMax?: number;
    /** Points earned so far in the current game and its maximum. */
    gamePoints?: number;
    gameMax?: number;
    /** Tournament total and rank across all games played so far. */
    tournamentTotal?: number;
    tournamentRank?: number;
  } | null;
}

export const ROUND_HALF_UP = (x: number): number => Math.floor(x + 0.5);
