/**
 * Unit tests for the host transition table (spec §4.5, §11), the auto signal
 * schedule (§6.7) and device detection (§5.2). No database required.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RLGL_RACES, RLGL_AUTO_MIN_GREEN_MS, RLGL_RACE_DURATION_MS } from '@asas/shared';
import { canTransition } from '../src/rounds/transitions';
import { buildAutoSchedule } from '../src/rounds/auto-schedule';
import { detectDevice } from '../src/sessions/device';

describe('Host transitions (§4.5)', () => {
  it('only the host flow can advance a stage; timers never do', () => {
    assert.equal(canTransition('START_ROUND', 'Ready', false), null);
    assert.match(canTransition('START_ROUND', 'InputLocked', false) ?? '', /not allowed/);
    // A locked round waits for the host: reveal is allowed, next round is not.
    assert.equal(canTransition('REVEAL_RESULTS', 'InputLocked', false), null);
    assert.match(canTransition('NEXT_ROUND', 'InputLocked', false) ?? '', /not allowed/);
    assert.equal(canTransition('NEXT_ROUND', 'Reveal', false), null);
  });

  it('instructions always precede a game; practice may be skipped', () => {
    assert.equal(canTransition('SHOW_INSTRUCTIONS', 'GameResults', false), null);
    assert.match(canTransition('START_GAME', 'GameResults', false) ?? '', /not allowed/);
    assert.equal(canTransition('START_GAME', 'Instructions', false), null);
    assert.equal(canTransition('START_PRACTICE', 'Instructions', false), null);
  });

  it('pause is an overlay that blocks everything except resume and void', () => {
    assert.equal(canTransition('PAUSE', 'RoundActive', false), null);
    assert.equal(canTransition('PAUSE', 'RoundActive', true), 'already paused');
    assert.equal(canTransition('RESUME', 'RoundActive', false), 'not paused');
    assert.equal(canTransition('RESUME', 'RoundActive', true), null);
    assert.equal(canTransition('VOID_ROUND', 'RoundActive', true), null);
    assert.equal(canTransition('REVEAL_RESULTS', 'InputLocked', true), 'resume or void the round first');
  });

  it('a closed session accepts nothing', () => {
    assert.equal(canTransition('SHOW_INSTRUCTIONS', 'Closed', false), 'session is closed');
  });
});

describe('Auto signal schedule (§6.7)', () => {
  it('alternates colours from GREEN, covers the race and guarantees minimum green time', () => {
    for (const content of RLGL_RACES) {
      for (let seed = 1; seed <= 25; seed++) {
        const s = buildAutoSchedule(content, RLGL_RACE_DURATION_MS, seed);
        assert.ok(s.length >= 2);
        assert.equal(s[0].color, 'GREEN');
        assert.equal(s[0].atMs, 0);
        let green = 0;
        for (let i = 0; i < s.length; i++) {
          if (i > 0) {
            assert.notEqual(s[i].color, s[i - 1].color, 'colours must alternate');
            assert.ok(s[i].atMs > s[i - 1].atMs, 'times must increase');
          }
          const end = i + 1 < s.length ? s[i + 1].atMs : RLGL_RACE_DURATION_MS;
          if (s[i].color === 'GREEN') green += Math.min(end, RLGL_RACE_DURATION_MS) - s[i].atMs;
        }
        assert.ok(green >= Math.min(RLGL_AUTO_MIN_GREEN_MS, RLGL_RACE_DURATION_MS * 0.45), `seed ${seed}: green ${green}`);
      }
    }
  });

  it('is reproducible for the same seed (replay logs)', () => {
    const a = buildAutoSchedule(RLGL_RACES[0], RLGL_RACE_DURATION_MS, 42);
    const b = buildAutoSchedule(RLGL_RACES[0], RLGL_RACE_DURATION_MS, 42);
    assert.deepEqual(a, b);
  });
});

describe('Device detection (§5.2)', () => {
  it('recognises iPhone Safari', () => {
    const d = detectDevice({
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    });
    assert.equal(d.deviceType, 'iPhone');
    assert.equal(d.os, 'iOS 17.5');
    assert.equal(d.browser, 'Safari');
    assert.equal(d.detectionSource, 'user-agent');
  });

  it('recognises an Android phone and prefers Client Hints for the model', () => {
    const d = detectDevice({
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      'sec-ch-ua-model': '"SM-S918B"',
      'sec-ch-ua-platform': '"Android"',
      'sec-ch-ua-mobile': '?1',
    });
    assert.equal(d.deviceType, 'Android phone');
    assert.equal(d.model, 'SM-S918B');
    assert.equal(d.os, 'Android 14');
    assert.equal(d.browser, 'Chrome');
    assert.equal(d.detectionSource, 'client-hints');
  });

  it('never throws and never blocks participation when nothing is available', () => {
    const d = detectDevice({});
    assert.equal(d.deviceType, 'Unknown');
    assert.equal(d.model, null);
    assert.equal(d.browser, null);
    assert.equal(d.detectionSource, 'none');
  });
});
