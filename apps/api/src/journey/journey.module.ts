import { Module } from '@nestjs/common';
import { JourneyStage } from '../common/journey-stage.js';
import { OwnerClock } from '../common/owner-clock.js';
import { PregnancyContext } from '../common/pregnancy-context.js';
import { ContentModule } from '../content/content.module.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';
import { JourneyController } from './journey.controller.js';

/** Prenatal visit schedules and postpartum mode. */
@Module({
  imports: [ContentModule, EntitlementsModule],
  controllers: [JourneyController],
  providers: [OwnerClock, PregnancyContext, JourneyStage],
})
export class JourneyModule {}
