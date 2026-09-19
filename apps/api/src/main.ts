import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { loadConfig, loadEnvFile } from './config/app-config';

// Must run before any config/env access.
loadEnvFile();

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });

  app.use(helmet());
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

  await app.listen(config.port);
  Logger.log(`ASAS Challenge API listening on :${config.port} (prefix /v1)`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error(err instanceof Error ? err.message : String(err), undefined, 'Bootstrap');
  process.exit(1);
});
