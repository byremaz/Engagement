import { Controller, Get } from '@nestjs/common';
import { DbService } from './db/db.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DbService) {}

  /** GET /v1/health - liveness + database reachability. */
  @Get()
  async health(): Promise<{ status: 'ok' | 'degraded'; database: boolean; time: string }> {
    const database = await this.db.ping();
    return { status: database ? 'ok' : 'degraded', database, time: new Date().toISOString() };
  }
}
