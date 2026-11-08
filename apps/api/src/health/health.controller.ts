import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse } from '@preconception/contracts';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { REQUEST_ID_RESPONSE_HEADER } from '../common/dto/api-error.dto.js';
import { REQUEST_ID_HEADER } from '../common/middleware/request-id.middleware.js';
import { PrismaService } from '../database/prisma.service.js';
import { LivenessDto, ReadinessDto } from './health.dto.js';

@ApiTags('health')
@ApiHeader({
  name: REQUEST_ID_HEADER,
  required: false,
  description:
    'Optional upstream correlation id; echoed back when well-formed.',
})
@Public('Liveness and readiness probes for the load balancer; status only')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: the process is up. */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Returns 200 while the process can serve HTTP. Touches no dependencies. Public, not rate limited.',
  })
  @ApiOkResponse({
    description: 'Process is alive',
    type: LivenessDto,
    headers: REQUEST_ID_RESPONSE_HEADER,
  })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies are reachable. Returns 503 when the database is down. */
  @Get()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Runs `SELECT 1` against PostgreSQL (bounded by a timeout). Public, not rate limited.',
  })
  @ApiOkResponse({
    description: 'Ready',
    type: ReadinessDto,
    headers: REQUEST_ID_RESPONSE_HEADER,
  })
  @ApiServiceUnavailableResponse({
    description: 'Database unreachable or did not answer in time',
    type: ReadinessDto,
    headers: REQUEST_ID_RESPONSE_HEADER,
    example: { status: 'degraded', database: 'down' },
  })
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const dbUp = await this.prisma.isHealthy();
    if (!dbUp) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: dbUp ? 'ok' : 'degraded', database: dbUp ? 'up' : 'down' };
  }
}
