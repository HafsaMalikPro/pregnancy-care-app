import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivitySections,
  MealPlanSections,
  RecipeSections,
} from '@preconception/contracts';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { SessionUser } from '../auth/owner.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  Article,
  ContentStatus,
  Prisma,
} from '../generated/prisma/client.js';

export interface ArticleDraftInput {
  slug: string;
  locale: string;
  title: string;
  summary: string;
  body: string;
  references: { title: string; url?: string }[];
  premium: boolean;
  kind?: ContentKindName;
  week?: number;
  sections?: object;
  category?: string | null;
  trimester?: number | null;
  tags?: string[];
}

type ContentKindName = 'article' | 'week_guide' | StructuredKind;
export type StructuredKind = 'recipe' | 'activity' | 'meal_plan';

/** Zod schema for each structured kind's `sections`. */
const STRUCTURED: Record<StructuredKind, z.ZodType> = {
  recipe: RecipeSections,
  activity: ActivitySections,
  meal_plan: MealPlanSections,
};

export const isStructured = (kind: string): kind is StructuredKind =>
  kind in STRUCTURED;

/** Validates structured sections; 400 with field paths when invalid. Returns the parsed value. */
export function parseStructured(kind: StructuredKind, value: unknown): object {
  const result = STRUCTURED[kind].safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: ['sections', ...i.path].join('.'),
      message: i.message,
    }));
    throw new BadRequestException({
      message: details.map((d) => `${d.path}: ${d.message}`),
      details,
    });
  }
  if (kind === 'activity') {
    const a = result.data as ActivitySections;
    if (a.fromWeek !== null && a.toWeek !== null && a.fromWeek > a.toWeek) {
      throw new BadRequestException([
        'sections.fromWeek must be <= sections.toWeek',
      ]);
    }
  }
  return result.data as object;
}

export interface WeekGuideDraftInput {
  week: number;
  locale: string;
  title: string;
  summary: string;
  sections: object;
  references: { title: string; url?: string }[];
}

export const weekGuideSlug = (week: number) => `pregnancy-week-${week}`;

export interface ReviewInput {
  decision: 'approved' | 'changes_requested';
  reviewerCredentials: string;
  sources: { title: string; url?: string }[];
  comments?: string;
}

const REVIEW_INTERVAL_MONTHS = 12;
const WORKING_STATES: ContentStatus[] = ['draft', 'in_review', 'approved'];

/**
 * Editorial workflow: draft → in_review → approved → published, with changes_requested
 * returning to draft. Every transition is audited. Health content is published only after an
 * approving clinical review by someone other than its author.
 */
@Injectable()
export class AdminContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createDraft(
    actor: SessionUser,
    input: ArticleDraftInput,
    requestId?: string,
  ) {
    if (
      input.kind !== 'week_guide' &&
      input.slug.startsWith('pregnancy-week-')
    ) {
      throw new BadRequestException([
        'slug "pregnancy-week-*" is reserved for week guides',
      ]);
    }
    const kind = input.kind ?? 'article';
    if (isStructured(kind)) {
      input = { ...input, sections: parseStructured(kind, input.sections) };
    }
    return this.prisma.$transaction(async (tx) => {
      const versions = await tx.article.findMany({
        where: { slug: input.slug, locale: input.locale },
        select: { version: true, status: true, kind: true },
      });
      if (versions.some((v) => v.kind !== kind)) {
        throw new ConflictException(
          'This slug is already used by a different kind of content.',
        );
      }
      if (versions.some((v) => WORKING_STATES.includes(v.status))) {
        throw new ConflictException(
          'A working version of this article already exists; edit it instead.',
        );
      }
      const version = Math.max(0, ...versions.map((v) => v.version)) + 1;
      const article = await tx.article.create({
        data: { ...input, version, status: 'draft', createdById: actor.id },
      });
      await this.log(tx, actor, 'article.created', article, requestId);
      return article;
    });
  }

  /**
   * A week guide is an article of kind `week_guide`: it reuses the same versioning, clinical
   * review, publishing and audit. Safety content is never premium.
   */
  createWeekGuideDraft(
    actor: SessionUser,
    input: WeekGuideDraftInput,
    requestId?: string,
  ) {
    return this.createDraft(
      actor,
      {
        kind: 'week_guide',
        slug: weekGuideSlug(input.week),
        locale: input.locale,
        week: input.week,
        title: input.title,
        summary: input.summary,
        body: '',
        sections: input.sections,
        references: input.references,
        premium: false,
      },
      requestId,
    );
  }

  async updateDraft(
    actor: SessionUser,
    id: string,
    input: Partial<
      Omit<ArticleDraftInput, 'slug' | 'locale' | 'kind' | 'week'>
    > & { structuredSections?: object },
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const article = await this.find(tx, id);
      if (article.status !== 'draft') {
        throw new ConflictException('Only drafts can be edited.');
      }
      if (input.sections && article.kind !== 'week_guide') {
        throw new BadRequestException(['sections apply to week guides only']);
      }
      const { structuredSections, ...rest } = input;
      if (structuredSections !== undefined) {
        if (!isStructured(article.kind)) {
          throw new BadRequestException([
            'structuredSections apply to recipes, activities and meal plans only',
          ]);
        }
        input = {
          ...rest,
          sections: parseStructured(article.kind, structuredSections),
        };
      } else {
        input = rest;
      }
      if (input.premium && article.kind === 'week_guide') {
        throw new BadRequestException(['week guides cannot be premium']);
      }
      const updated = await tx.article.update({ where: { id }, data: input });
      await this.log(tx, actor, 'article.updated', updated, requestId);
      return updated;
    });
  }

  submit(actor: SessionUser, id: string, requestId?: string) {
    return this.transition(
      actor,
      id,
      'draft',
      'in_review',
      'article.submitted',
      requestId,
    );
  }

  async review(
    actor: SessionUser,
    id: string,
    input: ReviewInput,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const article = await this.find(tx, id);
      if (article.status !== 'in_review') {
        throw new ConflictException('Only articles in review can be reviewed.');
      }
      if (article.createdById === actor.id) {
        throw new ForbiddenException(
          'Authors cannot review their own articles.',
        );
      }
      const now = new Date();
      const review = await tx.contentReview.create({
        data: {
          articleId: id,
          reviewerId: actor.id,
          reviewerCredentials: input.reviewerCredentials,
          decision: input.decision,
          sources: input.sources,
          comments: input.comments ?? null,
          reviewedAt: now,
        },
      });
      const updated = await tx.article.update({
        where: { id },
        data: { status: input.decision === 'approved' ? 'approved' : 'draft' },
      });
      await this.log(
        tx,
        actor,
        `article.review.${input.decision}`,
        updated,
        requestId,
      );
      return { article: updated, review };
    });
  }

  async publish(actor: SessionUser, id: string, requestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const article = await this.find(tx, id);
      if (article.status !== 'approved') {
        throw new ConflictException('Only approved articles can be published.');
      }
      if (article.kind === 'meal_plan') {
        // A published plan must only point at published (reviewed) recipes.
        const slugs = [
          ...new Set(
            (article.sections as MealPlanSections).days.flatMap((d) =>
              d.meals.map((m) => m.recipeSlug),
            ),
          ),
        ];
        const published = await tx.article.findMany({
          where: {
            kind: 'recipe',
            locale: article.locale,
            status: 'published',
            slug: { in: slugs },
          },
          select: { slug: true },
        });
        const missing = slugs.filter(
          (x) => !published.some((p) => p.slug === x),
        );
        if (missing.length) {
          throw new ConflictException(
            `Publish these recipes first: ${missing.join(', ')}.`,
          );
        }
      }
      await tx.article.updateMany({
        where: {
          slug: article.slug,
          locale: article.locale,
          status: 'published',
        },
        data: { status: 'archived' },
      });
      const now = new Date();
      const nextReviewDue = new Date(now);
      nextReviewDue.setUTCMonth(
        nextReviewDue.getUTCMonth() + REVIEW_INTERVAL_MONTHS,
      );
      const updated = await tx.article.update({
        where: { id },
        data: { status: 'published', publishedAt: now, nextReviewDue },
      });
      await this.log(tx, actor, 'article.published', updated, requestId);
      return updated;
    });
  }

  async archive(actor: SessionUser, id: string, requestId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const article = await this.find(tx, id);
      if (article.status === 'archived') {
        throw new ConflictException('Article is already archived.');
      }
      const updated = await tx.article.update({
        where: { id },
        data: { status: 'archived' },
      });
      await this.log(tx, actor, 'article.archived', updated, requestId);
      return updated;
    });
  }

  private async transition(
    actor: SessionUser,
    id: string,
    from: ContentStatus,
    to: ContentStatus,
    action: string,
    requestId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const article = await this.find(tx, id);
      if (article.status !== from) {
        throw new ConflictException(
          `Article must be ${from} (is ${article.status}).`,
        );
      }
      if (
        to === 'in_review' &&
        article.kind === 'article' &&
        !article.body.trim()
      ) {
        throw new BadRequestException(['body must not be empty']);
      }
      if (to === 'in_review' && isStructured(article.kind)) {
        // Re-check against the current schema before a reviewer sees it.
        parseStructured(article.kind, article.sections);
        if (!article.category) {
          throw new BadRequestException(['category is required before review']);
        }
      }
      const updated = await tx.article.update({
        where: { id },
        data: { status: to },
      });
      await this.log(tx, actor, action, updated, requestId);
      return updated;
    });
  }

  private async find(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Article> {
    const article = await tx.article.findUnique({ where: { id } });
    if (!article) throw new NotFoundException('Article not found.');
    return article;
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: SessionUser,
    action: string,
    article: Article,
    requestId?: string,
  ) {
    return this.audit.record(
      {
        action,
        actorUserId: actor.id,
        actorRole: actor.staffRole,
        targetType: 'article',
        targetId: article.id,
        requestId,
        metadata: {
          slug: article.slug,
          locale: article.locale,
          version: article.version,
        },
      },
      tx,
    );
  }
}
