import type {
  Article,
  ArticleSummary,
  ContentCategory,
  Trimester,
} from '@preconception/contracts';
import { toIsoDate } from '../common/dates.js';
import type {
  Article as ArticleRow,
  ContentReview,
} from '../generated/prisma/client.js';

type Locale = Article['locale'];

export function toSummary(row: ArticleRow): ArticleSummary {
  return {
    slug: row.slug,
    locale: row.locale as Locale,
    version: row.version,
    title: row.title,
    summary: row.summary,
    premium: row.premium,
    publishedAt: (row.publishedAt ?? row.updatedAt).toISOString(),
    category: (row.category as ContentCategory | null) ?? null,
    trimester: (row.trimester as Trimester | null) ?? null,
    tags: row.tags,
  };
}

/** Public review info: only an approving review with a review date counts. */
export function toReviewInfo(review: ContentReview | null): Article['review'] {
  return review?.reviewedAt && review.decision === 'approved'
    ? {
        reviewerCredentials: review.reviewerCredentials,
        reviewedAt: review.reviewedAt.toISOString(),
      }
    : null;
}

export function toArticle(
  row: ArticleRow,
  review: ContentReview | null,
  locked: boolean,
): Article {
  return {
    ...toSummary(row),
    body: locked ? null : row.body,
    locked,
    references: parseReferences(row.references),
    review: toReviewInfo(review),
    nextReviewDue: row.nextReviewDue ? toIsoDate(row.nextReviewDue) : null,
  };
}

export function parseReferences(value: unknown): Article['references'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is { title: string; url?: string } =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as { title?: unknown }).title === 'string',
    )
    .map((r) => ({
      title: r.title,
      ...(typeof r.url === 'string' && { url: r.url }),
    }));
}
