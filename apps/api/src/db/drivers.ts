/**
 * Concrete database drivers (see `driver.ts` for why two exist).
 *
 * Both expose the same `DbDriver` contract, so every service, migration and
 * export path runs identical SQL whichever one is active.
 */
import { resolve } from 'node:path';
import { Pool } from 'pg';
import type { DbDriver, QueryResultLike, SqlExecutor } from './driver';

// ------------------------------------------------------------------ postgres

/**
 * TLS settings for a managed PostgreSQL that asks for it in the URL.
 *
 * A hosted database reached over the public internet (Render, Neon, RDS…)
 * requires `sslmode=require`, but presents a certificate chain Node does not
 * carry, so verification is disabled for exactly that case. An internal or
 * local connection (no `sslmode`, or `disable`) stays plain, as today.
 */
export function sslOptionsFor(connectionString: string): { rejectUnauthorized: boolean } | undefined {
  const mode = /[?&]sslmode=([^&]+)/.exec(connectionString)?.[1]?.toLowerCase() ?? process.env.PGSSLMODE?.toLowerCase();
  if (!mode || mode === 'disable') return undefined;
  return { rejectUnauthorized: mode === 'verify-full' || mode === 'verify-ca' };
}

/** Real PostgreSQL server via a pooled `pg` connection (event/production). */
export class PostgresDriver implements DbDriver {
  readonly kind = 'postgres' as const;
  private readonly pool: Pool;

  constructor(connectionString: string, onError?: (message: string) => void) {
    this.pool = new Pool({ connectionString, max: 20, ssl: sslOptionsFor(connectionString) });
    this.pool.on('error', (err) => onError?.(err.message));
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResultLike<T>> {
    const res = await this.pool.query(text, params as never[]);
    return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
  }

  async tx<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: async <R>(text: string, params: unknown[] = []) => {
          const res = await client.query(text, params as never[]);
          return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
        },
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async exec(sql: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ------------------------------------------------------------------ embedded

interface PGliteLike {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
  exec(sql: string): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * PGlite: the actual PostgreSQL engine compiled to WebAssembly, persisting to a
 * local data directory. Single-connection by design, so writes are serialised
 * through a promise chain and transactions hold that lock for their duration.
 */
export class EmbeddedDriver implements DbDriver {
  readonly kind = 'embedded' as const;
  readonly dataDir: string;
  private db: PGliteLike | null = null;
  private opening: Promise<PGliteLike> | null = null;
  /** Serialises access: PGlite has exactly one backend connection. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dataDir: string) {
    this.dataDir = resolve(dataDir);
  }

  private async open(): Promise<PGliteLike> {
    if (this.db) return this.db;
    if (!this.opening) {
      this.opening = (async () => {
        // Loaded lazily so a postgres-only deployment never pays the WASM cost.
        const { PGlite } = (await import('@electric-sql/pglite')) as unknown as {
          PGlite: new (dir: string, opts?: Record<string, unknown>) => PGliteLike;
        };
        const { pgcrypto } = (await import('@electric-sql/pglite/contrib/pgcrypto')) as unknown as {
          pgcrypto: unknown;
        };
        const db = new PGlite(this.dataDir, { extensions: { pgcrypto } });
        this.db = db;
        return db;
      })();
    }
    return this.opening;
  }

  /** Queues `fn` so only one statement/transaction touches the engine at a time. */
  private run<T>(fn: (db: PGliteLike) => Promise<T>): Promise<T> {
    const next = this.chain.then(async () => fn(await this.open()));
    this.chain = next.catch(() => undefined);
    return next;
  }

  async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResultLike<T>> {
    return this.run(async (db) => {
      const res = await db.query<T>(text, params);
      return { rows: res.rows ?? [], rowCount: res.rows?.length ?? res.affectedRows ?? 0 };
    });
  }

  async tx<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T> {
    return this.run(async (db) => {
      const executor: SqlExecutor = {
        query: async <R>(text: string, params: unknown[] = []) => {
          const res = await db.query<R>(text, params);
          return { rows: res.rows ?? [], rowCount: res.rows?.length ?? res.affectedRows ?? 0 };
        },
      };
      await db.query('BEGIN');
      try {
        const result = await fn(executor);
        await db.query('COMMIT');
        return result;
      } catch (err) {
        await db.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
    });
  }

  async exec(sql: string): Promise<void> {
    await this.run(async (db) => {
      await db.exec(sql);
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    this.opening = null;
    if (db) await db.close().catch(() => undefined);
  }
}
