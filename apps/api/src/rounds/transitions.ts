/**
 * Allowed host-driven state transitions (spec §4.5, §11).
 * Pure table so it can be unit-tested without a database.
 * Pause is an overlay and is validated separately.
 */
import type { HostAction, SessionState } from '@asas/shared';

const ALLOWED: Record<HostAction, SessionState[]> = {
  SHOW_INSTRUCTIONS: ['Lobby', 'GameResults', 'Instructions'],
  START_PRACTICE: ['Instructions', 'Reveal'],
  REVEAL_PRACTICE: ['InputLocked'],
  START_GAME: ['Instructions', 'Reveal'],
  START_ROUND: ['Ready'],
  PAUSE: ['Countdown', 'RoundActive'],
  RESUME: ['Countdown', 'RoundActive'],
  REVEAL_RESULTS: ['InputLocked'],
  NEXT_ROUND: ['Reveal'],
  SHOW_GAME_RESULTS: ['Reveal'],
  NEXT_GAME: ['GameResults'],
  SHOW_FINAL_RESULTS: ['GameResults', 'Reveal', 'TournamentResults'],
  VOID_ROUND: ['Countdown', 'RoundActive', 'InputLocked', 'Reveal'],
  START_TIEBREAK: ['TournamentResults'],
  OPEN_JOIN: [],
  CLOSE_JOIN: [],
  CEREMONY_STEP: ['TournamentResults'],
  STANDINGS_PAGE: ['Reveal', 'GameResults', 'TournamentResults'],
  CLOSE_SESSION: ['TournamentResults', 'Lobby', 'GameResults'],
};

export function canTransition(action: HostAction, state: SessionState, paused: boolean): string | null {
  if (state === 'Closed') return 'session is closed';
  const from = ALLOWED[action];
  if (!from.includes(state)) return `${action} is not allowed while ${state}`;
  if (action === 'PAUSE' && paused) return 'already paused';
  if (action === 'RESUME' && !paused) return 'not paused';
  if (paused && !['RESUME', 'VOID_ROUND'].includes(action)) return 'resume or void the round first';
  return null;
}

/** Timers close input only; they never advance the stage (§4.5). */
export const AUTO_CLOSE_TARGET: SessionState = 'InputLocked';
export const COUNTDOWN_MS = 3000;
