import { NextResponse, type NextRequest } from "next/server";
import { API_URL } from "./lib/api";

/**
 * Same-origin API proxy. The browser calls `/v1/*` on this site and the request is forwarded
 * to the API (NEXT_PUBLIC_API_URL). The API's session cookies are SameSite=Lax, and a deployed
 * website and API on different sites (vercel.app and railway.app) would never see them sent;
 * through this proxy they are first-party cookies of the website.
 *
 * With PROXY_SECRET set (server-only, same value as the API's PROXY_SECRET), the visitor's IP
 * goes along so the API's per-IP rate limits stay per visitor rather than per proxy.
 */
const PROXY_SECRET_HEADER = "x-pc-proxy-secret";
const PROXY_CLIENT_IP_HEADER = "x-pc-proxy-client-ip";

function clientIp(headers: Headers): string | null {
  // Set by the hosting platform (Vercel overwrites both, so a visitor can't choose them).
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || null;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = new URL(`${pathname}${search}`, `${API_URL}/`);

  const headers = new Headers(request.headers);
  // Never pass on values a visitor sent for these.
  headers.delete(PROXY_SECRET_HEADER);
  headers.delete(PROXY_CLIENT_IP_HEADER);
  const secret = process.env.PROXY_SECRET?.trim();
  const ip = clientIp(request.headers);
  if (secret && ip) {
    headers.set(PROXY_SECRET_HEADER, secret);
    headers.set(PROXY_CLIENT_IP_HEADER, ip);
  }

  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  matcher: "/v1/:path*",
};
