/**
 * Local-only sample content so the mobile app's Discover and Tools tabs have something to
 * show while testing against a fresh dev database. Never run against a real environment —
 * it only inserts rows, and re-running it is safe (upserts by slug/key) but pointless
 * anywhere real content already exists.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import type { WeekGuideSections } from '@preconception/contracts';

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

const ARTICLES = [
  {
    slug: 'first-trimester-tests',
    title: 'First trimester tests, explained',
    summary: 'What the early blood tests and scans are actually checking for.',
    body: 'Your first prenatal visit usually includes blood tests for blood type, immunity to rubella, and screening for infections. Many clinics also offer a dating scan around 8-12 weeks to confirm how far along you are and check for a heartbeat. None of these are mandatory — ask your clinician what each one is for before deciding.',
  },
  {
    slug: 'folic-acid-why-it-matters',
    title: 'Folic acid: why it matters now',
    summary: 'The early weeks are when it does the most good.',
    body: 'Folic acid supports the early development of the neural tube, which forms the brain and spinal cord — most of this happens before many people know they are pregnant. A daily 400mcg supplement, started before conception if possible and continued through the first trimester, is the standard recommendation in most guidelines.',
  },
  {
    slug: 'morning-sickness-relief',
    title: 'Easing morning sickness',
    summary: 'Small, practical changes that help — and when to ask for more.',
    body: 'Eating small amounts often, keeping a few plain crackers by the bed, and staying ahead of thirst rather than catching up on it all help for many people. If vomiting stops you from keeping fluids down for more than a day, call your clinician — that is beyond what home measures can fix.',
  },
  {
    slug: 'safe-exercise-pregnancy',
    title: 'Safe exercise during pregnancy',
    summary: 'Movement is usually encouraged — here is what to adjust.',
    body: 'Most people can continue the activity they were already doing, adjusting intensity as pregnancy progresses. Walking, swimming, and prenatal yoga are commonly recommended starting points. Avoid activities with a high fall risk or contact risk, and stop and check in with a clinician if you feel dizzy, short of breath at rest, or notice pain.',
  },
  {
    slug: 'partner-support-pregnancy',
    title: 'How partners can help',
    summary: 'Concrete ways to share the load, not just the sentiment.',
    body: 'Attending appointments, taking over tasks that involve chemicals or heavy lifting, and simply asking "what would help today?" tend to matter more than reassurance alone. Pregnancy involves a lot of decisions — having someone else hold context for them is its own kind of support.',
  },
] as const;

function weekSections(week: number): WeekGuideSections {
  return {
    baby: `At week ${week}, your baby continues growing steadily — organs are maturing and movements are becoming more coordinated.`,
    body: `You may notice new changes this week as your body adjusts to the growing pregnancy.`,
    symptoms:
      week < 14
        ? ['nausea', 'fatigue', 'breast_tenderness']
        : ['back_pain', 'fatigue'],
    eat: 'Keep meals regular and include a source of protein and iron where you can.',
    move: 'Gentle daily movement — a walk is enough on most days.',
    visits:
      week % 4 === 0
        ? 'A routine check-in is typical around this week.'
        : 'No visit is usually scheduled this exact week.',
    askAtVisit: ['What should I expect over the next few weeks?'],
    prepare: [],
    avoid: ['Raw or undercooked meat and eggs', 'Unpasteurised dairy'],
    whenToGetHelp: [
      'Heavy bleeding, severe abdominal pain, or a fever — contact your clinician right away.',
    ],
    checklist:
      week === 10 ? ['Book your first prenatal visit if you have not yet'] : [],
    message:
      'Every pregnancy moves at its own pace — this is a general guide, not a schedule to match exactly.',
    firstPregnancyNote: null,
    subsequentPregnancyNote: null,
    babyMilestones: [],
    sizeComparison: null,
  };
}

async function main() {
  console.log('Seeding sample articles…');
  const createdArticles: Record<string, string> = {};
  for (const [index, a] of ARTICLES.entries()) {
    const existing = await prisma.article.findFirst({
      where: { kind: 'article', slug: a.slug, locale: 'en' },
    });
    const row = existing
      ? await prisma.article.update({
          where: { id: existing.id },
          data: { title: a.title, summary: a.summary, body: a.body },
        })
      : await prisma.article.create({
          data: {
            kind: 'article',
            slug: a.slug,
            locale: 'en',
            version: 1,
            title: a.title,
            summary: a.summary,
            body: a.body,
            status: 'published',
            publishedAt: new Date(Date.now() - index * 86_400_000),
          },
        });
    createdArticles[a.slug] = row.id;
  }

  console.log('Seeding sample week guides (weeks 6-16)…');
  for (let week = 6; week <= 16; week++) {
    const slug = `pregnancy-week-${week}`;
    const sections = weekSections(week);
    const existing = await prisma.article.findFirst({
      where: { kind: 'week_guide', slug, locale: 'en' },
    });
    const data = {
      title: `Week ${week}`,
      summary: `What's happening at week ${week} of pregnancy.`,
      body: sections.baby,
      sections: sections as object,
      week,
      status: 'published' as const,
      publishedAt: new Date(),
    };
    if (existing) {
      await prisma.article.update({ where: { id: existing.id }, data });
    } else {
      await prisma.article.create({
        data: { kind: 'week_guide', slug, locale: 'en', version: 1, ...data },
      });
    }
  }

  console.log('Seeding sample readiness tasks…');
  const TASKS = [
    {
      key: 'start-folic-acid',
      title: 'Start a folic acid supplement',
      description: '400mcg daily is the standard recommendation.',
      category: 'nutrition',
      sortOrder: 0,
      articleSlug: 'folic-acid-why-it-matters',
    },
    {
      key: 'book-first-prenatal-visit',
      title: 'Book your first prenatal visit',
      description: 'Usually scheduled between 8 and 12 weeks.',
      category: 'care',
      sortOrder: 1,
      articleSlug: null,
    },
    {
      key: 'cut-alcohol',
      title: 'Cut out alcohol',
      description: 'No amount has been shown to be safe during pregnancy.',
      category: 'lifestyle',
      sortOrder: 2,
      articleSlug: null,
    },
    {
      key: 'gentle-movement',
      title: 'Add gentle daily movement',
      description: 'A short walk most days is a reasonable starting point.',
      category: 'fitness',
      sortOrder: 3,
      articleSlug: 'safe-exercise-pregnancy',
    },
    {
      key: 'tell-your-employer',
      title: 'Plan when to tell your employer',
      description: 'There is no required timing — this is entirely your call.',
      category: 'planning',
      sortOrder: 4,
      articleSlug: null,
    },
  ] as const;

  for (const t of TASKS) {
    const articleId = t.articleSlug
      ? createdArticles[t.articleSlug]
      : undefined;
    const existing = await prisma.readinessTask.findUnique({
      where: { key: t.key },
    });
    const data = {
      title: t.title,
      description: t.description,
      category: t.category,
      sortOrder: t.sortOrder,
      status: 'published' as const,
      articleId: articleId ?? null,
    };
    if (existing) {
      await prisma.readinessTask.update({ where: { id: existing.id }, data });
    } else {
      await prisma.readinessTask.create({
        data: { key: t.key, locale: 'en', ...data },
      });
    }
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
