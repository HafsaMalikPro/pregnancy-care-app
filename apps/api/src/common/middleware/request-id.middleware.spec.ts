import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware } from './request-id.middleware.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function run(incoming?: string) {
  const headers: Record<string, string> = {};
  const req = {
    header: (name: string) => (name === 'x-request-id' ? incoming : undefined),
  } as unknown as Request;
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requestIdMiddleware(req, res, next);
  return { id: req.requestId, header: headers['x-request-id'], next };
}

describe('requestIdMiddleware', () => {
  it('issues a UUID when none is sent and echoes it', () => {
    const out = run();
    expect(out.id).toMatch(UUID);
    expect(out.header).toBe(out.id);
    expect(out.next).toHaveBeenCalledOnce();
  });

  it.each(['abcd1234', 'trace-0b6f3c2e-6d1f', 'A'.repeat(64)])(
    'accepts a well-formed upstream id %s',
    (incoming) => {
      expect(run(incoming).id).toBe(incoming);
    },
  );

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(65)],
    ['markup', '<script>alert(1)</script>'],
    ['header injection', 'abcd1234\r\nSet-Cookie: x=1'],
    ['spaces', 'abcd 1234'],
    ['empty', ''],
  ])('replaces a %s id with a new UUID', (_label, incoming) => {
    const out = run(incoming);
    expect(out.id).toMatch(UUID);
    expect(out.header).toBe(out.id);
  });
});
