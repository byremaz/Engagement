/**
 * Idempotent schema migration: `npm run db:migrate -w apps/api`.
 * Reads DATABASE_URL from the environment (see .env.example).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnvFile } from '../config/app-config';
import { sslOptionsFor } from './drivers';

loadEnvFile();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  // A managed database over the public internet needs TLS; the same rule the
  // pooled driver uses, so both paths agree (see `sslOptionsFor`).
  const client = new Client({ connectionString: databaseUrl, ssl: sslOptionsFor(databaseUrl) });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('schema applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
