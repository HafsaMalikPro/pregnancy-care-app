import type { NextFunction, Request, RequestHandler, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_COOKIE =
  /(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\.session_token=/;

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * CSRF defence for Nest routes, on top of SameSite=Lax session cookies: a state-changing
 * request authenticated by the session cookie must come from an allowed origin (Origin
 * header, or Referer when a browser omits Origin). Requests that carry an Authorization
 * header (bearer, anonymous) are not affected: a cross-site page cannot set that header
 * without a CORS preflight the API refuses.
 *
 * Better Auth's own routes (/v1/auth) run its built-in origin check against the same list.
 */
export function csrfMiddleware(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.header('authorization')) return next();
    if (!SESSION_COOKIE.test(req.header('cookie') ?? '')) return next();
    const origin =
      originOf(req.header('origin')) ?? originOf(req.header('referer'));
    if (origin && allowed.has(origin)) return next();
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Cross-site request refused.',
        requestId: req.requestId ?? 'unknown',
      },
    });
  };
}
