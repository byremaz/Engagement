/**
 * Game and tournament standings computed from persisted raw scores (§9.1-9.3).
 * Game scores use the planned round count as denominator - never the number
 * of rounds actually played (§3, §6.8).
 */
import { Injectable } from '@nestjs/common';
import type { GameType, StandingRow } from '@asas/shared';
import { buildStandings, geoGameScore, orderGameScore, rlglGameScore } from '@asas/shared';
import { DbService } from '../db/db.service';
import type { SessionRow } from '../sessions/sessions.service';
import { RoundRepo } from './round-repo';
import { roundCountFor } from './snapshot';

interface PersonRow {
  id: string;
  number: number;
  name: string;
  avatar: string;
  tie_break: string | null;
}

@Injectable()
export class StandingsService {
  constructor(
    private readonly db: DbService,
    private readonly repo: RoundRepo,
  ) {}

  private people(sessionId: string): Promise<PersonRow[]> {
    return this.db.query<PersonRow>(
      'SELECT id, number, name, avatar, tie_break FROM participants WHERE session_id = $1 AND removed_at IS NULL ORDER BY number',
      [sessionId],
    );
  }

  /** Displayed integer game score per participant; null if that game has no revealed round yet. */
  async gameScores(session: SessionRow, game: GameType): Promise<Map<string, number> | null> {
    const revealed = await this.repo.revealedRoundCount(session.id, game);
    if (revealed === 0) return null;
    const totals = await this.repo.gameRawTotals(session.id, game);
    const planned = roundCountFor(session, game);
    const fn = game === 'RLGL' ? rlglGameScore : game === 'GEO' ? geoGameScore : orderGameScore;
    const out = new Map<string, number>();
    for (const p of await this.people(session.id)) {
      out.set(p.id, fn([totals.get(p.id) ?? 0], planned));
    }
    return out;
  }

  async tournament(session: SessionRow): Promise<StandingRow[]> {
    const [rlgl, geo, order, people] = await Promise.all([
      this.gameScores(session, 'RLGL'),
      this.gameScores(session, 'GEO'),
      this.gameScores(session, 'ORDER'),
      this.people(session.id),
    ]);
    return buildStandings(
      people.map((p) => ({
        participantId: p.id,
        number: p.number,
        name: p.name,
        avatar: p.avatar,
        rlgl: rlgl?.get(p.id) ?? null,
        geo: geo?.get(p.id) ?? null,
        order: order?.get(p.id) ?? null,
        tieBreak: p.tie_break === null ? null : Number(p.tie_break),
      })),
    );
  }

  /** Standings for one game only (Show Game Results). */
  async forGame(session: SessionRow, game: GameType): Promise<StandingRow[]> {
    const all = await this.tournament(session);
    const key = game === 'RLGL' ? 'rlgl' : game === 'GEO' ? 'geo' : 'order';
    const rows = all.map((r) => ({ ...r, total: r[key] }));
    rows.sort((a, b) => b.total - a.total || a.number - b.number);
    let rank = 0;
    rows.forEach((r, i) => {
      if (i === 0 || rows[i - 1]!.total !== r.total) rank = i + 1;
      r.rank = rank;
    });
    return rows;
  }
}
