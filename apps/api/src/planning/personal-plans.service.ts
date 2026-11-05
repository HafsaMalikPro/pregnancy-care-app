import { Injectable } from '@nestjs/common';
import type {
  ActivitySections,
  DietPattern,
  ExercisePlan,
  FoodAllergy,
  MealPlanSections,
  PersonalMealPlan,
  RecipeSections,
} from '@preconception/contracts';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { addDays, fromIsoDate, toIsoDate } from '../common/dates.js';
import {
  type ActivePregnancy,
  PregnancyContext,
} from '../common/pregnancy-context.js';
import {
  activityFits,
  bySlot,
  choosePlan,
  type FoodPreferences,
  mealsForDate,
} from '../content/catalog.js';
import { CatalogService, toActivity } from '../content/catalog.service.js';
import { PrismaService } from '../database/prisma.service.js';

export const EXERCISE_DISCLAIMER =
  'General guidance reviewed by clinicians, not an exercise prescription. Stop and contact your midwife, doctor or maternity unit if any stop sign happens. Logging an activity is for your own record; it is not medical monitoring.';

/**
 * Personal meal and exercise plans: published, reviewed content filtered by what the person
 * told us. No targets, prescriptions or diagnoses are computed.
 */
@Injectable()
export class PersonalPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly pregnancy: PregnancyContext,
  ) {}

  async foodPreferences(
    owner: Owner,
    active: ActivePregnancy | null,
  ): Promise<FoodPreferences> {
    const profile = await this.prisma.profile.findFirst({
      where: ownerWhere(owner),
    });
    return {
      dietPattern: (profile?.dietPattern as DietPattern | null) ?? null,
      allergies: (profile?.foodAllergies ?? []) as FoodAllergy[],
      avoidFoods: [
        ...new Set(
          [
            ...(profile?.foodIntolerances ?? []),
            ...(profile?.excludedFoods ?? []),
            ...(active?.row.foodRestrictions ?? []),
          ].map((f) => f.toLowerCase()),
        ),
      ],
      cuisines: profile?.cuisinePreferences ?? [],
    };
  }

  async mealPlan(
    owner: Owner,
    opts: { date?: string; days: number; locale: string },
  ): Promise<PersonalMealPlan> {
    const active = await this.pregnancy.active(owner);
    const prefs = await this.foodPreferences(owner, active);
    const filters = {
      dietPattern: prefs.dietPattern,
      excludedAllergens: prefs.allergies,
      excludedFoods: prefs.avoidFoods,
    };
    const empty = (
      availability: PersonalMealPlan['availability'],
    ): PersonalMealPlan => ({
      availability,
      planSlug: null,
      hydrationNote: null,
      days: [],
      filters,
    });
    if (!active) return empty('no_pregnancy');
    if (active.row.clinicianNutritionPlan) return empty('clinician_guidance');

    const { rows: plans } = await this.catalog.published(
      'meal_plan',
      opts.locale,
    );
    if (!plans.length) return empty('none_published');
    const slugs = plans.flatMap((p) =>
      (p.sections as MealPlanSections).days.flatMap((d) =>
        d.meals.map((m) => m.recipeSlug),
      ),
    );
    const recipes = await this.catalog.recipesBySlug(slugs, opts.locale);
    const sectionsBySlug = new Map<string, RecipeSections>(
      [...recipes].map(([slug, r]) => [slug, r.sections]),
    );
    const chosen = choosePlan(
      plans.map((p) => ({
        slug: p.slug,
        sections: p.sections as MealPlanSections,
      })),
      sectionsBySlug,
      prefs,
      active.trimester,
    );
    if (!chosen) return empty('none_matching');

    const start = opts.date ?? active.today;
    const end = addDays(start, opts.days - 1);
    const logs = await this.prisma.mealLog.findMany({
      where: {
        ...ownerWhere(owner),
        date: { gte: fromIsoDate(start), lte: fromIsoDate(end) },
      },
    });
    const eaten = new Set(
      logs.map((l) => `${toIsoDate(l.date)}|${l.slot}|${l.recipeSlug}`),
    );
    const days = Array.from({ length: opts.days }, (_, i) => {
      const date = addDays(start, i);
      return {
        date,
        meals: mealsForDate(chosen.sections, date)
          .flatMap((m) => {
            const recipe = recipes.get(m.recipeSlug);
            return recipe
              ? [
                  {
                    slot: m.slot,
                    recipe,
                    eaten: eaten.has(`${date}|${m.slot}|${m.recipeSlug}`),
                  },
                ]
              : [];
          })
          .sort(bySlot),
      };
    });
    return {
      availability: 'available',
      planSlug: chosen.slug,
      hydrationNote: chosen.sections.hydrationNote,
      days,
      filters,
    };
  }

  async exercisePlan(
    owner: Owner,
    opts: { date?: string; locale: string },
  ): Promise<ExercisePlan> {
    const active = await this.pregnancy.active(owner);
    const empty = (
      availability: ExercisePlan['availability'],
    ): ExercisePlan => ({
      availability,
      week: active?.week ?? null,
      activities: [],
      disclaimer: EXERCISE_DISCLAIMER,
    });
    if (!active) return empty('no_pregnancy');
    // Never offer generic activities to someone a clinician asked to limit exercise.
    if (active.row.restrictExercise) return empty('clinician_guidance');

    const { rows, reviews } = await this.catalog.published(
      'activity',
      opts.locale,
    );
    if (!rows.length) return empty('none_published');
    const fitting = rows.filter((r) =>
      activityFits(
        r.sections as ActivitySections,
        active.week,
        active.trimester,
      ),
    );
    if (!fitting.length) return empty('none_matching');

    const date = opts.date ?? active.today;
    const done = await this.prisma.activityLog.findMany({
      where: { ...ownerWhere(owner), date: fromIsoDate(date) },
      select: { activitySlug: true },
    });
    const doneSet = new Set(done.map((d) => d.activitySlug));
    return {
      availability: 'available',
      week: active.week,
      activities: fitting.map((r) => ({
        ...toActivity(r, reviews.get(r.id) ?? null),
        doneToday: doneSet.has(r.slug),
      })),
      disclaimer: EXERCISE_DISCLAIMER,
    };
  }
}
