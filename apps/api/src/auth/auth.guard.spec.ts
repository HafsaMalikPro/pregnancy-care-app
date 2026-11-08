import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../database/prisma.service.js';
import { hashAnonymousSecret } from './anonymous-credentials.js';
import type { AuthRequirement } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import type { Auth } from './auth.provider.js';

const SECRET = 'q4Zs2b1x0Jm9Rk3t7YwV8nC6dP5eH2aL4gU1iO0sT9f'; // gitleaks:allow (synthetic test value)

function setup(opts: {
  requirement?: AuthRequirement;
  headers?: Record<string, string>;
  sessionUser?: Record<string, unknown> | null;
  anon?: Record<string, unknown> | null;
  requireMfa?: boolean;
}) {
  const req: Record<string, unknown> = {
    headers: opts.headers ?? {},
    header: (n: string) => (opts.headers ?? {})[n.toLowerCase()],
  };
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(opts.requirement);
  const update = vi.fn();
  const findUnique = vi.fn().mockResolvedValue(opts.anon ?? null);
  const prisma = {
    anonymousSession: { findUnique, update },
  } as unknown as PrismaService;
  const config = {
    get: (k: keyof Env) =>
      ({
        ADMIN_REQUIRE_MFA: opts.requireMfa ?? true,
        ANONYMOUS_SESSION_TTL_DAYS: 180,
      })[k as string],
  } as unknown as ConfigService<Env, true>;
  const getSession = vi
    .fn()
    .mockResolvedValue(
      opts.sessionUser ? { user: opts.sessionUser, session: {} } : null,
    );
  const auth = { api: { getSession } } as unknown as Auth;
  const ctx = {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  const guard = new AuthGuard(reflector, prisma, config, auth);
  return {
    run: () => guard.canActivate(ctx),
    req,
    getSession,
    findUnique,
    update,
  };
}

const user = (extra: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'a@b.test',
  name: 'A',
  emailVerified: true,
  status: 'active',
  staffRole: null,
  twoFactorEnabled: false,
  ...extra,
});

const liveAnon = (extra: Record<string, unknown> = {}) => ({
  id: 'a1',
  expiresAt: new Date(Date.now() + 86_400_000),
  lastSeenAt: new Date(),
  linkedUserId: null,
  ...extra,
});

describe('AuthGuard', () => {
  it('lets public routes through without looking up credentials', async () => {
    const t = setup({ requirement: { kind: 'public', reason: 'test' } });
    await expect(t.run()).resolves.toBe(true);
    expect(t.getSession).not.toHaveBeenCalled();
  });

  it('defaults to requiring an owner (default deny)', async () => {
    await expect(setup({}).run()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves a user session', async () => {
    const t = setup({ sessionUser: user() });
    await expect(t.run()).resolves.toBe(true);
    expect(t.req.owner).toMatchObject({ kind: 'user', id: 'u1' });
  });

  it('rejects inactive accounts', async () => {
    await expect(
      setup({ sessionUser: user({ status: 'deleted' }) }).run(),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves an anonymous secret by hash, never by the raw value', async () => {
    const t = setup({
      headers: { authorization: `Anonymous ${SECRET}` },
      anon: liveAnon(),
    });
    await expect(t.run()).resolves.toBe(true);
    expect(t.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { credentialHash: hashAnonymousSecret(SECRET) },
      }),
    );
    expect(t.getSession).not.toHaveBeenCalled();
    expect(t.update).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', liveAnon({ expiresAt: new Date(Date.now() - 1) })],
    ['linked', liveAnon({ linkedUserId: 'u1' })],
    ['unknown', null],
  ])('rejects a %s anonymous session', async (_l, anon) => {
    const t = setup({
      headers: { authorization: `Anonymous ${SECRET}` },
      anon,
    });
    await expect(t.run()).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refreshes retention at most once a day', async () => {
    const t = setup({
      headers: { authorization: `Anonymous ${SECRET}` },
      anon: liveAnon({ lastSeenAt: new Date(Date.now() - 2 * 86_400_000) }),
    });
    await t.run();
    expect(t.update).toHaveBeenCalledOnce();
  });

  it('forbids anonymous owners on user-only routes', async () => {
    const t = setup({
      requirement: { kind: 'user' },
      headers: { authorization: `Anonymous ${SECRET}` },
      anon: liveAnon(),
    });
    await expect(t.run()).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('optional auth', () => {
    it('proceeds without an owner when no credentials are sent', async () => {
      const t = setup({ requirement: { kind: 'optional', reason: 'test' } });
      await expect(t.run()).resolves.toBe(true);
      expect(t.req.owner).toBeUndefined();
      expect(t.getSession).not.toHaveBeenCalled();
    });

    it('still rejects invalid credentials', async () => {
      const t = setup({
        requirement: { kind: 'optional', reason: 'test' },
        headers: { authorization: 'Bearer bad' },
      });
      await expect(t.run()).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('notices a session cookie', async () => {
      const t = setup({
        requirement: { kind: 'optional', reason: 'test' },
        headers: { cookie: 'theme=dark; better-auth.session_token=abc' },
        sessionUser: user(),
      });
      await t.run();
      expect(t.req.owner).toMatchObject({ kind: 'user' });
    });
  });

  describe('staff', () => {
    const staff = (role: string | null, mfa = true) =>
      user({ staffRole: role, twoFactorEnabled: mfa });

    it.each([
      ['content_editor', ['content_editor'], true],
      ['administrator', ['content_editor'], true],
      ['support', ['content_editor'], false],
      [null, ['support'], false],
    ])('%s on a route for %j → allowed=%s', async (role, roles, allowed) => {
      const t = setup({
        requirement: { kind: 'staff', roles: roles as never },
        sessionUser: staff(role),
      });
      if (allowed) await expect(t.run()).resolves.toBe(true);
      else await expect(t.run()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires two-factor auth unless disabled', async () => {
      const req = { kind: 'staff', roles: ['support'] } as AuthRequirement;
      await expect(
        setup({ requirement: req, sessionUser: staff('support', false) }).run(),
      ).rejects.toThrow(/two-factor/);
      await expect(
        setup({
          requirement: req,
          sessionUser: staff('support', false),
          requireMfa: false,
        }).run(),
      ).resolves.toBe(true);
    });
  });
});
