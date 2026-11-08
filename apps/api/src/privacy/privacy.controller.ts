import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Equals } from 'class-validator';
import type { Request } from 'express';
import {
  CurrentOwner,
  CurrentUser,
  UserOnly,
} from '../auth/auth.decorators.js';
import type { Owner, SessionUser } from '../auth/owner.js';
import { ApiErrors, ApiOwnerAuth, ApiUserAuth } from '../common/swagger.js';
import { EXPORT_FORMAT, PrivacyService } from './privacy.service.js';

const DELETE_CONFIRMATION = 'DELETE MY ACCOUNT';

class DeleteAccountDto {
  @ApiProperty({
    example: DELETE_CONFIRMATION,
    description: 'Must match exactly',
  })
  @Equals(DELETE_CONFIRMATION, {
    message: `confirm must be "${DELETE_CONFIRMATION}"`,
  })
  confirm: string;
}

class ExportBundleDto {
  @ApiProperty({ example: EXPORT_FORMAT }) format: string;
  @ApiProperty({
    example: 2,
    description: 'Bundle format version; bumped when the shape changes',
  })
  formatVersion: number;
  @ApiProperty({ format: 'date-time' }) exportedAt: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) account: object;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  profile: object | null;
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  pregnancies: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  consentHistory: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } }) cycles: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  dailyLogs: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  readinessProgress: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  reminders: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  symptomChecks: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  kickSessions: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  contractions: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  weightEntries: object[];
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  subscriptions: object[];
}

class PrivacyJobDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['export', 'deletion'] }) kind: string;
  @ApiProperty({
    enum: ['requested', 'processing', 'completed', 'failed', 'cancelled'],
  })
  status: string;
  @ApiProperty({ format: 'date-time' }) requestedAt: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  completedAt: string | null;
}

@ApiTags('privacy')
@Controller('me')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header(
    'Content-Disposition',
    'attachment; filename="preconception-export.json"',
  )
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'Download all my data',
    description:
      'Machine-readable JSON of everything stored for the caller. Limited to 3 per hour.',
  })
  @ApiOkResponse({ type: ExportBundleDto })
  @ApiErrors(429)
  export(@CurrentOwner() owner: Owner, @Req() req: Request) {
    return this.privacy.export(owner, req.requestId);
  }

  @Post('deletion')
  @UserOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiUserAuth()
  @ApiOperation({
    summary: 'Delete my account and all its data',
    description:
      'Immediate and irreversible. Anonymous sessions use DELETE /v1/anonymous-sessions/current instead.',
  })
  @ApiNoContentResponse({ description: 'Deleted; all sessions are revoked' })
  @ApiErrors(400, 409, 429)
  async delete(
    @CurrentUser() user: SessionUser,
    @Body() _dto: DeleteAccountDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.privacy.deleteAccount(user.id, req.requestId);
  }

  @Get('privacy-jobs')
  @UserOnly()
  @ApiUserAuth()
  @ApiOperation({ summary: 'My export history' })
  @ApiOkResponse({ type: [PrivacyJobDto] })
  async jobs(@CurrentUser() user: SessionUser): Promise<PrivacyJobDto[]> {
    const rows = await this.privacy.listJobs(user.id);
    return rows.map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      requestedAt: j.requestedAt.toISOString(),
      completedAt: j.completedAt?.toISOString() ?? null,
    }));
  }
}
