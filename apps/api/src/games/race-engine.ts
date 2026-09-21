/**
 * Server-authoritative Red Light, Green Light simulation (spec §6.4, §6.9).
 * Pure in-memory engine per attempt; the RoundsService persists outcomes.
 * The server owns signal state, life state, movement, timing and elimination.
 */
import type { RaceLifeState, SignalColor, SignalMode } from '@asas/shared';
import {
  RLGL_HEARTBEAT_TIMEOUT_MS,
  RLGL_MISTAKE_GRACE_MS,
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
  /** Active (unpaused) ms from race start to the finish line — the v2 speed input. */
  finishActiveMs: number | null;
  /** Deadline of the forgiveness window for a mistaken press on RED (null = none). */
  redGraceUntil: number | null;
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
  /** Unpaused ms elapsed since the engine started; pauses never inflate a finisher's time. */
  private activeMs = 0;

  constructor(
    participantIds: string[],
    now: number,
    readonly speed = RLGL_SPEED_UNITS_PER_SEC,
    /** Frozen per session content so an older session keeps its own tolerance. */
    readonly redToleranceMs = RLGL_RED_TOLERANCE_MS,
  ) {
    for (const id of participantIds) {
      this.players.set(id, {
        participantId: id,
        progress: 0,
        state: 'alive',
        holding: false,
        holdSince: null,
        lastHeartbeat: null,
        finishedAt: null,
        finishActiveMs: null,
        redGraceUntil: null,
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
        p.redGraceUntil = null;
      }
    } else {
      this.lastTick = now;
    }
  }

  /** Hold-button state from a participant. Returns an elimination if this input was a red violation. */
  input(participantId: string, holding: boolean, now: number): EliminationEvent | null {
    const p = this.players.get(participantId);
    if (!p || p.state !== 'alive' || this.paused) return null;
    const tickEv = this.tick(now);
    // The catch-up tick may itself have eliminated this player (e.g. a
    // mistaken press whose grace window just expired): report it, don't
    // keep mutating a dead player.
    if (p.state !== 'alive') return tickEv;
    const sig = this.signal;
    if (!holding) {
      p.holding = false;
      p.holdSince = null;
      p.redGraceUntil = null; // released in time: the mistake is forgiven
      p.lastHeartbeat = now;
      return null;
    }
    p.lastHeartbeat = now;
    if (sig.color === 'RED') {
      const inTolerance = now - sig.effectiveAt < this.redToleranceMs;
      const newPress = !p.holding;
      // A NEW press during established red is a mistake, but no longer instantly
      // fatal: the racer gets a short grace window to release (forgiveness margin).
      if (newPress && now >= sig.effectiveAt && !inTolerance) {
        p.holding = true;
        p.holdSince = null;
        p.redGraceUntil = now + RLGL_MISTAKE_GRACE_MS;
        return null;
      }
      // Still holding a mistaken press when its grace window expires → eliminated.
      if (!newPress && p.redGraceUntil !== null) {
        if (now >= p.redGraceUntil) return this.eliminate([p], now, 'new press on red');
        return null;
      }
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
    p.redGraceUntil = null; // GREEN made the hold legal
    return null;
  }

  /**
   * Advance simulation to `now`: apply movement during green holds, stop stale
   * holds (>500 ms without heartbeat, §6.9 - absence alone never kills),
   * eliminate holds that outlast red tolerance, and detect finishes.
   */
  tick(now: number): EliminationEvent | null {
    if (this.paused || now <= this.lastTick) return null;
    this.activeMs += now - this.lastTick;
    const sig = this.signal;
    const victims: RacePlayer[] = [];
    const graceVictims: RacePlayer[] = [];
    for (const p of this.players.values()) {
      if (p.state !== 'alive' || !p.holding) continue;
      if (p.lastHeartbeat !== null && now - p.lastHeartbeat > RLGL_HEARTBEAT_TIMEOUT_MS) {
        p.holding = false;
        p.holdSince = null;
        p.redGraceUntil = null; // stale hold = released: the mistake is forgiven
        continue;
      }
      if (sig.color === 'RED') {
        if (p.redGraceUntil !== null) {
          // Mistaken press: only fatal once its own grace window has expired.
          if (now >= p.redGraceUntil) graceVictims.push(p);
          continue;
        }
        if (now - sig.effectiveAt >= this.redToleranceMs) victims.push(p);
        continue;
      }
      p.redGraceUntil = null; // GREEN made the hold legal
      const from = Math.max(this.lastTick, p.holdSince ?? this.lastTick, sig.effectiveAt);
      const dt = Math.max(0, now - from) / 1000;
      p.progress = Math.min(RLGL_TRACK_LENGTH, p.progress + dt * this.speed);
      if (p.progress >= RLGL_TRACK_LENGTH) {
        p.state = 'finished';
        p.finishedAt = now;
        p.finishActiveMs = this.activeMs;
        p.holding = false;
      }
    }
    this.lastTick = now;
    const graceEv = graceVictims.length ? this.eliminate(graceVictims, now, 'new press on red') : null;
    const redEv = victims.length ? this.eliminate(victims, now, 'continued hold on red') : null;
    if (graceEv && redEv) {
      // Both kinds died on the same tick: report every victim in one event.
      return { eventId: redEv.eventId, participantIds: [...graceEv.participantIds, ...redEv.participantIds], at: now };
    }
    return redEv ?? graceEv;
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
