import type {
  ActivitySections,
  MealPlanSections,
  RecipeSections,
} from '@preconception/contracts';
import { describe, expect, it } from 'vitest';
import {
  activityFits,
  choosePlan,
  type FoodPreferences,
  isoWeekday,
  mealsForDate,
  mentions,
  recipeAllergens,
  recipeExclusion,
} from './catalog.js';

const recipe = (over: Partial<RecipeSections> = {}): RecipeSections => ({
  mealSlots: ['lunch'],
  servings: 2,
  prepMinutes: 20,
  ingredients: [
    { name: 'Red lentils', quantity: '150 g', allergens: [] },
    { name: 'Spinach', quantity: '100 g', allergens: [] },
  ],
  steps: ['Cook'],
  dietPatterns: ['vegetarian', 'vegan', 'eggetarian'],
  nutrients: [],
  foodSafetyNotes: [],
  substitutions: [],
  cuisine: 'south_asian',
  media: [],
  ...over,
});

const prefs = (over: Partial<FoodPreferences> = {}): FoodPreferences => ({
  dietPattern: null,
  allergies: [],
  avoidFoods: [],
  cuisines: [],
  ...over,
});

const plan = (
  slug: string,
  meals: string[],
  over: Partial<MealPlanSections> = {},
) => ({
  slug,
  sections: {
    days: [
      {
        day: 1,
        meals: meals.map((recipeSlug) => ({
          slot: 'lunch' as const,
          recipeSlug,
        })),
      },
    ],
    dietPatterns: ['no_restriction', 'vegetarian'],
    trimesters: [1, 2, 3],
    hydrationNote: 'Drink regularly through the day.',
    cuisine: null,
    ...over,
  } satisfies MealPlanSections,
});

describe('recipeExclusion', () => {
  it('excludes recipes containing a saved allergen', () => {
    const r = recipe({
      ingredients: [{ name: 'Paneer', quantity: null, allergens: ['milk'] }],
    });
    expect(recipeAllergens(r)).toEqual(['milk']);
    expect(recipeExclusion(r, prefs({ allergies: ['milk'] }))).toBe('allergen');
    expect(recipeExclusion(r, prefs({ allergies: ['egg'] }))).toBeNull();
  });

  it('excludes avoided foods by whole word, including plurals', () => {
    const r = recipe({
      ingredients: [
        { name: 'Chopped tomatoes', quantity: null, allergens: [] },
        { name: 'Nutmeg', quantity: null, allergens: [] },
      ],
    });
    expect(recipeExclusion(r, prefs({ avoidFoods: ['tomato'] }))).toBe(
      'avoided_food',
    );
    expect(recipeExclusion(r, prefs({ avoidFoods: ['nut'] }))).toBeNull();
  });

  it('applies vegetarian, vegan, eggetarian and pescatarian patterns', () => {
    const chicken = recipe({ dietPatterns: ['no_restriction'] });
    expect(recipeExclusion(chicken, prefs({ dietPattern: 'vegetarian' }))).toBe(
      'diet',
    );
    expect(
      recipeExclusion(recipe(), prefs({ dietPattern: 'vegan' })),
    ).toBeNull();
    expect(
      recipeExclusion(chicken, prefs({ dietPattern: 'pescatarian' })),
    ).toBe('diet');
  });

  it('does not filter on no_restriction or other', () => {
    const chicken = recipe({ dietPatterns: ['no_restriction'] });
    expect(
      recipeExclusion(chicken, prefs({ dietPattern: 'no_restriction' })),
    ).toBeNull();
    expect(
      recipeExclusion(chicken, prefs({ dietPattern: 'other' })),
    ).toBeNull();
  });
});

describe('choosePlan', () => {
  const recipes = new Map<string, RecipeSections>([
    ['dal', recipe()],
    [
      'paneer',
      recipe({
        ingredients: [{ name: 'Paneer', quantity: null, allergens: ['milk'] }],
      }),
    ],
  ]);

  it('skips a plan if any recipe is unsuitable or unpublished', () => {
    const plans = [
      plan('a', ['dal', 'paneer']),
      plan('b', ['dal', 'missing']),
      plan('c', ['dal']),
    ];
    expect(
      choosePlan(plans, recipes, prefs({ allergies: ['milk'] }), 2)?.slug,
    ).toBe('c');
  });

  it('requires the trimester and diet pattern', () => {
    const plans = [
      plan('a', ['dal'], { trimesters: [1] }),
      plan('b', ['dal'], { dietPatterns: ['no_restriction'] }),
    ];
    expect(choosePlan(plans, recipes, prefs(), 3)?.slug).toBe('b');
    expect(
      choosePlan(plans, recipes, prefs({ dietPattern: 'vegetarian' }), 3),
    ).toBeNull();
  });

  it('ranks preferred cuisines first, then slug order', () => {
    const plans = [
      plan('b', ['dal']),
      plan('a', ['dal']),
      plan('z', ['dal'], { cuisine: 'south_asian' }),
    ];
    expect(choosePlan(plans, recipes, prefs(), 2)?.slug).toBe('a');
    expect(
      choosePlan(plans, recipes, prefs({ cuisines: ['south_asian'] }), 2)?.slug,
    ).toBe('z');
  });
});

describe('mealsForDate', () => {
  it('repeats a one-day plan and follows the weekday for a weekly one', () => {
    const daily = plan('a', ['dal']).sections;
    expect(mealsForDate(daily, '2026-11-08')).toHaveLength(1);
    const weekly: MealPlanSections = {
      ...daily,
      days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
        day,
        meals: [{ slot: 'lunch', recipeSlug: `r${day}` }],
      })),
    };
    expect(isoWeekday('2026-11-02')).toBe(1); // Monday
    expect(isoWeekday('2026-11-08')).toBe(7); // Sunday
    expect(mealsForDate(weekly, '2026-11-08')[0].recipeSlug).toBe('r7');
  });
});

describe('activityFits', () => {
  const activity = (
    over: Partial<ActivitySections> = {},
  ): ActivitySections => ({
    type: 'walking',
    instructions: ['Walk'],
    durationMinutes: null,
    intensity: null,
    trimesters: [1, 2],
    fromWeek: null,
    toWeek: null,
    safetyNotes: [],
    contraindications: [],
    stopSigns: ['Bleeding'],
    media: [],
    ...over,
  });

  it('checks trimester and the optional week window', () => {
    expect(activityFits(activity(), 20, 2)).toBe(true);
    expect(activityFits(activity(), 30, 3)).toBe(false);
    expect(activityFits(activity({ fromWeek: 16 }), 14, 2)).toBe(false);
    expect(activityFits(activity({ toWeek: 20 }), 21, 2)).toBe(false);
  });
});

describe('mentions: singular and plural forms (regression)', () => {
  // Before the fix only "<singular> excludes <plural>" matched; a user excluding "eggs" still
  // got "1 egg", and "berry" did not exclude "mixed berries".
  it.each([
    ['1 egg, boiled', 'eggs'],
    ['Eggs', 'egg'],
    ['Mixed berries', 'berry'],
    ['1 strawberry', 'strawberries'],
    ['Sliced mushroom', 'mushrooms'],
    ['Chopped tomato', 'tomatoes'],
    ['Peaches in juice', 'peach'],
    ['Black olives', 'olive'],
    ['Hummus', 'hummus'],
    ['Peanut butter', 'peanuts'],
    ['Dairy-free yoghurt', 'dairy'],
    ['Smoked salmon', ' Salmon '],
  ])('"%s" mentions "%s"', (ingredient, food) => {
    expect(mentions(ingredient, food)).toBe(true);
  });

  it.each([
    ['Nutmeg', 'nut'],
    ['Nutmeg', 'nuts'],
    ['Peanut butter', 'pea'],
    ['Peanut butter', 'peas'],
    ['Eggplant', 'egg'],
    ['Pineapple', 'apple'],
    ['Oatmeal', 'oats'],
    ['Glass noodles', 'gla'],
    ['Anything', ''],
    ['Anything', '   '],
  ])('"%s" does not mention "%s"', (ingredient, food) => {
    expect(mentions(ingredient, food)).toBe(false);
  });

  it('treats regex characters in a food literally', () => {
    expect(mentions('c++ sauce', 'c++')).toBe(true);
    expect(mentions('cream', '.*')).toBe(false);
  });

  it('excludes a recipe through recipeExclusion with a plural avoid term', () => {
    const r = recipe({
      ingredients: [{ name: '2 eggs', quantity: null, allergens: [] }],
    });
    expect(recipeExclusion(r, prefs({ avoidFoods: ['egg'] }))).toBe(
      'avoided_food',
    );
    const one = recipe({
      ingredients: [{ name: '1 egg', quantity: null, allergens: [] }],
    });
    expect(recipeExclusion(one, prefs({ avoidFoods: ['eggs'] }))).toBe(
      'avoided_food',
    );
  });
});

describe('choosePlan across trimesters (regression)', () => {
  const recipes = new Map<string, RecipeSections>([['dal', recipe()]]);

  it('requires a plan to cover every trimester in the requested days', () => {
    const plans = [
      plan('second-only', ['dal'], { trimesters: [2] }),
      plan('second-and-third', ['dal'], { trimesters: [2, 3] }),
    ];
    expect(choosePlan(plans, recipes, prefs(), [2])?.slug).toBe(
      'second-and-third',
    );
    expect(choosePlan(plans, recipes, prefs(), [2, 3])?.slug).toBe(
      'second-and-third',
    );
    expect(choosePlan([plans[0]], recipes, prefs(), [2, 3])).toBeNull();
    // A single trimester is still accepted.
    expect(choosePlan([plans[0]], recipes, prefs(), 2)?.slug).toBe(
      'second-only',
    );
  });
});
