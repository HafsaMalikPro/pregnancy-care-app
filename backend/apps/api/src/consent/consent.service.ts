import { Injectable } from '@nestjs/common';
import { ConsentPurpose, type ConsentState } from '@preconception/contracts';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { consentRequired } from '../common/errors.js';
import { PrismaService } from '../database/prisma.service.js';

export interface ConsentInput {
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string;
  source: string;
}

/** Consent history is append-only; the current state of a purpose is its newest row. */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async current(owner: Owner): Promise<ConsentState[]> {
    return Promise.all(
      ConsentPurpose.options.map(async (purpose) => {
        const latest = await this.latest(owner, purpose);
        return {
          purpose,
          granted: latest?.granted ?? false,
          policyVersion: latest?.policyVersion ?? null,
          updatedAt: latest?.createdAt.toISOString() ?? null,
        };
      }),
    );
  }

  async record(owner: Owner, input: ConsentInput): Promise<ConsentState> {
    const row = await this.prisma.consentRecord.create({
      data: { ...ownerWhere(owner), ...input },
    });
    return {
      purpose: row.purpose,
      granted: row.granted,
      policyVersion: row.policyVersion,
      updatedAt: row.createdAt.toISOString(),
    };
  }

  /** Throws CONSENT_REQUIRED unless health_data_processing is currently granted. */
  async assertHealthDataConsent(owner: Owner): Promise<void> {
    if (!(await this.hasHealthDataConsent(owner))) throw consentRequired();
  }

  /** Whether health_data_processing is currently granted (for writes that must not fail). */
  async hasHealthDataConsent(owner: Owner): Promise<boolean> {
    const latest = await this.latest(owner, 'health_data_processing');
    return latest?.granted ?? false;
  }

  private latest(owner: Owner, purpose: ConsentPurpose) {
    return this.prisma.consentRecord.findFirst({
      where: { ...ownerWhere(owner), purpose },
      orderBy: { createdAt: 'desc' },
    });
  }
}
