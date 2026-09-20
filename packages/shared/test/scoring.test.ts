import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORING_RULE_VERSION,
  SCORING_RULE_VERSION_V1,
  buildStandings,
  geoGameScore,
  geoRoundScore,
  geoRoundScoreV2,
  initialOrderFor,
  orderGameScore,
  rlglGameScore,
  scoreOrder,
  scoreOrderV2,
  scoreRace,
  scoreRaceV2,
  scoringRules,
  speedBonus,
  tieBreakValues,
  topThreeTies,
  type RaceParticipation,
} from '../src/scoring';
import { ORDER_QUESTIONS, validateContentBank } from '../src/content';

const near = (a: number, b: number, eps = 0.05): void => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

describe('Scoring v2 (plan §7): 80 achievement + 20 speed', () => {
  it('speed bonus is linear over the window, bucketed to 100 ms, and 0 when never locked', () => {
    assert.equal(speedBonus(0, 20_000), 20);
    assert.equal(speedBonus(10_000, 20_000), 10);
    assert.equal(speedBonus(20_000, 20_000), 0);
    assert.equal(speedBonus(25_000, 20_000), 0);
    assert.equal(speedBonus(null, 20_000), 0);
    assert.equal(speedBonus(1_049, 20_000), speedBonus(1_000, 20_000)); // same bucket
  });

  it('race: first finisher 100, +5 s → 93.3, +15 s → 80; alive 60·p; eliminated 0', () => {
    const res = new Map(
      scoreRaceV2([
        { participantId: 'first', state: 'finished', progress: 100, finishActiveMs: 40_000 },
        { participantId: 'plus5', state: 'finished', progress: 100, finishActiveMs: 45_000 },
        { participantId: 'plus10', state: 'finished', progress: 100, finishActiveMs: 50_000 },
        { participantId: 'plus15', state: 'finished', progress: 100, finishActiveMs: 55_000 },
        { participantId: 'late', state: 'finished', progress: 100, finishActiveMs: 70_000 },
        { participantId: 'alive90', state: 'alive', progress: 90, finishActiveMs: null },
        { participantId: 'alive50', state: 'alive', progress: 50, finishActiveMs: null },
        { participantId: 'dead95', state: 'eliminated', progress: 95, finishActiveMs: null },
      ]).map((r) => [r.participantId, r]),
    );
    assert.equal(res.get('first')!.raw, 100);
    near(res.get('plus5')!.raw, 93.33);
    near(res.get('plus10')!.raw, 86.67);
    assert.equal(res.get('plus15')!.raw, 80);
    assert.equal(res.get('late')!.raw, 80);
    assert.equal(res.get('alive90')!.raw, 54);
    assert.equal(res.get('alive50')!.raw, 30);
    assert.equal(res.get('dead95')!.raw, 0);
    assert.equal(res.get('first')!.rank, 1);
    assert.equal(res.get('plus5')!.rank, 2);
    // Finishing last still beats the best possible survivor.
    assert.ok(res.get('late')!.raw > 60);
    // Game examples from the plan.
    assert.equal(rlglGameScore([100, 0, 30]), 433);
    assert.equal(rlglGameScore([93.3, 86.7, 100]), 933);
  });

  it('race: finishers in the same 100 ms bucket share rank and points', () => {
    const [a, b] = scoreRaceV2([
      { participantId: 'a', state: 'finished', progress: 100, finishActiveMs: 30_000 },
      { participantId: 'b', state: 'finished', progress: 100, finishActiveMs: 30_090 },
    ]);
    assert.equal(a.rank, 1);
    assert.equal(b.rank, 1);
    assert.equal(a.raw, b.raw);
  });

  it('geo: inside 80 + speed (manual lock only); outside 10 per 500 km; no pin 0', () => {
    const W = 25_000;
    near(geoRoundScoreV2({ distanceKm: 0, inside: true, timeMs: 3_000, lockedManually: true, windowMs: W }).raw, 97.6);
    assert.equal(geoRoundScoreV2({ distanceKm: 0, inside: true, timeMs: 10_000, lockedManually: true, windowMs: W }).raw, 92);
    assert.equal(geoRoundScoreV2({ distanceKm: 0, inside: true, timeMs: 20_000, lockedManually: true, windowMs: W }).raw, 84);
    assert.equal(geoRoundScoreV2({ distanceKm: 0, inside: true, timeMs: null, lockedManually: false, windowMs: W }).raw, 80);
    assert.equal(geoRoundScoreV2({ distanceKm: 100, inside: false, timeMs: 2_000, lockedManually: true, windowMs: W }).raw, 78);
    assert.equal(geoRoundScoreV2({ distanceKm: 500, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw, 70);
    assert.equal(geoRoundScoreV2({ distanceKm: 1_000, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw, 60);
    assert.equal(geoRoundScoreV2({ distanceKm: 2_000, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw, 40);
    assert.equal(geoRoundScoreV2({ distanceKm: 4_000, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw, 0);
    assert.equal(geoRoundScoreV2({ distanceKm: 4_500, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw, 0);
    assert.equal(geoRoundScoreV2({ distanceKm: null, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw, 0);
    // A slow inside pin always beats a fast pin 1 km outside.
    assert.ok(80 > geoRoundScoreV2({ distanceKm: 1, inside: false, timeMs: 0, lockedManually: true, windowMs: W }).raw);
    // Plan example: 5 inside (avg 8 s) + 2 at 600 km + 1 none → 755.
    const inside8 = geoRoundScoreV2({ distanceKm: 0, inside: true, timeMs: 8_000, lockedManually: true, windowMs: W }).raw;
    const out600 = geoRoundScoreV2({ distanceKm: 600, inside: false, timeMs: null, lockedManually: false, windowMs: W }).raw;
    assert.equal(geoGameScore([inside8, inside8, inside8, inside8, inside8, out600, out600, 0]), 755);
  });

  it('order: 20 per position, perfect + manual lock adds speed; a fast half-right never beats a slow perfect', () => {
    const correct = ['a', 'b', 'c', 'd'];
    const W = 20_000;
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: correct, timeMs: 3_000, lockedManually: true, windowMs: W }).raw, 97);
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: correct, timeMs: 8_000, lockedManually: true, windowMs: W }).raw, 92);
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: correct, timeMs: 15_000, lockedManually: true, windowMs: W }).raw, 85);
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: correct, timeMs: null, lockedManually: false, windowMs: W }).raw, 80);
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: ['b', 'a', 'c', 'd'], timeMs: 1_000, lockedManually: true, windowMs: W }).raw, 40);
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: ['d', 'a', 'b', 'c'], timeMs: 1_000, lockedManually: true, windowMs: W }).raw, 0);
    assert.equal(scoreOrderV2({ correctOrder: correct, answer: null, timeMs: null, lockedManually: false, windowMs: W }).raw, 0);
    const perfect7 = scoreOrderV2({ correctOrder: correct, answer: correct, timeMs: 7_000, lockedManually: true, windowMs: W }).raw;
    assert.equal(orderGameScore([perfect7, perfect7, perfect7, perfect7, perfect7, perfect7, 40, 40, 0, 0]), 638);
  });

  it('rule sets are selected by the frozen session version; v1 keeps 25 per card and its formulas', () => {
    assert.equal(scoringRules(SCORING_RULE_VERSION).version, '2.0.0');
    assert.equal(scoringRules(SCORING_RULE_VERSION_V1).version, '1.2.0');
    assert.equal(scoringRules(undefined).version, '1.2.0');
    const v1 = scoringRules(SCORING_RULE_VERSION_V1);
    assert.equal(v1.order({ correctOrder: ['a', 'b', 'c', 'd'], answer: ['a', 'b', 'c', 'd'], timeMs: 0, lockedManually: true, windowMs: 20_000 }).raw, 100);
    assert.equal(v1.geo({ distanceKm: 640, inside: false, timeMs: null, lockedManually: false, windowMs: 25_000 }).raw, 87.2);
    // v1 race uses the registered count, not the number of rows scored (BUG-C).
    const [, second] = v1.race(
      [
        { participantId: 'a', state: 'finished', progress: 100, finishActiveMs: 30_000 },
        { participantId: 'b', state: 'finished', progress: 100, finishActiveMs: 31_000 },
      ],
      5,
    );
    assert.equal(second.raw, 95); // 80 + 20·(5−2)/4
  });
});

describe('Red Light, Green Light (§6.8)', () => {
  it('ranks finishers with 0.1 s buckets and scores the rest by progress', () => {
    const t0 = 1_000_000;
    const parts: RaceParticipation[] = [
      { participantId: 'a', state: 'finished', progress: 100, finishedAt: t0 + 30_000 },
      { participantId: 'b', state: 'finished', progress: 100, finishedAt: t0 + 30_050 }, // same bucket as a
      { participantId: 'c', state: 'finished', progress: 100, finishedAt: t0 + 31_000 },
      { participantId: 'd', state: 'alive', progress: 50, finishedAt: null },
      { participantId: 'e', state: 'eliminated', progress: 70, finishedAt: null },
    ];
    const res = new Map(scoreRace(parts).map((r) => [r.participantId, r]));
    assert.equal(res.get('a')!.rank, 1);
    assert.equal(res.get('b')!.rank, 1);
    assert.equal(res.get('c')!.rank, 3);
    assert.equal(res.get('a')!.raw, 100); // 80 + 20*(5-1)/4
    assert.equal(res.get('c')!.raw, 90); // 80 + 20*(5-3)/4
    assert.equal(res.get('d')!.raw, 40); // 80 * 0.5
    assert.equal(res.get('e')!.raw, 0);
  });

  it('single finisher scores 100 and game total uses the 300 denominator', () => {
    const [only] = scoreRace([{ participantId: 'x', state: 'finished', progress: 100, finishedAt: 10 }]);
    assert.equal(only.raw, 100);
    assert.equal(rlglGameScore([100, 100, 100]), 1000);
    assert.equal(rlglGameScore([100, 0, 40]), 467); // 1000*140/300 = 466.67 -> 467
    assert.equal(rlglGameScore([]), 0);
  });
});

describe('Pin the Country (§7.5)', () => {
  it('scores by distance and clamps at 5000 km', () => {
    assert.equal(geoRoundScore(0), 100);
    assert.equal(geoRoundScore(640), 87.2);
    assert.equal(geoRoundScore(5000), 0);
    assert.equal(geoRoundScore(9000), 0);
    assert.equal(geoRoundScore(null), 0);
  });

  it('rounds half up only at game level over 8 rounds', () => {
    assert.equal(geoGameScore(new Array(8).fill(100)), 1000);
    assert.equal(geoGameScore([87.2, 100, 0, 0, 0, 0, 0, 0]), 234); // 1000*187.2/800 = 234
    assert.equal(geoGameScore([0.4]), 1); // 0.5 -> 1 (half up)
  });
});

describe('Order It! (§8.5)', () => {
  it('awards 25 per absolute position', () => {
    const correct = ['a', 'b', 'c', 'd'];
    assert.equal(scoreOrder(correct, ['a', 'b', 'c', 'd']).raw, 100);
    assert.equal(scoreOrder(correct, ['b', 'a', 'c', 'd']).raw, 50);
    assert.equal(scoreOrder(correct, ['d', 'a', 'b', 'c']).raw, 0);
    assert.equal(scoreOrder(correct, null).raw, 0);
    assert.equal(orderGameScore(new Array(10).fill(100)), 1000);
  });

  it('never presents the correct answer as the starting order', () => {
    for (const question of ORDER_QUESTIONS) {
      for (let i = 0; i < 50; i++) {
        const start = initialOrderFor(question.correctOrder, `${question.id}:${i}`);
        assert.notDeepEqual(start, question.correctOrder);
        assert.deepEqual([...start].sort(), [...question.correctOrder].sort());
      }
    }
  });
});

describe('Standings and ties (§9)', () => {
  const base = { avatar: 'a1', tieBreak: null };
  it('uses displayed totals, then perfect games, then shared rank', () => {
    const rows = buildStandings([
      { participantId: 'p1', number: 1, name: 'One', rlgl: 1000, geo: 500, order: 500, ...base },
      { participantId: 'p2', number: 2, name: 'Two', rlgl: 700, geo: 700, order: 600, ...base },
      { participantId: 'p3', number: 3, name: 'Three', rlgl: 600, geo: 700, order: 700, ...base },
      { participantId: 'p4', number: 4, name: 'Four', rlgl: 100, geo: 100, order: 100, ...base },
    ]);
    assert.deepEqual(rows.map((r) => [r.participantId, r.rank]), [['p1', 1], ['p2', 2], ['p3', 2], ['p4', 4]]);
    assert.deepEqual(topThreeTies(rows), [['p2', 'p3']]);
  });

  it('tie-break values prefer correct cards, then lock speed with 0.5 s equality', () => {
    const v = tieBreakValues([
      { participantId: 'fast', correctPositions: 4, timeMs: 5_000 },
      { participantId: 'same', correctPositions: 4, timeMs: 5_300 },
      { participantId: 'slow', correctPositions: 4, timeMs: 9_000 },
      { participantId: 'unlocked', correctPositions: 4, timeMs: null },
      { participantId: 'three', correctPositions: 3, timeMs: 1_000 },
    ]);
    assert.equal(v.get('fast'), v.get('same'));
    assert.ok(v.get('fast')! > v.get('slow')!);
    assert.ok(v.get('slow')! > v.get('unlocked')!);
    assert.ok(v.get('unlocked')! > v.get('three')!);
  });
});

describe('Content bank (§10)', () => {
  it('is internally consistent', () => {
    assert.deepEqual(validateContentBank(), []);
  });
});
