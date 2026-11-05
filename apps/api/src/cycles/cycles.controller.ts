import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CycleEntry,
  type CycleEstimate,
  EstimateConfidence,
  type PageInfo,
} from '@preconception/contracts';
import { IsOptional, ValidateIf } from 'class-validator';
import { CurrentOwner } from '../auth/auth.decorators.js';
import type { Owner } from '../auth/owner.js';
import { IsCalendarDate } from '../common/dates.js';
import { PageInfoDto, PageQueryDto } from '../common/pagination.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { CyclesService } from './cycles.service.js';
import { ESTIMATE_METHOD } from './estimate.js';

class CreateCycleDto {
  @ApiProperty({ example: '2026-09-28', format: 'date' })
  @IsCalendarDate()
  periodStart: string;

  @ApiPropertyOptional({
    example: '2026-10-02',
    format: 'date',
    nullable: true,
    description:
      'Omit or null while the period is ongoing. At most 30 days after start.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsCalendarDate()
  periodEnd?: string | null;
}

class UpdateCycleDto {
  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsCalendarDate()
  periodStart?: string;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    description: 'null clears the end date',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsCalendarDate()
  periodEnd?: string | null;
}

class CycleEntryDto implements CycleEntry {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date' }) periodStart: string;
  @ApiProperty({ format: 'date', nullable: true, type: String }) periodEnd:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

class CyclePageDto {
  @ApiProperty({ type: [CycleEntryDto] }) items: CycleEntryDto[];
  @ApiProperty({ type: PageInfoDto }) page: PageInfo;
}

class DateWindowDto {
  @ApiProperty({ format: 'date' }) earliest: string;
  @ApiProperty({ format: 'date' }) latest: string;
}

class CycleEstimateDto implements CycleEstimate {
  @ApiProperty({
    example: ESTIMATE_METHOD,
    description: 'Versioned calculation identifier',
  })
  method: string;

  @ApiProperty({ enum: EstimateConfidence.options })
  confidence: EstimateConfidence;

  @ApiProperty({ type: DateWindowDto, nullable: true })
  nextPeriodWindow: DateWindowDto | null;

  @ApiProperty({ description: 'Complete cycles used in the calculation' })
  cyclesUsed: number;

  @ApiProperty({
    type: [String],
    description:
      'Plain-language limitations. Clients must display them with every estimate.',
  })
  limitations: string[];
}

@ApiTags('cycles')
@ApiOwnerAuth()
@Controller('cycles')
export class CyclesController {
  constructor(private readonly cycles: CyclesService) {}

  @Get()
  @ApiOperation({ summary: 'List recorded periods, newest first' })
  @ApiOkResponse({ type: CyclePageDto })
  @ApiErrors(400)
  list(@CurrentOwner() owner: Owner, @Query() query: PageQueryDto) {
    return this.cycles.list(owner, query);
  }

  @Get('estimate')
  @ApiOperation({
    summary: 'Next-period estimate',
    description:
      'Calendar average of up to the last 6 complete cycles. Never estimates ovulation or fertility. Always returns limitations to display.',
  })
  @ApiOkResponse({ type: CycleEstimateDto })
  estimate(@CurrentOwner() owner: Owner): Promise<CycleEstimate> {
    return this.cycles.estimate(owner);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one period' })
  @ApiOkResponse({ type: CycleEntryDto })
  @ApiErrors(400, 404)
  get(@CurrentOwner() owner: Owner, @Param('id', ParseUUIDPipe) id: string) {
    return this.cycles.get(owner, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Record a period',
    description:
      'Requires health_data_processing consent. Rejected with 409 if it overlaps an existing period (edit that one instead) and 400 for future dates or a range over 30 days.',
  })
  @ApiCreatedResponse({ type: CycleEntryDto })
  @ApiErrors(400, 403, 409)
  create(@CurrentOwner() owner: Owner, @Body() dto: CreateCycleDto) {
    return this.cycles.create(owner, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Correct a period',
    description: 'Requires health_data_processing consent.',
  })
  @ApiOkResponse({ type: CycleEntryDto })
  @ApiErrors(400, 403, 404, 409)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCycleDto,
  ) {
    return this.cycles.update(owner, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a period' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(400, 404)
  async remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.cycles.remove(owner, id);
  }
}
