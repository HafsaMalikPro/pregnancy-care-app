import { Module } from '@nestjs/common';
import { EntitlementsController } from './entitlements.controller.js';
import { EntitlementsService } from './entitlements.service.js';

@Module({
  controllers: [EntitlementsController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
