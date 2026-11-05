import { Controller, Get } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { type Me, StaffRole } from '@preconception/contracts';
import { ApiOwnerAuth } from '../common/swagger.js';
import { CurrentOwner } from './auth.decorators.js';
import type { Owner } from './owner.js';

class MeDto {
  @ApiProperty({ enum: ['user', 'anonymous'] })
  kind: 'user' | 'anonymous';

  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ description: 'Users only' })
  email?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Users only' })
  name?: string | null;

  @ApiPropertyOptional({ description: 'Users only' })
  emailVerified?: boolean;

  @ApiPropertyOptional({
    enum: StaffRole.options,
    nullable: true,
    description: 'Users only',
  })
  staffRole?: StaffRole | null;

  @ApiPropertyOptional({ description: 'Users only' })
  twoFactorEnabled?: boolean;

  @ApiPropertyOptional({ format: 'date-time', description: 'Anonymous only' })
  expiresAt?: string;
}

@ApiTags('identity')
@ApiExtraModels(MeDto)
@Controller('me')
export class MeController {
  @Get()
  @ApiOwnerAuth()
  @ApiOperation({
    summary: 'Who am I',
    description: 'The resolved caller: a user or an anonymous session.',
  })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentOwner() owner: Owner): Me {
    if (owner.kind === 'anonymous') {
      return {
        kind: 'anonymous',
        id: owner.id,
        expiresAt: owner.expiresAt.toISOString(),
      };
    }
    const { id, email, name, emailVerified, staffRole, twoFactorEnabled } =
      owner.user;
    return {
      kind: 'user',
      id,
      email,
      name,
      emailVerified,
      staffRole,
      twoFactorEnabled,
    };
  }
}
