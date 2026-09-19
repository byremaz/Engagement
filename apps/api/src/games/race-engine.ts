/**
 * Server-authoritative Red Light, Green Light simulation (spec §6.4, §6.9).
 * Pure in-memory engine per attempt; the RoundsService persists outcomes.
 * The server owns signal state, life state, movement, timing and elimination.
 */
import type { RaceLifeState, SignalColor, SignalMode } from '@asas/shared';
import {
  RLGL_HEARTBEAT_TIMEOUT_MS,
  RLGL_RED_TOLERANCE_MS,
  RLGL_SPEED_UNITS_PER_SEC,
  RLGL_TRACK_LENGTH,
} from '@asas/shared';

export interface RacePlayer {
  participantId: string;
  progress: number;
  state: RaceLifeState;
  holding: boolean;
  /** Server time the current hold started (after green was effective). */
  holdSince: number | null;
  lastHeartbeat: number | null;
  finishedAt: number | null;
  death: { at: number; reason: string; signalEventId: number } | null;
}

export interface SignalEvent {
  eventId: number;
  color: SignalColor;
  effectiveAt: number;
  source: SignalMode;
}

export interface EliminationEvent {
  eventId: number;
  participantIds: string[];
  at: number;
}

export class RaceEngine {
  readonly players = new Map<string, RacePlayer>();
  readonly signals: SignalEvent[] = [];
  readonly eliminations: EliminationEvent[] = [];
  private nextSignalId = 1;
  private nextElimId = 1;
  private paused = false;
  private lastTick: number;

  constructor(participantIds: string[], now: number, readonly speed = RLGL_SPEED_UNITS_PER_SEC) {
    for (const id of participantIds) {
      this.players.set(id, {
        participantId: id,
        progress: 0,
        state: 'alive',
        holding: false,
        holdSince: null,
        lastHeartbeat: null,
        finishedAt: null,
        death: null,
      });
    }
    this.lastTick = now;
    // Safe initial signal is RED (§6.2).
    this.signals.push({ eventId: this.nextSignalId++, color: 'RED', effectiveAt: now, source: 'MANUAL' });
  }

  get signal(): SignalEvent {
    return this.signals[this.signals.length - 1]!;
  }

  /** Repeating the current colour is a no-op: it must not restart red tolerance (§6.5). */
  setSignal(color: SignalColor, effectiveAt: number, source: SignalMode): SignalEvent | null {
    if (this.signal.color === color) return null;
    const ev: SignalEvent = { eventId: this.nextSignalId++, color, effectiveAt, source };
    this.signals.push(ev);
    return ev;
  }

  setPaused(paused: boolean, now: number): void {
    this.tick(now);
    this.paused = paused;
    if (paused) {
      // Freeze movement; clear holds so an old press can never kill after Resume (§11).
      for (const p of this.players.values()) {
        p.holding = false;
        p.holdSince = null;
      }
    } else {
      this.lastTick = now;
    }
  }

  /** Hold-button state from a participant. Returns an elimination if this input was a red violation. */
  input(participantId: string, holding: boolean, now: number): EliminationEvent | null {
    const p = this.players.get(participantId);
    if (!p || p.state !== 'alive' || this.paused) return null;
    this.tick(now);
    const sig = this.signal;
    if (!holding) {
      p.holding = false;
      p.holdSince = null;
      p.lastHeartbeat = now;
      return null;
    }
    p.lastHeartbeat = now;
    if (sig.color === 'RED') {
      const inTolerance = now - sig.effectiveAt < RLGL_RED_TOLERANCE_MS;
      const newPress = !p.holding;
      // New press during established red, or continuing hold after the shared tolerance → eliminated (§6.4).
      if (newPress && now >= sig.effectiveAt && !inTolerance) return this.eliminate([p], now, 'new press on red');
      if (!newPress && !inTolerance) return this.eliminate([p], now, 'continued hold on red');
      // Within tolerance: stop movement, no distance granted, no death yet.
      p.holding = true;
      p.holdSince = null;
      return null;
    }
    if (!p.holding) {
      p.holding = true;
      p.holdSince = Math.max(now, sig.effectiveAt);
    }
    return null;
  }

  /**
   * Advance simulation to `now`: apply movement during green holds, stop stale
   * holds (>500 ms without heartbeat, §6.9 - absence alone never kills),
   * eliminate holds that outlast red tolerance, and detect finishes.
   */
  tick(now: number): EliminationEvent | null {
    if (this.paused || now <= this.lastTick) return null;
    const sig = this.signal;
    const victims: RacePlayer[] = [];
    for (const p of this.players.values()) {
      if (p.state !== 'alive' || !p.holding) continue;
      if (p.lastHeartbeat !== null && now - p.lastHeartbeat > RLGL_HEARTBEAT_TIMEOUT_MS) {
        p.holding = false;
        p.holdSince = null;
        continue;
      }
      if (sig.color === 'RED') {
        if (now - sig.effectiveAt >= RLGL_RED_TOLERANCE_MS) victims.push(p);
        continue;
      }
      const from = Math.max(this.lastTick, p.holdSince ?? this.lastTick, sig.effectiveAt);
      const dt = Math.max(0, now - from) / 1000;
      p.progress = Math.min(RLGL_TRACK_LENGTH, p.progress + dt * this.speed);
      if (p.progress >= RLGL_TRACK_LENGTH) {
        p.state = 'finished';
        p.finishedAt = now;
        p.holding = false;
      }
    }
    this.lastTick = now;
    return victims.length ? this.eliminate(victims, now, 'continued hold on red') : null;
  }

  /** Race closes when no living, unfinished player remains (§6.4). */
  noRacerCanContinue(): boolean {
    for (const p of this.players.values()) if (p.state === 'alive') return false;
    return true;
  }

  private eliminate(victims: RacePlayer[], now: number, reason: string): EliminationEvent {
    const ev: EliminationEvent = { eventId: this.nextElimId++, participantIds: [], at: now };
    for (const p of victims) {
      if (p.state !== 'alive') continue; // process elimination only once (§6.9)
      p.state = 'eliminated';
      p.holding = false;
      p.holdSince = null;
      p.death = { at: now, reason, signalEventId: this.signal.eventId };
      ev.participantIds.push(p.participantId);
    }
    if (ev.participantIds.length) this.eliminations.push(ev);
    return ev;
  }
}
