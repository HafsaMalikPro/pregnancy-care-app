import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { ConsentPurpose, type ConsentState } from '@preconception/contracts';
import { IsBoolean, IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { CurrentOwner } from '../auth/auth.decorators.js';
import type { Owner } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth } from '../common/swagger.js';
import { ThrottleWrite } from '../common/throttle.js';
import { ConsentService } from './consent.service.js';

class RecordConsentDto {
  @ApiProperty({ enum: ConsentPurpose.options })
  @IsIn(ConsentPurpose.options)
  purpose: ConsentPurpose;

  @ApiProperty()
  @IsBoolean()
  granted: boolean;

  @ApiProperty({
    example: '2026-10-01',
    description: 'Version of the policy shown to the person',
  })
  @IsString()
  @MaxLength(32)
  policyVersion: string;

  @ApiProperty({
    example: 'onboarding',
    description: 'Where consent was captured (snake_case)',
  })
  @Matches(/^[a-z][a-z_]{1,39}$/)
  source: string;
}

class ConsentStateDto implements ConsentState {
  @ApiProperty({ enum: ConsentPurpose.options })
  purpose: ConsentPurpose;

  @ApiProperty({ description: 'False when never recorded' })
  granted: boolean;

  @ApiProperty({ nullable: true, type: String })
  policyVersion: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  updatedAt: string | null;
}

@ApiTags('consent')
@ApiOwnerAuth()
@Controller('me/consents')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get()
  @ApiOperation({ summary: 'Current consent state for every purpose' })
  @ApiOkResponse({ type: [ConsentStateDto] })
  current(@CurrentOwner() owner: Owner): Promise<ConsentState[]> {
    return this.consent.current(owner);
  }

  @Post()
  @ThrottleWrite('consentChange')
  @ApiOperation({
    summary: 'Grant or withdraw consent',
    description:
      'Appends to the consent history. `health_data_processing` must be granted before cycles, daily logs or task notes can be saved. Withdrawing it blocks new writes; existing data is kept until the person deletes it.',
  })
  @ApiCreatedResponse({ type: ConsentStateDto })
  @ApiErrors(400)
  record(
    @CurrentOwner() owner: Owner,
    @Body() dto: RecordConsentDto,
  ): Promise<ConsentState> {
    return this.consent.record(owner, dto);
  }
}
