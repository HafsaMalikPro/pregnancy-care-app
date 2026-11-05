import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/database/prisma.service.js';
import { setupApp } from './../src/setup-app.js';

describe('API foundation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /v1/health reports the database as up', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/health')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('issues a request id and returns errors in the shared shape', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/does-not-exist')
      .expect(404);
    expect(res.headers['x-request-id']).toBeTruthy();
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('routes are versioned under /v1', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('serves the OpenAPI document outside production', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs/openapi.json')
      .expect(200);
    expect(res.body.paths['/v1/health']).toBeDefined();
  });

  describe('database constraints', () => {
    let anonId: string;

    beforeAll(async () => {
      const anon = await prisma.anonymousSession.create({
        data: {
          credentialHash: `test-${crypto.randomUUID()}`,
          platform: 'test',
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      anonId = anon.id;
    });

    afterAll(async () => {
      await prisma.anonymousSession.delete({ where: { id: anonId } });
    });

    it('rejects overlapping periods for the same owner', async () => {
      await prisma.cycle.create({
        data: {
          anonymousSessionId: anonId,
          periodStart: new Date('2026-01-01'),
          periodEnd: new Date('2026-01-05'),
        },
      });
      await expect(
        prisma.cycle.create({
          data: {
            anonymousSessionId: anonId,
            periodStart: new Date('2026-01-04'),
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects a period that ends before it starts', async () => {
      await expect(
        prisma.cycle.create({
          data: {
            anonymousSessionId: anonId,
            periodStart: new Date('2026-03-10'),
            periodEnd: new Date('2026-03-01'),
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects a record with no owner', async () => {
      await expect(
        prisma.cycle.create({ data: { periodStart: new Date('2026-05-01') } }),
      ).rejects.toThrow();
    });
  });
});
