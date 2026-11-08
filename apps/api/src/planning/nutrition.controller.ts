import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type {
  MealLog,
  MealSlot,
  PersonalMealPlan,
  ShoppingItem,
} from '@preconception/contracts';
import { daysBetween } from '@preconception/utils';
import { CurrentOwner } from '../auth/auth.decorators.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { fromIsoDate, toIsoDate } from '../common/dates.js';
import { OwnerClock } from '../common/owner-clock.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ConsentService } from '../consent/consent.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  MealLog as MealLogRow,
  ShoppingItem as ShoppingRow,
} from '../generated/prisma/client.js';
import { findOrCreate } from './idempotent.js';
import { PersonalPlansService } from './personal-plans.service.js';
import {
  CreateShoppingItemDto,
  DateRangeQueryDto,
  FromMealPlanDto,
  MealLogDto,
  MealLogParams,
  PersonalMealPlanDto,
  PlanQueryDto,
  ShoppingFromPlanResultDto,
  ShoppingItemDto,
  UpdateShoppingItemDto,
} from './planning.dto.js';

const MAX_RANGE = 92;

export function checkRange(from: string, to: string) {
  const span = daysBetween(from, to);
  if (span < 0) throw new BadRequestException(['to must be on or after from']);
  if (span > MAX_RANGE)
    throw new BadRequestException([
      `to must be at most ${MAX_RANGE} days after from`,
    ]);
}

@ApiTags('nutrition')
@ApiOwnerAuth()
@Controller()
export class NutritionController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PersonalPlansService,
    private readonly consent: ConsentService,
    private readonly clock: OwnerClock,
  ) {}

  @Get('me/meal-plan')
  @ApiOperation({
    summary: 'My meal plan for a day or a week',
    description:
      'A published, clinically reviewed plan filtered by your diet pattern, allergies, intolerances, excluded foods and anything your clinician advised avoiding. If any recipe in a plan is unsuitable, the whole plan is skipped. When you said a clinician or dietitian manages what you eat, no generic plan is offered (availability = clinician_guidance). No calorie or supplement targets are computed.',
  })
  @ApiOkResponse({ type: PersonalMealPlanDto })
  @ApiErrors(400)
  mealPlan(
    @CurrentOwner() owner: Owner,
    @Query() q: PlanQueryDto,
  ): Promise<PersonalMealPlan> {
    return this.plans.mealPlan(owner, q);
  }

  @Get('meal-logs')
  @ApiOperation({ summary: 'Meals I logged in a date range' })
  @ApiOkResponse({ type: [MealLogDto] })
  @ApiErrors(400)
  async logs(
    @CurrentOwner() owner: Owner,
    @Query() q: DateRangeQueryDto,
  ): Promise<MealLog[]> {
    checkRange(q.from, q.to);
    const rows = await this.prisma.mealLog.findMany({
      where: {
        ...ownerWhere(owner),
        date: { gte: fromIsoDate(q.from), lte: fromIsoDate(q.to) },
      },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
    });
    return rows.map(toMealLog);
  }

  @Put('meal-logs/:date/:slot/:recipeSlug')
  @ApiOperation({
    summary: 'Mark a meal as eaten',
    description:
      'Idempotent: repeating it returns the same entry. The recipe must be published. Requires health_data_processing consent. Future dates are rejected.',
  })
  @ApiOkResponse({ type: MealLogDto })
  @ApiErrors(400, 403, 404)
  async logMeal(
    @CurrentOwner() owner: Owner,
    @Param() p: MealLogParams,
  ): Promise<MealLog> {
    await this.consent.assertHealthDataConsent(owner);
    if (p.date > (await this.clock.today(owner))) {
      throw new BadRequestException(['date cannot be in the future']);
    }
    await this.requirePublished('recipe', p.recipeSlug);
    const where = {
      ...ownerWhere(owner),
      date: fromIsoDate(p.date),
      slot: p.slot,
      recipeSlug: p.recipeSlug,
    };
    const row = await findOrCreate(
      () => this.prisma.mealLog.findFirst({ where }),
      () => this.prisma.mealLog.create({ data: where }),
    );
    return toMealLog(row);
  }

  @Delete('meal-logs/:date/:slot/:recipeSlug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unmark a meal' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiErrors(400, 404)
  async unlogMeal(
    @CurrentOwner() owner: Owner,
    @Param() p: MealLogParams,
  ): Promise<void> {
    const { count } = await this.prisma.mealLog.deleteMany({
      where: {
        ...ownerWhere(owner),
        date: fromIsoDate(p.date),
        slot: p.slot,
        recipeSlug: p.recipeSlug,
      },
    });
    if (count === 0) throw new NotFoundException('No such meal log.');
  }

  @Get('shopping-list')
  @ApiOperation({
    summary: 'My shopping list',
    description: 'Unchecked items first, then by name.',
  })
  @ApiOkResponse({ type: [ShoppingItemDto] })
  async shopping(@CurrentOwner() owner: Owner): Promise<ShoppingItem[]> {
    const rows = await this.prisma.shoppingItem.findMany({
      where: ownerWhere(owner),
      orderBy: [{ checked: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toShopping);
  }

  @Post('shopping-list')
  @ApiOperation({
    summary: 'Add an item',
    description:
      'Names are trimmed and lower-cased; adding an existing name returns that item.',
  })
  @ApiCreatedResponse({ type: ShoppingItemDto })
  @ApiErrors(400)
  async addItem(
    @CurrentOwner() owner: Owner,
    @Body() dto: CreateShoppingItemDto,
  ): Promise<ShoppingItem> {
    const name = dto.name.trim().toLowerCase();
    if (!name) throw new BadRequestException(['name must not be empty']);
    await this.assertListSize(owner, 1);
    const row = await findOrCreate(
      () =>
        this.prisma.shoppingItem.findFirst({
          where: { ...ownerWhere(owner), name },
        }),
      () =>
        this.prisma.shoppingItem.create({
          data: { ...ownerWhere(owner), name, quantity: dto.quantity ?? null },
        }),
    );
    return toShopping(row);
  }

  @Post('shopping-list/from-meal-plan')
  @ApiOperation({
    summary: 'Add the ingredients of my meal plan',
    description:
      'Adds every ingredient of your personal meal plan for the given days. Names already on the list are left unchanged.',
  })
  @ApiCreatedResponse({ type: ShoppingFromPlanResultDto })
  @ApiErrors(400)
  async fromPlan(@CurrentOwner() owner: Owner, @Body() dto: FromMealPlanDto) {
    const plan = await this.plans.mealPlan(owner, {
      date: dto.date,
      days: dto.days,
      locale: 'en',
    });
    const wanted = new Map<
      string,
      { quantity: string | null; recipeSlug: string }
    >();
    for (const day of plan.days) {
      for (const meal of day.meals) {
        for (const ing of meal.recipe.sections.ingredients) {
          const name = ing.name.trim().toLowerCase();
          if (!wanted.has(name))
            wanted.set(name, {
              quantity: ing.quantity,
              recipeSlug: meal.recipe.slug,
            });
        }
      }
    }
    const existing = new Set(
      (
        await this.prisma.shoppingItem.findMany({
          where: ownerWhere(owner),
          select: { name: true },
        })
      ).map((r) => r.name),
    );
    const toAdd = [...wanted].filter(([name]) => !existing.has(name));
    await this.assertListSize(owner, toAdd.length);
    const { count } = await this.prisma.shoppingItem.createMany({
      data: toAdd.map(([name, v]) => ({
        ...ownerWhere(owner),
        name,
        quantity: v.quantity,
        recipeSlug: v.recipeSlug,
      })),
      skipDuplicates: true,
    });
    return { added: count, items: await this.shopping(owner) };
  }

  @Patch('shopping-list/:id')
  @ApiOperation({ summary: 'Check or uncheck an item, or change its quantity' })
  @ApiOkResponse({ type: ShoppingItemDto })
  @ApiErrors(400, 404)
  async updateItem(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShoppingItemDto,
  ): Promise<ShoppingItem> {
    const { count } = await this.prisma.shoppingItem.updateMany({
      where: { id, ...ownerWhere(owner) },
      data: {
        ...(dto.checked !== undefined && { checked: dto.checked }),
        ...(dto.quantity !== undefined && { quantity: dto.quantity }),
      },
    });
    if (count === 0) throw new NotFoundException('Item not found.');
    // owner-scope: the updateMany above matched this id for this owner (else 404)
    return toShopping(
      await this.prisma.shoppingItem.findUniqueOrThrow({ where: { id } }),
    );
  }

  @Delete('shopping-list/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item' })
  @ApiNoContentResponse({ description: 'Removed' })
  @ApiErrors(400, 404)
  async removeItem(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const { count } = await this.prisma.shoppingItem.deleteMany({
      where: { id, ...ownerWhere(owner) },
    });
    if (count === 0) throw new NotFoundException('Item not found.');
  }

  @Delete('shopping-list')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove all checked items' })
  @ApiNoContentResponse({ description: 'Removed' })
  async clearChecked(@CurrentOwner() owner: Owner): Promise<void> {
    await this.prisma.shoppingItem.deleteMany({
      where: { ...ownerWhere(owner), checked: true },
    });
  }

  private async requirePublished(kind: 'recipe' | 'activity', slug: string) {
    const found = await this.prisma.article.findFirst({
      where: { kind, slug, status: 'published' },
      select: { id: true },
    });
    if (!found)
      throw new NotFoundException(`No published ${kind} with that slug.`);
  }

  private async assertListSize(owner: Owner, adding: number) {
    const count = await this.prisma.shoppingItem.count({
      where: ownerWhere(owner),
    });
    if (count + adding > 300)
      throw new BadRequestException([
        'the shopping list holds at most 300 items',
      ]);
  }
}

function toMealLog(row: MealLogRow): MealLog {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    slot: row.slot as MealSlot,
    recipeSlug: row.recipeSlug,
    createdAt: row.createdAt.toISOString(),
  };
}

function toShopping(row: ShoppingRow): ShoppingItem {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    checked: row.checked,
    recipeSlug: row.recipeSlug,
    updatedAt: row.updatedAt.toISOString(),
  };
}
