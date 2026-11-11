/**
 * Local-only sample content for the full 42-week journey: week guides 1–42, recipes, meal
 * plans, activities, newborn/birth/hospital-bag checklists and newborn/postpartum articles.
 *
 * NOT clinical content. Everything is published with no review record, so the API serves
 * `review: null` and the website never labels it as reviewed. It refuses to run against
 * anything but a local database. Re-running it is safe (upserts by slug/key).
 *
 *   cd apps/api && pnpm dlx tsx prisma/seed-journey.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ActivitySections,
  MealPlanSections,
  RecipeSections,
  WeekGuideSections,
} from '@preconception/contracts';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { ACTIVITIES, ARTICLES, TASKS } from './sample-journey/care.js';
import { MEAL_PLANS, RECIPES } from './sample-journey/meals.js';
import {
  SAMPLE_REFERENCES,
  trimesterOf,
  weekGuide,
} from './sample-journey/weeks.js';

const url = process.env.DATABASE_URL ?? '';
if (
  process.env.NODE_ENV === 'production' ||
  !/@(localhost|127\.0\.0\.1)[:/]/.test(url)
) {
  throw new Error('The sample seed only runs against a local database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Kind = 'article' | 'week_guide' | 'recipe' | 'activity' | 'meal_plan';

async function upsertContent(
  kind: Kind,
  slug: string,
  data: {
    title: string;
    summary: string;
    body: string;
    sections?: object;
    week?: number;
    category?: string | null;
    trimester?: number | null;
    tags?: string[];
  },
): Promise<string> {
  const existing = await prisma.article.findFirst({
    where: { kind, slug, locale: 'en', status: 'published' },
    orderBy: { version: 'desc' },
  });
  const row = {
    ...data,
    sections: data.sections ?? undefined,
    references: SAMPLE_REFERENCES,
    status: 'published' as const,
    publishedAt: existing?.publishedAt ?? new Date(),
  };
  if (existing) {
    await prisma.article.update({ where: { id: existing.id }, data: row });
    return existing.id;
  }
  const latest = await prisma.article.findFirst({
    where: { slug, locale: 'en' },
    orderBy: { version: 'desc' },
  });
  if (latest && latest.kind !== kind)
    throw new Error(`Slug ${slug} is used by a ${latest.kind}`);
  const created = await prisma.article.create({
    data: {
      kind,
      slug,
      locale: 'en',
      version: (latest?.version ?? 0) + 1,
      ...row,
    },
  });
  return created.id;
}

async function main() {
  console.log('Week guides 1–42…');
  for (let week = 1; week <= 42; week++) {
    const g = weekGuide(week);
    const sections = WeekGuideSections.parse(g.sections);
    await upsertContent('week_guide', `pregnancy-week-${week}`, {
      title: g.title,
      summary: g.summary,
      body: sections.baby,
      sections,
      week,
      category: 'trimester_guide',
      trimester: trimesterOf(week),
    });
  }

  console.log(`Recipes (${RECIPES.length})…`);
  for (const r of RECIPES) {
    await upsertContent('recipe', r.slug, {
      title: r.title,
      summary: r.summary,
      body: r.summary,
      sections: RecipeSections.parse(r.sections),
      category: 'nutrition',
      trimester: null,
      tags: r.tags,
    });
  }

  console.log(`Meal plans (${MEAL_PLANS.length})…`);
  const recipeSlugs = new Set(RECIPES.map((r) => r.slug));
  for (const p of MEAL_PLANS) {
    const sections = MealPlanSections.parse(p.sections);
    for (const d of sections.days)
      for (const m of d.meals)
        if (!recipeSlugs.has(m.recipeSlug))
          throw new Error(`${p.slug}: unknown recipe ${m.recipeSlug}`);
    await upsertContent('meal_plan', p.slug, {
      title: p.title,
      summary: p.summary,
      body: p.summary,
      sections,
      category: 'nutrition',
      trimester: null,
      tags: sections.dietPatterns.filter((d) => d !== 'no_restriction'),
    });
  }

  console.log(`Activities (${ACTIVITIES.length})…`);
  for (const a of ACTIVITIES) {
    const sections = ActivitySections.parse(a.sections);
    await upsertContent('activity', a.slug, {
      title: a.title,
      summary: a.summary,
      body: a.summary,
      sections,
      category: 'exercise',
      trimester:
        sections.trimesters.length === 1 ? sections.trimesters[0] : null,
      tags: [sections.type],
    });
  }

  console.log(`Articles (${ARTICLES.length})…`);
  const articleIds: Record<string, string> = {};
  for (const a of ARTICLES) {
    articleIds[a.slug] = await upsertContent('article', a.slug, {
      title: a.title,
      summary: a.summary,
      body: a.body,
      category: a.category,
      trimester: a.trimester,
      tags: a.tags,
    });
  }

  console.log(`Checklist tasks (${TASKS.length})…`);
  const link: Record<string, string> = {
    safe_sleep: 'safe-sleep-for-babies',
    breastfeeding: 'breastfeeding-getting-started',
    bathing_hygiene: 'bathing-your-newborn',
    feeding: 'formula-feeding-safely',
    postpartum_home: 'recovering-after-birth',
    newborn_appointments: 'newborn-first-week',
  };
  for (const [index, task] of TASKS.entries()) {
    const data = {
      title: task.title,
      description: task.description,
      category: task.category,
      fromWeek: task.fromWeek,
      toWeek: task.toWeek,
      sortOrder: 100 + index,
      status: 'published' as const,
      articleId: link[task.category]
        ? (articleIds[link[task.category]] ?? null)
        : null,
    };
    await prisma.readinessTask.upsert({
      where: { key: task.key },
      update: data,
      create: { key: task.key, locale: 'en', ...data },
    });
  }

  console.log(
    'Done. Remember: this is sample content with no clinical review.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
