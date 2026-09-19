/**
 * Standalone connection diagnostic. Answers the question "why is Postgres
 * rejecting my credentials?" without printing the password itself.
 *
 * Run from the repo root:  npx tsx apps/api/src/db/diagnose-connection.ts
 */
import { Client } from 'pg';
import { loadEnvFile } from '../config/app-config';

interface ParsedUrl {
  user: string;
  host: string;
  port: string;
  database: string;
  passwordLength: number;
}

function parse(databaseUrl: string): ParsedUrl {
  const url = new URL(databaseUrl);
  return {
    user: decodeURIComponent(url.username),
    host: url.hostname,
    port: url.port || '5432',
    database: url.pathname.replace(/^\//, ''),
    passwordLength: decodeURIComponent(url.password).length,
  };
}

async function main(): Promise<void> {
  const envPath = loadEnvFile();
  console.log(`.env loaded from: ${envPath ?? '(none found)'}`);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const parsed = parse(databaseUrl);
  // Never log the secret itself - only its shape. [secure-coding]
  console.log('DATABASE_URL resolves to:');
  console.log(`  user     = ${parsed.user}`);
  console.log(`  host     = ${parsed.host}`);
  console.log(`  port     = ${parsed.port}`);
  console.log(`  database = ${parsed.database}`);
  console.log(`  password = <${parsed.passwordLength} chars>`);

  const envPassword = process.env.POSTGRES_PASSWORD ?? '';
  const urlPassword = decodeURIComponent(new URL(databaseUrl).password);
  if (envPassword && envPassword !== urlPassword) {
    console.warn(
      '\nMISMATCH: POSTGRES_PASSWORD and the password inside DATABASE_URL differ.\n' +
        '  docker-compose seeds the container from POSTGRES_PASSWORD, but the API\n' +
        '  connects using DATABASE_URL. Make the two agree.',
    );
  }

  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  try {
    await client.connect();
    const res = await client.query<{
      version: string;
      current_user: string;
      current_database: string;
      data_directory: string;
    }>(
      "select version() as version, current_user, current_database(), current_setting('data_directory') as data_directory",
    );
    const row = res.rows[0];
    console.log('\nConnection OK.');
    console.log(`  server         = ${row.version}`);
    console.log(`  connected as   = ${row.current_user}`);
    console.log(`  database       = ${row.current_database}`);
    console.log(`  data_directory = ${row.data_directory}`);
    console.log(
      '\nHint: data_directory "/var/lib/postgresql/data" means you reached the\n' +
        'docker container. A Windows path means a locally installed Postgres is\n' +
        'occupying the port instead.',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    console.error(`\nConnection FAILED: ${message}${code ? ` (code ${code})` : ''}`);
    if (code === '28P01' || /password authentication failed/i.test(message)) {
      console.error(
        '\nThe server was reached but rejected the password. Most likely causes,\n' +
          'in order of frequency:\n' +
          '  1. The postgres data volume was initialised with an OLDER password.\n' +
          '     POSTGRES_PASSWORD only takes effect on FIRST boot of an empty\n' +
          '     volume; changing .env afterwards does nothing. Reset with:\n' +
          '       docker compose down -v && docker compose up -d postgres\n' +
          '     (-v deletes the volume, so all local session data is lost.)\n' +
          '  2. A separately installed Postgres already owns port 5432, so you\n' +
          '     are authenticating against the wrong server. Either stop that\n' +
          '     service or set POSTGRES_PORT=5433 in .env, update DATABASE_URL to\n' +
          '     match, and restart the container.\n' +
          '  3. The password contains a URL-reserved character (@ : / ? # &) and\n' +
          '     needs percent-encoding inside DATABASE_URL.',
      );
    } else if (code === 'ECONNREFUSED') {
      console.error('\nNothing is listening. Start the database: docker compose up -d postgres');
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
