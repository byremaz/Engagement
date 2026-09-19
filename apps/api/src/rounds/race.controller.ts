/**
 * Red Light, Green Light lifecycle glue between the stage engine and the
 * in-memory RaceEngine (§6.2-6.9, §11). Server-authoritative throughout.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import type { RaceContent, RaceSnapshot, SignalColor } from '@asas/shared';
import { DbService } from '../db/db.service';
import { RaceEngine } from '../games/race-engine';
import type { SessionRow } from '../sessions/sessions.service';
import { buildAutoSchedule } from './auto-schedule';
import { LiveRuntime, type LiveAttempt } from './live-runtime';
import { RoundRepo, type AttemptRow } from './round-repo';
import { RoundsEventBus } from './rounds.events';
import type { RoundsService } from './rounds.service';

const TICK_MS = 100;

interface Meta {
  number: number;
  name: string;
  avatar: string;
}

@Injectable()
export class RaceController {
  private rounds!: RoundsService;
  private readonly meta = new Map<string, Map<string, Meta>>();
  private readonly mode = new Map<string, 'MANUAL' | 'AUTO'>();

  constructor(
    private readonly db: DbService,
    private readonly repo: RoundRepo,
    private readonly live: LiveRuntime,
    private readonly bus: RoundsEventBus,
  ) {}

  attach(rounds: RoundsService): void {
    this.rounds = rounds;
  }

  /** Countdown finished → race is live. Registers N players (everyone present at start, §6.8). */
  async onActive(s: SessionRow, a: AttemptRow, live: LiveAttempt, resumed: boolean, deadline: number): Promise<void> {
    const now = Date.now();
    const content = a.content as unknown as RaceContent;
    if (!live.engine || !resumed) {
      const rows = await this.db.query<{ id: string; number: number; name: string; avatar: string }>(
        'SELECT id, number, name, avatar FROM participants WHERE session_id = $1 AND removed_at IS NULL', [s.id]);
      live.engine = new RaceEngine(rows.map((r) => r.id), now, content.speedUnitsPerSec);
      this.meta.set(s.id, new Map(rows.map((r) => [r.id, { number: r.number, name: r.name, avatar: r.avatar }])));
    } else {
      live.engine.setPaused(false, now);
    }
    this.mode.set(s.id, s.signal_mode);
    live.engine.setSignal('RED', now, 'MANUAL'); // always resume/start at RED (§6.2, §11)
    if (s.signal_mode === 'AUTO') {
      // Valid schedule for the remaining time; first GREEN after a short beat.
      this.live.arm(live, now + 1000, buildAutoSchedule(content, deadline - now - 1000, a.seed + (resumed ? 1 : 0)));
      this.armNextSignal(s.id, live);
    }
    this.live.every(live, TICK_MS, () => void this.tick(s.id, live));
  }

  private armNextSignal(sessionId: string, live: LiveAttempt): void {
    const next = live.schedule.shift();
    if (!next) return;
    this.live.after(live, next.at - Date.now(), () => {
      this.applySignal(sessionId, live, next.color, 'AUTO');
      this.armNextSignal(sessionId, live);
    });
  }

  private applySignal(sessionId: string, live: LiveAttempt, color: SignalColor, source: 'MANUAL' | 'AUTO'): void {
    if (!live.engine) return;
    const now = Date.now();
    const ev = live.engine.setSignal(color, now, source);
    if (!ev) return; // repeat of current colour: no-op (§6.5)
    void this.db.query(
      'INSERT INTO signal_events (attempt_id, event_id, color, effective_at, source) VALUES ($1, $2, $3, $4, $5)',
      [live.attemptId, ev.eventId, ev.color, new Date(ev.effectiveAt), source]);
    this.bus.emit('signal', sessionId, ev.color, ev.eventId, ev.effectiveAt);
  }

  /** Host RED / GREEN button (§6.5). Rejected in Auto mode or when not racing. */
  async hostSignal(sessionId: string, color: SignalColor): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live?.engine) throw new BadRequestException('no live race');
    if (this.mode.get(sessionId) === 'AUTO') throw new BadRequestException('signals are automatic in Auto mode');
    this.applySignal(sessionId, live, color, 'MANUAL');
    await this.rounds.publish(sessionId);
  }

  /** Phone hold/release heartbeat. Returns the participant's own race state. */
  input(sessionId: string, participantId: string, holding: boolean): { progress: number; state: string } | null {
    const live = this.live.get(sessionId);
    if (!live?.engine) return null;
    const elim = live.engine.input(participantId, holding, Date.now());
    if (elim?.participantIds.length) this.bus.emit('eliminated', sessionId, elim.participantIds, elim.eventId);
    const p = live.engine.players.get(participantId);
    return p ? { progress: p.progress, state: p.state } : null;
  }

  private async tick(sessionId: string, live: LiveAttempt): Promise<void> {
    if (!live.engine) return;
    const elim = live.engine.tick(Date.now());
    if (elim?.participantIds.length) this.bus.emit('eliminated', sessionId, elim.participantIds, elim.eventId);
    if (live.engine.noRacerCanContinue()) {
      await this.rounds.closeRound(sessionId, live.attemptId);
      return;
    }
    this.bus.emit('snapshot', sessionId, await this.rounds.snapshot(sessionId));
  }

  onPause(sessionId: string): void {
    const live = this.live.get(sessionId);
    live?.engine?.setPaused(true, Date.now());
    if (live) live.schedule = [];
  }

  /** Persist final outcomes so scoring/reveal works from the database (§12.1). */
  async onClose(sessionId: string, attemptId: string): Promise<void> {
    const live = this.live.get(sessionId);
    if (!live?.engine || live.attemptId !== attemptId) return;
    live.engine.tick(Date.now());
    for (const p of live.engine.players.values()) {
      await this.repo.writeRaceOutcome(attemptId, p.participantId, {
        progress: p.progress, state: p.state, finishedAt: p.finishedAt, death: p.death,
      });
    }
  }

  snapshot(sessionId: string): RaceSnapshot | null {
    const live = this.live.get(sessionId);
    const e = live?.engine;
    if (!e) return null;
    const meta = this.meta.get(sessionId) ?? new Map<string, Meta>();
    return {
      signal: e.signal.color,
      signalEventId: e.signal.eventId,
      signalEffectiveAt: e.signal.effectiveAt,
      mode: this.mode.get(sessionId) ?? 'MANUAL',
      raceStartedAt: e.signals[0]?.effectiveAt ?? null,
      players: [...e.players.values()].map((p) => {
        const m = meta.get(p.participantId);
        return { participantId: p.participantId, number: m?.number ?? 0, name: m?.name ?? '', avatar: m?.avatar ?? '', progress: p.progress, state: p.state, holding: p.holding };
      }),
      eliminationsFeed: e.eliminations.slice(-5).map((ev) => ({
        eventId: ev.eventId, at: ev.at, names: ev.participantIds.map((id) => meta.get(id)?.name ?? ''),
      })),
    };
  }
}
