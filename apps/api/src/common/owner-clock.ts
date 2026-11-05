import { Injectable } from '@nestjs/common';
import { todayInZone } from '@preconception/utils';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { PrismaService } from '../database/prisma.service.js';

/** "Today" in the owner's profile time zone (UTC when no profile exists). */
@Injectable()
export class OwnerClock {
  constructor(private readonly prisma: PrismaService) {}

  async today(owner: Owner, now = new Date()): Promise<string> {
    const profile = await this.prisma.profile.findFirst({
      where: ownerWhere(owner),
      select: { timeZone: true },
    });
    return todayInZone(profile?.timeZone ?? 'UTC', now);
  }
}
