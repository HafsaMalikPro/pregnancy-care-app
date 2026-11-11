import type { Request, Response } from 'express';
import { csrfMiddleware } from './csrf.middleware.js';

function run(headers: Record<string, string>, method = 'POST') {
  const mw = csrfMiddleware(['https://app.example.com']);
  const req = {
    method,
    header: (n: string) => headers[n.toLowerCase()],
    requestId: 'r1',
  } as unknown as Request;
  let status = 0;
  const res = {
    status(s: number) {
      status = s;
      return this;
    },
    json: () => undefined,
  } as unknown as Response;
  let passed = false;
  mw(req, res, () => {
    passed = true;
  });
  return { passed, status };
}

const cookie = 'better-auth.session_token=abc';

describe('csrfMiddleware', () => {
  it('lets safe methods, bearer and cookie-less requests through', () => {
    expect(run({ cookie }, 'GET').passed).toBe(true);
    expect(run({ cookie, authorization: 'Bearer x' }).passed).toBe(true);
    expect(run({}).passed).toBe(true);
  });

  it('requires an allowed Origin or Referer for cookie writes', () => {
    expect(run({ cookie, origin: 'https://app.example.com' }).passed).toBe(
      true,
    );
    expect(run({ cookie, referer: 'https://app.example.com/x?y' }).passed).toBe(
      true,
    );
    expect(
      run({ cookie: `__Secure-${cookie}`, origin: 'https://evil.test' }),
    ).toEqual({
      passed: false,
      status: 403,
    });
    expect(run({ cookie }).status).toBe(403);
    expect(run({ cookie, origin: 'null' }).status).toBe(403);
    expect(
      run({ cookie, origin: 'https://app.example.com.evil.test' }).status,
    ).toBe(403);
  });
});
