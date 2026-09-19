/**
 * In-memory runtime for live attempts: race engines, auto-signal timers and
 * deadline timers. Persistent truth lives in PostgreSQL; this is only the
 * hot path for the currently active round of each session.
 */
import { Injectable } from '@nestjs/common';
import { RaceEngine } from '../games/race-engine';
import type { ScheduledSignal } from './auto-schedule';

export interface LiveAttempt {
  attemptId: string;
  sessionId: string;
  engine: RaceEngine | null;
  /** Remaining auto-schedule entries (absolute server ms). */
  schedule: { color: 'RED' | 'GREEN'; at: number }[];
  timers: NodeJS.Timeout[];
  tickHandle: NodeJS.Timeout | null;
}

@Injectable()
export class LiveRuntime {
  private readonly bySession = new Map<string, LiveAttempt>();

  get(sessionId: string): LiveAttempt | null {
    return this.bySession.get(sessionId) ?? null;
  }

  create(sessionId: string, attemptId: string, engine: RaceEngine | null): LiveAttempt {
    this.clear(sessionId);
    const live: LiveAttempt = { attemptId, sessionId, engine, schedule: [], timers: [], tickHandle: null };
    this.bySession.set(sessionId, live);
    return live;
  }

  /** Cancels all timers but keeps the engine (used for Pause). */
  cancelTimers(sessionId: string): void {
    const live = this.bySession.get(sessionId);
    if (!live) return;
    for (const t of live.timers) clearTimeout(t);
    live.timers = [];
    if (live.tickHandle) clearInterval(live.tickHandle);
    live.tickHandle = null;
  }

  clear(sessionId: string): void {
    this.cancelTimers(sessionId);
    this.bySession.delete(sessionId);
  }

  after(live: LiveAttempt, ms: number, fn: () => void): void {
    const t = setTimeout(fn, Math.max(0, ms));
    live.timers.push(t);
  }

  every(live: LiveAttempt, ms: number, fn: () => void): void {
    if (live.tickHandle) clearInterval(live.tickHandle);
    live.tickHandle = setInterval(fn, ms);
  }

  /** Converts a relative schedule into absolute times from `startAt`. */
  arm(live: LiveAttempt, startAt: number, schedule: ScheduledSignal[]): void {
    live.schedule = schedule.map((s) => ({ color: s.color, at: startAt + s.atMs }));
  }
}
