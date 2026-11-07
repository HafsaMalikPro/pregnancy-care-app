import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { StaffRole } from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  type Auth,
  daysAgo,
  grantHealthConsent,
  signUp,
  staffUser,
} from './helpers.js';

/**
 * Reusable factories for integration tests. Everything they create uses unique slugs and
 * accounts, so files can run in parallel on one database without seeing each other's rows.
 * Published content is global, so assertions should look for the slugs a test created rather
 * than at whole lists.
 */

export const uid = () => randomUUID().slice(0, 8);
export const refs = [
  { title: 'NICE guideline', url: 'https://www.nice.org.uk/' },
];
export const approval = {
  decision: 'approved',
  reviewerCredentials: 'RM, Registered Midwife',
  sources: refs,
};

export type Staff = Auth & { id: string; email: string };

export interface Team {
  editor: Staff;
  reviewer: Staff;
  admin: Staff;
  support: Staff;
}

/** One account per staff role (all with two-factor enabled). */
export async function staffTeam(
  app: INestApplication<App>,
  prisma: PrismaService,
): Promise<Team> {
  const [editor, reviewer, admin, support] = await Promise.all(
    (
      [
        'content_editor',
        'clinical_reviewer',
        'administrator',
        'support',
      ] as StaffRole[]
    ).map((role) => staffUser(app, prisma, role)),
  );
  return { editor, reviewer, admin, support };
}

export function recipeSections(
  ingredients: { name: string; allergens?: string[] }[],
  diet: string[] = ['no_restriction', 'vegetarian'],
) {
  return {
    mealSlots: ['breakfast', 'lunch', 'dinner'],
    servings: 2,
    prepMinutes: 15,
    ingredients: ingredients.map((i) => ({
      name: i.name,
      quantity: '1',
      allergens: i.allergens ?? [],
    })),
    steps: ['Prepare.', 'Cook until steaming hot.'],
    dietPatterns: diet,
    nutrients: [],
    foodSafetyNotes: ['Cook thoroughly.'],
    substitutions: [],
    cuisine: null,
    media: [],
  };
}

export function activitySections(
  opts: {
    trimesters?: number[];
    fromWeek?: number | null;
    toWeek?: number | null;
  } = {},
) {
  return {
    type: 'walking',
    instructions: ['Walk at a pace where you can still talk.'],
    durationMinutes: null,
    intensity: 'gentle',
    trimesters: opts.trimesters ?? [1, 2, 3],
    fromWeek: opts.fromWeek ?? null,
    toWeek: opts.toWeek ?? null,
    safetyNotes: ['Wear supportive shoes.'],
    contraindications: ['Your clinician has advised rest.'],
    stopSigns: ['Vaginal bleeding'],
    media: [],
  };
}

export function mealPlanSections(
  recipeSlugs: string[],
  opts: { trimesters?: number[]; diet?: string[] } = {},
) {
  return {
    days: [
      {
        day: 1,
        meals: recipeSlugs.map((slug, i) => ({
          slot: (['breakfast', 'lunch', 'dinner'] as const)[i % 3],
          recipeSlug: slug,
        })),
      },
    ],
    dietPatterns: opts.diet ?? ['no_restriction', 'vegetarian'],
    trimesters: opts.trimesters ?? [1, 2, 3],
    hydrationNote: 'Sip water through the day.',
    cuisine: null,
  };
}

type StructuredPath = 'recipes' | 'activities' | 'meal-plans';
const CATEGORY: Record<StructuredPath, string> = {
  recipes: 'nutrition',
  activities: 'exercise',
  'meal-plans': 'nutrition',
};

/** Creates a structured draft and takes it through review and publication. Returns its id. */
export async function publishStructured(
  app: INestApplication<App>,
  team: Pick<Team, 'editor' | 'reviewer'>,
  path: StructuredPath,
  sections: object,
  slug = `${path.slice(0, 4)}-${uid()}`,
  title = `Title ${slug}`,
): Promise<{ id: string; slug: string }> {
  const http = request(app.getHttpServer());
  const created = await http.post(`/v1/admin/${path}`).set(team.editor).send({
    slug,
    locale: 'en',
    title,
    summary: 'Summary',
    category: CATEGORY[path],
    references: refs,
    sections,
  });
  if (created.status !== 201) {
    throw new Error(
      `creating ${path} failed: ${created.status} ${JSON.stringify(created.body)}`,
    );
  }
  const id = created.body.id as string;
  await http
    .post(`/v1/admin/articles/${id}/submit`)
    .set(team.editor)
    .expect(200);
  await http
    .post(`/v1/admin/articles/${id}/reviews`)
    .set(team.reviewer)
    .send(approval)
    .expect(201);
  await http
    .post(`/v1/admin/articles/${id}/publish`)
    .set(team.editor)
    .expect(200);
  return { id, slug };
}

/** A plain article draft (not submitted). */
export async function articleDraft(
  app: INestApplication<App>,
  editor: Auth,
  slug = `article-${uid()}`,
) {
  const res = await request(app.getHttpServer())
    .post('/v1/admin/articles')
    .set(editor)
    .send({
      slug,
      locale: 'en',
      title: 'Iron in pregnancy',
      summary: 'Why iron matters.',
      body: 'Eat iron-rich foods and follow your midwife’s advice.',
      references: refs,
      premium: false,
      category: 'nutrition',
    })
    .expect(201);
  return { id: res.body.id as string, slug };
}

/** A registered user with consent and an active pregnancy `weeks` weeks along (LMP dating). */
export async function pregnantUser(
  app: INestApplication<App>,
  weeks = 20,
  extra: object = {},
) {
  const user = await signUp(app);
  await grantHealthConsent(app, user);
  const res = await request(app.getHttpServer())
    .post('/v1/pregnancies')
    .set(user)
    .send({ dating: { method: 'lmp', lmpDate: daysAgo(weeks * 7) }, ...extra })
    .expect(201);
  return {
    ...user,
    pregnancyId: res.body.id as string,
    dueDate: res.body.dueDate as string,
  };
}

/** UTC calendar date `days` from today (negative = past). */
export function daysFromNow(days: number): string {
  return daysAgo(-days);
}
