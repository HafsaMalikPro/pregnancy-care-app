import type { NextConfig } from "next";

// Every page renders client-side against the NestJS API with the visitor's own session,
// so there is nothing for Cache Components to prerender or cache.
const nextConfig: NextConfig = {
  // Same-origin proxy to the API (see src/lib/api.ts). Enabled when NEXT_PUBLIC_API_PROXY=true.
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_PROXY !== "true") return [];
    const api = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
    return [{ source: "/v1/:path*", destination: `${api}/v1/:path*` }];
  },
  experimental: {
    // Keep the ~30 static pages in one worker so they share fetched week guides. Separate
    // workers each fetch all 42 guides and together exceed the API's per-IP rate limit.
    staticGenerationMinPagesPerWorker: 100,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
