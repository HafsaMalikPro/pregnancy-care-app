import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ApiError } from '@preconception/contracts';
import { consentRequired, premiumRequired } from '../errors.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function run(exception: unknown, requestId: string | null = 'req-12345') {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const req = {
    method: 'POST',
    route: { path: '/v1/things' },
    requestId: requestId ?? undefined,
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return { status: res.statusCode, body: res.body as ApiError };
}

/** Shape of an `http-errors` error thrown by Express body-parser. */
function parserError(status: number, type: string) {
  return Object.assign(new Error(`${type} raw parser message`), {
    status,
    statusCode: status,
    expose: true,
    type,
  });
}

describe('ApiExceptionFilter', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it.each([
    [new UnauthorizedException(), 401, 'UNAUTHORIZED'],
    [new ForbiddenException(), 403, 'FORBIDDEN'],
    [new NotFoundException('Cannot GET /v1/x'), 404, 'NOT_FOUND'],
    [new ConflictException(), 409, 'CONFLICT'],
    [new ThrottlerException(), 429, 'RATE_LIMITED'],
  ])('maps %s to %i %s', (exception, status, code) => {
    const out = run(exception);
    expect(out.status).toBe(status);
    expect(out.body.error.code).toBe(code);
    expect(ApiError.safeParse(out.body).success).toBe(true);
  });

  it('keeps 4xx HttpException messages', () => {
    const out = run(new NotFoundException('Cannot GET /v1/x'));
    expect(out.body.error.message).toBe('Cannot GET /v1/x');
  });

  it('returns validation details for class-validator messages', () => {
    const out = run(
      new BadRequestException([
        'periodStart must be a valid ISO 8601 date string',
        'extra should not exist',
      ]),
    );
    expect(out.status).toBe(400);
    expect(out.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'The request is invalid.',
      requestId: 'req-12345',
      details: [
        {
          path: 'periodStart',
          message: 'periodStart must be a valid ISO 8601 date string',
        },
        { path: 'extra', message: 'extra should not exist' },
      ],
    });
  });

  it('omits details and hides the raw message for a single-string bad request', () => {
    // Nest wraps JSON SyntaxErrors like this; the message can quote the request body.
    const out = run(new BadRequestException('Unexpected token "secret-note"'));
    expect(out.body.error.message).toBe('The request is invalid.');
    expect(out.body.error.details).toBeUndefined();
    expect(JSON.stringify(out.body)).not.toContain('secret-note');
  });

  it('maps an oversized body to 413 PAYLOAD_TOO_LARGE without logging an error', () => {
    const out = run(parserError(413, 'entity.too.large'));
    expect(out.status).toBe(413);
    expect(out.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(out.body.error.message).toBe('The request body is too large.');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('maps other parser client errors to their status with a generic message', () => {
    const out = run(parserError(415, 'charset.unsupported'));
    expect(out.status).toBe(415);
    expect(out.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(out.body.error.message).toBe('The request is invalid.');
    expect(JSON.stringify(out.body)).not.toContain('raw parser message');
  });

  it('does not trust a status on errors that are not exposable client errors', () => {
    const forged = Object.assign(new Error('x'), { status: 404 });
    expect(run(forged).status).toBe(500);
    const serverish = Object.assign(new Error('x'), {
      status: 503,
      expose: true,
    });
    expect(run(serverish).status).toBe(500);
  });

  it('returns a generic 500 and logs only method, route, class and request id', () => {
    const err = new TypeError('cycle note: private text');
    const out = run(err);
    expect(out.status).toBe(500);
    expect(out.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId: 'req-12345',
    });
    expect(logSpy).toHaveBeenCalledWith(
      'POST /v1/things failed: TypeError [req-12345]',
    );
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain('private text');
  });

  it('hides messages of 5xx HttpExceptions', () => {
    const out = run(new InternalServerErrorException('db password wrong'));
    expect(out.body.error.message).toBe('An unexpected error occurred.');
  });

  it('maps an unmapped 5xx HttpException to INTERNAL_ERROR', () => {
    const out = run(new HttpException('gateway', HttpStatus.BAD_GATEWAY));
    expect(out.status).toBe(502);
    expect(out.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('handles non-Error throws', () => {
    const out = run('a string');
    expect(out.status).toBe(500);
    expect(logSpy).toHaveBeenCalledWith(
      'POST /v1/things failed: string [req-12345]',
    );
    expect(run(null).status).toBe(500);
  });

  it.each([
    [consentRequired(), 'CONSENT_REQUIRED'],
    [premiumRequired(), 'PREMIUM_REQUIRED'],
  ])('keeps explicit 403 codes (%#)', (exception, code) => {
    const out = run(exception);
    expect(out.status).toBe(403);
    expect(out.body.error.code).toBe(code);
  });

  it('maps database constraint failures without echoing row values', () => {
    const overlap = Object.assign(new Error('conflicts with (2026-01-01)'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2039',
      meta: { driverAdapterError: { cause: { originalCode: '23P01' } } },
    });
    const out = run(overlap);
    expect(out.status).toBe(409);
    expect(out.body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(out.body)).not.toContain('2026');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('passes through structured validation details from the global pipe', () => {
    const out = run(
      new BadRequestException({
        message: ['url must be a URL'],
        details: [{ path: 'references.0.url', message: 'url must be a URL' }],
      }),
    );
    expect(out.body.error.details).toEqual([
      { path: 'references.0.url', message: 'url must be a URL' },
    ]);
  });

  it('falls back to "unknown" when no request id was assigned', () => {
    expect(run(new NotFoundException(), null).body.error.requestId).toBe(
      'unknown',
    );
  });
});
