import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config/app-config';
import { DbService } from './db.service';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig(process.env) }, DbService],
  exports: [APP_CONFIG, DbService],
})
export class DbModule {}
