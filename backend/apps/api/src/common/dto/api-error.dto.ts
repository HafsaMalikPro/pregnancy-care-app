import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '@preconception/contracts';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';

/** OpenAPI mirror of `ApiError` in @preconception/contracts. Documentation only. */
export class ApiErrorDetailDto {
  @ApiProperty({ example: 'periodStart' })
  path: string;

  @ApiProperty({ example: 'periodStart must be a valid ISO 8601 date string' })
  message: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ enum: ErrorCode.options, example: 'NOT_FOUND' })
  code: string;

  @ApiProperty({ example: 'Cannot GET /v1/unknown' })
  message: string;

  @ApiProperty({
    description: `Matches the ${REQUEST_ID_HEADER} response header.`,
    example: '0b6f3c2e-6d1f-4c4e-9a53-5f7f1f5c2a10',
  })
  requestId: string;

  @ApiPropertyOptional({
    type: [ApiErrorDetailDto],
    description: 'Present on validation failures only.',
  })
  details?: ApiErrorDetailDto[];
}

export class ApiErrorDto {
  @ApiProperty({ type: ApiErrorBodyDto })
  error: ApiErrorBodyDto;
}

/** Response header set on every response by requestIdMiddleware. */
export const REQUEST_ID_RESPONSE_HEADER = {
  [REQUEST_ID_HEADER]: {
    description:
      'Request correlation id. Echoes a well-formed incoming id (8-64 chars of A-Z, a-z, 0-9, -), otherwise a new UUID.',
    schema: { type: 'string' },
  },
};
