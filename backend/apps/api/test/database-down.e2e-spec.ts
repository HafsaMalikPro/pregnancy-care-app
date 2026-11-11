import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './helpers.js';

// A real failure: nothing listens on port 1, so every connection attempt is refused.
describe('Database unavailable (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({
      DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/none',
      DATABASE_POOL_TIMEOUT_MS: '1000',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('readiness returns 503 degraded', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(503);
    expect(res.body).toEqual({ status: 'degraded', database: 'down' });
  });

  it('readiness answers within the health-check timeout', async () => {
    const started = Date.now();
    await request(app.getHttpServer()).get('/v1/health').expect(503);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('liveness stays 200 because it does not depend on the database', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
  });

  it('does not leak the connection string', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(JSON.stringify(res.body)).not.toContain('nobody');
  });
});
