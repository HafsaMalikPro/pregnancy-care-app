import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from '@preconception/contracts';

/** OpenAPI mirrors of the health responses. Documentation only. */
export class LivenessDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status: 'ok';
}

export class ReadinessDto implements HealthResponse {
  @ApiProperty({ enum: ['ok', 'degraded'], example: 'ok' })
  status: HealthResponse['status'];

  @ApiProperty({ enum: ['up', 'down'], example: 'up' })
  database: HealthResponse['database'];
}
