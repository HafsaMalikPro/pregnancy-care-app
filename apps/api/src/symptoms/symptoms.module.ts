import { Module } from '@nestjs/common';
import { JourneyStage } from '../common/journey-stage.js';
import { OwnerClock } from '../common/owner-clock.js';
import { ConsentModule } from '../consent/consent.module.js';
import { SymptomChecksController } from './symptoms.controller.js';

/** Red-flag screen: rule-based triage from a version-controlled rules file. */
@Module({
  imports: [ConsentModule],
  controllers: [SymptomChecksController],
  providers: [OwnerClock, JourneyStage],
})
export class SymptomsModule {}
