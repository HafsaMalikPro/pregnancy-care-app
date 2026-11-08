import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { createAppLogger } from './common/logging/redacting-logger.js';
import type { Env } from './config/env.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Redacting from the first line logged at boot; setupApp keeps it for the app's lifetime.
    logger: createAppLogger(process.env.NODE_ENV ?? 'development'),
  });
  await setupApp(app);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
