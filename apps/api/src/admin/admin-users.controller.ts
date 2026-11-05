import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Staff } from '../auth/auth.decorators.js';
import type { SessionUser } from '../auth/owner.js';
import { pageInfo } from '../common/pagination.js';
import { ApiErrors, ApiUserAuth } from '../common/swagger.js';
import { PrismaService } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import {
  AdminUserDto,
  AdminUserPageDto,
  AuditPageDto,
  AuditQueryDto,
  SetStaffRoleDto,
  UserLookupQueryDto,
} from './admin.dto.js';

/** Support tooling deliberately exposes account metadata only, never health records. */
@ApiTags('admin')
@ApiUserAuth()
@ApiErrors(403)
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @Staff('support')
  @ApiOperation({
    summary: 'Look up accounts',
    description: 'Roles: support, administrator. No health data is returned.',
  })
  @ApiOkResponse({ type: AdminUserPageDto })
  @ApiErrors(400)
  async users(@Query() q: UserLookupQueryDto) {
    const where = {
      ...(q.email && { email: q.email.toLowerCase() }),
      ...(q.staffOnly === 'true' && { staffRole: { not: null } }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toAdminUser), page: pageInfo(q, total) };
  }

  @Patch('users/:id/staff-role')
  @Staff('administrator')
  @ApiOperation({
    summary: 'Grant, change or remove a staff role',
    description: 'Administrator only. Cannot change your own role. Audited.',
  })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiErrors(400, 404)
  async setRole(
    @CurrentUser() actor: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStaffRoleDto,
    @Req() req: Request,
  ) {
    if (id === actor.id)
      throw new ForbiddenException('You cannot change your own role.');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { staffRole: dto.staffRole },
      });
      // Role changes take effect immediately: existing sessions must sign in again.
      await tx.authSession.deleteMany({ where: { userId: id } });
      await this.audit.record(
        {
          action: 'user.staff_role_changed',
          actorUserId: actor.id,
          actorRole: actor.staffRole,
          targetType: 'user',
          targetId: id,
          requestId: req.requestId,
          metadata: { from: existing.staffRole, to: dto.staffRole },
        },
        tx,
      );
      return updated;
    });
    return toAdminUser(user);
  }

  @Get('audit-events')
  @Staff('administrator')
  @ApiOperation({
    summary: 'Security audit trail',
    description: 'Administrator only.',
  })
  @ApiOkResponse({ type: AuditPageDto })
  @ApiErrors(400)
  async auditEvents(@Query() q: AuditQueryDto) {
    const where = {
      ...(q.action && { action: q.action }),
      ...(q.actorUserId && { actorUserId: q.actorUserId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit,
        skip: q.offset,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);
    return { items, page: pageInfo(q, total) };
  }
}

function toAdminUser(u: User): AdminUserDto {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status,
    staffRole: u.staffRole,
    twoFactorEnabled: u.twoFactorEnabled,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt.toISOString(),
  };
}
