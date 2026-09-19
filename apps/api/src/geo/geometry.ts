/**
 * Country geometry and geodesic distance for Pin the Country (spec §7.5, §7.6).
 *
 * Data source (recorded per §7.6): world-atlas 2.0.2 `countries-110m.json`
 * (Natural Earth 1:110m admin-0 countries, ISC licence), pinned in
 * apps/api/package.json and loaded from node_modules at boot - never from
 * a live web request. Countries are keyed by ISO 3166-1 numeric ID and
 * mapped to the alpha-3 content codes used in @asas/shared.
 *
 * Scoring: d = 0 inside or on the boundary of any ring of the accepted
 * geometry; otherwise the shortest geodesic (great-circle) distance from the
 * pin to the boundary, computed against every ring segment (islands included).
 */
import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';

export const GEO_DATA_SOURCE = 'world-atlas@2.0.2 countries-110m.json (Natural Earth 1:110m)';

/** ISO 3166-1 alpha-3 -> numeric ID used by world-atlas. */
const ALPHA3_TO_NUMERIC: Record<string, string> = {
  SAU: '682',
  EGY: '818',
  BRA: '076',
  AUS: '036',
  JPN: '392',
  ITA: '380',
  CAN: '124',
  NOR: '578',
  MDG: '450',
  ARG: '032',
  DEU: '276',
};

export type Ring = [number, number][]; // [lng, lat]
export interface CountryGeometry {
  code: string;
  name: string;
  /** Polygons; each polygon = [outerRing, ...holes]. */
  polygons: Ring[][];
}

const EARTH_RADIUS_KM = 6371.0088;

let cache: Map<string, CountryGeometry> | null = null;

export function loadGeometries(): Map<string, CountryGeometry> {
  if (cache) return cache;
  const topoPath = require.resolve('world-atlas/countries-110m.json');
  const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
  const collection = feature(topo, topo.objects.countries) as unknown as {
    features: { id: string; properties: { name: string }; geometry: { type: string; coordinates: unknown } }[];
  };
  const byNumeric = new Map(collection.features.map((f) => [String(f.id), f]));
  const out = new Map<string, CountryGeometry>();
  for (const [alpha3, numeric] of Object.entries(ALPHA3_TO_NUMERIC)) {
    const f = byNumeric.get(numeric);
    if (!f) continue;
    const polygons: Ring[][] =
      f.geometry.type === 'Polygon'
        ? [f.geometry.coordinates as Ring[]]
        : (f.geometry.coordinates as Ring[][]);
    out.set(alpha3, { code: alpha3, name: f.properties.name, polygons });
  }
  cache = out;
  return out;
}

export function getGeometry(code: string): CountryGeometry | null {
  return loadGeometries().get(code) ?? null;
}

/** Public geometry payload for the reveal highlight (same geometry as scoring, §7.6). */
export function geometryForReveal(code: string): { type: 'MultiPolygon'; coordinates: Ring[][] } | null {
  const g = getGeometry(code);
  return g ? { type: 'MultiPolygon', coordinates: g.polygons } : null;
}

export interface DistanceResult {
  inside: boolean;
  /** 0 when inside/on boundary; otherwise km to nearest boundary point. */
  distanceKm: number;
}

/** Shortest distance from a pin to the accepted geometry (spec §7.5). */
export function distanceToCountry(code: string, lat: number, lng: number): DistanceResult | null {
  const g = getGeometry(code);
  if (!g) return null;
  const point: [number, number] = [normalizeLng(lng), lat];
  for (const polygon of g.polygons) {
    if (pointInPolygon(point, polygon)) return { inside: true, distanceKm: 0 };
  }
  let best = Number.POSITIVE_INFINITY;
  for (const polygon of g.polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i++) {
        const d = distanceToSegmentKm(point, ring[i]!, ring[i + 1]!);
        if (d < best) best = d;
      }
    }
  }
  return { inside: false, distanceKm: best };
}

// ------------------------------------------------------------------ helpers

function normalizeLng(lng: number): number {
  let x = ((((lng + 180) % 360) + 360) % 360) - 180;
  if (x === -180) x = 180;
  return x;
}

/** Ray casting with even-odd rule; holes handled because each ring toggles. */
function pointInPolygon(p: [number, number], polygon: Ring[]): boolean {
  let inside = false;
  for (const ring of polygon) {
    if (pointInRing(p, ring)) inside = !inside;
  }
  return inside;
}

function pointInRing(p: [number, number], ring: Ring): boolean {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i]![0];
    const yi = ring[i]![1];
    let xj = ring[j]![0];
    const yj = ring[j]![1];
    // Longitude wraparound: shift segment endpoints close to the point's meridian.
    if (xi - x > 180) xi -= 360;
    if (x - xi > 180) xi += 360;
    if (xj - x > 180) xj -= 360;
    if (x - xj > 180) xj += 360;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Great-circle distance from point P to the geodesic segment AB using 3D unit
 * vectors: project P onto the great circle through A,B; if the projection falls
 * within the arc, use the cross-track distance, else the nearer endpoint.
 */
function distanceToSegmentKm(p: [number, number], a: [number, number], b: [number, number]): number {
  const P = toVec(p);
  const A = toVec(a);
  const B = toVec(b);
  const n = cross(A, B);
  const nLen = Math.hypot(n[0], n[1], n[2]);
  if (nLen < 1e-12) return haversineKm(p, a); // degenerate segment
  const nUnit: Vec = [n[0] / nLen, n[1] / nLen, n[2] / nLen];
  // Projection of P on the plane of the great circle.
  const dot = P[0] * nUnit[0] + P[1] * nUnit[1] + P[2] * nUnit[2];
  const proj: Vec = [P[0] - dot * nUnit[0], P[1] - dot * nUnit[1], P[2] - dot * nUnit[2]];
  const pLen = Math.hypot(proj[0], proj[1], proj[2]);
  if (pLen < 1e-12) return Math.min(haversineKm(p, a), haversineKm(p, b));
  const T: Vec = [proj[0] / pLen, proj[1] / pLen, proj[2] / pLen];
  // Is T between A and B along the arc? Check both cross products point the same way as n.
  const c1 = cross(A, T);
  const c2 = cross(T, B);
  const within = c1[0] * n[0] + c1[1] * n[1] + c1[2] * n[2] >= 0 && c2[0] * n[0] + c2[1] * n[1] + c2[2] * n[2] >= 0;
  if (within) {
    const angle = Math.asin(Math.min(1, Math.abs(dot)));
    return angle * EARTH_RADIUS_KM;
  }
  return Math.min(haversineKm(p, a), haversineKm(p, b));
}

type Vec = [number, number, number];

function toVec([lng, lat]: [number, number]): Vec {
  const la = (lat * Math.PI) / 180;
  const lo = (lng * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
