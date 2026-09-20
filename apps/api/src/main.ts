import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig, loadEnvFile } from './config/app-config';

// Must run before any config/env access.
loadEnvFile();

/**
 * Built Angular bundle to serve from this same process, when there is one.
 *
 * Single-origin deployment (Render, §deploy): the phone, the display and the
 * host load from the SAME origin that serves `/v1`, so every relative call in
 * `api.service.ts` and the `/v1/socket.io` WebSocket work untouched, with no
 * CORS and no reverse proxy in front of the socket. In local development the
 * Angular dev server serves the UI instead and this returns null, so `npm run
 * dev:api` is unchanged.
 */
function resolveWebRoot(): string | null {
  const explicit = process.env.WEB_ROOT?.trim();
  const candidates = explicit
    ? [resolve(explicit)]
    : [
        // Compiled: <repo>/apps/api/dist/apps/api/src/main.js
        resolve(__dirname, '../../../../../web/dist/web/browser'),
        // Source (tsx/ts-node): <repo>/apps/api/src/main.ts
        resolve(__dirname, '../../web/dist/web/browser'),
        resolve(process.cwd(), 'apps/web/dist/web/browser'),
      ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['log', 'warn', 'error'] });

  app.use(
    helmet({
      // The bundle is same-origin; relax only what a self-hosted SPA needs.
      // `connect-src 'self'` already covers the same-origin WebSocket.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:'],
          'font-src': ["'self'"],
          'worker-src': ["'self'", 'blob:'],
        },
      },
      // The display is opened full screen on the venue machine; COEP would
      // block nothing we use but breaks nothing either. Keep it off.
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.enableCors({ origin: config.corsOrigins, credentials: true });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  const webRoot = resolveWebRoot();
  if (webRoot) {
    // Hashed bundle files may be cached hard; index.html must never be, or a
    // redeploy on event day would keep serving the previous build.
    app.useStaticAssets(webRoot, { index: false, maxAge: '1y', setHeaders: (res, path) => {
      if (path.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    } });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path === '/v1' || req.path.startsWith('/v1/')) return next();
      // A clean path becomes its hash route here, before any bundle is fetched,
      // so someone typing `/host` on the venue machine is not dropped on the
      // participant join screen. The bundle repeats this defensively (web
      // main.ts) for hosts that do not redirect.
      if (req.path !== '/' && !req.path.includes('.')) {
        return res.redirect(302, `/#${req.path}${req.url.slice(req.path.length)}`);
      }
      return res.sendFile(join(webRoot, 'index.html'));
    });
  }

  // Render (and any container host) requires binding all interfaces, not loopback.
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`ASAS Challenge API listening on :${config.port} (prefix /v1)`, 'Bootstrap');
  Logger.log(webRoot ? `Serving the web app from ${webRoot}` : 'No web bundle found; API only', 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error(err instanceof Error ? err.message : String(err), undefined, 'Bootstrap');
  process.exit(1);
});
