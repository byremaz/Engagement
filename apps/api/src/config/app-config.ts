/**
 * Typed runtime configuration. All secrets come from the environment;
 * nothing is hard-coded and the process refuses to start without them.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  /** Optional driver override: 'postgres' | 'embedded' (see db/driver.ts). */
  dbDriver?: string;
  corsOrigins: string[];
  hostAccessKey: string;
  tokenSecret: string;
  publicWebUrl: string;
}

const requireEnv = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const tokenSecret = requireEnv(env, 'TOKEN_SECRET');
  if (tokenSecret.length < 32) {
    throw new Error('TOKEN_SECRET must be at least 32 characters');
  }
  const hostAccessKey = requireEnv(env, 'HOST_ACCESS_KEY');
  if (hostAccessKey.length < 16) {
    throw new Error('HOST_ACCESS_KEY must be at least 16 characters');
  }
  // Distinct purposes must use distinct secrets: leaking the host key must not
  // also hand over the ability to forge participant/display session tokens.
  if (hostAccessKey === tokenSecret) {
    throw new Error('HOST_ACCESS_KEY and TOKEN_SECRET must be different values');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  return {
    port,
    databaseUrl: requireEnv(env, 'DATABASE_URL'),
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:4200')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    hostAccessKey,
    tokenSecret,
    publicWebUrl: (env.PUBLIC_WEB_URL ?? 'http://localhost:4200').replace(/\/$/, ''),
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Locates the nearest `.env` by walking up from this module's directory, so it
 * works regardless of the process working directory (src/ or dist/).
 */
export function findEnvFile(startDir: string = __dirname): string | undefined {
  let dir = startDir;
  // Walk upward so this resolves from src/ (ts-node/tsx) and dist/ alike.
  for (let i = 0; i < 10; i += 1) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

/**
 * Loads the repo-root `.env` into `process.env` exactly once. Real environment
 * variables always win, so container/CI config is never overwritten.
 */
let envLoaded = false;

export function loadEnvFile(): string | undefined {
  if (envLoaded) {
    return undefined;
  }
  envLoaded = true;
  const path = findEnvFile();
  if (path) {
    loadDotenv({ path, override: false });
  }
  return path;
}
