import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js';
import { type Env, validateEnv } from './config/env.js';
import { ConsentModule } from './consent/consent.module.js';
import { ContentModule } from './content/content.module.js';
import { CyclesModule } from './cycles/cycles.module.js';
import { DailyLogsModule } from './daily-logs/daily-logs.module.js';
import { EmailModule } from './email/email.module.js';
import { DatabaseModule } from './database/database.module.js';
import { EntitlementsModule } from './entitlements/entitlements.module.js';
import { HealthController } from './health/health.controller.js';
import { PlanningModule } from './planning/planning.module.js';
import { PregnancyModule } from './pregnancy/pregnancy.module.js';
import { PrivacyModule } from './privacy/privacy.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { RemindersModule } from './reminders/reminders.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Default budget per client IP; auth, export and other expensive routes set tighter limits.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: 60_000, limit: 120 }],
        skipIf: () => !config.get('RATE_LIMIT_ENABLED', { infer: true }),
      }),
    }),
    DatabaseModule,
    EmailModule,
    AuditModule,
    AuthModule,
    ConsentModule,
    EntitlementsModule,
    ProfileModule,
    CyclesModule,
    PregnancyModule,
    DailyLogsModule,
    ContentModule,
    PlanningModule,
    RemindersModule,
    PrivacyModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
