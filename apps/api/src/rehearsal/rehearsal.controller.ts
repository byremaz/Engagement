/**
 * Host-only rehearsal endpoints (§16 deliverable 4):
 *   POST   /v1/sessions/:id/simulated-participants   { count }
 *   GET    /v1/sessions/:id/simulated-participants
 *   DELETE /v1/sessions/:id/simulated-participants
 */
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { HostGuard } from '../sessions/host.guard';
import { SimulationService } from './simulation.service';

export class AddSimulatedDto {
  @IsInt() @Min(1) @Max(100) count!: number;
}

@Controller('sessions/:id/simulated-participants')
@UseGuards(HostGuard)
export class RehearsalController {
  constructor(private readonly sim: SimulationService) {}

  @Post()
  add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSimulatedDto) {
    return this.sim.add(id, dto.count);
  }

  @Get()
  async count(@Param('id', ParseUUIDPipe) id: string) {
    return { simulated: await this.sim.count(id) };
  }

  @Delete()
  removeAll(@Param('id', ParseUUIDPipe) id: string) {
    return this.sim.removeAll(id);
  }
}
