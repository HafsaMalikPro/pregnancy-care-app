import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/**
 * Header that carries the client IP to Better Auth. It is overwritten on every request with
 * Express's `req.ip`, which honours TRUST_PROXY, so a client can't choose its own value.
 * Better Auth would otherwise trust X-Forwarded-For as sent, and anyone could reset its
 * per-IP limits by changing that header.
 */
export const CLIENT_IP_HEADER = 'x-pc-client-ip';

/**
 * Sent by the website's same-origin proxy (frontend `src/proxy.ts`): the shared secret, and
 * the visitor's IP as the website's host saw it. Without them every visitor behind the proxy
 * would share the proxy's IP, and with it one set of rate limits and sign-in lockouts.
 */
export const PROXY_SECRET_HEADER = 'x-pc-proxy-secret';
export const PROXY_CLIENT_IP_HEADER = 'x-pc-proxy-client-ip';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Resolves the client IP once per request and makes `req.ip` return it, so the Nest
 * throttler, Better Auth (via CLIENT_IP_HEADER) and security events all agree.
 *
 * The proxy's forwarded IP is used only when the request carries `proxySecret` (compared in
 * constant time) and the value is a literal IP address. Otherwise the TRUST_PROXY-aware
 * `req.ip` stands. Both proxy headers are always removed so nothing downstream sees them.
 */
export function createClientIpMiddleware(proxySecret?: string) {
  const expected = proxySecret ? digest(proxySecret) : null;
  return (req: Request, _res: Response, next: NextFunction): void => {
    const sentSecret = req.header(PROXY_SECRET_HEADER);
    const forwarded = req.header(PROXY_CLIENT_IP_HEADER)?.trim();
    delete req.headers[PROXY_SECRET_HEADER];
    delete req.headers[PROXY_CLIENT_IP_HEADER];

    if (
      expected &&
      sentSecret &&
      forwarded &&
      isIP(forwarded) !== 0 &&
      timingSafeEqual(digest(sentSecret), expected)
    ) {
      Object.defineProperty(req, 'ip', {
        value: forwarded,
        configurable: true,
        enumerable: true,
      });
    }
    req.headers[CLIENT_IP_HEADER] = req.ip ?? req.socket.remoteAddress ?? '';
    next();
  };
}
