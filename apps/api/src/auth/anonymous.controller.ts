import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AnonymousSessionCreated,
  Platform,
} from '@preconception/contracts';
import { IsIn, IsString, Matches } from 'class-validator';
import type { Request } from 'express';
import { ApiErrors, ApiOwnerAuth, ApiUserAuth } from '../common/swagger.js';
import {
  type LinkResult,
  AnonymousSessionService,
} from './anonymous.service.js';
import {
  CurrentOwner,
  CurrentUser,
  Public,
  UserOnly,
} from './auth.decorators.js';
import type { Owner, SessionUser } from './owner.js';

class CreateAnonymousSessionDto {
  @ApiProperty({ enum: Platform.options, example: 'ios' })
  @IsIn(Platform.options)
  platform: Platform;
}

class AnonymousSessionCreatedDto implements AnonymousSessionCreated {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    description:
      'Shown once. Store in platform-secure storage and send as `Authorization: Anonymous <secret>`.',
    example: 'q4Zs2b1x0Jm9Rk3t7YwV8nC6dP5eH2aL4gU1iO0sT9f',
  })
  secret: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt: string;
}

class LinkAnonymousSessionDto {
  @ApiProperty({ description: 'The anonymous secret held by this device.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/, { message: 'secret is malformed' })
  secret: string;
}

class LinkResultDto implements LinkResult {
  @ApiProperty() pregnancies: number;
  @ApiProperty() cycles: number;
  @ApiProperty() dailyLogs: number;
  @ApiProperty() taskProgress: number;
  @ApiProperty() consentRecords: number;
  @ApiProperty() reminders: number;
  @ApiProperty({
    description: 'False when the account already had a profile (kept).',
  })
  profile: boolean;
}

@ApiTags('identity')
@Controller('anonymous-sessions')
export class AnonymousSessionController {
  constructor(private readonly sessions: AnonymousSessionService) {}

  @Post()
  @Public('Starting a guest session is how a visitor gets credentials')
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Start anonymous use',
    description:
      'Creates an installation-scoped anonymous session. Only a hash of the secret is stored. Limited to 10 per hour per IP.',
  })
  @ApiCreatedResponse({ type: AnonymousSessionCreatedDto })
  @ApiErrors(400, 429)
  create(
    @Body() dto: CreateAnonymousSessionDto,
  ): Promise<AnonymousSessionCreated> {
    return this.sessions.create(dto.platform);
  }

  @Delete('current')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'Delete this anonymous session and all its data',
    description: 'Irreversible. Requires anonymous credentials.',
  })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiErrors(403)
  async deleteCurrent(
    @CurrentOwner() owner: Owner,
    @Req() req: Request,
  ): Promise<void> {
    if (owner.kind !== 'anonymous') {
      throw new ForbiddenException(
        'Use account deletion for registered accounts.',
      );
    }
    await this.sessions.delete(owner.id, req.requestId);
  }

  @Post('link')
  @UserOnly()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiUserAuth()
  @ApiOperation({
    summary: 'Move anonymous data into the signed-in account',
    description:
      'Moves pregnancies, cycles, daily logs, task progress, consent history, reminders and (if the account has none) the profile. Rejected with 409 `ACCOUNT_HAS_HEALTH_DATA` when the account already has health data; nothing moves and the anonymous secret keeps working, so clients can offer to keep using the guest session or export it. After a successful link the anonymous secret stops working.',
  })
  @ApiOkResponse({ type: LinkResultDto })
  @ApiErrors(400, 404, 409)
  link(
    @CurrentUser() user: SessionUser,
    @Body() dto: LinkAnonymousSessionDto,
    @Req() req: Request,
  ): Promise<LinkResult> {
    return this.sessions.link(user.id, dto.secret, req.requestId);
  }
}
