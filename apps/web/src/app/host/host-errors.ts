/**
 * Maps server error messages (transitions.ts / rounds.service.ts BadRequests)
 * and HTTP failures to i18n keys so the host desk never shows raw English
 * (plan v2, BUG-K). The raw message is the last resort only.
 */
import { HttpErrorResponse } from '@angular/common/http';
import type { StringKey } from '../i18n/strings.en';

const PATTERNS: [RegExp, StringKey][] = [
  [/session is closed/i, 'error.sessionClosed'],
  [/not allowed after a scored round/i, 'error.startGameAfterScored'],
  [/is not allowed while/i, 'error.notAllowedWhile'],
  [/already paused/i, 'error.alreadyPaused'],
  [/not paused/i, 'error.notPaused'],
  [/resume or void/i, 'error.resumeFirst'],
  [/no prepared round|no active round|no closed round/i, 'error.noPreparedRound'],
  [/reason is required/i, 'error.reasonRequired'],
  [/no more rounds/i, 'error.noMoreRounds'],
  [/no next game/i, 'error.noNextGame'],
  [/automatic in auto mode/i, 'error.autoSignals'],
  [/no live race/i, 'error.noLiveRace'],
  [/not connected|timeout/i, 'error.network'],
];

export interface HostError {
  key: StringKey;
  params?: Record<string, string | number>;
  /** Untranslatable server text, shown only when no key matched. */
  raw?: string;
}

export function hostErrorFromMessage(message: string | undefined | null): HostError {
  const msg = message ?? '';
  for (const [re, key] of PATTERNS) if (re.test(msg)) return { key };
  return { key: 'error.generic', raw: msg || undefined };
}

export function hostErrorFromHttp(e: unknown): HostError {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return { key: 'error.server' };
    const m = (e.error as { message?: string | string[] })?.message;
    const text = Array.isArray(m) ? m.join(' ') : m;
    if (text) {
      const mapped = hostErrorFromMessage(text);
      if (mapped.key !== 'error.generic') return mapped;
      return { key: 'error.status', params: { status: e.status }, raw: text };
    }
    return { key: 'error.status', params: { status: e.status } };
  }
  return { key: 'error.generic' };
}
