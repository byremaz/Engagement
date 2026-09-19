/**
 * Proves the "never revive" rule (plan §1, to-do 3): once the server has
 * confirmed an elimination, no client-side event may walk it back to `alive`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canMove, resolveLife, shouldResetLife, strongerLife } from '../src/life';

describe('life state merge (plan §1)', () => {
  it('lets a known outcome beat alive regardless of argument order', () => {
    assert.equal(strongerLife('alive', 'eliminated'), 'eliminated');
    assert.equal(strongerLife('eliminated', 'alive'), 'eliminated');
    assert.equal(strongerLife('alive', 'finished'), 'finished');
    assert.equal(strongerLife('eliminated', 'finished'), 'eliminated');
  });

  it('never resolves unknown to alive', () => {
    assert.equal(resolveLife([]), 'unknown');
    assert.equal(resolveLife([null, undefined]), 'unknown');
    assert.equal(resolveLife(['unknown', 'unknown']), 'unknown');
    assert.equal(canMove('unknown'), false);
  });

  it('only permits movement on a positively-known alive', () => {
    assert.equal(canMove('alive'), true);
    assert.equal(canMove('eliminated'), false);
    assert.equal(canMove('finished'), false);
  });
});

describe('elimination survives every non-attempt event (to-do 3)', () => {
  // The elimination arrives once; each later source reports a stale `alive`.
  const eliminated = 'eliminated' as const;

  it('survives a release heartbeat reporting alive', () => {
    assert.equal(resolveLife([eliminated, 'alive']), 'eliminated');
  });

  it('survives a refresh where the me payload has no race block', () => {
    assert.equal(resolveLife([eliminated, null]), 'eliminated');
  });

  it('survives a reconnect snapshot that still lists the player as alive', () => {
    assert.equal(resolveLife([eliminated, 'alive', 'alive']), 'eliminated');
  });

  it('survives a locale change that re-renders from unknown', () => {
    assert.equal(resolveLife([eliminated, 'unknown']), 'eliminated');
  });

  it('is recovered from the snapshot alone when the me event was missed', () => {
    assert.equal(resolveLife(['unknown', eliminated]), 'eliminated');
  });
});

describe('the only sanctioned reset is a new attempt (to-do 3)', () => {
  it('does not reset for the same attempt across reconnects', () => {
    assert.equal(shouldResetLife('attempt-1', 'attempt-1'), false);
  });

  it('resets when the host starts a new authorized attempt', () => {
    assert.equal(shouldResetLife('attempt-1', 'attempt-2'), true);
  });

  it('treats the gap between attempts as a reset', () => {
    assert.equal(shouldResetLife('attempt-1', null), true);
    assert.equal(shouldResetLife(null, 'attempt-2'), true);
  });
});
