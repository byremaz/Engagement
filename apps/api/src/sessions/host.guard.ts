import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { APP_CONFIG, AppConfig } from '../config/app-config';

/**
 * Protects host-only routes. The key is supplied via `x-host-key` and compared
 * in constant time against HOST_ACCESS_KEY from the environment.
 */
@Injectable()
export class HostGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.header('x-host-key');
    if (!header || !safeEqual(header, this.config.hostAccessKey)) {
      throw new UnauthorizedException('host key required');
    }
    return true;
  }
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}
