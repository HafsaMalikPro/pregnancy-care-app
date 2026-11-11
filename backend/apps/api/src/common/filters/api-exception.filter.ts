import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError, ErrorCode } from '@preconception/contracts';
import type { Request, Response } from 'express';
import {
  CodedConflictException,
  CodedForbiddenException,
  dbFailure,
} from '../errors.js';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/**
 * Converts every error into the shared ApiError shape. Internal errors are logged with the
 * request id and error class only — never the request body, which may contain health data.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = req.requestId ?? 'unknown';

    const db = dbFailure(exception);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (db?.status ??
          bodyParserStatus(exception) ??
          HttpStatus.INTERNAL_SERVER_ERROR);
    const code =
      exception instanceof CodedForbiddenException ||
      exception instanceof CodedConflictException
        ? exception.code
        : (CODE_BY_STATUS[status] ??
          (status < 500 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'));

    let message = 'An unexpected error occurred.';
    let details: NonNullable<ApiError['error']['details']> | undefined;

    if (exception instanceof BadRequestException) {
      message = 'The request is invalid.';
      details = validationDetails(exception.getResponse());
    } else if (exception instanceof HttpException && status < 500) {
      message = exception.message;
    } else if (db) {
      message = db.message;
    } else if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
      message = 'The request body is too large.';
    } else if (status < 500) {
      message = 'The request is invalid.';
    } else {
      const name =
        exception instanceof Error ? exception.name : typeof exception;
      this.logger.error(
        `${req.method} ${req.route?.path ?? 'unmatched'} failed: ${name} [${requestId}]`,
      );
    }

    const body: ApiError = {
      error: { code, message, requestId, ...(details && { details }) },
    };
    res.status(status).json(body);
  }
}

/**
 * Client errors raised by Express body parsing before any route runs (oversized body,
 * unsupported encoding or charset). They are `http-errors` objects, not HttpExceptions.
 * Their messages are not echoed: a parser message can quote part of the body.
 */
function bodyParserStatus(exception: unknown): number | undefined {
  const { status, expose } = (exception ?? {}) as {
    status?: unknown;
    expose?: unknown;
  };
  return typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    expose === true
    ? status
    : undefined;
}

function validationDetails(response: unknown) {
  const { message: messages, details } = (response ?? {}) as {
    message?: unknown;
    details?: unknown;
  };
  // Structured details from the global ValidationPipe (common/validation.ts).
  if (Array.isArray(details)) {
    return details.filter(
      (d): d is { path: string; message: string } =>
        typeof d?.path === 'string' && typeof d?.message === 'string',
    );
  }
  // Hand-written BadRequestException(['field must ...']) from services and pipes.
  if (!Array.isArray(messages)) return undefined;
  // Those messages start with the field name ("periodStart cannot be ...").
  return messages
    .filter((m): m is string => typeof m === 'string')
    .map((m) => ({ path: m.split(' ')[0] ?? '', message: m }));
}
