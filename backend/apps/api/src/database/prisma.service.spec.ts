import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from './prisma.service.js';

// Constructing the client opens no connection; $queryRaw is replaced per test.
function service() {
  const values: Partial<Env> = {
    DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/unused',
    DATABASE_POOL_MAX: 10,
    DATABASE_POOL_TIMEOUT_MS: 5000,
  };
  const config = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new PrismaService(config);
}

describe('PrismaService.isHealthy', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is true when SELECT 1 succeeds', async () => {
    const prisma = service();
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([
      { '?column?': 1 },
    ] as never);
    await expect(prisma.isHealthy()).resolves.toBe(true);
  });

  it('is false when the query fails', async () => {
    const prisma = service();
    vi.spyOn(prisma, '$queryRaw').mockRejectedValue(
      new Error('ECONNREFUSED') as never,
    );
    await expect(prisma.isHealthy()).resolves.toBe(false);
  });

  it('is false when the query hangs past the timeout', async () => {
    vi.useFakeTimers();
    const prisma = service();
    vi.spyOn(prisma, '$queryRaw').mockReturnValue(
      new Promise(() => {}) as never,
    );
    const result = prisma.isHealthy(2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toBe(false);
  });

  it('clears its timer once the query answers', async () => {
    vi.useFakeTimers();
    const prisma = service();
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([] as never);
    await prisma.isHealthy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
