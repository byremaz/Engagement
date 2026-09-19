/**
 * Builds the public SessionSnapshot sent to every client (spec §12.2, §12.6).
 * Solutions (correct order, reveal camera) and private pins are stripped
 * until the attempt has been revealed.
 *
 * Arabic labels are resolved from the ID-keyed maps in `@asas/shared` so a
 * language switch on a client never needs another request, and the
 * score-bearing identity (option IDs, country codes, question IDs) is never
 * translated [secure-coding].
 */
import type {
  CountryContent,
  GameType,
  OrderContent,
  RaceContent,
  RevealPayload,
  RoundPublic,
  SessionSnapshot,
  StandingRow,
} from '@asas/shared';
import {
  COUNTRY_NAMES_AR,
  GAME_ORDER,
  ORDER_LABELS_AR,
  RACE_LABELS_AR,
  initialOrderFor,
} from '@asas/shared';
import type { SessionRow } from '../sessions/sessions.service';
import type { AttemptRow } from './round-repo';

export function gameTypeAt(index: number): GameType | null {
  return GAME_ORDER[index] ?? null;
}

export function roundCountFor(session: SessionRow, game: GameType | null): number {
  if (!game) return 0;
  const c = session.content;
  return game === 'RLGL' ? c.races.scored.length : game === 'GEO' ? c.countries.scored.length : c.ordering.scored.length;
}

export function roundPublicFor(attempt: AttemptRow): RoundPublic | null {
  const content = attempt.content as unknown;
  switch (attempt.game_type) {
    case 'RLGL': {
      const r = content as RaceContent;
      const ar = RACE_LABELS_AR[r.id];
      return {
        type: 'RLGL',
        title: r.title,
        titleAr: ar?.title ?? r.title,
        scene: r.scene,
        sceneAr: ar?.scene ?? r.scene,
        durationMs: attempt.duration_ms,
        trackLength: r.trackLength,
      };
    }
    case 'GEO': {
      const c = content as CountryContent;
      return {
        type: 'GEO',
        countryName: c.name,
        countryNameAr: COUNTRY_NAMES_AR[c.code] ?? c.name,
        durationMs: attempt.duration_ms,
      };
    }
    case 'ORDER': {
      const q = content as OrderContent;
      // Shared, deterministic start order that is never the full solution (§8.2).
      const start = initialOrderFor(q.correctOrder, `${attempt.id}:${attempt.seed}`);
      const ar = ORDER_LABELS_AR[q.id];
      // Arabic option labels are positional against the *correct* order, so map
      // each option ID back to its index in `q.options` before translating.
      const options = start
        .map((id) => q.options.find((o) => o.id === id)!)
        .map((o) => {
          const idx = q.options.findIndex((x) => x.id === o.id);
          return { id: o.id, label: o.label, labelAr: ar?.labels[idx] ?? o.label };
        });
      return {
        type: 'ORDER',
        questionId: q.id,
        prompt: q.prompt,
        promptAr: ar?.prompt ?? q.prompt,
        direction: q.direction,
        directionAr: ar?.direction ?? q.direction,
        options,
        durationMs: attempt.duration_ms,
      };
    }
    default:
      return null;
  }
}

export interface SnapshotExtras {
  responseCount: number;
  participantCount: number;
  readyCount: number;
  reveal: RevealPayload | null;
  standings: StandingRow[] | null;
  race: SessionSnapshot['race'];
}

export function buildSnapshot(session: SessionRow, attempt: AttemptRow | null, extras: SnapshotExtras, now = Date.now()): SessionSnapshot {
  const game = gameTypeAt(session.game_index);
  const inRound = ['Countdown', 'RoundActive'].includes(session.state);
  const countdownEndsAt = attempt?.countdown_ends_at ? attempt.countdown_ends_at.getTime() : null;
  const deadlineAt = attempt?.deadline_at ? attempt.deadline_at.getTime() : null;
  let remainingMs: number | null = null;
  if (attempt && inRound) {
    remainingMs = session.paused && attempt.paused_remaining_ms !== null
      ? attempt.paused_remaining_ms
      : deadlineAt !== null ? Math.max(0, deadlineAt - now) : null;
  }
  const showReveal = attempt?.revealed_at != null || session.state === 'Reveal';
  return {
    sessionId: session.id,
    title: session.title,
    joinCode: session.join_code,
    state: session.state,
    paused: session.paused,
    joinOpen: session.join_open,
    seq: Number(session.seq),
    serverTime: now,
    gameType: game,
    gameIndex: session.game_index,
    roundNumber: attempt ? attempt.round_index + 1 : session.round_index + 1,
    roundCount: roundCountFor(session, game),
    attemptId: attempt?.id ?? null,
    isPractice: attempt?.is_practice ?? false,
    countdownEndsAt: session.paused ? null : countdownEndsAt,
    deadlineAt: session.paused ? null : deadlineAt,
    remainingMs,
    responseCount: extras.responseCount,
    participantCount: extras.participantCount,
    readyCount: extras.readyCount,
    ceremonyStep: session.ceremony_step,
    standingsPage: session.standings_page ?? 0,
    eventStartedAt: session.event_started_at ? session.event_started_at.getTime() : null,
    roundPublic: attempt && !attempt.voided_at ? roundPublicFor(attempt) : null,
    reveal: showReveal ? extras.reveal : null,
    standings: extras.standings,
    race: extras.race,
  };
}
