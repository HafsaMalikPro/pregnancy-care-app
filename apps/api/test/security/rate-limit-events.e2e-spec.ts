import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import { createTestApp, getPrisma, uniqueEmail } from '../helpers.js';

/** 429s become one security event per client and route per minute (rate limits on). */
describe('Security: rate-limit events (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_ENABLED: 'true' });
    prisma = await getPrisma(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('records a rate-limit hit once, not once per refused request', async () => {
    const http = request(app.getHttpServer());
    const since = new Date();
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) {
      const res = await http
        .post('/v1/auth/sign-in/email')
        .send({ email: uniqueEmail('rl'), password: 'not-the-password-123' });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(3);
    const { SecurityEventsService } =
      await import('../../src/audit/security-events.service.js');
    await app.get(SecurityEventsService).flush();
    const events = await prisma.auditEvent.findMany({
      where: { action: 'security.rate_limited', createdAt: { gte: since } },
    });
    const forRoute = events.filter(
      (e) =>
        (e.metadata as { route?: string }).route ===
        'POST /v1/auth/sign-in/email',
    );
    expect(forRoute).toHaveLength(1);
    expect(JSON.stringify(forRoute[0])).not.toMatch(/127\.0\.0\.1|::1/);
  });
});
