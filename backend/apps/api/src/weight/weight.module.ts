import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { ConsentModule } from '../consent/consent.module.js';
import { WeightController } from './weight.controller.js';

/** Opt-in weight tracking: entries and a plain trend, no targets. */
@Module({
  imports: [ConsentModule],
  controllers: [WeightController],
  providers: [OwnerClock],
})
export class WeightModule {}
