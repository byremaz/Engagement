/**
 * Geometry checks for Pin the Country (spec §7.5, §7.6; acceptance AC-06, AC-07).
 * Uses the same pinned world-atlas dataset the API scores with at runtime.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GEO_COUNTRIES, GEO_PRACTICE, GEO_SPARES, geoGameScore, geoRoundScore } from '@asas/shared';
import { distanceToCountry, getGeometry, haversineKm, loadGeometries } from '../src/geo/geometry';

describe('Country geometry dataset (§7.6)', () => {
  it('has reviewed geometry for every practice, scored and spare country', () => {
    const all = [GEO_PRACTICE, ...GEO_COUNTRIES, ...GEO_SPARES];
    for (const c of all) {
      const g = getGeometry(c.code);
      assert.ok(g, `missing geometry for ${c.code}`);
      assert.ok(g!.polygons.length >= 1, `${c.code} has no polygons`);
    }
    assert.equal(loadGeometries().size, all.length);
  });
});

describe('Pin scoring against geometry (AC-06)', () => {
  it('inside a country: distance 0 and full raw points', () => {
    // Riyadh
    const r = distanceToCountry('SAU', 24.7136, 46.6753)!;
    assert.equal(r.inside, true);
    assert.equal(r.distanceKm, 0);
    assert.equal(geoRoundScore(r.distanceKm), 100);
  });

  it('on the boundary: treated as inside (0 km)', () => {
    const g = getGeometry('EGY')!;
    const ring = g.polygons[0]![0]!;
    // Midpoint of the first boundary segment lies on the boundary.
    const [a, b] = [ring[0]!, ring[1]!];
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r = distanceToCountry('EGY', mid[1], mid[0])!;
    assert.ok(r.distanceKm < 1, `boundary pin should be ~0 km, got ${r.distanceKm}`);
  });

  it('outside a country: positive geodesic distance to the nearest boundary', () => {
    // Pin in the Mediterranean north of Alexandria, asked for Egypt.
    const r = distanceToCountry('EGY', 33.0, 29.9)!;
    assert.equal(r.inside, false);
    assert.ok(r.distanceKm > 100 && r.distanceKm < 250, `unexpected distance ${r.distanceKm}`);
    // Pin in Cairo when Brazil was asked: far away, scores zero.
    const far = distanceToCountry('BRA', 30.04, 31.24)!;
    assert.ok(far.distanceKm > 5000);
    assert.equal(geoRoundScore(far.distanceKm), 0);
  });

  it('accepted islands count as inside (Hokkaido for Japan, Tasmania for Australia)', () => {
    const hokkaido = distanceToCountry('JPN', 43.06, 141.35)!; // Sapporo
    assert.equal(hokkaido.inside, true);
    const tasmania = distanceToCountry('AUS', -42.88, 147.33)!; // Hobart
    assert.equal(tasmania.inside, true);
    // Madagascar is itself an island; Antananarivo is inside.
    assert.equal(distanceToCountry('MDG', -18.88, 47.51)!.inside, true);
  });

  it('a wrong neighbouring country is outside, not inside', () => {
    // Amman (Jordan) asked for Saudi Arabia.
    const r = distanceToCountry('SAU', 31.95, 35.93)!;
    assert.equal(r.inside, false);
    assert.ok(r.distanceKm > 50);
  });

  it('handles longitude wraparound consistently', () => {
    const a = distanceToCountry('JPN', 35.68, 139.69)!; // Tokyo
    const b = distanceToCountry('JPN', 35.68, 139.69 - 360)!;
    assert.equal(a.inside, true);
    assert.equal(b.inside, true);
  });

  it('returns null for unknown content codes', () => {
    assert.equal(distanceToCountry('XXX', 0, 0), null);
  });
});

describe('Distance-to-score mapping (AC-07)', () => {
  it('1,000 km scores 80 raw; 5,000 km scores zero; inside scores 100', () => {
    assert.equal(geoRoundScore(0), 100);
    assert.equal(geoRoundScore(1000), 80);
    assert.equal(geoRoundScore(5000), 0);
    assert.equal(geoRoundScore(7000), 0);
  });

  it('eight perfect pins score exactly 1,000 game points', () => {
    assert.equal(geoGameScore([100, 100, 100, 100, 100, 100, 100, 100]), 1000);
  });

  it('haversine matches a known great-circle distance', () => {
    // Riyadh -> Cairo is roughly 1,640 km.
    const d = haversineKm([46.6753, 24.7136], [31.2357, 30.0444]);
    assert.ok(d > 1600 && d < 1700, `got ${d}`);
  });
});
