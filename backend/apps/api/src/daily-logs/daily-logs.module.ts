import { Module } from '@nestjs/common';
import { OwnerClock } from '../common/owner-clock.js';
import { ConsentModule } from '../consent/consent.module.js';
import { DailyLogsController } from './daily-logs.controller.js';

@Module({
  imports: [ConsentModule],
  controllers: [DailyLogsController],
  providers: [OwnerClock],
})
export class DailyLogsModule {}
