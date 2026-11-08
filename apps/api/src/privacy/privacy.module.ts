import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyService } from './privacy.service.js';
import { RetentionService } from './retention.service.js';

@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService, RetentionService],
  exports: [RetentionService],
})
export class PrivacyModule {}
