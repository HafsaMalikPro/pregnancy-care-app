/** Public origin of this website, for canonical URLs, the sitemap and social cards. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Social profiles shown in the footer. Each appears only when its URL is set, so the site
 * never links to an account that doesn't exist. Set them in .env.local, e.g.
 * NEXT_PUBLIC_SOCIAL_INSTAGRAM=https://www.instagram.com/your-handle
 */
export const SOCIAL_LINKS = (
  [
    { network: "facebook", label: "Facebook", url: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK },
    { network: "instagram", label: "Instagram", url: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM },
    { network: "tiktok", label: "TikTok", url: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK },
    { network: "youtube", label: "YouTube", url: process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE },
    { network: "linkedin", label: "LinkedIn", url: process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN },
  ] as const
).filter((s): s is typeof s & { url: string } => Boolean(s.url));
