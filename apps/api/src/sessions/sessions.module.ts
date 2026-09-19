import { Module } from '@nestjs/common';
import { HostGuard } from './host.guard';
import { JoinController, SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [JoinController, SessionsController],
  providers: [SessionsService, HostGuard],
  exports: [SessionsService],
})
export class SessionsModule {}
