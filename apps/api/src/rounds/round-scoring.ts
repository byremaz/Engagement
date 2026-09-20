/**
 * Server-side round scoring for the three games (spec §12.5, plan v2 §7).
 * Turns persisted answers into raw scores + reveal payloads. Pure functions.
 * The rule set (v1 or v2) is the one frozen into the session.
 */
import type { RaceLifeState, RevealPayload, RoundResultDetail, ScoringRules } from '@asas/shared';
import {
  COUNTRY_NAMES_AR,
  ORDER_LABELS_AR,
  geoResultLabel,
  orderResultLabel,
  type CountryContent,
  type OrderContent,
} from '@asas/shared';
import { distanceToCountry, geometryForReveal } from '../geo/geometry';
import type { AnswerRow } from './round-repo';

export interface Named {
  id: string;
  name: string;
}

export interface ScoredEntry {
  participantId: string;
  raw: number;
  detail: Record<string, unknown> & RoundResultDetail & { label: string };
}

export interface RoundScoreResult {
  entries: ScoredEntry[];
  reveal: RevealPayload;
}

export interface RoundScoringContext {
  rules: ScoringRules;
  /** Round duration = the speed window for GEO/ORDER. */
  windowMs: number;
  /** Registered count at race start (v1 race normalization only). */
  registered?: number | null;
}

function nameOf(people: Named[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? 'Unknown';
}

function topFive(entries: ScoredEntry[], people: Named[]): { name: string; score: number }[] {
  return [...entries]
    .sort((a, b) => b.raw - a.raw || a.participantId.localeCompare(b.participantId))
    .slice(0, 5)
    .map((e) => ({ name: nameOf(people, e.participantId), score: Math.round(e.raw) }));
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

/** Order It!: absolute-position scoring; unanswered = 0 (§8.2, §8.5). */
export function scoreOrderRound(content: OrderContent, answers: AnswerRow[], people: Named[], ctx: RoundScoringContext): RoundScoreResult {
  const entries: ScoredEntry[] = people.map((p) => {
    const a = answers.find((x) => x.participant_id === p.id);
    const order = a && Array.isArray(a.payload['order']) ? (a.payload['order'] as string[]) : null;
    const lockedManually = !!a?.locked_at && a.time_ms !== null && a.time_ms !== undefined;
    const s = ctx.rules.order({ correctOrder: content.correctOrder, answer: order, timeMs: a?.time_ms ?? null, lockedManually, windowMs: ctx.windowMs });
    return {
      participantId: p.id,
      raw: s.raw,
      detail: {
        correctPositions: s.correctPositions,
        positions: s.positions,
        label: orderResultLabel(s),
        locked: !!a?.locked_at,
        lockedManually,
        base: round1(s.base),
        speed: round1(s.speed),
        timeMs: a?.time_ms ?? null,
      },
    };
  });
  return {
    entries,
    reveal: {
      type: 'ORDER',
      correctOrder: content.correctOrder,
      explanation: content.explanation,
      explanationAr: ORDER_LABELS_AR[content.id]?.explanation ?? content.explanation,
      perfectCount: entries.filter((e) => e.detail.correctPositions === content.correctOrder.length).length,
      topFive: topFive(entries, people),
      perParticipant: entries.map((e) => ({
        participantId: e.participantId,
        name: nameOf(people, e.participantId),
        raw: round1(e.raw),
        base: e.detail.base,
        speed: e.detail.speed,
        timeMs: e.detail.timeMs,
        correctPositions: e.detail.correctPositions,
        lockedManually: e.detail.lockedManually,
      })),
    },
  };
}

/** Pin the Country: geodesic distance to accepted geometry (§7.5). */
export function scoreGeoRound(content: CountryContent, answers: AnswerRow[], people: Named[], ctx: RoundScoringContext): RoundScoreResult {
  const pins: Extract<RevealPayload, { type: 'GEO' }>['pins'] = [];
  const entries: ScoredEntry[] = people.map((p) => {
    const a = answers.find((x) => x.participant_id === p.id);
    const pin = a?.payload['pin'] as { lat: number; lng: number } | undefined;
    if (!pin || typeof pin.lat !== 'number' || typeof pin.lng !== 'number') {
      return { participantId: p.id, raw: 0, detail: { distanceKm: null, inside: false, label: geoResultLabel(null, 0), base: 0, speed: 0, timeMs: null, lockedManually: false } };
    }
    const d = distanceToCountry(content.code, pin.lat, pin.lng);
    const distanceKm = d ? d.distanceKm : null;
    const lockedManually = !!a?.locked_at && a.time_ms !== null && a.time_ms !== undefined;
    const s = ctx.rules.geo({ distanceKm, inside: d?.inside ?? false, timeMs: a?.time_ms ?? null, lockedManually, windowMs: ctx.windowMs });
    pins.push({
      participantId: p.id,
      name: p.name,
      lat: pin.lat,
      lng: pin.lng,
      distanceKm: distanceKm ?? -1,
      score: Math.round(s.raw),
      base: round1(s.base),
      speed: round1(s.speed),
      timeMs: a?.time_ms ?? null,
      inside: d?.inside ?? false,
    });
    return {
      participantId: p.id,
      raw: s.raw,
      detail: { distanceKm, inside: d?.inside ?? false, label: geoResultLabel(distanceKm, s.raw), base: round1(s.base), speed: round1(s.speed), timeMs: a?.time_ms ?? null, lockedManually },
    };
  });
  return {
    entries,
    reveal: {
      type: 'GEO',
      countryCode: content.code,
      countryName: content.name,
      countryNameAr: COUNTRY_NAMES_AR[content.code] ?? content.name,
      insideCount: entries.filter((e) => e.detail.inside === true).length,
      topFive: topFive(entries, people),
      pins,
      geometry: geometryForReveal(content.code),
      center: content.revealView ?? null,
    },
  };
}

/** Red Light, Green Light: finishers by speed, partial credit for survivors, 0 for eliminated (§6.8, plan §7.2). */
export function scoreRaceRound(answers: AnswerRow[], people: Named[], ctx: RoundScoringContext): RoundScoreResult {
  const participations = people.map((p) => {
    const a = answers.find((x) => x.participant_id === p.id);
    const payload = (a?.payload ?? {}) as { progress?: number; state?: RaceLifeState; finishedAt?: number | null; finishActiveMs?: number | null };
    return {
      participantId: p.id,
      state: payload.state ?? 'alive',
      progress: typeof payload.progress === 'number' ? payload.progress : 0,
      finishActiveMs: typeof payload.finishActiveMs === 'number' ? payload.finishActiveMs : typeof payload.finishedAt === 'number' ? payload.finishedAt : null,
    };
  });
  const results = ctx.rules.race(participations, ctx.registered ?? undefined);
  const entries: ScoredEntry[] = results.map((r) => ({
    participantId: r.participantId,
    raw: r.raw,
    detail: {
      state: r.state,
      raceState: r.state,
      progress: r.progress,
      rank: r.rank,
      finishRank: r.rank,
      base: round1(r.base),
      speed: round1(r.speed),
      timeMs: r.finishActiveMs,
      label:
        r.state === 'eliminated'
          ? 'Eliminated: 0/100'
          : r.state === 'finished'
            ? `Finished #${r.rank}: ${Math.round(r.raw)}/100`
            : `Reached ${Math.round(r.progress)}%: ${Math.round(r.raw)}/100`,
    },
  }));
  return {
    entries,
    reveal: {
      type: 'RLGL',
      results: results
        .map((r) => ({
          participantId: r.participantId,
          name: nameOf(people, r.participantId),
          state: r.state,
          progress: r.progress,
          rank: r.rank,
          raw: round1(r.raw),
          base: round1(r.base),
          speed: round1(r.speed),
          timeMs: r.finishActiveMs,
        }))
        .sort((a, b) => b.raw - a.raw || (a.rank ?? 999) - (b.rank ?? 999)),
    },
  };
}
