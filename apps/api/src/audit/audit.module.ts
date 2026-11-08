import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { SecurityEventsService } from './security-events.service.js';

@Global()
@Module({
  providers: [AuditService, SecurityEventsService],
  exports: [AuditService, SecurityEventsService],
})
export class AuditModule {}
