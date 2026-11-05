import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type {
  Activity,
  ActivitySections,
  MealPlan,
  MealPlanSections,
  Recipe,
  RecipeSections,
} from '@preconception/contracts';
import { Public } from '../auth/auth.decorators.js';
import { pageInfo } from '../common/pagination.js';
import { ApiErrors } from '../common/swagger.js';
import type { Prisma } from '../generated/prisma/client.js';
import { recipeAllergens } from './catalog.js';
import {
  ActivityDto,
  ActivityPageDto,
  ActivityQueryDto,
  MealPlanDto,
  MealPlanPageDto,
  MealPlanQueryDto,
  RecipeDto,
  RecipePageDto,
  RecipeQueryDto,
  SlugLocaleQueryDto,
} from './catalog.dto.js';
import { CatalogService, toActivity, toRecipe } from './catalog.service.js';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function common(q: {
  trimester?: number;
  tag?: string;
}): Prisma.ArticleWhereInput {
  return {
    ...(q.tag && { tags: { has: q.tag } }),
  };
}

/** Pages an in-memory list (the published catalog is small; filters apply to structured fields). */
function paged<T>(items: T[], q: { limit: number; offset: number }) {
  return {
    items: items.slice(q.offset, q.offset + q.limit),
    page: pageInfo(q, items.length),
  };
}

@ApiTags('nutrition')
@Public()
@Controller('recipes')
export class RecipesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Published recipes',
    description:
      'Public. Filter by meal slot, diet pattern, allergens to leave out, trimester and tag. Only clinically reviewed, published recipes are listed.',
  })
  @ApiOkResponse({ type: RecipePageDto })
  @ApiErrors(400)
  async list(@Query() q: RecipeQueryDto) {
    const { rows, reviews } = await this.catalog.published(
      'recipe',
      q.locale,
      common(q),
    );
    const items: Recipe[] = rows
      .filter((r) => {
        const s = r.sections as RecipeSections;
        if (q.trimester && r.trimester !== null && r.trimester !== q.trimester)
          return false;
        if (q.slot && !s.mealSlots.includes(q.slot)) return false;
        if (q.diet && !s.dietPatterns.includes(q.diet)) return false;
        if (q.excludeAllergens?.length) {
          const contains = recipeAllergens(s);
          if (q.excludeAllergens.some((a) => contains.includes(a)))
            return false;
        }
        return true;
      })
      .map((r) => toRecipe(r, reviews.get(r.id) ?? null));
    return paged(items, q);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One published recipe' })
  @ApiOkResponse({ type: RecipeDto })
  @ApiErrors(404)
  async get(
    @Param('slug') slug: string,
    @Query() q: SlugLocaleQueryDto,
  ): Promise<Recipe> {
    const found = SLUG.test(slug)
      ? await this.catalog.one('recipe', slug, q.locale)
      : null;
    if (!found) throw new NotFoundException('Recipe not found.');
    return toRecipe(found.row, found.review);
  }
}

@ApiTags('exercise')
@Public()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Published exercise and movement activities',
    description:
      'Public. Filter by type, trimester, week and tag. Each activity lists its safety notes, contraindications and the signs to stop. General information, not an exercise prescription.',
  })
  @ApiOkResponse({ type: ActivityPageDto })
  @ApiErrors(400)
  async list(@Query() q: ActivityQueryDto) {
    const { rows, reviews } = await this.catalog.published(
      'activity',
      q.locale,
      common(q),
    );
    const items: Activity[] = rows
      .filter((r) => {
        const s = r.sections as ActivitySections;
        if (q.type && s.type !== q.type) return false;
        if (q.trimester && !s.trimesters.includes(q.trimester)) return false;
        if (q.week !== undefined) {
          if (s.fromWeek !== null && q.week < s.fromWeek) return false;
          if (s.toWeek !== null && q.week > s.toWeek) return false;
        }
        return true;
      })
      .map((r) => toActivity(r, reviews.get(r.id) ?? null));
    return paged(items, q);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One published activity' })
  @ApiOkResponse({ type: ActivityDto })
  @ApiErrors(404)
  async get(
    @Param('slug') slug: string,
    @Query() q: SlugLocaleQueryDto,
  ): Promise<Activity> {
    const found = SLUG.test(slug)
      ? await this.catalog.one('activity', slug, q.locale)
      : null;
    if (!found) throw new NotFoundException('Activity not found.');
    return toActivity(found.row, found.review);
  }
}

@ApiTags('nutrition')
@Public()
@Controller('meal-plans')
export class MealPlansController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({
    summary: 'Published meal plans',
    description:
      'Public. Daily (1 day) or weekly (7 days) plans, each with its published recipes. For a plan filtered by your own preferences use GET /v1/me/meal-plan.',
  })
  @ApiOkResponse({ type: MealPlanPageDto })
  @ApiErrors(400)
  async list(@Query() q: MealPlanQueryDto) {
    const { rows, reviews } = await this.catalog.published(
      'meal_plan',
      q.locale,
      common(q),
    );
    const matching = rows.filter((r) => {
      const s = r.sections as MealPlanSections;
      if (q.trimester && !s.trimesters.includes(q.trimester)) return false;
      if (q.diet && !s.dietPatterns.includes(q.diet)) return false;
      return true;
    });
    const page = matching.slice(q.offset, q.offset + q.limit);
    const items: MealPlan[] = await Promise.all(
      page.map((r) => this.catalog.mealPlan(r, reviews.get(r.id) ?? null)),
    );
    return { items, page: pageInfo(q, matching.length) };
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One published meal plan with its recipes' })
  @ApiOkResponse({ type: MealPlanDto })
  @ApiErrors(404)
  async get(
    @Param('slug') slug: string,
    @Query() q: SlugLocaleQueryDto,
  ): Promise<MealPlan> {
    const found = SLUG.test(slug)
      ? await this.catalog.one('meal_plan', slug, q.locale)
      : null;
    if (!found) throw new NotFoundException('Meal plan not found.');
    return this.catalog.mealPlan(found.row, found.review);
  }
}
