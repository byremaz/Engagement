/**
 * Server-side round scoring for the three games (spec §12.5).
 * Turns persisted answers into raw scores + reveal payloads. Pure functions.
 */
import type { RaceLifeState, RevealPayload } from '@asas/shared';
import {
  COUNTRY_NAMES_AR,
  ORDER_LABELS_AR,
  geoResultLabel,
  geoRoundScore,
  orderResultLabel,
  scoreOrder,
  scoreRace,
  type CountryContent,
  type OrderContent,
} from '@asas/shared';
import { distanceToCountry } from '../geo/geometry';
import type { AnswerRow } from './round-repo';

export interface Named {
  id: string;
  name: string;
}

export interface ScoredEntry {
  participantId: string;
  raw: number;
  detail: Record<string, unknown>;
}

export interface RoundScoreResult {
  entries: ScoredEntry[];
  reveal: RevealPayload;
}

function nameOf(people: Named[], id: string): string {
  return people.find((p) => p.id === id)?.name ?? 'Unknown';
}

function topFive(entries: ScoredEntry[], people: Named[]): { name: string; score: number }[] {
  return [...entries]
    .sort((a, b) => b.raw - a.raw)
    .slice(0, 5)
    .map((e) => ({ name: nameOf(people, e.participantId), score: Math.round(e.raw) }));
}

/** Order It!: absolute-position scoring; unanswered = 0 (§8.2, §8.5). */
export function scoreOrderRound(content: OrderContent, answers: AnswerRow[], people: Named[]): RoundScoreResult {
  const entries: ScoredEntry[] = people.map((p) => {
    const a = answers.find((x) => x.participant_id === p.id);
    const order = a && Array.isArray(a.payload['order']) ? (a.payload['order'] as string[]) : null;
    const s = scoreOrder(content.correctOrder, order);
    return {
      participantId: p.id,
      raw: s.raw,
      detail: { correctPositions: s.correctPositions, positions: s.positions, label: orderResultLabel(s), locked: !!a?.locked_at },
    };
  });
  return {
    entries,
    reveal: {
      type: 'ORDER',
      correctOrder: content.correctOrder,
      explanation: content.explanation,
      explanationAr: ORDER_LABELS_AR[content.id]?.explanation ?? content.explanation,
      perfectCount: entries.filter((e) => e.raw === 100).length,
      topFive: topFive(entries, people),
    },
  };
}

/** Pin the Country: geodesic distance to accepted geometry (§7.5). */
export function scoreGeoRound(content: CountryContent, answers: AnswerRow[], people: Named[]): RoundScoreResult {
  const pins: Extract<RevealPayload, { type: 'GEO' }>['pins'] = [];
  const entries: ScoredEntry[] = people.map((p) => {
    const a = answers.find((x) => x.participant_id === p.id);
    const pin = a?.payload['pin'] as { lat: number; lng: number } | undefined;
    if (!pin || typeof pin.lat !== 'number' || typeof pin.lng !== 'number') {
      return { participantId: p.id, raw: 0, detail: { distanceKm: null, label: geoResultLabel(null, 0) } };
    }
    const d = distanceToCountry(content.code, pin.lat, pin.lng);
    const distanceKm = d ? d.distanceKm : null;
    const raw = geoRoundScore(distanceKm);
    pins.push({ participantId: p.id, name: p.name, lat: pin.lat, lng: pin.lng, distanceKm: distanceKm ?? -1, score: Math.round(raw) });
    return { participantId: p.id, raw, detail: { distanceKm, inside: d?.inside ?? false, label: geoResultLabel(distanceKm, raw) } };
  });
  return {
    entries,
    reveal: {
      type: 'GEO',
      countryCode: content.code,
      countryName: content.name,
      countryNameAr: COUNTRY_NAMES_AR[content.code] ?? content.name,
      insideCount: entries.filter((e) => e.detail['inside'] === true).length,
      topFive: topFive(entries, people),
      pins,
    },
  };
}

/** Red Light, Green Light: rank finishers, partial credit for survivors, 0 for eliminated (§6.8). */
export function scoreRaceRound(answers: AnswerRow[], people: Named[]): RoundScoreResult {
  const participations = people.map((p) => {
    const a = answers.find((x) => x.participant_id === p.id);
    const payload = (a?.payload ?? {}) as { progress?: number; state?: RaceLifeState; finishedAt?: number | null };
    return {
      participantId: p.id,
      state: payload.state ?? 'alive',
      progress: typeof payload.progress === 'number' ? payload.progress : 0,
      finishedAt: typeof payload.finishedAt === 'number' ? payload.finishedAt : null,
    };
  });
  const results = scoreRace(participations);
  const entries: ScoredEntry[] = results.map((r) => ({
    participantId: r.participantId,
    raw: r.raw,
    detail: {
      state: r.state,
      progress: r.progress,
      rank: r.rank,
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
        .map((r) => ({ participantId: r.participantId, name: nameOf(people, r.participantId), state: r.state, progress: r.progress, rank: r.rank, raw: r.raw }))
        .sort((a, b) => b.raw - a.raw),
    },
  };
}
