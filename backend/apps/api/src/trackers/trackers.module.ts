import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { PregnancyContext } from '../common/pregnancy-context.js';
import { ConsentModule } from '../consent/consent.module.js';
import { ContractionsController } from './contractions.controller.js';
import { KickCountsController } from './kicks.controller.js';

/** Kick counter (third trimester) and contraction timer. */
@Module({
  imports: [ConsentModule],
  controllers: [KickCountsController, ContractionsController],
  providers: [OwnerClock, PregnancyContext],
})
export class TrackersModule {}
