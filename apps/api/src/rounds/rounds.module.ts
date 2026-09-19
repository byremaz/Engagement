import { Module } from '@nestjs/common';
import { EventsGateway } from '../realtime/events.gateway';
import { RehearsalController } from '../rehearsal/rehearsal.controller';
import { SimulationService } from '../rehearsal/simulation.service';
import { SessionsModule } from '../sessions/sessions.module';
import { HostGuard } from '../sessions/host.guard';
import { ExportsController, HostActionsController } from './rounds.controller';
import { LiveRuntime } from './live-runtime';
import { ParticipationService } from './participation.service';
import { RaceController } from './race.controller';
import { RoundRepo } from './round-repo';
import { RoundsEventBus } from './rounds.events';
import { RoundsService } from './rounds.service';
import { StandingsService } from './standings.service';

@Module({
  imports: [SessionsModule],
  controllers: [HostActionsController, ExportsController, RehearsalController],
  providers: [
    RoundRepo,
    LiveRuntime,
    RoundsEventBus,
    StandingsService,
    RaceController,
    RoundsService,
    ParticipationService,
    SimulationService,
    EventsGateway,
    HostGuard,
  ],
  exports: [RoundsService, StandingsService, RoundRepo],
})
export class RoundsModule {}
