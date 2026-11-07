import { fakePrisma } from '../../test/support/fake-prisma.js';
import type { Owner } from '../auth/owner.js';
import { CodedForbiddenException } from '../common/errors.js';
import { ConsentService } from './consent.service.js';

const guest: Owner = { kind: 'anonymous', id: 'g1', expiresAt: new Date() };
const row = (granted: boolean, purpose = 'health_data_processing') => ({
  purpose,
  granted,
  policyVersion: '2026-10-01',
  createdAt: new Date('2026-10-02T00:00:00Z'),
});

describe('ConsentService', () => {
  it('reports every purpose as not granted when nothing was recorded', async () => {
    const { prisma } = fakePrisma();
    const states = await new ConsentService(prisma).current(guest);
    expect(states.map((s) => s.purpose).sort()).toEqual([
      'health_data_processing',
      'marketing_email',
      'product_analytics',
    ]);
    for (const s of states) {
      expect(s).toMatchObject({
        granted: false,
        policyVersion: null,
        updatedAt: null,
      });
    }
  });

  it('uses only the newest record for a purpose', async () => {
    const findFirst = vi.fn().mockResolvedValue(row(false));
    const { prisma } = fakePrisma({ consentRecord: { findFirst } });
    await expect(
      new ConsentService(prisma).assertHealthDataConsent(guest),
    ).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { anonymousSessionId: 'g1', purpose: 'health_data_processing' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('allows health writes when the newest record grants consent', async () => {
    const { prisma } = fakePrisma({
      consentRecord: { findFirst: vi.fn().mockResolvedValue(row(true)) },
    });
    await expect(
      new ConsentService(prisma).assertHealthDataConsent(guest),
    ).resolves.toBeUndefined();
  });

  it('throws a coded 403 so clients can tell consent from other refusals', async () => {
    const { prisma } = fakePrisma();
    const err = await new ConsentService(prisma)
      .assertHealthDataConsent(guest)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CodedForbiddenException);
    expect((err as CodedForbiddenException).getStatus()).toBe(403);
  });

  it('records a new row (append-only) scoped to the owner', async () => {
    const create = vi.fn((args: { data: object }) =>
      Promise.resolve({
        ...args.data,
        createdAt: new Date('2026-10-03T00:00:00Z'),
      }),
    );
    const { prisma } = fakePrisma({ consentRecord: { create } });
    const state = await new ConsentService(prisma).record(guest, {
      purpose: 'product_analytics',
      granted: true,
      policyVersion: 'v2',
      source: 'settings',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        anonymousSessionId: 'g1',
        purpose: 'product_analytics',
        granted: true,
        policyVersion: 'v2',
        source: 'settings',
      },
    });
    expect(state).toEqual({
      purpose: 'product_analytics',
      granted: true,
      policyVersion: 'v2',
      updatedAt: '2026-10-03T00:00:00.000Z',
    });
  });
});
