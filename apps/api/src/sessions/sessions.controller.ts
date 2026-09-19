import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { detectDevice } from './device';
import {
  CreateSessionDto,
  CursorQueryDto,
  JoinSessionDto,
  RenameParticipantDto,
  RestoreDto,
  SetJoinOpenDto,
  SetSignalModeDto,
} from './dto';
import { HostGuard } from './host.guard';
import { SessionRow, SessionsService } from './sessions.service';

/** Public-safe projection of a session (no host secrets, no participant metadata). */
function publicSession(s: SessionRow) {
  return {
    id: s.id,
    joinCode: s.join_code,
    title: s.title,
    state: s.state,
    joinOpen: s.join_open,
    paused: s.paused,
    createdAt: s.created_at,
  };
}

function hostSession(s: SessionRow) {
  return {
    ...publicSession(s),
    capacity: s.capacity,
    gameIndex: s.game_index,
    roundIndex: s.round_index,
    ceremonyStep: s.ceremony_step,
    signalMode: s.signal_mode,
    contentFrozen: s.content_frozen,
    eventStartedAt: s.event_started_at,
    closedAt: s.closed_at,
  };
}

/** Participant-facing routes keyed by the human join code. */
@Controller('join')
export class JoinController {
  constructor(private readonly sessions: SessionsService) {}

  /** GET /v1/join/:code - lobby preview before entering a name. */
  @Get(':code')
  async preview(@Param('code') code: string) {
    const s = await this.sessions.getByJoinCode(sanitizeCode(code));
    const counts = await this.sessions.counts(s.id);
    return { session: publicSession(s), participantCount: counts.participants };
  }

  /** POST /v1/join/:code/participants - name is the only required input (spec §5.1). */
  @Post(':code/participants')
  @HttpCode(201)
  join(@Param('code') code: string, @Body() dto: JoinSessionDto, @Req() req: Request) {
    return this.sessions.join(sanitizeCode(code), dto.name, detectDevice(req.headers));
  }

  /** POST /v1/join/:code/restorations - recover identity with the private code. */
  @Post(':code/restorations')
  @HttpCode(200)
  restore(@Param('code') code: string, @Body() dto: RestoreDto, @Req() req: Request) {
    return this.sessions.restore(sanitizeCode(code), dto.recoveryCode, detectDevice(req.headers));
  }
}

/** Host-only administration routes. */
@Controller('sessions')
@UseGuards(HostGuard)
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateSessionDto) {
    return hostSession(await this.sessions.create(dto.title.trim(), dto.capacity ?? 100));
  }

  @Get()
  async list(@Query() q: CursorQueryDto) {
    const page = await this.sessions.list(q.cursor, q.limit ?? 50);
    return { items: page.items.map(hostSession), nextCursor: page.nextCursor };
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return hostSession(await this.sessions.getById(id));
  }

  @Get(':id/participants')
  roster(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.roster(id);
  }

  @Patch(':id/participants/:participantId')
  @HttpCode(204)
  async rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('participantId', ParseUUIDPipe) participantId: string,
    @Body() dto: RenameParticipantDto,
  ) {
    await this.sessions.rename(id, participantId, dto.name);
  }

  @Delete(':id/participants/:participantId')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Param('participantId', ParseUUIDPipe) participantId: string) {
    await this.sessions.remove(id, participantId);
  }

  @Patch(':id/join-open')
  async setJoinOpen(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetJoinOpenDto) {
    return hostSession(await this.sessions.setJoinOpen(id, dto.open));
  }

  @Patch(':id/signal-mode')
  async setSignalMode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetSignalModeDto) {
    return hostSession(await this.sessions.setSignalMode(id, dto.mode));
  }

  /** Issues a token for the shared large-screen display route. */
  @Post(':id/display-tokens')
  @HttpCode(201)
  async displayToken(@Param('id', ParseUUIDPipe) id: string) {
    const s = await this.sessions.getById(id);
    return { token: this.sessions.displayToken(s.id) };
  }

  @Post(':id/close')
  async close(@Param('id', ParseUUIDPipe) id: string) {
    return hostSession(await this.sessions.close(id));
  }
}

function sanitizeCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
}
