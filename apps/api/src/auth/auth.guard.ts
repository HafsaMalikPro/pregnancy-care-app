import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@preconception/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import type { Env } from '../config/env.js';
import {
  SECURITY_EVENTS,
  SecurityEventsService,
} from '../audit/security-events.service.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  hashAnonymousSecret,
  parseAnonymousAuthorization,
} from './anonymous-credentials.js';
import { AUTH_REQUIREMENT, type AuthRequirement } from './auth.decorators.js';
import { AUTH, type Auth } from './auth.provider.js';
import type { Owner, SessionUser } from './owner.js';

const DAY_MS = 86_400_000;

/**
 * Global, default-deny guard. Resolves `req.owner` from either a Better Auth session (cookie
 * or `Authorization: Bearer`) or `Authorization: Anonymous <secret>`, then applies the
 * route's AuthRequirement. Routes must opt out explicitly with @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly security: SecurityEventsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<AuthRequirement>(
      AUTH_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    ) ?? { kind: 'owner' };
    if (requirement.kind === 'public') return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (requirement.kind === 'optional' && !hasCredentials(req)) return true;
    const owner = await this.resolveOwner(req);
    if (!owner) throw new UnauthorizedException('Authentication required.');
    req.owner = owner;

    if (requirement.kind === 'owner' || requirement.kind === 'optional') {
      return true;
    }
    if (owner.kind !== 'user') {
      if (requirement.kind === 'staff')
        this.denied(req, null, 'not_an_account');
      throw new ForbiddenException('A registered account is required.');
    }
    if (requirement.kind === 'staff') {
      try {
        this.assertStaff(owner.user, requirement.roles);
      } catch (err) {
        this.denied(
          req,
          owner.user,
          owner.user.staffRole && !owner.user.twoFactorEnabled
            ? 'two_factor_required'
            : 'role',
        );
        throw err;
      }
    }
    return true;
  }

  private async resolveOwner(req: Request): Promise<Owner | null> {
    const authorization = req.header('authorization');
    if (authorization?.trimStart().startsWith('Anonymous')) {
      const secret = parseAnonymousAuthorization(authorization);
      return secret ? this.resolveAnonymous(secret) : null;
    }

    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session) return null;
    const u = session.user as typeof session.user & {
      staffRole?: string | null;
      status?: string | null;
      twoFactorEnabled?: boolean | null;
    };
    if (u.status && u.status !== 'active') return null;
    return {
      kind: 'user',
      id: u.id,
      user: {
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        emailVerified: u.emailVerified,
        staffRole: (u.staffRole ?? null) as StaffRole | null,
        twoFactorEnabled: u.twoFactorEnabled ?? false,
        status: u.status ?? 'active',
      },
    };
  }

  private async resolveAnonymous(secret: string): Promise<Owner | null> {
    const session = await this.prisma.anonymousSession.findUnique({
      where: { credentialHash: hashAnonymousSecret(secret) },
      select: {
        id: true,
        expiresAt: true,
        lastSeenAt: true,
        linkedUserId: true,
      },
    });
    const now = Date.now();
    // A linked session's data now belongs to the account; the old secret stops working.
    if (
      !session ||
      session.linkedUserId ||
      session.expiresAt.getTime() <= now
    ) {
      return null;
    }
    let expiresAt = session.expiresAt;
    // Sliding retention, written at most once a day rather than on every request.
    if (now - session.lastSeenAt.getTime() > DAY_MS) {
      const ttlDays = this.config.get('ANONYMOUS_SESSION_TTL_DAYS', {
        infer: true,
      });
      expiresAt = new Date(now + ttlDays * DAY_MS);
      await this.prisma.anonymousSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now), expiresAt },
      });
    }
    return { kind: 'anonymous', id: session.id, expiresAt };
  }

  private denied(
    req: Request,
    user: SessionUser | null,
    reason: 'role' | 'two_factor_required' | 'not_an_account',
  ): void {
    this.security.record(SECURITY_EVENTS.staffAccessDenied, {
      actorUserId: user?.id ?? null,
      actorRole: user?.staffRole ?? null,
      requestId: req.requestId,
      ip: req.ip ?? null,
      metadata: {
        route: `${req.method} ${req.route?.path ?? 'unmatched'}`,
        reason,
      },
    });
  }

  private assertStaff(user: SessionUser, roles: StaffRole[]): void {
    const role = user.staffRole;
    if (!role || (role !== 'administrator' && !roles.includes(role))) {
      throw new ForbiddenException('This action requires a staff role.');
    }
    if (
      this.config.get('ADMIN_REQUIRE_MFA', { infer: true }) &&
      !user.twoFactorEnabled
    ) {
      throw new ForbiddenException(
        'Staff actions require two-factor authentication.',
      );
    }
  }
}

/** Credentials Better Auth or the anonymous scheme could resolve. */
function hasCredentials(req: Request): boolean {
  return (
    Boolean(req.header('authorization')) ||
    /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(
      req.header('cookie') ?? '',
    )
  );
}
