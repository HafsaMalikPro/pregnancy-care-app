import type {
  ActivitySections,
  DietPattern,
  FoodAllergy,
  MealPlanSections,
  MealSlot,
  RecipeSections,
} from '@preconception/contracts';

/**
 * Pure matching rules for personal meal and exercise plans. They only filter clinician-reviewed
 * content by what the person told us; they never compute nutrition targets or diagnose anything.
 */

export interface FoodPreferences {
  /** Null, `no_restriction` or `other` means no diet-pattern filter. */
  dietPattern: DietPattern | null;
  allergies: FoodAllergy[];
  /** Intolerances, excluded foods and clinician-advised restrictions, lower-case. */
  avoidFoods: string[];
  cuisines: string[];
}

/** Every allergen any ingredient in the recipe contains. */
export function recipeAllergens(sections: RecipeSections): FoodAllergy[] {
  return [...new Set(sections.ingredients.flatMap((i) => i.allergens))].sort();
}

const FILTERED_DIETS: DietPattern[] = [
  'vegetarian',
  'eggetarian',
  'vegan',
  'pescatarian',
];

/**
 * Why a recipe is unsuitable, or null when it fits. Allergens and avoided foods always exclude;
 * a diet pattern excludes recipes not marked as suiting it.
 */
export function recipeExclusion(
  sections: RecipeSections,
  prefs: FoodPreferences,
): 'allergen' | 'avoided_food' | 'diet' | null {
  const allergens = recipeAllergens(sections);
  if (allergens.some((a) => prefs.allergies.includes(a))) return 'allergen';
  if (prefs.avoidFoods.length) {
    const names = sections.ingredients.map((i) => i.name.toLowerCase());
    if (prefs.avoidFoods.some((food) => names.some((n) => mentions(n, food)))) {
      return 'avoided_food';
    }
  }
  if (
    prefs.dietPattern &&
    FILTERED_DIETS.includes(prefs.dietPattern) &&
    !sections.dietPatterns.includes(prefs.dietPattern)
  ) {
    return 'diet';
  }
  return null;
}

/**
 * Whole-word match, so "nut" doesn't exclude "nutmeg" but "peanut" excludes "peanut butter".
 * Singular and plural forms match each other in both directions ("eggs" excludes "1 egg",
 * "berry" excludes "mixed berries"): people type either form, and a miss here would serve a
 * food they asked to avoid. Over-matching only hides a recipe, so the stems err wide.
 */
export function mentions(ingredient: string, food: string): boolean {
  const f = food.trim().toLowerCase();
  if (!f) return false;
  const alternatives = singularForms(f).map((stem) => {
    const escaped = escapeRegExp(stem);
    return stem.endsWith('y') && stem.length > 2
      ? `${escapeRegExp(stem.slice(0, -1))}(?:y|ies)`
      : `${escaped}(?:e?s)?`;
  });
  return new RegExp(`(^|[^a-z])(?:${alternatives.join('|')})([^a-z]|$)`).test(
    ingredient.toLowerCase(),
  );
}

/** The term plus the singular forms it could be a plural of. */
function singularForms(term: string): string[] {
  const forms = new Set([term]);
  if (term.endsWith('ies') && term.length > 4)
    forms.add(`${term.slice(0, -3)}y`);
  if (term.endsWith('es') && term.length > 3) forms.add(term.slice(0, -2));
  if (term.endsWith('s') && !term.endsWith('ss') && term.length > 2)
    forms.add(term.slice(0, -1));
  return [...forms];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface PlanCandidate {
  slug: string;
  sections: MealPlanSections;
}

/**
 * The best published plan for this person: it must cover their trimester, suit their diet
 * pattern, and every recipe in it must be published and suitable. A plan with any unsuitable or
 * missing recipe is skipped entirely rather than served with gaps. Preferred cuisines rank
 * higher; ties keep slug order so the choice is stable.
 */
export function choosePlan(
  plans: PlanCandidate[],
  recipes: Map<string, RecipeSections>,
  prefs: FoodPreferences,
  /** Every trimester the requested days fall in; the plan must be reviewed for all of them. */
  trimester: 1 | 2 | 3 | (1 | 2 | 3)[],
): PlanCandidate | null {
  const diet = prefs.dietPattern;
  const trimesters = Array.isArray(trimester) ? trimester : [trimester];
  const suitable = plans.filter((p) => {
    if (!trimesters.every((t) => p.sections.trimesters.includes(t)))
      return false;
    if (
      diet &&
      FILTERED_DIETS.includes(diet) &&
      !p.sections.dietPatterns.includes(diet)
    ) {
      return false;
    }
    return p.sections.days.every((d) =>
      d.meals.every((m) => {
        const r = recipes.get(m.recipeSlug);
        return r !== undefined && recipeExclusion(r, prefs) === null;
      }),
    );
  });
  const score = (p: PlanCandidate) =>
    p.sections.cuisine && prefs.cuisines.includes(p.sections.cuisine) ? 1 : 0;
  return (
    [...suitable].sort(
      (a, b) => score(b) - score(a) || a.slug.localeCompare(b.slug),
    )[0] ?? null
  );
}

/** ISO weekday 1 (Monday) - 7 for a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** The plan's meals for a date: a one-day plan repeats; a weekly plan follows the weekday. */
export function mealsForDate(
  plan: MealPlanSections,
  date: string,
): { slot: MealSlot; recipeSlug: string }[] {
  if (plan.days.length === 1) return plan.days[0].meals;
  const day = isoWeekday(date);
  return plan.days.find((d) => d.day === day)?.meals ?? [];
}

const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const bySlot = (a: { slot: MealSlot }, b: { slot: MealSlot }) =>
  SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);

/** Whether an activity is reviewed for this point in pregnancy. */
export function activityFits(
  sections: ActivitySections,
  week: number,
  trimester: 1 | 2 | 3,
): boolean {
  if (!sections.trimesters.includes(trimester)) return false;
  if (sections.fromWeek !== null && week < sections.fromWeek) return false;
  if (sections.toWeek !== null && week > sections.toWeek) return false;
  return true;
}
