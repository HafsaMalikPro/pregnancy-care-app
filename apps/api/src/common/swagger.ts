import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { ApiErrorDto } from './dto/api-error.dto.js';

export const SECURITY = {
  bearer: 'session-bearer',
  cookie: 'session-cookie',
  anonymous: 'anonymous',
} as const;

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'VALIDATION_ERROR: invalid or unknown fields (see `details`)',
  401: 'UNAUTHORIZED: missing, invalid or expired credentials',
  403: 'FORBIDDEN / CONSENT_REQUIRED / PREMIUM_REQUIRED',
  404: 'NOT_FOUND: does not exist or belongs to someone else',
  409: 'CONFLICT: duplicate or overlapping record',
  429: 'RATE_LIMITED',
};

/** Documents ApiError responses for the given statuses. */
export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: ERROR_DESCRIPTIONS[status] ?? 'Error',
        type: ApiErrorDto,
      }),
    ),
  );
}

/** Registered user (session cookie or bearer token) or anonymous session. */
export function ApiOwnerAuth() {
  return applyDecorators(
    ApiBearerAuth(SECURITY.bearer),
    ApiCookieAuth(SECURITY.cookie),
    ApiSecurity(SECURITY.anonymous),
    ApiErrors(401),
  );
}

/** Registered user only; anonymous sessions get 403. */
export function ApiUserAuth() {
  return applyDecorators(
    ApiBearerAuth(SECURITY.bearer),
    ApiCookieAuth(SECURITY.cookie),
    ApiErrors(401, 403),
  );
}
