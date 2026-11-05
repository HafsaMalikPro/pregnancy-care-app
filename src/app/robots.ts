import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Personal pages are client-rendered behind sign-in; keep crawlers out of them too.
const PRIVATE = [
  "/dashboard", "/timeline", "/tools", "/journal", "/checklist", "/reminders",
  "/settings", "/onboarding", "/admin", "/login", "/signup", "/goodbye",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
