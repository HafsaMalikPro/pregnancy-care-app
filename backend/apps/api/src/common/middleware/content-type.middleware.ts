import type { NextFunction, Request, Response } from 'express';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const JSON_TYPE = /^application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i;

/** True when the request carries a body (declared length > 0, or chunked). */
function hasBody(req: Request): boolean {
  const length = Number(req.header('content-length') ?? 0);
  return length > 0 || Boolean(req.header('transfer-encoding'));
}

/**
 * Every API body is JSON. A body of any other type (form posts, text/plain, multipart) is
 * refused with 415 before parsing, instead of being silently ignored. Bodiless requests are
 * unaffected.
 */
export function jsonOnlyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!BODY_METHODS.has(req.method) || !hasBody(req)) return next();
  if (JSON_TYPE.test(req.header('content-type') ?? '')) return next();
  res.status(415).json({
    error: {
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Send the request body as application/json.',
      requestId: req.requestId ?? 'unknown',
    },
  });
}
