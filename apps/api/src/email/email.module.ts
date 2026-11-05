import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import {
  DisabledEmailSender,
  EMAIL_SENDER,
  type EmailSender,
  LogEmailSender,
  MemoryEmailSender,
  ResendEmailSender,
} from './email-sender.js';

export function createEmailSender(
  env: Pick<Env, 'EMAIL_PROVIDER' | 'EMAIL_FROM' | 'RESEND_API_KEY'>,
): EmailSender {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      return new ResendEmailSender(env.RESEND_API_KEY!, env.EMAIL_FROM!);
    case 'log':
      return new LogEmailSender();
    case 'memory':
      return new MemoryEmailSender();
    default:
      return new DisabledEmailSender();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createEmailSender({
          EMAIL_PROVIDER: config.get('EMAIL_PROVIDER', { infer: true }),
          EMAIL_FROM: config.get('EMAIL_FROM', { infer: true }),
          RESEND_API_KEY: config.get('RESEND_API_KEY', { infer: true }),
        }),
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
