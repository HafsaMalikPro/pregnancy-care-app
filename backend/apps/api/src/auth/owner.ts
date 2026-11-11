import type { StaffRole } from '@preconception/contracts';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  staffRole: StaffRole | null;
  twoFactorEnabled: boolean;
  status: string;
}

/**
 * Who a request acts for. Every user-owned row belongs to exactly one owner: a registered
 * user or an anonymous session (enforced by CHECK constraints). Never taken from the client.
 */
export type Owner =
  | { kind: 'user'; id: string; user: SessionUser }
  | { kind: 'anonymous'; id: string; expiresAt: Date };

/** Prisma `where` fragment that scopes a query to the owner's rows. */
export function ownerWhere(
  owner: Owner,
): { userId: string } | { anonymousSessionId: string } {
  return owner.kind === 'user'
    ? { userId: owner.id }
    : { anonymousSessionId: owner.id };
}

declare module 'express' {
  interface Request {
    owner?: Owner;
  }
}
