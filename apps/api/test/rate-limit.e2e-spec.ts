import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Public } from '../src/auth/auth.decorators.js';
import { anonymous, createTestApp, signUp } from './helpers.js';

/**
 * A public test-only controller isolates the global ThrottlerGuard (and the error filter's 429
 * mapping) from authentication. Rate limiting is on for this file only.
 */
@Public('test-only probe controller')
@Controller('throttle-probe')
class ThrottleProbeController {
  @Get()
  get(): { ok: true } {
    return { ok: true };
  }
}

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_ENABLED: 'true' }, [
      ThrottleProbeController,
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 RATE_LIMITED after 120 requests per minute from one client', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 120; i++) {
      await http.get('/v1/throttle-probe').expect(200);
    }
    const res = await http.get('/v1/throttle-probe').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('limits anonymous session creation to 10 per hour per IP', async () => {
    for (let i = 0; i < 10; i++) await anonymous(app);
    const res = await request(app.getHttpServer())
      .post('/v1/anonymous-sessions')
      .send({ platform: 'web' })
      .expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('limits sign-in attempts through Better Auth', async () => {
    const http = request(app.getHttpServer());
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await http
        .post('/v1/auth/sign-in/email')
        .send({ email: 'nobody@example.test', password: 'wrong-password-123' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it('limits two-factor backup-code guesses to 5 per minute', async () => {
    const http = request(app.getHttpServer());
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await http
        .post('/v1/auth/two-factor/verify-backup-code')
        .send({ code: `guess-${i}` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses).toContain(429);
  });

  it('limits append-only consent changes to 30 per hour', async () => {
    const http = request(app.getHttpServer());
    const user = await signUp(app);
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await http
        .post('/v1/me/consents')
        .set(user)
        .send({
          purpose: 'product_analytics',
          granted: i % 2 === 0,
          policyVersion: '2026-10-01',
          source: 'test',
        });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30)).not.toContain(429);
    expect(statuses[0]).toBeLessThan(300);
    expect(statuses[30]).toBe(429);
  });

  it('limits data exports to 3 per hour', async () => {
    const http = request(app.getHttpServer());
    // A registered user: this file's guest-session budget is spent by the test above.
    const user = await signUp(app);
    for (let i = 0; i < 3; i++) {
      await http.post('/v1/me/export').set(user).expect(200);
    }
    const res = await http.post('/v1/me/export').set(user).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('limits account-deletion attempts to 3 per hour', async () => {
    const http = request(app.getHttpServer());
    // Wrong confirmations: each attempt is rejected (400) but still counts.
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const user = await signUp(app).catch(() => null);
      if (!user) break; // sign-up itself is rate limited (10/hour); enough attempts were made
      const res = await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'no' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 3)).toEqual([400, 400, 400]);
    expect(statuses[3]).toBe(429);
  });

  it('never throttles health probes', async () => {
    const http = request(app.getHttpServer());
    for (let i = 0; i < 130; i++) {
      await http.get('/v1/health/live').expect(200);
    }
  });
});
