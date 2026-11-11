import type { MetadataRoute } from "next";
import { getArticles, optional } from "@/lib/public-api";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = [
    "",
    "/journey",
    "/weeks",
    "/nutrition",
    "/exercise",
    "/baby-care",
    "/birth-and-postpartum",
    "/postpartum",
    "/articles",
    "/about",
    "/privacy",
    "/terms",
    "/contact",
  ];
  const weeks = Array.from({ length: 42 }, (_, i) => `/weeks/${i + 1}`);
  const articles = (await optional(getArticles(100)))?.items ?? [];
  return [
    ...pages.map((p) => ({ url: `${SITE_URL}${p}` })),
    ...weeks.map((p) => ({ url: `${SITE_URL}${p}` })),
    ...articles.map((a) => ({
      url: `${SITE_URL}/articles/${a.slug}`,
      lastModified: a.publishedAt,
    })),
  ];
}
