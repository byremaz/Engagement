/**
 * Participant self-service routes (`/v1/participants/me/*`).
 * Authenticated by the signed participant token from join/restore — the same
 * HMAC token the socket uses — sent as `Authorization: Bearer <token>`.
 * Registered in RoundsModule so a change can be broadcast to every screen.
 */
import { Body, Controller, Headers, Inject, Patch, UnauthorizedException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { RoundsService } from '../rounds/rounds.service';
import { SetAvatarDto } from './dto';
import { SessionsService } from './sessions.service';
import { verifyToken, type TokenClaims } from './tokens';

@Controller('participants/me')
export class ParticipantsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: SessionsService,
    private readonly rounds: RoundsService,
  ) {}

  private async claims(authorization?: string): Promise<TokenClaims & { participantId: string }> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    const claims = token ? verifyToken(token, this.config.tokenSecret) : null;
    if (!claims || claims.role !== 'participant' || !claims.participantId) {
      throw new UnauthorizedException('participant token required');
    }
    // One active controller per identity (§5.1.9): stale devices may not act.
    if (claims.controllerId && !(await this.sessions.isActiveController(claims.participantId, claims.controllerId))) {
      throw new UnauthorizedException('this identity is controlled from another device');
    }
    return claims as TokenClaims & { participantId: string };
  }

  /** PATCH /v1/participants/me/avatar — change avatar (allow-list, display-only). */
  @Patch('avatar')
  async setAvatar(@Headers('authorization') authorization: string | undefined, @Body() dto: SetAvatarDto) {
    const claims = await this.claims(authorization);
    const { sessionId, avatar } = await this.sessions.setAvatar(claims.participantId, dto.avatar);
    // Broadcast a fresh snapshot so the display and host roster update at once.
    await this.rounds.publish(sessionId).catch(() => undefined);
    return { avatar };
  }
}
