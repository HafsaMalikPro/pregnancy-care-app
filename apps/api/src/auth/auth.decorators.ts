import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { StaffRole } from '@preconception/contracts';
import type { Request } from 'express';
import type { Owner, SessionUser } from './owner.js';

export const AUTH_REQUIREMENT = 'auth:requirement';

/**
 * - `owner` (default for every route): a registered user or an anonymous session.
 * - `user`: a registered user.
 * - `staff`: a registered user with one of the roles (administrator always passes) and, unless
 *   ADMIN_REQUIRE_MFA=false, two-factor auth enabled.
 * - `optional`: identifies the caller when credentials are sent (invalid ones still get 401),
 *   otherwise proceeds without an owner. For content that is public but entitlement-aware.
 * - `public`: no credentials.
 */
export type AuthRequirement =
  | { kind: 'public' }
  | { kind: 'optional' }
  | { kind: 'owner' }
  | { kind: 'user' }
  | { kind: 'staff'; roles: StaffRole[] };

export const Public = () =>
  SetMetadata(AUTH_REQUIREMENT, { kind: 'public' } satisfies AuthRequirement);

export const OptionalAuth = () =>
  SetMetadata(AUTH_REQUIREMENT, { kind: 'optional' } satisfies AuthRequirement);

/** The owner when credentials were sent, otherwise undefined. For @OptionalAuth() routes. */
export const MaybeOwner = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Owner | undefined =>
    ctx.switchToHttp().getRequest<Request>().owner,
);

export const UserOnly = () =>
  SetMetadata(AUTH_REQUIREMENT, { kind: 'user' } satisfies AuthRequirement);

export const Staff = (...roles: StaffRole[]) =>
  SetMetadata(AUTH_REQUIREMENT, {
    kind: 'staff',
    roles,
  } satisfies AuthRequirement);

/** The resolved owner. Only valid on routes that are not @Public(). */
export const CurrentOwner = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Owner => {
    const owner = ctx.switchToHttp().getRequest<Request>().owner;
    if (!owner) throw new Error('CurrentOwner used on a public route');
    return owner;
  },
);

/** The registered user. Only valid on @UserOnly() or @Staff() routes. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser => {
    const owner = ctx.switchToHttp().getRequest<Request>().owner;
    if (owner?.kind !== 'user') throw new Error('CurrentUser needs @UserOnly');
    return owner.user;
  },
);
