import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { type Entitlement, EntitlementStatus } from '@preconception/contracts';
import { CurrentOwner } from '../auth/auth.decorators.js';
import type { Owner } from '../auth/owner.js';
import { ApiOwnerAuth } from '../common/swagger.js';
import { EntitlementsService } from './entitlements.service.js';

class EntitlementDto implements Entitlement {
  @ApiProperty()
  premium: boolean;

  @ApiProperty({ enum: EntitlementStatus.options })
  status: EntitlementStatus;

  @ApiProperty({ nullable: true, type: String, format: 'date-time' })
  expiresAt: string | null;
}

@ApiTags('entitlements')
@Controller('me/entitlement')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get()
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'Premium entitlement',
    description:
      'Derived from server-verified subscriptions only. Anonymous sessions always get `none`.',
  })
  @ApiOkResponse({ type: EntitlementDto })
  get(@CurrentOwner() owner: Owner): Promise<Entitlement> {
    return this.entitlements.forOwner(owner);
  }
}
