import type {
  ActivitySections,
  MealPlanSections,
  RecipeSections,
} from '@preconception/contracts';
import { fakePrisma } from '../../test/support/fake-prisma.js';
import type { Owner } from '../auth/owner.js';
import { addDays } from '../common/dates.js';
import type { PregnancyContext } from '../common/pregnancy-context.js';
import { weekOn } from '../common/pregnancy-context.js';
import type { CatalogService } from '../content/catalog.service.js';
import {
  EXERCISE_DISCLAIMER,
  PersonalPlansService,
} from './personal-plans.service.js';

const owner: Owner = { kind: 'anonymous', id: 'g1', expiresAt: new Date() };
const TODAY = '2026-06-01';
/** 20w0d on TODAY: due 140 days later. */
const DUE = addDays(TODAY, 140);

function row(slug: string, sections: object, kind = 'activity') {
  return {
    id: `id-${slug}`,
    kind,
    slug,
    locale: 'en',
    version: 1,
    title: slug,
    summary: '',
    category: null,
    trimester: null,
    tags: [],
    references: [],
    premium: false,
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    nextReviewDue: null,
    sections,
  };
}

const activity = (
  fromWeek: number | null,
  toWeek: number | null,
  trimesters: number[],
) =>
  ({
    type: 'walking',
    instructions: ['Walk.'],
    durationMinutes: null,
    intensity: 'gentle',
    trimesters,
    fromWeek,
    toWeek,
    safetyNotes: [],
    contraindications: [],
    stopSigns: ['Bleeding'],
    media: [],
  }) as unknown as ActivitySections;

function setup(opts: {
  pregnancy?: Partial<{
    restrictExercise: boolean;
    clinicianNutritionPlan: boolean;
  }> | null;
  activities?: ReturnType<typeof row>[];
  plans?: ReturnType<typeof row>[];
  recipes?: Map<string, { sections: RecipeSections }>;
}) {
  const { prisma } = fakePrisma();
  const pregnancyRow =
    opts.pregnancy === null
      ? null
      : {
          dueDate: new Date(`${DUE}T00:00:00Z`),
          restrictExercise: false,
          clinicianNutritionPlan: false,
          foodRestrictions: [],
          ...opts.pregnancy,
        };
  const context = {
    active: vi.fn().mockResolvedValue(
      pregnancyRow && {
        row: pregnancyRow,
        today: TODAY,
        ...weekOn(DUE, TODAY),
      },
    ),
  } as unknown as PregnancyContext;
  const catalog = {
    published: vi.fn((kind: string) =>
      Promise.resolve({
        rows:
          kind === 'activity' ? (opts.activities ?? []) : (opts.plans ?? []),
        reviews: new Map(),
        total: 0,
      }),
    ),
    recipesBySlug: vi.fn().mockResolvedValue(opts.recipes ?? new Map()),
  } as unknown as CatalogService;
  return new PersonalPlansService(prisma, catalog, context);
}

describe('PersonalPlansService.exercisePlan', () => {
  const activities = [
    row('mid', activity(14, 27, [2])),
    row('late', activity(28, null, [3])),
    row('any', activity(null, null, [1, 2, 3])),
  ];

  it('matches activities to today’s week by default', async () => {
    const plan = await setup({ activities }).exercisePlan(owner, {
      locale: 'en',
    });
    expect(plan.week).toBe(20);
    expect(plan.activities.map((a) => a.slug).sort()).toEqual(['any', 'mid']);
    expect(plan.disclaimer).toBe(EXERCISE_DISCLAIMER);
  });

  it('matches activities to the week of a requested date (regression)', async () => {
    const plan = await setup({ activities }).exercisePlan(owner, {
      date: addDays(TODAY, 10 * 7),
      locale: 'en',
    });
    expect(plan.week).toBe(30);
    expect(plan.activities.map((a) => a.slug).sort()).toEqual(['any', 'late']);
  });

  it('returns clinician_guidance, no_pregnancy, none_published and none_matching', async () => {
    expect(
      (
        await setup({
          activities,
          pregnancy: { restrictExercise: true },
        }).exercisePlan(owner, { locale: 'en' })
      ).availability,
    ).toBe('clinician_guidance');
    const none = await setup({ activities, pregnancy: null }).exercisePlan(
      owner,
      { locale: 'en' },
    );
    expect(none).toMatchObject({
      availability: 'no_pregnancy',
      week: null,
      activities: [],
    });
    expect(
      (await setup({ activities: [] }).exercisePlan(owner, { locale: 'en' }))
        .availability,
    ).toBe('none_published');
    expect(
      (
        await setup({
          activities: [row('late', activity(28, null, [3]))],
        }).exercisePlan(owner, { locale: 'en' })
      ).availability,
    ).toBe('none_matching');
  });
});

describe('PersonalPlansService.mealPlan', () => {
  const dal: RecipeSections = {
    mealSlots: ['lunch'],
    servings: 1,
    prepMinutes: 10,
    ingredients: [{ name: 'Lentils', quantity: null, allergens: [] }],
    steps: ['Cook'],
    dietPatterns: ['no_restriction'],
    nutrients: [],
    foodSafetyNotes: [],
    substitutions: [],
    cuisine: null,
    media: [],
  };
  const planSections = (trimesters: number[]) =>
    ({
      days: [{ day: 1, meals: [{ slot: 'lunch', recipeSlug: 'dal' }] }],
      dietPatterns: ['no_restriction'],
      trimesters,
      hydrationNote: 'Drink water.',
      cuisine: null,
    }) as unknown as MealPlanSections;
  const recipes = new Map([['dal', { slug: 'dal', sections: dal }]]) as never;

  it('chooses a plan reviewed for the trimester of the requested days (regression)', async () => {
    const plans = [row('second-only', planSections([2]), 'meal_plan')];
    const service = setup({ plans, recipes });
    expect(
      (await service.mealPlan(owner, { days: 1, locale: 'en' })).planSlug,
    ).toBe('second-only');
    // Week 30 is the third trimester: a second-trimester-only plan must not be offered.
    const later = await service.mealPlan(owner, {
      date: addDays(TODAY, 10 * 7),
      days: 1,
      locale: 'en',
    });
    expect(later.availability).toBe('none_matching');
    // 27w1d..28w0d: the last day is in the third trimester. 27w0d..27w6d is not.
    const within = await service.mealPlan(owner, {
      date: addDays(TODAY, 7 * 7),
      days: 7,
      locale: 'en',
    });
    expect(within.availability).toBe('available');
    const crossing = await service.mealPlan(owner, {
      date: addDays(TODAY, 7 * 7 + 1),
      days: 7,
      locale: 'en',
    });
    expect(crossing.availability).toBe('none_matching');
  });

  it('returns one entry per requested day', async () => {
    const plans = [row('all', planSections([1, 2, 3]), 'meal_plan')];
    const plan = await setup({ plans, recipes }).mealPlan(owner, {
      days: 3,
      locale: 'en',
    });
    expect(plan.days.map((d) => d.date)).toEqual([
      TODAY,
      addDays(TODAY, 1),
      addDays(TODAY, 2),
    ]);
    expect(plan.days[0].meals[0]).toMatchObject({
      slot: 'lunch',
      eaten: false,
    });
  });

  it('withholds plans when a clinician manages nutrition', async () => {
    const plans = [row('all', planSections([1, 2, 3]), 'meal_plan')];
    const plan = await setup({
      plans,
      recipes,
      pregnancy: { clinicianNutritionPlan: true },
    }).mealPlan(owner, { days: 1, locale: 'en' });
    expect(plan).toMatchObject({
      availability: 'clinician_guidance',
      days: [],
    });
  });
});
