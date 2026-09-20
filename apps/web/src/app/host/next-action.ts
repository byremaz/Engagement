/**
 * Pure host-action resolvers (plan v2 §4.2): ONE primary press derived from the
 * authoritative snapshot, plus the secondary actions the server accepts in the
 * same state. Kept free of Angular so both components and any future test
 * read the same rules.
 */
import type { HostAction, SessionSnapshot } from '@asas/shared';

/** Resume always wins: a paused event has exactly one sensible next press. */
export function primaryActionFor(s: SessionSnapshot | null): HostAction | null {
  if (!s) return null;
  if (s.paused) return 'RESUME';
  switch (s.state) {
    case 'Lobby':
      return 'SHOW_INSTRUCTIONS';
    case 'Instructions':
      return 'START_PRACTICE';
    case 'Ready':
      return 'START_ROUND';
    case 'InputLocked':
      return s.isPractice ? 'REVEAL_PRACTICE' : 'REVEAL_RESULTS';
    case 'Reveal':
      if (s.isPractice) return 'START_GAME';
      return s.roundNumber >= s.roundCount ? 'SHOW_GAME_RESULTS' : 'NEXT_ROUND';
    case 'GameResults': {
      // Step through the podium first (3rd → 2nd → champion → table), then move on.
      const step = s.podiumStep ?? 0;
      if (step < 4) return 'PODIUM_STEP';
      return s.gameIndex >= 2 ? 'SHOW_FINAL_RESULTS' : 'NEXT_GAME';
    }
    case 'TournamentResults':
      return s.ceremonyStep < 4 ? 'CEREMONY_STEP' : null;
    default:
      return null;
  }
}

/** The next podium / ceremony step the primary press should send. */
export function nextStepFor(s: SessionSnapshot | null): number {
  if (!s) return 0;
  const cur = s.state === 'GameResults' ? (s.podiumStep ?? 0) : s.ceremonyStep;
  return Math.min(4, cur + 1);
}

/** Which stage actions the server accepts in which state (see transitions.ts). */
const BY_STATE: Partial<Record<SessionSnapshot['state'], HostAction[]>> = {
  Lobby: ['SHOW_INSTRUCTIONS'],
  Instructions: ['SHOW_INSTRUCTIONS', 'START_PRACTICE', 'START_GAME'],
  Ready: ['START_ROUND'],
  InputLocked: ['REVEAL_PRACTICE', 'REVEAL_RESULTS'],
  Reveal: ['START_GAME', 'NEXT_ROUND', 'SHOW_GAME_RESULTS'],
  GameResults: ['SHOW_INSTRUCTIONS', 'NEXT_GAME', 'SHOW_FINAL_RESULTS'],
};

export function secondaryActionsFor(s: SessionSnapshot | null, primary: HostAction | null): HostAction[] {
  if (!s || s.paused) return [];
  return (BY_STATE[s.state] ?? []).filter((a) => {
    if (a === primary) return false;
    if (a === 'REVEAL_PRACTICE') return s.isPractice;
    if (a === 'REVEAL_RESULTS') return !s.isPractice;
    if (a === 'START_GAME') return s.state === 'Instructions' || s.isPractice;
    if (a === 'NEXT_ROUND') return !s.isPractice && s.roundNumber < s.roundCount;
    if (a === 'SHOW_GAME_RESULTS') return !s.isPractice;
    return true;
  });
}

/** Pause exists only while a round is live; Resume is the primary while paused. */
export function pauseActionFor(s: SessionSnapshot | null): HostAction | null {
  if (!s) return null;
  const live = s.state === 'Countdown' || s.state === 'RoundActive';
  return live && !s.paused ? 'PAUSE' : null;
}
