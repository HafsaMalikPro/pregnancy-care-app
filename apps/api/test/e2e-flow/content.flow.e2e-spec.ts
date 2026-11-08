import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import {
  activitySections,
  approval,
  articleDraft,
  mealPlanSections,
  publishStructured,
  recipeSections,
  staffTeam,
  type Team,
} from '../fixtures.js';
import { createTestApp, getPrisma } from '../helpers.js';
import { http } from './flow-helpers.js';

describe('Flow: content workflow and public catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let team: Team;
  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    team = await staffTeam(app, prisma);
  });
  afterAll(async () => {
    await app.close();
  });

  it('draft → submit → review (another staff member) → publish, then public', async () => {
    const { id, slug } = await articleDraft(app, team.editor);
    await http(app).get(`/v1/articles/${slug}`).expect(404);
    await http(app)
      .post(`/v1/admin/articles/${id}/submit`)
      .set(team.editor)
      .expect(200);
    // The author cannot review their own work; a clinical reviewer can.
    await http(app)
      .post(`/v1/admin/articles/${id}/reviews`)
      .set(team.editor)
      .send(approval)
      .expect(403);
    await http(app)
      .post(`/v1/admin/articles/${id}/reviews`)
      .set(team.reviewer)
      .send(approval)
      .expect(201);
    await http(app)
      .post(`/v1/admin/articles/${id}/publish`)
      .set(team.editor)
      .expect(200);
    const pub = await http(app).get(`/v1/articles/${slug}`).expect(200);
    expect(pub.body).toMatchObject({
      slug,
      body: expect.any(String),
      review: { reviewerCredentials: approval.reviewerCredentials },
    });
  });

  it('public lists return only published recipes, activities and meal plans', async () => {
    const recipe = await publishStructured(
      app,
      team,
      'recipes',
      recipeSections([{ name: 'Oats' }]),
    );
    const activity = await publishStructured(
      app,
      team,
      'activities',
      activitySections(),
    );
    const plan = await publishStructured(
      app,
      team,
      'meal-plans',
      mealPlanSections([recipe.slug]),
    );
    const draft = await http(app)
      .post('/v1/admin/recipes')
      .set(team.editor)
      .send({
        slug: `draft-${recipe.slug}`,
        locale: 'en',
        title: 'Draft',
        summary: 'S',
        category: 'nutrition',
        references: [{ title: 'NICE', url: 'https://www.nice.org.uk/' }],
        sections: recipeSections([{ name: 'Rice' }]),
      })
      .expect(201);
    await http(app).get(`/v1/recipes/${recipe.slug}`).expect(200);
    await http(app).get(`/v1/activities/${activity.slug}`).expect(200);
    await http(app).get(`/v1/meal-plans/${plan.slug}`).expect(200);
    await http(app).get(`/v1/recipes/${draft.body.slug}`).expect(404);
    const list = await http(app)
      .get('/v1/recipes')
      .query({ limit: 100 })
      .expect(200);
    expect(
      list.body.items.every(
        (r: { status?: string }) =>
          r.status === undefined || r.status === 'published',
      ),
    ).toBe(true);
    const guides = await http(app).get('/v1/week-guides').expect(200);
    expect(Array.isArray(guides.body)).toBe(true);
  });

  it('negative: unknown slug 404, staff route without auth 401, bad draft 400', async () => {
    await http(app).get('/v1/articles/no-such-article-here').expect(404);
    await http(app).post('/v1/admin/articles').send({}).expect(401);
    await http(app)
      .post('/v1/admin/articles')
      .set(team.editor)
      .send({ slug: 'Bad Slug!' })
      .expect(400);
  });
});
