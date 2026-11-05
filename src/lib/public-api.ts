import "server-only";
import { API_URL } from "./api";
import type { Activity, ArticleSummary, Article, Page, Recipe, WeekGuide } from "./types";

/**
 * Server-side reads of public, non-personal content (articles and week guides). They carry
 * no cookies or guest secret, so the cached result is the same for everyone.
 */
const REVALIDATE_SECONDS = 300;

export class PublicApiUnavailable extends Error {}

/**
 * Rate-limit retries, for reads that only run at build time or during background
 * revalidation (never while a visitor waits). A build renders several pages at once and can
 * briefly exceed the API's per-IP limit; waiting out the window is better than publishing a
 * page that says the content can't be loaded.
 */
const MAX_RETRIES = 3;
const MAX_WAIT_SECONDS = 60;

async function get<T>(path: string, retries = 0, retried = false): Promise<T | null> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { Accept: "application/json" },
      // A retry skips the data cache so it can't be answered with the cached 429.
      ...(retried ? { cache: "no-store" as const } : { next: { revalidate: REVALIDATE_SECONDS } }),
    });
  } catch {
    throw new PublicApiUnavailable(`Can't reach the API at ${API_URL}`);
  }
  if (res.status === 429 && retries > 0) {
    const wait = Math.min(Number(res.headers.get("retry-after")) || 15, MAX_WAIT_SECONDS);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return get<T>(path, retries - 1, true);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new PublicApiUnavailable(`API returned ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/** For sections that can be left out: null instead of throwing when the API is down. */
export async function optional<T>(read: Promise<T>): Promise<T | null> {
  try {
    return await read;
  } catch (err) {
    if (err instanceof PublicApiUnavailable) return null;
    throw err;
  }
}

export const getArticles = (limit: number, offset = 0) =>
  get<Page<ArticleSummary>>(`/v1/articles?limit=${limit}&offset=${offset}`);

export const getArticle = (slug: string) =>
  get<Article>(`/v1/articles/${encodeURIComponent(slug)}`);

export const getWeekGuide = (week: number) => get<WeekGuide>(`/v1/week-guides/${week}`);

/**
 * Every published week guide, 1–42 (null where a week isn't published). `reachable` is false
 * when the API couldn't be reached, so pages can say so instead of implying nothing exists.
 */
type AllGuides = { guides: (WeekGuide | null)[]; reachable: boolean };

/** One shared copy per server process, so the pages that list every week share 42 requests. */
let allGuides: { at: number; result: Promise<AllGuides> } | null = null;

export function getAllWeekGuides(): Promise<AllGuides> {
  if (allGuides && Date.now() - allGuides.at < REVALIDATE_SECONDS * 1000) return allGuides.result;
  const entry = { at: Date.now(), result: fetchAllWeekGuides() };
  allGuides = entry;
  // Don't keep a result that couldn't reach the API; the next render should try again.
  void entry.result.then(
    (r) => {
      if (!r.reachable && allGuides === entry) allGuides = null;
    },
    () => {
      if (allGuides === entry) allGuides = null;
    },
  );
  return entry.result;
}

/**
 * One request for every published guide (GET /v1/week-guides), placed by week into a 42-slot
 * array with null for unpublished weeks.
 */
async function fetchAllWeekGuides(): Promise<AllGuides> {
  try {
    const list = (await get<WeekGuide[]>("/v1/week-guides?from=1&to=42", MAX_RETRIES)) ?? [];
    const guides: (WeekGuide | null)[] = Array.from({ length: 42 }, () => null);
    for (const g of list) if (g.week >= 1 && g.week <= 42) guides[g.week - 1] = g;
    return { guides, reachable: true };
  } catch (err) {
    if (err instanceof PublicApiUnavailable) {
      return { guides: Array.from({ length: 42 }, () => null), reachable: false };
    }
    throw err;
  }
}

/** Up to 100 published articles (the API's page limit), or null when the API is down. */
export const getArticleLibrary = async () =>
  (await optional(get<Page<ArticleSummary>>("/v1/articles?limit=100&offset=0", MAX_RETRIES)))?.items ?? null;

/** Every published recipe (one page of up to 100), or null when the API is down. */
export const getRecipes = async () =>
  (await optional(get<Page<Recipe>>("/v1/recipes?limit=100&offset=0", MAX_RETRIES)))?.items ?? null;

/** Every published activity (one page of up to 100), or null when the API is down. */
export const getActivities = async () =>
  (await optional(get<Page<Activity>>("/v1/activities?limit=100&offset=0", MAX_RETRIES)))?.items ?? null;

/** Published articles in any of `categories`, newest first, or null when the API is down. */
export async function getArticlesIn(categories: string[]): Promise<ArticleSummary[] | null> {
  const pages = await optional(
    Promise.all(
      categories.map((c) =>
        get<Page<ArticleSummary>>(`/v1/articles?limit=50&offset=0&category=${encodeURIComponent(c)}`, MAX_RETRIES),
      ),
    ),
  );
  if (!pages) return null;
  const seen = new Set<string>();
  return pages.flatMap((p) => p?.items ?? []).filter((a) => !seen.has(a.slug) && (seen.add(a.slug), true));
}
