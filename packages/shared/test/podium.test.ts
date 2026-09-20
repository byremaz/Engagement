import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { podiumBands, podiumRankForStep, podiumRevealRanks } from '../src/podium';

const rows = (ranks: number[]) => ranks.map((rank, i) => ({ rank, id: `p${i}` }));

describe('Podium reveal (plan §8): third → second → first, ties as bands', () => {
  it('reveals 3 then 3+2 then 3+2+1 for a plain top three', () => {
    const r = rows([1, 2, 3, 4]);
    assert.deepEqual(podiumRevealRanks(r, 0), []);
    assert.deepEqual(podiumRevealRanks(r, 1), [3]);
    assert.deepEqual(podiumRevealRanks(r, 2), [3, 2]);
    assert.deepEqual(podiumRevealRanks(r, 3), [3, 2, 1]);
    assert.deepEqual(podiumRevealRanks(r, 4), [3, 2, 1]);
    assert.equal(podiumRankForStep(r, 1), 3);
    assert.equal(podiumRankForStep(r, 3), 1);
  });

  it('two tied for second: no third place exists, step 1 reveals nothing', () => {
    const r = rows([1, 2, 2, 4]);
    assert.deepEqual(podiumRevealRanks(r, 1), []);
    assert.deepEqual(podiumRevealRanks(r, 2), [2]);
    assert.deepEqual(podiumRevealRanks(r, 3), [2, 1]);
    assert.equal(podiumRankForStep(r, 1), null);
    assert.equal(podiumBands(r, 2)[0]!.rows.length, 2);
  });

  it('three tied for first: only the champion band, at step 3', () => {
    const r = rows([1, 1, 1, 4]);
    assert.deepEqual(podiumRevealRanks(r, 1), []);
    assert.deepEqual(podiumRevealRanks(r, 2), []);
    assert.deepEqual(podiumRevealRanks(r, 3), [1]);
    assert.equal(podiumBands(r, 3)[0]!.rows.length, 3);
  });

  it('never invents a band for an empty room', () => {
    assert.deepEqual(podiumRevealRanks([], 3), []);
  });
});
