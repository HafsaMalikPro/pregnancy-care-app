import type { NextFunction, Request, Response } from 'express';

/**
 * Header that carries the client IP to Better Auth. It is overwritten on every request with
 * Express's `req.ip`, which honours TRUST_PROXY, so a client can't choose its own value.
 * Better Auth would otherwise trust X-Forwarded-For as sent, and anyone could reset its
 * per-IP limits by changing that header.
 */
export const CLIENT_IP_HEADER = 'x-pc-client-ip';

export function clientIpMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? '';
  next();
}
