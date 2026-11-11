import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Accepts a well-formed upstream request id or issues a new one, and echoes it back.
 * Registered with `app.use()` in setupApp so it runs before body parsing: parser errors
 * (malformed or oversized bodies) then carry the same id as every other response.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  // Also on the request headers, so handlers outside Nest (Better Auth hooks) can read it.
  if (req.headers) req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
