import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AnonymousSessionController } from './anonymous.controller.js';
import { AnonymousSessionService } from './anonymous.service.js';
import { AuthGuard } from './auth.guard.js';
import { AUTH, authProvider } from './auth.provider.js';
import { MeController } from './me.controller.js';

@Global()
@Module({
  controllers: [AnonymousSessionController, MeController],
  providers: [
    authProvider,
    AnonymousSessionService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
