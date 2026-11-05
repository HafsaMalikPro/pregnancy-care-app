import { Injectable } from '@nestjs/common';
import type { WeekGuide, WeekGuideSections } from '@preconception/contracts';
import { toArticle } from '../content/content.mapper.js';
import { PrismaService } from '../database/prisma.service.js';
import type {
  Article as ArticleRow,
  ContentReview,
} from '../generated/prisma/client.js';

/** Reads published, clinically reviewed week guides (articles of kind `week_guide`). */
@Injectable()
export class WeekGuideService {
  constructor(private readonly prisma: PrismaService) {}

  async published(week: number, locale: string): Promise<WeekGuide | null> {
    const [guide] = await this.publishedRange(week, week, locale);
    return guide ?? null;
  }

  /**
   * Every published guide for weeks `from`-`to`, in week order, in two queries (guides, then
   * their approving reviews). Unpublished weeks are simply absent.
   */
  async publishedRange(
    from: number,
    to: number,
    locale: string,
  ): Promise<WeekGuide[]> {
    const rows = await this.prisma.article.findMany({
      where: {
        kind: 'week_guide',
        locale,
        status: 'published',
        week: { gte: from, lte: to },
      },
      orderBy: { week: 'asc' },
    });
    if (rows.length === 0) return [];
    const reviews = await this.prisma.contentReview.findMany({
      where: { articleId: { in: rows.map((r) => r.id) }, decision: 'approved' },
      orderBy: { reviewedAt: 'desc' },
    });
    const latest = new Map<string, ContentReview>();
    for (const r of reviews)
      if (!latest.has(r.articleId)) latest.set(r.articleId, r);
    return rows.flatMap((row) => {
      const guide = toWeekGuide(row, latest.get(row.id) ?? null);
      return guide ? [guide] : [];
    });
  }
}

export function toWeekGuide(
  row: ArticleRow,
  review: ContentReview | null,
): WeekGuide | null {
  if (!row.sections || !row.week) return null;
  const article = toArticle(row, review, false);
  return {
    week: row.week,
    locale: article.locale,
    version: article.version,
    title: article.title,
    summary: article.summary,
    // Guides saved before these fields existed get their defaults.
    sections: {
      babyMilestones: [],
      sizeComparison: null,
      ...(row.sections as Partial<WeekGuideSections>),
    } as WeekGuideSections,
    references: article.references,
    review: article.review,
    publishedAt: article.publishedAt,
    nextReviewDue: article.nextReviewDue,
  };
}
