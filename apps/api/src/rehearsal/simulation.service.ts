/**
 * Rehearsal mode (spec §16, deliverable 4): the host can add simulated
 * participants that join, get ready, race, place pins and lock orders through
 * the SAME server paths as real phones, so the full flow can be rehearsed
 * without real people. Simulated rows are flagged `is_simulated` and can be
 * purged in one call before the real event so they never contaminate results.
 *
 * Bots never call host actions and never submit scores (§AC-15): they only use
 * ParticipationService / RaceController like any participant controller.
 */
import { BadRequestException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { CountryContent, OrderContent, SessionSnapshot } from '@asas/shared';
import { RLGL_RED_TOLERANCE_MS } from '@asas/shared';
import { DbService } from '../db/db.service';
import { ParticipationService } from '../rounds/participation.service';
import { RaceController } from '../rounds/race.controller';
import { RoundRepo } from '../rounds/round-repo';
import { RoundsEventBus } from '../rounds/rounds.events';
import { SessionsService } from '../sessions/sessions.service';
import { hashRecoveryCode, newControllerId, randomCode } from '../sessions/tokens';

interface Bot {
  id: string;
  controllerId: string;
  /** 0..1 - probability of a perfect answer / of surviving a red light. */
  skill: number;
}

interface Run {
  attemptId: string;
  timers: NodeJS.Timeout[];
  heartbeat: NodeJS.Timeout | null;
  holding: Set<string>;
  /** Red tolerance of the running race, so lapses are calibrated per race. */
  tolerance: number;
}

const SIM_AVATAR = '🤖';
const HEARTBEAT_MS = 250;
const MAX_SIMULATED_PER_CALL = 100;

@Injectable()
export class SimulationService implements OnModuleDestroy {
  private readonly log = new Logger(SimulationService.name);
  private readonly runs = new Map<string, Run>();
  private readonly bots = new Map<string, Bot[]>();

  constructor(
    private readonly db: DbService,
    private readonly sessions: SessionsService,
    private readonly repo: RoundRepo,
    private readonly participation: ParticipationService,
    private readonly race: RaceController,
    bus: RoundsEventBus,
  ) {
    bus.on('snapshot', (sid, snap) => void this.onSnapshot(sid, snap).catch((e) => this.log.warn(`bots: ${(e as Error).message}`)));
    bus.on('signal', (sid, color) => this.onSignal(sid, color));
  }

  // ------------------------------------------------------------ management

  /** Adds `count` simulated participants (host only). Respects session capacity. */
  async add(sessionId: string, count: number): Promise<{ added: number; simulated: number }> {
    if (!Number.isInteger(count) || count < 1 || count > MAX_SIMULATED_PER_CALL) {
      throw new BadRequestException(`count must be between 1 and ${MAX_SIMULATED_PER_CALL}`);
    }
    const s = await this.sessions.getById(sessionId);
    if (s.state === 'Closed') throw new BadRequestException('session is closed');

    const added = await this.db.tx(async (client) => {
      await client.query('SELECT id FROM sessions WHERE id = $1 FOR UPDATE', [sessionId]);
      const cur = await client.query<{ n: string; m: number | null }>(
        `SELECT count(*) FILTER (WHERE removed_at IS NULL)::text AS n, max(number) AS m FROM participants WHERE session_id = $1`,
        [sessionId],
      );
      const existing = Number(cur.rows[0]?.n ?? 0);
      let number = cur.rows[0]?.m ?? 0;
      const room = Math.max(0, s.capacity - existing);
      const n = Math.min(count, room);
      for (let i = 0; i < n; i++) {
        number += 1;
        const controllerId = newControllerId();
        await client.query(
          `INSERT INTO participants
             (session_id, number, name, avatar, recovery_hash, controller_id, device, device_history, ready, connected, is_simulated)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, '[]'::jsonb, true, true, true)`,
          [
            sessionId,
            number,
            `Sim ${String(number).padStart(2, '0')}`,
            SIM_AVATAR,
            hashRecoveryCode(randomCode(8), sessionId),
            controllerId,
            JSON.stringify({ deviceType: 'Unknown', model: 'Simulated', os: 'Simulated', browser: 'Simulated', detectionSource: 'none' }),
          ],
        );
      }
      return n;
    });
    this.bots.delete(sessionId); // reload lazily
    await this.sessions.audit(sessionId, 'ADD_SIMULATED', { requested: count, added });
    return { added, simulated: await this.count(sessionId) };
  }

  /** Hard-deletes every simulated participant and their answers (cascade). */
  async removeAll(sessionId: string): Promise<{ removed: number }> {
    await this.sessions.getById(sessionId);
    this.stop(sessionId);
    const rows = await this.db.query('DELETE FROM participants WHERE session_id = $1 AND is_simulated RETURNING id', [sessionId]);
    this.bots.delete(sessionId);
    await this.sessions.audit(sessionId, 'REMOVE_SIMULATED', { removed: rows.length });
    return { removed: rows.length };
  }

  async count(sessionId: string): Promise<number> {
    const row = await this.db.one<{ n: string }>(
      'SELECT count(*)::text AS n FROM participants WHERE session_id = $1 AND is_simulated AND removed_at IS NULL',
      [sessionId],
    );
    return Number(row?.n ?? 0);
  }

  private async loadBots(sessionId: string): Promise<Bot[]> {
    const cached = this.bots.get(sessionId);
    if (cached) return cached;
    const rows = await this.db.query<{ id: string; controller_id: string | null; number: number }>(
      'SELECT id, controller_id, number FROM participants WHERE session_id = $1 AND is_simulated AND removed_at IS NULL',
      [sessionId],
    );
    // Deterministic skill spread so rehearsal standings look realistic (some perfect, some weak).
    const bots = rows.filter((r) => r.controller_id).map((r) => ({ id: r.id, controllerId: r.controller_id!, skill: 0.25 + ((r.number * 37) % 70) / 100 }));
    this.bots.set(sessionId, bots);
    return bots;
  }

  // -------------------------------------------------------------- behaviour

  private async onSnapshot(sessionId: string, snap: SessionSnapshot): Promise<void> {
    const run = this.runs.get(sessionId);
    const active = snap.state === 'RoundActive' && !snap.paused && snap.attemptId;
    if (!active) {
      if (run) this.stop(sessionId);
      return;
    }
    if (run?.attemptId === snap.attemptId) return; // already running for this attempt
    if (run) this.stop(sessionId);
    const bots = await this.loadBots(sessionId);
    if (bots.length === 0) return;
    const attempt = await this.repo.get(snap.attemptId!);
    if (!attempt || attempt.closed_at || attempt.voided_at) return;

    const tolerance = (attempt.content as { redToleranceMs?: number }).redToleranceMs ?? RLGL_RED_TOLERANCE_MS;
    const fresh: Run = { attemptId: attempt.id, timers: [], heartbeat: null, holding: new Set(), tolerance };
    this.runs.set(sessionId, fresh);
    const budget = Math.max(1500, (attempt.deadline_at?.getTime() ?? Date.now() + attempt.duration_ms) - Date.now() - 1500);
    const eligible = attempt.tiebreak_participants ? bots.filter((b) => attempt.tiebreak_participants!.includes(b.id)) : bots;

    switch (attempt.game_type) {
      case 'ORDER': {
        const q = attempt.content as unknown as OrderContent;
        const ids = snap.roundPublic?.type === 'ORDER' ? snap.roundPublic.options.map((o) => o.id) : q.options.map((o) => o.id);
        for (const b of eligible) {
          const order = Math.random() < b.skill ? [...q.correctOrder] : shuffle(ids);
          this.after(fresh, randomInt(1500, Math.max(1600, Math.min(budget, 16_000))), () =>
            this.participation.saveOrder(sessionId, b.id, b.controllerId, order, true).catch(() => undefined));
        }
        return;
      }
      case 'GEO': {
        const c = attempt.content as unknown as CountryContent;
        for (const b of eligible) {
          const spread = (1 - b.skill) * 18; // degrees of error for weak bots
          const lat = clamp(c.revealView.lat + (Math.random() - 0.5) * spread, -85, 85);
          const lng = wrapLng(c.revealView.lng + (Math.random() - 0.5) * spread);
          this.after(fresh, randomInt(2000, Math.max(2100, Math.min(budget, 20_000))), () =>
            this.participation.savePin(sessionId, b.id, b.controllerId, lat, lng, true).catch(() => undefined));
        }
        return;
      }
      case 'RLGL': {
        // React to the current signal now, then keep the hold heartbeat alive (§6.9: >500 ms silence stops movement).
        this.onSignal(sessionId, snap.race?.signal ?? 'RED');
        fresh.heartbeat = setInterval(() => {
          for (const id of fresh.holding) this.race.input(sessionId, id, true);
        }, HEARTBEAT_MS);
        return;
      }
      default:
        return;
    }
  }

  private onSignal(sessionId: string, color: 'RED' | 'GREEN'): void {
    const run = this.runs.get(sessionId);
    const bots = this.bots.get(sessionId);
    if (!run || !bots) return;
    for (const b of bots) {
      if (color === 'GREEN') {
        // Human-like reaction time before pressing.
        this.after(run, randomInt(200, 700), () => { run.holding.add(b.id); this.race.input(sessionId, b.id, true); });
      } else {
        // Weak bots occasionally release too late and get eliminated (demonstrates the death effect).
        // A race has ~12-15 reds, so the PER-RED lapse chance stays small: the weakest bot
        // (skill 0.25) lapses on ~11 % of reds and survives a race about one time in six,
        // the strongest (0.94) almost always finishes — a realistic room, not a massacre.
        // The lapse must exceed the race's tolerance or no bot ever dies; a normal
        // release lands inside it (humans: 250-350 ms reaction).
        const tol = run.tolerance;
        const lapse = Math.random() < (1 - b.skill) * 0.15 ? randomInt(tol + 150, tol + 700) : randomInt(80, Math.max(140, tol - 60));
        this.after(run, lapse, () => { run.holding.delete(b.id); this.race.input(sessionId, b.id, false); });
      }
    }
  }

  private after(run: Run, ms: number, fn: () => unknown): void {
    run.timers.push(setTimeout(() => void fn(), ms));
  }

  private stop(sessionId: string): void {
    const run = this.runs.get(sessionId);
    if (!run) return;
    for (const t of run.timers) clearTimeout(t);
    if (run.heartbeat) clearInterval(run.heartbeat);
    this.runs.delete(sessionId);
  }

  onModuleDestroy(): void {
    for (const sid of [...this.runs.keys()]) this.stop(sid);
  }
}

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function wrapLng(x: number): number {
  return ((((x + 180) % 360) + 360) % 360) - 180;
}
