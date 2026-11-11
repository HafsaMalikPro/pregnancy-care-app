import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { dbFailure } from './errors.js';
import { flattenValidationErrors } from './validation.js';

/** Shape observed from Prisma 7 + @prisma/adapter-pg against Postgres 17. */
function prismaError(
  code: string,
  pgCode?: string,
  detail = 'Key (period)=(2026-01-03) conflicts',
) {
  return Object.assign(new Error(`Database error. ${detail}`), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta: pgCode
      ? { driverAdapterError: { cause: { originalCode: pgCode, detail } } }
      : {},
  });
}

describe('dbFailure', () => {
  it.each([
    ['P2002', undefined, HttpStatus.CONFLICT],
    ['P2003', undefined, HttpStatus.CONFLICT],
    ['P2025', undefined, HttpStatus.NOT_FOUND],
    ['P2039', '23P01', HttpStatus.CONFLICT],
    ['P2039', '23514', HttpStatus.BAD_REQUEST],
  ])('maps %s/%s to %i', (code, pg, status) => {
    expect(dbFailure(prismaError(code, pg))?.status).toBe(status);
  });

  it('never echoes database text, which can contain cycle dates', () => {
    for (const [code, pg] of [
      ['P2002'],
      ['P2039', '23P01'],
      ['P2039', '23514'],
    ]) {
      expect(dbFailure(prismaError(code!, pg))?.message).not.toMatch(
        /2026|Key|period/,
      );
    }
  });

  it.each([
    prismaError('P2039', '40001'),
    prismaError('P1001'),
    new Error('x'),
    null,
    'string',
  ])('leaves other errors to the 500 path (%#)', (e) => {
    expect(dbFailure(e)).toBeUndefined();
  });
});

describe('flattenValidationErrors', () => {
  it('produces dotted paths for nested and array errors', () => {
    const errors = [
      {
        property: 'title',
        constraints: { minLength: 'title must be longer' },
        children: [],
      },
      {
        property: 'references',
        constraints: {},
        children: [
          {
            property: '0',
            children: [
              {
                property: 'url',
                constraints: { isUrl: 'url must be a URL' },
                children: [],
              },
            ],
          },
        ],
      },
    ] as unknown as ValidationError[];
    expect(flattenValidationErrors(errors)).toEqual([
      { path: 'title', message: 'title must be longer' },
      { path: 'references.0.url', message: 'url must be a URL' },
    ]);
  });
});
