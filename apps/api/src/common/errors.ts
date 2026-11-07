import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import type { ErrorCode } from '@preconception/contracts';

/** A 403 with a specific ApiError code, so clients can tell consent from premium gating. */
export class CodedForbiddenException extends ForbiddenException {
  constructor(
    readonly code: Extract<ErrorCode, 'CONSENT_REQUIRED' | 'PREMIUM_REQUIRED'>,
    message: string,
  ) {
    super({ code, message, statusCode: HttpStatus.FORBIDDEN });
  }
}

/** A 409 with a specific ApiError code, so clients can choose a recovery path. */
export class CodedConflictException extends ConflictException {
  constructor(
    readonly code: Extract<ErrorCode, 'ACCOUNT_HAS_HEALTH_DATA'>,
    message: string,
  ) {
    super({ code, message, statusCode: HttpStatus.CONFLICT });
  }
}

export const consentRequired = () =>
  new CodedForbiddenException(
    'CONSENT_REQUIRED',
    'Consent to health data processing is required before saving health data.',
  );

export const premiumRequired = () =>
  new CodedForbiddenException(
    'PREMIUM_REQUIRED',
    'This content requires an active premium entitlement.',
  );

interface DbFailure {
  status: number;
  message: string;
}

/**
 * Maps Prisma / Postgres constraint failures to client errors. Raw database messages are
 * never returned or logged: they quote row values, which can be cycle dates.
 */
export function dbFailure(exception: unknown): DbFailure | undefined {
  const e = exception as {
    name?: unknown;
    code?: unknown;
    meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } };
  } | null;
  if (e?.name !== 'PrismaClientKnownRequestError') return undefined;
  const pg = e.meta?.driverAdapterError?.cause?.originalCode;
  switch (e.code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        message: 'The record already exists.',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        message: 'A related record does not exist.',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The record was not found.',
      };
  }
  if (pg === '23P01') {
    return {
      status: HttpStatus.CONFLICT,
      message: 'The record overlaps an existing one.',
    };
  }
  if (pg === '23514') {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: 'The request is invalid.',
    };
  }
  return undefined;
}
