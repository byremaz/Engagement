import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import type { DbDriver, SqlExecutor } from './driver';
import { resolveDriverChoice } from './driver';
import { EmbeddedDriver, PostgresDriver } from './drivers';

/**
 * Single database entry point for every service (spec §12).
 *
 * It delegates to a `DbDriver` (real PostgreSQL, or the embedded WASM engine on
 * machines without a server - see `driver.ts`). Every query goes through
 * parameter binding; callers never interpolate values into SQL text.
 * [secure-coding]
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private readonly driver: DbDriver;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.driver = createDriver(config.databaseUrl, config.dbDriver, (m) =>
      this.logger.error(`database pool error: ${m}`),
    );
    this.logger.log(
      this.driver.kind === 'embedded'
        ? `database: embedded PostgreSQL (PGlite) at ${(this.driver as EmbeddedDriver).dataDir}`
        : 'database: PostgreSQL server',
    );
  }

  /** Which driver is serving requests - surfaced by /v1/health for the host. */
  get kind(): 'postgres' | 'embedded' {
    return this.driver.kind;
  }

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.driver.query<T>(text, params);
    return res.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  /** Run `fn` inside a transaction; rolls back on throw. */
  async tx<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T> {
    return this.driver.tx(fn);
  }

  /** Applies a multi-statement script (used by the migrator). */
  async exec(sql: string): Promise<void> {
    await this.driver.exec(sql);
  }

  async ping(): Promise<boolean> {
    const ok = await this.driver.ping();
    if (!ok) {
      this.logger.warn('database ping failed');
    }
    return ok;
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver.close();
  }
}

/** Builds the driver named by the environment. Shared with the CLI scripts. */
export function createDriver(
  databaseUrl: string | undefined,
  dbDriver: string | undefined,
  onError?: (message: string) => void,
): DbDriver {
  const choice = resolveDriverChoice(databaseUrl, dbDriver);
  return choice.kind === 'embedded'
    ? new EmbeddedDriver(choice.target)
    : new PostgresDriver(choice.target, onError);
}
