import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_CONFIG, loadConfig } from './config/app-config';
import { DbModule } from './db/db.module';
import { SessionsModule } from './sessions/sessions.module';
import { RoundsModule } from './rounds/rounds.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DbModule, SessionsModule, RoundsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class AppModule {}
