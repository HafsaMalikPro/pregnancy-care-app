import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';

/** Readiness must answer promptly even when the database hangs rather than refuses. */
export const HEALTH_CHECK_TIMEOUT_MS = 2000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DATABASE_POOL_MAX', { infer: true }),
        connectionTimeoutMillis: config.get('DATABASE_POOL_TIMEOUT_MS', {
          infer: true,
        }),
      }),
      // Query logging is deliberately off: queries carry health data as parameters.
      log: ['warn', 'error'],
    });
  }

  async isHealthy(timeoutMs = HEALTH_CHECK_TIMEOUT_MS): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    try {
      return await Promise.race([
        this.$queryRaw`SELECT 1`.then(() => true),
        timedOut,
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
