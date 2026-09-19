/**
 * Host REST endpoints under /v1/sessions/:id (kebab-case, plural nouns):
 * actions, snapshot and CSV exports (§4.1, §12.2). All guarded by the host key.
 */
import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import type { HostAction, StandingRow } from '@asas/shared';
import { HostGuard } from '../sessions/host.guard';
import { SessionsService } from '../sessions/sessions.service';
import { RaceController } from './race.controller';
import { RoundRepo } from './round-repo';
import { RoundsService } from './rounds.service';
import { StandingsService } from './standings.service';

const ACTIONS: HostAction[] = [
  'SHOW_INSTRUCTIONS', 'START_PRACTICE', 'REVEAL_PRACTICE', 'START_GAME', 'START_ROUND', 'PAUSE', 'RESUME',
  'REVEAL_RESULTS', 'NEXT_ROUND', 'SHOW_GAME_RESULTS', 'NEXT_GAME', 'SHOW_FINAL_RESULTS', 'VOID_ROUND',
  'START_TIEBREAK', 'CEREMONY_STEP', 'CLOSE_SESSION',
  'STANDINGS_PAGE',
];

export class HostActionDto {
  @IsIn(ACTIONS) action!: HostAction;
  @IsOptional() @IsString() @Length(3, 200) reason?: string;
  @IsOptional() @IsInt() @Min(0) @Max(4) step?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) page?: number;
  @IsOptional() @IsArray() participantIds?: string[];
}

export class SignalDto {
  @IsIn(['RED', 'GREEN']) color!: 'RED' | 'GREEN';
}

export class ExportQueryDto {
  @IsOptional() @IsIn(['public', 'private']) scope?: 'public' | 'private';
}

function csv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

@Controller('sessions/:id')
@UseGuards(HostGuard)
export class HostActionsController {
  constructor(
    private readonly rounds: RoundsService,
    private readonly race: RaceController,
  ) {}

  @Get('snapshot')
  snapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.rounds.snapshot(id);
  }

  @Post('actions')
  @HttpCode(200)
  act(@Param('id', ParseUUIDPipe) id: string, @Body() dto: HostActionDto) {
    // `page` must be forwarded too, otherwise STANDINGS_PAGE over REST always
    // resolves to page 0 and the host cannot page the display leaderboard.
    return this.rounds.act(id, dto.action, {
      reason: dto.reason,
      step: dto.step,
      page: dto.page,
      participantIds: dto.participantIds,
    });
  }

  @Post('signals')
  @HttpCode(204)
  async signal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SignalDto) {
    await this.race.hostSignal(id, dto.color);
  }
}

@Controller('sessions/:id/exports')
@UseGuards(HostGuard)
export class ExportsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly standings: StandingsService,
    private readonly repo: RoundRepo,
  ) {}

  /** Final standings; `scope=private` adds device columns (never on the public leaderboard). */
  @Get('standings.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async standingsCsv(@Param('id', ParseUUIDPipe) id: string, @Query() q: ExportQueryDto): Promise<string> {
    const s = await this.sessions.getById(id);
    const rows: StandingRow[] = await this.standings.tournament(s);
    const priv = q.scope === 'private';
    const roster = priv ? new Map((await this.sessions.roster(id)).map((p) => [p.id, p])) : null;
    await this.sessions.audit(id, 'EXPORT_STANDINGS', { scope: q.scope ?? 'public' });
    const header = ['Participant ID', 'Name', 'Rank', 'Red Light Green Light', 'Pin the Country', 'Order It', 'Total', 'Tie-break'];
    if (priv) header.push('Device Type', 'Device Model', 'OS', 'Browser');
    return csv([
      header,
      ...rows.map((r) => {
        const base: (string | number | null)[] = [r.participantId, r.name, r.rank, r.rlgl, r.geo, r.order, r.total, r.tieBreak];
        if (priv) {
          const d = roster?.get(r.participantId)?.device;
          base.push(d?.deviceType ?? '', d?.model ?? '', d?.os ?? '', d?.browser ?? '');
        }
        return base;
      }),
    ]);
  }

  /** Round-level inspection export (§12.2). */
  @Get('rounds.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async roundsCsv(@Param('id', ParseUUIDPipe) id: string): Promise<string> {
    await this.sessions.getById(id);
    const rows = await this.repo.attemptsForExport(id);
    await this.sessions.audit(id, 'EXPORT_ROUNDS', {});
    return csv([
      ['Attempt ID', 'Game', 'Round', 'Attempt No', 'Practice', 'Tie-break', 'Voided', 'Void Reason', 'Content ID', 'Participant ID', 'Number', 'Name', 'Locked At', 'Raw Score'],
      ...rows.map((r) => [
        r.id, r.game_type, r.round_index + 1, r.attempt_no, r.is_practice ? 'yes' : 'no', r.is_tiebreak ? 'yes' : 'no',
        r.voided_at ? 'yes' : 'no', r.void_reason, r.content_id, r.participant_id, r.number, r.name,
        r.locked_at ? r.locked_at.toISOString() : '', r.raw_score,
      ]),
    ]);
  }
}
