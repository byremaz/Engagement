/**
 * Provisions the ASAS role + database on a LOCALLY INSTALLED PostgreSQL
 * (i.e. when you are not running the docker-compose container).
 *
 * It connects as a superuser, then creates the role and database named in
 * .env (POSTGRES_USER / POSTGRES_DB / POSTGRES_PASSWORD).
 *
 * The superuser password is read from the PGSUPERPASS environment variable and
 * is never written to disk or logged. [secure-coding]
 *
 * PowerShell:
 *   $env:PGSUPERPASS = 'your-postgres-superuser-password'
 *   npx tsx apps/api/src/db/provision-local.ts
 *   Remove-Item Env:PGSUPERPASS
 */
import { Client } from 'pg';
import { loadEnvFile } from '../config/app-config';

interface Target {
  role: string;
  password: string;
  database: string;
  host: string;
  port: number;
}

function readTarget(): Target {
  const role = process.env.POSTGRES_USER?.trim();
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const database = process.env.POSTGRES_DB?.trim();

  if (!role || !password || !database) {
    throw new Error('POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB must all be set in .env');
  }
  return {
    role,
    password,
    database,
    host: process.env.POSTGRES_HOST?.trim() || 'localhost',
    port: Number(process.env.POSTGRES_PORT?.trim() || '5432'),
  };
}

/** Quotes an SQL identifier. Identifiers cannot be bound as parameters. */
function ident(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing unsafe SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

async function main(): Promise<void> {
  const envPath = loadEnvFile();
  console.log(`.env loaded from: ${envPath ?? '(none found)'}`);

  const target = readTarget();
  const superUser = process.env.PGSUPERUSER?.trim() || 'postgres';
  const superPass = process.env.PGSUPERPASS;

  if (!superPass) {
    console.error(
      'PGSUPERPASS is not set.\n' +
        "  PowerShell:  $env:PGSUPERPASS = 'your-postgres-superuser-password'\n" +
        '  then re-run:  npx tsx apps/api/src/db/provision-local.ts',
    );
    process.exit(1);
  }

  const admin = new Client({
    host: target.host,
    port: target.port,
    user: superUser,
    password: superPass,
    database: 'postgres',
    connectionTimeoutMillis: 5000,
  });

  try {
    await admin.connect();
    console.log(`Connected to ${target.host}:${target.port} as ${superUser}.`);

    // Values are bound as parameters; only identifiers are interpolated. [secure-coding]
    const roleExists = await admin.query('select 1 from pg_roles where rolname = $1', [target.role]);
    if (roleExists.rowCount) {
      await admin.query(`alter role ${ident(target.role)} with login password $1`, [
        target.password,
      ]);
      console.log(`Role "${target.role}" already existed - password synced with .env.`);
    } else {
      await admin.query(`create role ${ident(target.role)} with login password $1`, [
        target.password,
      ]);
      console.log(`Role "${target.role}" created.`);
    }

    const dbExists = await admin.query('select 1 from pg_database where datname = $1', [
      target.database,
    ]);
    if (dbExists.rowCount) {
      console.log(`Database "${target.database}" already exists.`);
    } else {
      // CREATE DATABASE cannot run inside a transaction or take parameters.
      await admin.query(
        `create database ${ident(target.database)} owner ${ident(target.role)} encoding 'UTF8'`,
      );
      console.log(`Database "${target.database}" created, owned by "${target.role}".`);
    }

    // Least privilege: the app role owns its schema but gets nothing global. [secure-coding]
    await admin.query(
      `grant all privileges on database ${ident(target.database)} to ${ident(target.role)}`,
    );
    console.log('Privileges granted.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    console.error(`\nProvisioning FAILED: ${message}${code ? ` (code ${code})` : ''}`);
    if (code === '28P01') {
      console.error(
        '\nThe superuser password was rejected. This is the password chosen for the\n' +
          '"postgres" account when PostgreSQL 18 was installed on this machine.',
      );
    } else if (code === 'ECONNREFUSED') {
      console.error('\nNothing is listening - is the postgresql-x64-18 Windows service running?');
    }
    process.exit(1);
  } finally {
    await admin.end().catch(() => undefined);
  }

  console.log('\nNext:  npm run db:migrate -w apps/api');
}

void main();
