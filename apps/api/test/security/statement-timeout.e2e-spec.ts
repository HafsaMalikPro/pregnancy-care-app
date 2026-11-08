import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp, getPrisma } from '../helpers.js';

/**
 * Database statement timeout (docs/SECURITY_CHECKLIST.md, E6). A short timeout here proves
 * Postgres cancels a long statement; production uses DATABASE_STATEMENT_TIMEOUT_MS (10 s).
 * Separate file: the app's config is read once per test file.
 */
describe('Security: statement timeout (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ DATABASE_STATEMENT_TIMEOUT_MS: '500' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('cancels a statement that runs longer than the limit', async () => {
    const prisma = await getPrisma(app);
    const started = Date.now();
    await expect(prisma.$queryRaw`SELECT pg_sleep(5)`).rejects.toSatisfy((e) =>
      /statement timeout|canceling statement/i.test(
        String((e as Error).message),
      ),
    );
    expect(Date.now() - started).toBeLessThan(3000);
    // The pool still works afterwards.
    await expect(prisma.$queryRaw`SELECT 1 AS ok`).resolves.toEqual([
      { ok: 1 },
    ]);
  });
});
