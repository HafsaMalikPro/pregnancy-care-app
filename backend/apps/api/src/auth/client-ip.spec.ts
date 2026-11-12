import type { Request, Response } from 'express';
import {
  CLIENT_IP_HEADER,
  createClientIpMiddleware,
  PROXY_CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
} from './client-ip.js';

const SECRET = 'a3f1c9e27b8d4560f2e1a7c3b9d8e6f4a1b2c3d4';

/** A minimal Express-like request whose `ip` getter is what TRUST_PROXY resolved. */
function request(headers: Record<string, string>, ip = '10.0.0.1'): Request {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const req = {
    headers: lower,
    socket: { remoteAddress: ip },
    header(name: string) {
      return this.headers[name.toLowerCase()] as string | undefined;
    },
  };
  Object.defineProperty(req, 'ip', { get: () => ip, configurable: true });
  return req as unknown as Request;
}

function run(middleware: ReturnType<typeof createClientIpMiddleware>, req: Request) {
  let called = false;
  middleware(req, {} as Response, () => {
    called = true;
  });
  expect(called).toBe(true);
  return req;
}

describe('client IP middleware', () => {
  it('uses the forwarded IP when the proxy secret matches', () => {
    const req = run(
      createClientIpMiddleware(SECRET),
      request({
        [PROXY_SECRET_HEADER]: SECRET,
        [PROXY_CLIENT_IP_HEADER]: '203.0.113.7',
      }),
    );
    expect(req.ip).toBe('203.0.113.7');
    expect(req.headers[CLIENT_IP_HEADER]).toBe('203.0.113.7');
  });

  it('accepts IPv6 addresses', () => {
    const req = run(
      createClientIpMiddleware(SECRET),
      request({
        [PROXY_SECRET_HEADER]: SECRET,
        [PROXY_CLIENT_IP_HEADER]: '2001:db8::1',
      }),
    );
    expect(req.ip).toBe('2001:db8::1');
  });

  it('ignores the forwarded IP with a wrong secret', () => {
    const req = run(
      createClientIpMiddleware(SECRET),
      request({
        [PROXY_SECRET_HEADER]: 'wrong-secret',
        [PROXY_CLIENT_IP_HEADER]: '203.0.113.7',
      }),
    );
    expect(req.ip).toBe('10.0.0.1');
    expect(req.headers[CLIENT_IP_HEADER]).toBe('10.0.0.1');
  });

  it('ignores the forwarded IP when no secret is configured', () => {
    const req = run(
      createClientIpMiddleware(undefined),
      request({
        [PROXY_SECRET_HEADER]: SECRET,
        [PROXY_CLIENT_IP_HEADER]: '203.0.113.7',
      }),
    );
    expect(req.ip).toBe('10.0.0.1');
  });

  it('ignores a forwarded value that is not an IP address', () => {
    const req = run(
      createClientIpMiddleware(SECRET),
      request({
        [PROXY_SECRET_HEADER]: SECRET,
        [PROXY_CLIENT_IP_HEADER]: '203.0.113.7, 198.51.100.1',
      }),
    );
    expect(req.ip).toBe('10.0.0.1');
  });

  it('always strips the proxy headers and overwrites a client-sent IP header', () => {
    const req = run(
      createClientIpMiddleware(SECRET),
      request({
        [PROXY_SECRET_HEADER]: SECRET,
        [PROXY_CLIENT_IP_HEADER]: '203.0.113.7',
        [CLIENT_IP_HEADER]: '192.0.2.99',
      }),
    );
    expect(req.headers[PROXY_SECRET_HEADER]).toBeUndefined();
    expect(req.headers[PROXY_CLIENT_IP_HEADER]).toBeUndefined();
    expect(req.headers[CLIENT_IP_HEADER]).toBe('203.0.113.7');
  });
});
