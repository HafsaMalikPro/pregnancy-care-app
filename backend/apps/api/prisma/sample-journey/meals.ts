/**
 * LOCAL SAMPLE CONTENT — not clinically reviewed. See weeks.ts.
 * No calorie, weight or supplement figures, matching the API's rules for meal content.
 */
import type {
  DietPattern,
  FoodAllergy,
  MealPlanSections,
  MealSlot,
  RecipeSections,
} from '@preconception/contracts';

const ALL: DietPattern[] = [
  'no_restriction',
  'vegetarian',
  'eggetarian',
  'vegan',
  'pescatarian',
];
const VEG: DietPattern[] = [
  'no_restriction',
  'vegetarian',
  'eggetarian',
  'pescatarian',
];
const EGG: DietPattern[] = ['no_restriction', 'eggetarian', 'pescatarian'];
const FISH: DietPattern[] = ['no_restriction', 'pescatarian'];
const MEAT: DietPattern[] = ['no_restriction'];

const i = (
  name: string,
  quantity: string | null,
  ...allergens: FoodAllergy[]
) => ({
  name,
  quantity,
  allergens,
});

export interface SampleRecipe {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  sections: RecipeSections;
}

function recipe(
  slug: string,
  title: string,
  summary: string,
  slots: MealSlot[],
  diets: DietPattern[],
  prepMinutes: number,
  ingredients: RecipeSections['ingredients'],
  steps: string[],
  nutrients: [string, string][],
  extra: Partial<
    Pick<
      RecipeSections,
      'foodSafetyNotes' | 'substitutions' | 'cuisine' | 'servings'
    >
  > = {},
): SampleRecipe {
  return {
    slug,
    title,
    summary,
    tags: [...slots, ...diets.filter((d) => d !== 'no_restriction')],
    sections: {
      mealSlots: slots,
      servings: extra.servings ?? 2,
      prepMinutes,
      ingredients,
      steps,
      dietPatterns: diets,
      nutrients: nutrients.map(([name, note]) => ({ name, note })),
      foodSafetyNotes: extra.foodSafetyNotes ?? [
        'Wash fruit and vegetables well before eating.',
      ],
      substitutions: extra.substitutions ?? [],
      cuisine: extra.cuisine ?? null,
      media: [],
    },
  };
}

export const RECIPES: SampleRecipe[] = [
  // Breakfast
  recipe(
    'overnight-oats-berries',
    'Overnight oats with berries',
    'Oats soaked in milk overnight with berries and chia seeds.',
    ['breakfast'],
    VEG,
    5,
    [
      i('Rolled oats', '80 g', 'wheat_gluten'),
      i('Pasteurised milk', '200 ml', 'milk'),
      i('Mixed berries', '1 handful'),
      i('Chia seeds', '1 tbsp'),
    ],
    [
      'Mix the oats, milk and chia seeds in a jar.',
      'Cover and refrigerate overnight.',
      'Top with washed berries in the morning.',
    ],
    [
      [
        'Fibre',
        'Oats and chia seeds are a source of fibre, which can help with constipation.',
      ],
      ['Calcium', 'Milk provides calcium.'],
    ],
    {
      substitutions: [
        {
          ingredient: 'Pasteurised milk',
          alternatives: ['Calcium-fortified soya or oat drink'],
        },
      ],
    },
  ),
  recipe(
    'spinach-egg-scramble',
    'Spinach and egg scramble on toast',
    'Fully cooked scrambled eggs with wilted spinach on wholegrain toast.',
    ['breakfast'],
    EGG,
    10,
    [
      i('Eggs', '4', 'egg'),
      i('Baby spinach', '2 handfuls'),
      i('Wholegrain bread', '2 slices', 'wheat_gluten'),
      i('Olive oil', '1 tsp'),
    ],
    [
      'Wilt the spinach in a pan with the oil.',
      'Add beaten eggs and stir over a medium heat until completely set, with no runny egg.',
      'Serve on toast.',
    ],
    [
      ['Protein', 'Eggs are a source of protein.'],
      ['Folate', 'Spinach provides folate.'],
    ],
    {
      foodSafetyNotes: [
        'Cook eggs until the white and yolk are solid, unless they are stamped as safe to eat runny (e.g. British Lion).',
      ],
    },
  ),
  recipe(
    'tofu-scramble-wrap',
    'Tofu scramble breakfast wrap',
    'Turmeric tofu scramble with peppers in a wholewheat wrap.',
    ['breakfast', 'lunch'],
    ALL,
    15,
    [
      i('Firm tofu', '200 g', 'soy'),
      i('Red pepper', '1'),
      i('Ground turmeric', '½ tsp'),
      i('Wholewheat wraps', '2', 'wheat_gluten'),
      i('Olive oil', '1 tsp'),
    ],
    [
      'Crumble the tofu into a hot oiled pan.',
      'Add sliced pepper and turmeric and cook for 8 minutes until hot throughout.',
      'Fill the wraps and roll.',
    ],
    [
      ['Protein', 'Tofu is a plant source of protein.'],
      ['Calcium', 'Calcium-set tofu provides calcium.'],
    ],
  ),
  recipe(
    'rice-porridge-banana',
    'Rice porridge with banana and cinnamon',
    'A gentle, allergen-free porridge — easy on a queasy stomach.',
    ['breakfast', 'snack'],
    ALL,
    20,
    [
      i('White rice', '80 g'),
      i('Water', '500 ml'),
      i('Banana', '1'),
      i('Ground cinnamon', 'a pinch'),
    ],
    [
      'Simmer the rice in the water, stirring often, for about 20 minutes until thick and soft.',
      'Stir in sliced banana and cinnamon.',
    ],
    [
      [
        'Carbohydrate',
        'Plain starchy foods are often easier to manage with nausea.',
      ],
      ['Potassium', 'Bananas provide potassium.'],
    ],
    {
      foodSafetyNotes: [
        'Cool leftover rice quickly and eat within 24 hours; reheat until steaming hot.',
      ],
    },
  ),
  recipe(
    'yogurt-fruit-seed-bowl',
    'Yogurt, fruit and seed bowl',
    'Plain pasteurised yogurt with fruit and pumpkin seeds.',
    ['breakfast', 'snack'],
    VEG,
    5,
    [
      i('Plain pasteurised yogurt', '250 g', 'milk'),
      i('Kiwi or orange', '1'),
      i('Pumpkin seeds', '1 tbsp'),
    ],
    ['Spoon the yogurt into bowls.', 'Top with chopped fruit and seeds.'],
    [
      ['Calcium', 'Yogurt provides calcium.'],
      [
        'Vitamin C',
        'Kiwi and orange provide vitamin C, which helps the body absorb iron.',
      ],
    ],
  ),
  // Lunch
  recipe(
    'red-lentil-vegetable-soup',
    'Red lentil and vegetable soup',
    'A thick, warming soup that keeps well in the fridge.',
    ['lunch', 'dinner'],
    ALL,
    35,
    [
      i('Red lentils', '150 g'),
      i('Carrots', '2'),
      i('Onion', '1'),
      i('Chopped tomatoes', '400 g tin'),
      i('Vegetable stock (allergen-free)', '1 litre'),
      i('Olive oil', '1 tbsp'),
    ],
    [
      'Soften chopped onion and carrot in the oil.',
      'Add lentils, tomatoes and stock; simmer 25 minutes.',
      'Blend or leave chunky.',
    ],
    [
      ['Iron', 'Lentils are a source of non-haem iron.'],
      ['Fibre', 'Lentils and vegetables provide fibre.'],
    ],
    { servings: 4 },
  ),
  recipe(
    'chickpea-salad-wrap',
    'Chickpea and tahini salad wrap',
    'Crushed chickpeas with cucumber, tomato and tahini dressing.',
    ['lunch'],
    ALL,
    10,
    [
      i('Chickpeas', '400 g tin'),
      i('Cucumber', '½'),
      i('Tomato', '1'),
      i('Tahini', '1 tbsp', 'sesame'),
      i('Lemon juice', '1 tbsp'),
      i('Wholewheat wraps', '2', 'wheat_gluten'),
    ],
    [
      'Drain and lightly mash the chickpeas.',
      'Mix with chopped vegetables, tahini and lemon.',
      'Fill the wraps.',
    ],
    [
      ['Protein', 'Chickpeas provide plant protein.'],
      ['Fibre', 'Chickpeas are high in fibre.'],
    ],
  ),
  recipe(
    'chicken-quinoa-salad',
    'Chicken, quinoa and spinach salad',
    'Cooked chicken with quinoa, spinach and a lemon dressing.',
    ['lunch'],
    MEAT,
    25,
    [
      i('Chicken breast', '2'),
      i('Quinoa', '100 g'),
      i('Baby spinach', '2 handfuls'),
      i('Cherry tomatoes', '8'),
      i('Olive oil and lemon', '1 tbsp each'),
    ],
    [
      'Cook the quinoa as the pack says.',
      'Grill or pan-cook the chicken until there is no pink meat and the juices run clear.',
      'Toss everything together with the dressing.',
    ],
    [
      ['Protein', 'Chicken and quinoa provide protein.'],
      ['Iron', 'Spinach and chicken provide iron.'],
    ],
    {
      foodSafetyNotes: [
        'Cook chicken until steaming hot all the way through with no pink meat.',
        'Avoid cold pre-cooked chicken from deli counters.',
      ],
    },
  ),
  recipe(
    'salmon-rice-bowl',
    'Baked salmon rice bowl',
    'Oven-baked salmon over rice with edamame and cucumber.',
    ['lunch', 'dinner'],
    FISH,
    30,
    [
      i('Salmon fillets', '2', 'fish'),
      i('Brown rice', '120 g'),
      i('Edamame beans', '100 g', 'soy'),
      i('Cucumber', '½'),
      i('Lime', '1'),
    ],
    [
      'Bake the salmon at 200°C for 15–18 minutes until it flakes easily.',
      'Cook the rice and edamame.',
      'Assemble with sliced cucumber and lime.',
    ],
    [
      [
        'Omega-3',
        'Oily fish such as salmon provide omega-3 fats. Have no more than two portions of oily fish a week.',
      ],
      ['Protein', 'Salmon provides protein.'],
    ],
    {
      foodSafetyNotes: [
        'Cook fish until opaque and flaking. Avoid raw fish such as sushi unless previously frozen.',
      ],
      cuisine: 'east_asian',
    },
  ),
  recipe(
    'bean-cheese-quesadilla',
    'Bean and cheese quesadilla',
    'Black beans and pasteurised cheddar in a crisp tortilla.',
    ['lunch'],
    VEG,
    15,
    [
      i('Black beans', '400 g tin'),
      i('Pasteurised cheddar', '60 g', 'milk'),
      i('Flour tortillas', '2', 'wheat_gluten'),
      i('Sweetcorn', '3 tbsp'),
    ],
    [
      'Mash the beans lightly with the sweetcorn.',
      'Spread on a tortilla, add grated cheese, top with the second tortilla.',
      'Dry-fry 3 minutes each side until the cheese is melted and hot.',
    ],
    [
      ['Calcium', 'Cheddar provides calcium.'],
      ['Fibre', 'Beans are high in fibre.'],
    ],
    { cuisine: 'latin_american' },
  ),
  // Dinner
  recipe(
    'chicken-vegetable-stir-fry',
    'Chicken and vegetable stir-fry',
    'Quick stir-fry with broccoli and peppers over rice.',
    ['dinner'],
    MEAT,
    25,
    [
      i('Chicken breast', '2'),
      i('Broccoli', '1 head'),
      i('Red pepper', '1'),
      i('Soy sauce', '1 tbsp', 'soy', 'wheat_gluten'),
      i('Rice', '150 g'),
    ],
    [
      'Cook the rice.',
      'Stir-fry sliced chicken until cooked through with no pink.',
      'Add vegetables and soy sauce and cook 4 minutes more.',
    ],
    [
      ['Protein', 'Chicken provides protein.'],
      ['Vitamin C', 'Broccoli and peppers provide vitamin C.'],
    ],
    {
      foodSafetyNotes: ['Cook chicken until steaming hot with no pink meat.'],
      cuisine: 'east_asian',
    },
  ),
  recipe(
    'baked-salmon-sweet-potato',
    'Baked salmon with sweet potato and greens',
    'Tray-baked salmon with roasted sweet potato and green beans.',
    ['dinner'],
    FISH,
    40,
    [
      i('Salmon fillets', '2', 'fish'),
      i('Sweet potatoes', '2'),
      i('Green beans', '150 g'),
      i('Olive oil', '1 tbsp'),
    ],
    [
      'Roast cubed sweet potato at 200°C for 20 minutes.',
      'Add salmon and beans to the tray and bake 15–18 minutes more until the fish flakes.',
    ],
    [
      ['Omega-3', 'Salmon provides omega-3 fats.'],
      [
        'Vitamin A (from beta-carotene)',
        'Sweet potato provides beta-carotene, a safe plant form of vitamin A.',
      ],
    ],
    { foodSafetyNotes: ['Cook fish until it is opaque and flakes easily.'] },
  ),
  recipe(
    'dal-rice-spinach',
    'Spinach dal with rice',
    'Mild red lentil dal with spinach, served with rice.',
    ['dinner', 'lunch'],
    ALL,
    35,
    [
      i('Red lentils', '150 g'),
      i('Spinach', '2 handfuls'),
      i('Onion', '1'),
      i('Garlic', '2 cloves'),
      i('Ground cumin and turmeric', '1 tsp each'),
      i('Rice', '150 g'),
      i('Vegetable oil', '1 tbsp'),
    ],
    [
      'Soften onion and garlic with the spices in the oil.',
      'Add lentils and 600 ml water; simmer 20 minutes.',
      'Stir in spinach. Serve with rice.',
    ],
    [
      ['Iron', 'Lentils and spinach are sources of non-haem iron.'],
      ['Folate', 'Lentils and spinach provide folate.'],
    ],
    { cuisine: 'south_asian', servings: 3 },
  ),
  recipe(
    'beef-bean-chilli',
    'Beef and bean chilli',
    'Lean beef and kidney bean chilli with rice.',
    ['dinner'],
    MEAT,
    45,
    [
      i('Lean beef mince', '300 g'),
      i('Kidney beans', '400 g tin'),
      i('Chopped tomatoes', '400 g tin'),
      i('Onion', '1'),
      i('Mild chilli powder', '1 tsp'),
      i('Rice', '150 g'),
    ],
    [
      'Brown the mince with the onion until no pink remains.',
      'Add beans, tomatoes and spice; simmer 30 minutes.',
      'Serve with rice.',
    ],
    [
      ['Iron', 'Red meat is a source of easily absorbed (haem) iron.'],
      ['Protein', 'Beef and beans provide protein.'],
    ],
    {
      foodSafetyNotes: [
        'Cook mince until there is no pink and the juices run clear.',
      ],
      servings: 4,
      cuisine: 'latin_american',
    },
  ),
  recipe(
    'tofu-vegetable-curry',
    'Tofu and vegetable coconut curry',
    'Mild coconut curry with tofu, chickpeas and vegetables.',
    ['dinner'],
    ALL,
    30,
    [
      i('Firm tofu', '200 g', 'soy'),
      i('Coconut milk', '400 ml tin'),
      i('Chickpeas', '400 g tin'),
      i('Mixed vegetables', '300 g'),
      i('Mild curry paste', '1 tbsp'),
      i('Rice', '150 g'),
    ],
    [
      'Fry cubed tofu until golden.',
      'Add curry paste, coconut milk, chickpeas and vegetables; simmer 15 minutes.',
      'Serve with rice.',
    ],
    [
      ['Protein', 'Tofu and chickpeas provide plant protein.'],
      ['Calcium', 'Calcium-set tofu provides calcium.'],
    ],
    { cuisine: 'south_asian', servings: 3 },
  ),
  recipe(
    'lentil-tomato-pasta',
    'Wholewheat pasta with lentil tomato sauce',
    'A hearty tomato and lentil sauce over wholewheat pasta.',
    ['dinner'],
    ALL,
    30,
    [
      i('Wholewheat pasta', '160 g', 'wheat_gluten'),
      i('Cooked green lentils', '250 g'),
      i('Passata', '500 g'),
      i('Garlic', '2 cloves'),
      i('Olive oil', '1 tbsp'),
    ],
    [
      'Cook the pasta.',
      'Warm garlic in oil, add passata and lentils, simmer 15 minutes.',
      'Toss with the pasta.',
    ],
    [
      ['Fibre', 'Wholewheat pasta and lentils provide fibre.'],
      ['Iron', 'Lentils provide non-haem iron.'],
    ],
    { cuisine: 'mediterranean' },
  ),
  // Snacks
  recipe(
    'apple-peanut-butter',
    'Apple slices with peanut butter',
    'A quick, filling snack.',
    ['snack'],
    ALL,
    2,
    [i('Apple', '1'), i('Peanut butter', '1 tbsp', 'peanut')],
    ['Slice the apple and serve with peanut butter.'],
    [
      ['Fibre', 'Apples provide fibre.'],
      ['Protein', 'Peanut butter provides some protein.'],
    ],
    {
      servings: 1,
      substitutions: [
        {
          ingredient: 'Peanut butter',
          alternatives: ['Sunflower seed butter'],
        },
      ],
    },
  ),
  recipe(
    'hummus-veg-sticks',
    'Hummus and vegetable sticks',
    'Crunchy carrot, cucumber and pepper with hummus.',
    ['snack'],
    ALL,
    5,
    [
      i('Hummus', '4 tbsp', 'sesame'),
      i('Carrot', '1'),
      i('Cucumber', '½'),
      i('Pepper', '½'),
    ],
    ['Cut the vegetables into sticks and serve with hummus.'],
    [['Fibre', 'Vegetables and chickpeas provide fibre.']],
    { servings: 1 },
  ),
  recipe(
    'cheese-oatcakes',
    'Oatcakes with hard cheese',
    'Pasteurised hard cheese on oatcakes.',
    ['snack'],
    VEG,
    2,
    [
      i('Oatcakes', '3', 'wheat_gluten'),
      i('Pasteurised hard cheese', '30 g', 'milk'),
    ],
    ['Top the oatcakes with sliced cheese.'],
    [['Calcium', 'Hard cheese provides calcium.']],
    {
      servings: 1,
      foodSafetyNotes: [
        'Hard cheeses like cheddar are safe. Avoid soft mould-ripened and soft blue cheeses unless cooked.',
      ],
    },
  ),
  recipe(
    'roasted-chickpeas-fruit',
    'Roasted chickpeas and fruit',
    'Crispy oven-roasted chickpeas with a piece of fruit.',
    ['snack'],
    ALL,
    30,
    [
      i('Chickpeas', '400 g tin'),
      i('Olive oil', '1 tsp'),
      i('Smoked paprika', '½ tsp'),
      i('Pear or orange', '1'),
    ],
    [
      'Dry the chickpeas, toss in oil and paprika.',
      'Roast at 200°C for 25 minutes, shaking halfway.',
      'Serve with fruit.',
    ],
    [
      ['Fibre', 'Chickpeas provide fibre.'],
      ['Protein', 'Chickpeas provide plant protein.'],
    ],
  ),
];

type Day = [string, string, string, string]; // breakfast, lunch, dinner, snack
const week = (days: Day[]): MealPlanSections['days'] =>
  days.map(([b, l, d, s], idx) => ({
    day: idx + 1,
    meals: [
      { slot: 'breakfast', recipeSlug: b },
      { slot: 'lunch', recipeSlug: l },
      { slot: 'dinner', recipeSlug: d },
      { slot: 'snack', recipeSlug: s },
    ],
  }));

const HYDRATION =
  'Drink fluids regularly through the day — water, milk and diluted fruit juice all count. You may need more in hot weather or when you are active. Pale yellow urine is a good sign you are drinking enough.';

export interface SampleMealPlan {
  slug: string;
  title: string;
  summary: string;
  sections: MealPlanSections;
}

export const MEAL_PLANS: SampleMealPlan[] = [
  {
    slug: 'balanced-week',
    title: 'A balanced week',
    summary:
      'Seven days of varied meals with meat, fish, eggs, dairy and plenty of plants.',
    sections: {
      days: week([
        [
          'overnight-oats-berries',
          'chicken-quinoa-salad',
          'dal-rice-spinach',
          'apple-peanut-butter',
        ],
        [
          'spinach-egg-scramble',
          'red-lentil-vegetable-soup',
          'baked-salmon-sweet-potato',
          'hummus-veg-sticks',
        ],
        [
          'yogurt-fruit-seed-bowl',
          'bean-cheese-quesadilla',
          'chicken-vegetable-stir-fry',
          'roasted-chickpeas-fruit',
        ],
        [
          'overnight-oats-berries',
          'salmon-rice-bowl',
          'lentil-tomato-pasta',
          'cheese-oatcakes',
        ],
        [
          'tofu-scramble-wrap',
          'chickpea-salad-wrap',
          'beef-bean-chilli',
          'apple-peanut-butter',
        ],
        [
          'spinach-egg-scramble',
          'red-lentil-vegetable-soup',
          'tofu-vegetable-curry',
          'yogurt-fruit-seed-bowl',
        ],
        [
          'rice-porridge-banana',
          'chicken-quinoa-salad',
          'baked-salmon-sweet-potato',
          'hummus-veg-sticks',
        ],
      ]),
      dietPatterns: ['no_restriction'],
      trimesters: [1, 2, 3],
      hydrationNote: HYDRATION,
      cuisine: null,
    },
  },
  {
    slug: 'wholesome-allergy-friendly-day',
    title: 'A gentle, allergy-friendly day',
    summary:
      'One simple day free of the common allergens — useful with allergies or nausea.',
    sections: {
      days: [
        {
          day: 1,
          meals: [
            { slot: 'breakfast', recipeSlug: 'rice-porridge-banana' },
            { slot: 'lunch', recipeSlug: 'red-lentil-vegetable-soup' },
            { slot: 'dinner', recipeSlug: 'dal-rice-spinach' },
            { slot: 'snack', recipeSlug: 'roasted-chickpeas-fruit' },
          ],
        },
      ],
      dietPatterns: [
        'no_restriction',
        'vegetarian',
        'eggetarian',
        'vegan',
        'pescatarian',
        'other',
      ],
      trimesters: [1, 2, 3],
      hydrationNote: HYDRATION,
      cuisine: null,
    },
  },
  {
    slug: 'pescatarian-week',
    title: 'A pescatarian week',
    summary: 'Fish, eggs, dairy and plant proteins — no meat.',
    sections: {
      days: week([
        [
          'overnight-oats-berries',
          'salmon-rice-bowl',
          'dal-rice-spinach',
          'hummus-veg-sticks',
        ],
        [
          'spinach-egg-scramble',
          'red-lentil-vegetable-soup',
          'lentil-tomato-pasta',
          'cheese-oatcakes',
        ],
        [
          'yogurt-fruit-seed-bowl',
          'chickpea-salad-wrap',
          'baked-salmon-sweet-potato',
          'apple-peanut-butter',
        ],
        [
          'tofu-scramble-wrap',
          'bean-cheese-quesadilla',
          'tofu-vegetable-curry',
          'roasted-chickpeas-fruit',
        ],
        [
          'overnight-oats-berries',
          'red-lentil-vegetable-soup',
          'dal-rice-spinach',
          'yogurt-fruit-seed-bowl',
        ],
        [
          'spinach-egg-scramble',
          'chickpea-salad-wrap',
          'lentil-tomato-pasta',
          'hummus-veg-sticks',
        ],
        [
          'rice-porridge-banana',
          'bean-cheese-quesadilla',
          'tofu-vegetable-curry',
          'cheese-oatcakes',
        ],
      ]),
      dietPatterns: ['pescatarian'],
      trimesters: [1, 2, 3],
      hydrationNote: HYDRATION,
      cuisine: null,
    },
  },
  {
    slug: 'plant-based-week',
    title: 'A plant-based week',
    summary:
      'Seven fully vegan days built around lentils, beans, tofu and wholegrains.',
    sections: {
      days: week([
        [
          'tofu-scramble-wrap',
          'red-lentil-vegetable-soup',
          'dal-rice-spinach',
          'apple-peanut-butter',
        ],
        [
          'rice-porridge-banana',
          'chickpea-salad-wrap',
          'tofu-vegetable-curry',
          'hummus-veg-sticks',
        ],
        [
          'tofu-scramble-wrap',
          'red-lentil-vegetable-soup',
          'lentil-tomato-pasta',
          'roasted-chickpeas-fruit',
        ],
        [
          'rice-porridge-banana',
          'chickpea-salad-wrap',
          'dal-rice-spinach',
          'apple-peanut-butter',
        ],
        [
          'tofu-scramble-wrap',
          'red-lentil-vegetable-soup',
          'tofu-vegetable-curry',
          'hummus-veg-sticks',
        ],
        [
          'rice-porridge-banana',
          'chickpea-salad-wrap',
          'lentil-tomato-pasta',
          'roasted-chickpeas-fruit',
        ],
        [
          'tofu-scramble-wrap',
          'dal-rice-spinach',
          'tofu-vegetable-curry',
          'apple-peanut-butter',
        ],
      ]),
      dietPatterns: ['vegan', 'vegetarian', 'eggetarian'],
      trimesters: [1, 2, 3],
      hydrationNote:
        HYDRATION +
        ' On a vegan diet, ask your midwife about vitamin B12, iodine and vitamin D supplements.',
      cuisine: null,
    },
  },
  {
    slug: 'vegetarian-week',
    title: 'A vegetarian week',
    summary: 'Dairy, beans, lentils and tofu — no meat, fish or eggs.',
    sections: {
      days: week([
        [
          'overnight-oats-berries',
          'bean-cheese-quesadilla',
          'dal-rice-spinach',
          'cheese-oatcakes',
        ],
        [
          'yogurt-fruit-seed-bowl',
          'red-lentil-vegetable-soup',
          'tofu-vegetable-curry',
          'hummus-veg-sticks',
        ],
        [
          'tofu-scramble-wrap',
          'chickpea-salad-wrap',
          'lentil-tomato-pasta',
          'apple-peanut-butter',
        ],
        [
          'overnight-oats-berries',
          'bean-cheese-quesadilla',
          'dal-rice-spinach',
          'roasted-chickpeas-fruit',
        ],
        [
          'yogurt-fruit-seed-bowl',
          'red-lentil-vegetable-soup',
          'tofu-vegetable-curry',
          'cheese-oatcakes',
        ],
        [
          'rice-porridge-banana',
          'chickpea-salad-wrap',
          'lentil-tomato-pasta',
          'hummus-veg-sticks',
        ],
        [
          'overnight-oats-berries',
          'bean-cheese-quesadilla',
          'dal-rice-spinach',
          'yogurt-fruit-seed-bowl',
        ],
      ]),
      dietPatterns: ['vegetarian', 'eggetarian'],
      trimesters: [1, 2, 3],
      hydrationNote: HYDRATION,
      cuisine: null,
    },
  },
];
