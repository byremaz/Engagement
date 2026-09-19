/**
 * Connection probe: identifies WHICH PostgreSQL server answers on the
 * configured port and which login actually works, without ever printing a
 * password. [secure-coding]
 *
 * Run:  npx tsx apps/api/src/db/probe-superuser.ts
 */
import { userInfo } from 'node:os';
import { Client } from 'pg';
import { loadEnvFile } from '../config/app-config';

interface Attempt {
  label: string;
  user: string;
  database: string;
  password?: string;
}

async function tryConnect(a: Attempt, host: string, port: number): Promise<boolean> {
  const client = new Client({
    host,
    port,
    user: a.user,
    database: a.database,
    password: a.password,
    connectionTimeoutMillis: 4000,
  });
  try {
    await client.connect();
    const res = await client.query<{
      current_user: string;
      dd: string;
      server_version: string;
      is_super: boolean;
    }>(
      "select current_user, current_setting('data_directory') as dd, " +
        "current_setting('server_version') as server_version, " +
        'pg_has_role(current_user, \'pg_read_all_settings\', \'member\') as is_super',
    );
    const row = res.rows[0];
    console.log(
      `OK   ${a.label}: user=${row.current_user} pg=${row.server_version} data_directory=${row.dd}`,
    );
    return true;
  } catch (err) {
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`FAIL ${a.label}: ${code ?? ''} ${message}`);
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const host = process.env.POSTGRES_HOST?.trim() || 'localhost';
  const port = Number(process.env.POSTGRES_PORT?.trim() || '5432');
  const superPass = process.env.PGSUPERPASS;
  const osUser = userInfo().username;

  const attempts: Attempt[] = [
    { label: 'postgres (no password / trust)', user: 'postgres', database: 'postgres' },
    { label: 'postgres / "postgres"', user: 'postgres', database: 'postgres', password: 'postgres' },
    { label: `${osUser} (no password / sspi)`, user: osUser, database: 'postgres' },
  ];
  if (superPass) {
    attempts.push({
      label: 'postgres / $PGSUPERPASS',
      user: 'postgres',
      database: 'postgres',
      password: superPass,
    });
  }

  console.log(`Probing ${host}:${port}`);
  for (const attempt of attempts) {
    if (await tryConnect(attempt, host, port)) {
      console.log('\nA working superuser login was found - run: npm run db:provision -w apps/api');
      return;
    }
  }
  console.log(
    '\nNo superuser login succeeded. The server IS reachable, so supply its password once:\n' +
      "  PowerShell:  $env:PGSUPERPASS = '<postgres superuser password>'\n" +
      '               npm run db:provision -w apps/api\n' +
      '               npm run db:migrate   -w apps/api\n' +
      '               Remove-Item Env:PGSUPERPASS',
  );
}

void main();
