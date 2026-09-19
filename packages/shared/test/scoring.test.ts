import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStandings,
  geoGameScore,
  geoRoundScore,
  initialOrderFor,
  orderGameScore,
  rlglGameScore,
  scoreOrder,
  scoreRace,
  tieBreakValues,
  topThreeTies,
  type RaceParticipation,
} from '../src/scoring';
import { ORDER_QUESTIONS, validateContentBank } from '../src/content';

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
      { participantId: 'fast', correctPositions: 4, lockedAt: 5_000, roundStartedAt: 0 },
      { participantId: 'same', correctPositions: 4, lockedAt: 5_300, roundStartedAt: 0 },
      { participantId: 'slow', correctPositions: 4, lockedAt: 9_000, roundStartedAt: 0 },
      { participantId: 'unlocked', correctPositions: 4, lockedAt: null, roundStartedAt: 0 },
      { participantId: 'three', correctPositions: 3, lockedAt: 1_000, roundStartedAt: 0 },
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
