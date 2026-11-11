import {
  FieldCipher,
  type FieldCipherService,
} from '../database/field-cipher.js';
import { ConflictException } from '@nestjs/common';
import { fakePrisma } from '../../test/support/fake-prisma.js';
import type { AuditService } from '../audit/audit.service.js';
import type { Owner } from '../auth/owner.js';
import { EXPORT_FORMAT, PrivacyService } from './privacy.service.js';

const user: Owner = {
  kind: 'user',
  id: 'u1',
  user: {
    id: 'u1',
    email: 'a@example.test',
    name: 'A',
    emailVerified: true,
    staffRole: null,
    twoFactorEnabled: false,
    status: 'active',
  },
};
const guest: Owner = { kind: 'anonymous', id: 'g1', expiresAt: new Date() };

function setup(overrides: Parameters<typeof fakePrisma>[0] = {}) {
  const { prisma, model } = fakePrisma(overrides);
  const audit = {
    record: vi.fn().mockResolvedValue(undefined),
    subjectRef: (id: string) => `sub_${id}`,
  };
  const service = new PrivacyService(
    prisma,
    audit as unknown as AuditService,
    new FieldCipher(new Map(), null) as FieldCipherService,
  );
  return { service, model, audit };
}

describe('PrivacyService.export', () => {
  it('records a completed job and an audit event for a user', async () => {
    const { service, model, audit } = setup();
    const bundle = await service.export(user, 'req-1');
    expect(bundle).toMatchObject({
      format: EXPORT_FORMAT,
      account: { kind: 'user', id: 'u1', email: 'a@example.test' },
      profile: null,
      pregnancies: [],
    });
    expect(model('privacyJob').create).toHaveBeenCalledWith({
      data: { userId: 'u1', kind: 'export', status: 'processing' },
    });
    expect(model('privacyJob').update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'privacy.export',
        targetId: 'u1',
        requestId: 'req-1',
      }),
    );
  });

  it('marks the job failed (not stuck in processing) when a read fails (regression)', async () => {
    const boom = new Error('connection lost');
    const { service, model, audit } = setup({
      dailyLog: { findMany: vi.fn().mockRejectedValue(boom) },
    });
    await expect(service.export(user)).rejects.toBe(boom);
    const updates = model('privacyJob').update.mock.calls.map(
      (c) => (c[0] as { data: { status: string } }).data.status,
    );
    expect(updates).toEqual(['failed']);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('still reports the original error if marking the job failed also fails', async () => {
    const boom = new Error('read failed');
    const { service } = setup({
      cycle: { findMany: vi.fn().mockRejectedValue(boom) },
      privacyJob: {
        update: vi.fn().mockRejectedValue(new Error('write failed')),
      },
    });
    await expect(service.export(user)).rejects.toBe(boom);
  });

  it('creates no job for a guest, and exports only the guest’s owner scope', async () => {
    const { service, model } = setup();
    const bundle = await service.export(guest);
    expect(bundle.account).toEqual({ kind: 'anonymous', id: 'g1' });
    expect(model('privacyJob').create).not.toHaveBeenCalled();
    expect(model('dailyLog').findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { anonymousSessionId: 'g1' } }),
    );
    expect(model('subscription').findMany).not.toHaveBeenCalled();
  });

  it('maps stored rows to the export shape, with dates as calendar days', async () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    const { service } = setup({
      pregnancy: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            status: 'ended',
            dueDate: d('2026-08-01'),
            datingMethod: 'lmp',
            firstPregnancy: true,
            fetusCount: 'one',
            confirmedByClinician: null,
            restrictExercise: false,
            foodRestrictions: ['dairy'],
            clinicianNutritionPlan: false,
            outcome: 'birth',
            endedOn: d('2026-07-30'),
            datings: [
              {
                method: 'lmp',
                source: 'self',
                inputs: { method: 'lmp', lmpDate: '2025-10-25' },
                dueDate: d('2026-08-01'),
                createdAt: new Date('2025-11-01T10:00:00Z'),
              },
            ],
          },
        ]),
      },
      birthPreferences: {
        findMany: vi.fn().mockResolvedValue([
          {
            pregnancyId: 'p1',
            birthSetting: 'hospital',
            painRelief: [],
            supportPeople: ['partner'],
            feedingIntention: null,
            notes: null,
          },
        ]),
      },
    });
    const bundle = await service.export(user);
    expect(bundle.pregnancies[0]).toMatchObject({
      dueDate: '2026-08-01',
      endedOn: '2026-07-30',
      outcome: 'birth',
      datingHistory: [
        { dueDate: '2026-08-01', recordedAt: '2025-11-01T10:00:00.000Z' },
      ],
      birthPreferences: {
        birthSetting: 'hospital',
        supportPeople: ['partner'],
      },
    });
  });
});

describe('PrivacyService.deleteAccount', () => {
  it('refuses staff accounts and former reviewers', async () => {
    for (const row of [
      { staffRole: 'support', _count: { contentReviews: 0 } },
      { staffRole: null, _count: { contentReviews: 2 } },
    ]) {
      const { service, model } = setup({
        user: { findUniqueOrThrow: vi.fn().mockResolvedValue(row) },
      });
      await expect(service.deleteAccount('u1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(model('user').delete).toBeUndefined();
    }
  });

  it('deletes linked guest sessions and the user, and completes the job', async () => {
    const del = vi.fn().mockResolvedValue({});
    const { service, model, audit } = setup({
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          staffRole: null,
          _count: { contentReviews: 0 },
        }),
        delete: del,
      },
      anonymousSession: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    });
    await service.deleteAccount('u1', 'r1');
    expect(model('anonymousSession').deleteMany).toHaveBeenCalledWith({
      where: { linkedUserId: 'u1' },
    });
    expect(del).toHaveBeenCalledWith({ where: { id: 'u1' } });
    // Audit references are cleared, not deleted.
    expect(model('auditEvent').updateMany).toHaveBeenCalledWith({
      where: { actorUserId: 'u1' },
      data: { actorUserId: null },
    });
    expect(model('auditEvent').updateMany).toHaveBeenCalledWith({
      where: { targetId: 'u1' },
      data: { targetId: null },
    });
    expect(model('privacyJob').update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'account.deleted',
        metadata: { subjectRef: 'sub_u1' },
      }),
      expect.anything(),
    );
  });
});
