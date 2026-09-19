/**
 * Database driver abstraction (spec §12, §16 deliverable 1).
 *
 * The event runs on PostgreSQL. Two drivers implement the SAME SQL surface so
 * the venue is never blocked by infrastructure:
 *
 *  - `postgres`  - a real server via `pg` (docker-compose or an installed
 *                  PostgreSQL). This is the production/event path.
 *  - `embedded`  - PGlite: the real PostgreSQL engine compiled to WASM, storing
 *                  its data directory on disk. Used for rehearsal/dev machines
 *                  where no server can be installed. Same SQL, same schema.
 *
 * Selection is explicit and comes only from the environment:
 *   DATABASE_URL=postgres://...            -> postgres driver
 *   DATABASE_URL=embedded                  -> embedded, default data dir
 *   DATABASE_URL=embedded:./.data/pglite   -> embedded, explicit data dir
 *   DB_DRIVER=embedded                     -> forces embedded regardless of URL
 *
 * No credentials are ever hard-coded here. [secure-coding]
 */

/** Minimal shape shared by `pg` results and PGlite results. */
export interface QueryResultLike<T> {
  rows: T[];
  rowCount: number;
}

/** Anything that can run a parameterised statement (pool, client or tx). */
export interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResultLike<T>>;
}

export interface DbDriver extends SqlExecutor {
  /** Human-readable driver name for logs and /v1/health. */
  readonly kind: 'postgres' | 'embedded';
  /** Runs `fn` inside a single transaction; rolls back on throw. */
  tx<T>(fn: (client: SqlExecutor) => Promise<T>): Promise<T>;
  /** Runs a multi-statement script (schema migration). */
  exec(sql: string): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export const DEFAULT_EMBEDDED_DATA_DIR = '.data/pglite';

export interface DriverChoice {
  kind: 'postgres' | 'embedded';
  /** Connection string (postgres) or data directory (embedded). */
  target: string;
}

/**
 * Decides which driver to use from the raw environment values. Pure, so it is
 * unit-testable and identical for the API, the migrator and the diagnostics.
 */
export function resolveDriverChoice(
  databaseUrl: string | undefined,
  dbDriver?: string | undefined,
): DriverChoice {
  const url = databaseUrl?.trim() ?? '';
  const forced = dbDriver?.trim().toLowerCase();

  const embeddedDir = (value: string): string => {
    const rest = value.replace(/^embedded:?/i, '').trim();
    return rest || DEFAULT_EMBEDDED_DATA_DIR;
  };

  if (forced === 'embedded') {
    return { kind: 'embedded', target: /^embedded/i.test(url) ? embeddedDir(url) : DEFAULT_EMBEDDED_DATA_DIR };
  }
  if (forced === 'postgres') {
    if (!url || /^embedded/i.test(url)) {
      throw new Error('DB_DRIVER=postgres requires a postgres:// DATABASE_URL');
    }
    return { kind: 'postgres', target: url };
  }
  if (/^embedded/i.test(url)) {
    return { kind: 'embedded', target: embeddedDir(url) };
  }
  if (!url) {
    throw new Error('DATABASE_URL is required (postgres://... or "embedded")');
  }
  return { kind: 'postgres', target: url };
}
