import type { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * Security headers for every response (docs/SECURITY_CHECKLIST.md, D1-D2).
 *
 * The API serves JSON, so the CSP is the strictest possible: nothing may load and nothing may
 * frame it. The only HTML it serves is Swagger UI at /docs, outside production only, which
 * needs inline script and style.
 */
export const API_CSP =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
export const DOCS_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
export const PERMISSIONS_POLICY =
  'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()';

const SESSION_COOKIE = /(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\./;
const PRIVATE_PREFIXES = ['/v1/auth', '/v1/me', '/v1/admin', '/docs'];

/** Responses that may carry owner data or credentials and must never be cached. */
function isPrivate(req: Request): boolean {
  return (
    req.method !== 'GET' ||
    Boolean(req.header('authorization')) ||
    SESSION_COOKIE.test(req.header('cookie') ?? '') ||
    PRIVATE_PREFIXES.some((p) => req.path === p || req.path.startsWith(`${p}/`))
  );
}

export function applySecurityHeaders(express: Express): void {
  express.disable('x-powered-by');
  // ETags on personal data let caches and observers correlate responses; responses are small.
  express.set('etag', false);

  const common = {
    strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
    referrerPolicy: { policy: 'no-referrer' as const },
    xFrameOptions: { action: 'deny' as const },
    crossOriginResourcePolicy: { policy: 'same-site' as const },
    crossOriginOpenerPolicy: { policy: 'same-origin' as const },
  };
  const api = helmet({
    ...common,
    // Cross-origin isolation for every API response, including Better Auth's HTML error page
    // (ZAP 90004, finding P-08). The dev-only Swagger UI below is left without it.
    crossOriginEmbedderPolicy: { policy: 'require-corp' },
    contentSecurityPolicy: { useDefaults: false, directives: parse(API_CSP) },
  });
  const docs = helmet({
    ...common,
    contentSecurityPolicy: { useDefaults: false, directives: parse(DOCS_CSP) },
  });

  express.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    if (isPrivate(req)) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
    } else {
      // Public content: a shared cache must key on credentials and origin.
      res.setHeader('Vary', 'Origin, Authorization, Cookie');
    }
    const forDocs = req.path === '/docs' || req.path.startsWith('/docs');
    return (forDocs ? docs : api)(req, res, next);
  });
}

function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(';').map((d) => {
      const [name, ...values] = d.trim().split(/\s+/);
      return [name, values];
    }),
  );
}
