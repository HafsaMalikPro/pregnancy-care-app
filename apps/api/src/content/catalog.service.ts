import { Injectable } from '@nestjs/common';
import type {
  Activity,
  ActivitySections,
  ContentCategory,
  MealPlan,
  MealPlanSections,
  Recipe,
  RecipeSections,
  Trimester,
} from '@preconception/contracts';
import { toIsoDate } from '../common/dates.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  Article as Row,
  ContentReview,
  Prisma,
} from '../generated/prisma/client.js';
import { recipeAllergens } from './catalog.js';
import { parseReferences, toReviewInfo } from './content.mapper.js';

type StructuredKind = 'recipe' | 'activity' | 'meal_plan';

/**
 * Reads published recipes, activities and meal plans. Only status = published is ever
 * returned; review info is attached only from an approving review.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async published(
    kind: StructuredKind,
    locale: string,
    where: Prisma.ArticleWhereInput = {},
    page?: { take: number; skip: number },
  ): Promise<{
    rows: Row[];
    reviews: Map<string, ContentReview>;
    total: number;
  }> {
    const filter: Prisma.ArticleWhereInput = {
      kind,
      locale,
      status: 'published',
      ...where,
    };
    const [rows, total] = await Promise.all([
      this.prisma.article.findMany({
        where: filter,
        orderBy: [{ title: 'asc' }, { slug: 'asc' }],
        ...page,
      }),
      this.prisma.article.count({ where: filter }),
    ]);
    return { rows, reviews: await this.reviewsFor(rows), total };
  }

  async one(kind: StructuredKind, slug: string, locale: string) {
    const row = await this.prisma.article.findFirst({
      where: { kind, slug, locale, status: 'published' },
    });
    if (!row) return null;
    return { row, review: (await this.reviewsFor([row])).get(row.id) ?? null };
  }

  /** Published recipes by slug (missing or unpublished slugs are absent). */
  async recipesBySlug(
    slugs: string[],
    locale: string,
  ): Promise<Map<string, Recipe>> {
    if (!slugs.length) return new Map();
    const { rows, reviews } = await this.published('recipe', locale, {
      slug: { in: [...new Set(slugs)] },
    });
    return new Map(
      rows.map((r) => [r.slug, toRecipe(r, reviews.get(r.id) ?? null)]),
    );
  }

  async mealPlan(row: Row, review: ContentReview | null): Promise<MealPlan> {
    const sections = row.sections as MealPlanSections;
    const recipes = await this.recipesBySlug(
      sections.days.flatMap((d) => d.meals.map((m) => m.recipeSlug)),
      row.locale,
    );
    return { ...base(row, review), sections, recipes: [...recipes.values()] };
  }

  private async reviewsFor(rows: Row[]): Promise<Map<string, ContentReview>> {
    if (!rows.length) return new Map();
    const reviews = await this.prisma.contentReview.findMany({
      where: { articleId: { in: rows.map((r) => r.id) }, decision: 'approved' },
      orderBy: { reviewedAt: 'desc' },
    });
    const latest = new Map<string, ContentReview>();
    for (const r of reviews)
      if (!latest.has(r.articleId)) latest.set(r.articleId, r);
    return latest;
  }
}

function base(row: Row, review: ContentReview | null) {
  return {
    slug: row.slug,
    locale: row.locale as 'en',
    version: row.version,
    title: row.title,
    summary: row.summary,
    category: (row.category as ContentCategory | null) ?? null,
    trimester: (row.trimester as Trimester | null) ?? null,
    tags: row.tags,
    references: parseReferences(row.references),
    review: toReviewInfo(review),
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    nextReviewDue: row.nextReviewDue ? toIsoDate(row.nextReviewDue) : null,
  };
}

export function toRecipe(row: Row, review: ContentReview | null): Recipe {
  const sections = row.sections as RecipeSections;
  return {
    ...base(row, review),
    sections,
    allergens: recipeAllergens(sections),
  };
}

export function toActivity(row: Row, review: ContentReview | null): Activity {
  return { ...base(row, review), sections: row.sections as ActivitySections };
}
