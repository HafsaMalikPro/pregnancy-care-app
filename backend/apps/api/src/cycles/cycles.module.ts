import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { ConsentModule } from '../consent/consent.module.js';
import { CyclesController } from './cycles.controller.js';
import { CyclesService } from './cycles.service.js';

@Module({
  imports: [ConsentModule],
  controllers: [CyclesController],
  providers: [CyclesService, OwnerClock],
})
export class CyclesModule {}
