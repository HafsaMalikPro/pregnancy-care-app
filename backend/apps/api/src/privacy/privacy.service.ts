import {
  ENCRYPTED_COLUMNS,
  FieldCipherService,
} from '../database/field-cipher.js';
import { ConflictException, Injectable } from '@nestjs/common';
import { EXPORT_FORMAT_VERSION } from '@preconception/contracts';
import { AuditService } from '../audit/audit.service.js';
import { type Owner, ownerWhere } from '../auth/owner.js';
import { toIsoDate } from '../common/dates.js';
import { PrismaService } from '../database/prisma.service.js';

/**
 * Bundle format. v2 (2026-11-07) adds formatVersion, symptom checks, kick-count sessions,
 * contractions, weight entries, quiet hours, the weight opt-in and kick thresholds.
 */
export const EXPORT_FORMAT = `preconception-export@${EXPORT_FORMAT_VERSION}`;

/**
 * Exports are assembled synchronously: one person's records are small and bounded. Move this
 * to a queue + worker (SCALABILITY_REVIEW §5) if exports grow to include large attachments.
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cipher: FieldCipherService,
  ) {}

  async export(owner: Owner, requestId?: string) {
    const job =
      owner.kind === 'user'
        ? await this.prisma.privacyJob.create({
            data: { userId: owner.id, kind: 'export', status: 'processing' },
          })
        : null;
    try {
      const bundle = await this.buildBundle(owner);
      if (job) {
        await this.prisma.privacyJob.update({
          where: { id: job.id },
          data: { status: 'completed', completedAt: new Date() },
        });
      }
      await this.audit.record({
        action: 'privacy.export',
        actorUserId: owner.kind === 'user' ? owner.id : null,
        targetType: owner.kind === 'user' ? 'user' : 'anonymous_session',
        targetId: owner.id,
        requestId,
      });
      return bundle;
    } catch (error) {
      // Never leave the job looking in progress: the user's export history must say it failed.
      if (job) {
        await this.prisma.privacyJob
          .update({
            where: { id: job.id },
            data: { status: 'failed', completedAt: new Date() },
          })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  private async buildBundle(owner: Owner) {
    const where = ownerWhere(owner);
    const [
      profile,
      pregnancies,
      consents,
      cycles,
      dailyLogs,
      progress,
      reminders,
      subscriptions,
      appointments,
      mealLogs,
      activityLogs,
      saved,
      shopping,
      planCompletions,
      symptomChecks,
      kickSessions,
      contractions,
      weightEntries,
    ] = await Promise.all([
      this.prisma.profile.findFirst({ where }),
      this.prisma.pregnancy.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: { datings: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.consentRecord.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.cycle.findMany({ where, orderBy: { periodStart: 'asc' } }),
      this.prisma.dailyLog.findMany({ where, orderBy: { date: 'asc' } }),
      this.prisma.userTaskProgress.findMany({
        where,
        include: { task: { select: { key: true } } },
      }),
      this.prisma.reminder.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          deliveries: {
            orderBy: { scheduledFor: 'desc' },
            take: 100,
            select: { scheduledFor: true, status: true, sentAt: true },
          },
        },
      }),
      owner.kind === 'user'
        ? this.prisma.subscription.findMany({ where: { userId: owner.id } })
        : Promise.resolve([]),
      this.prisma.appointment.findMany({ where, orderBy: { startsAt: 'asc' } }),
      this.prisma.mealLog.findMany({ where, orderBy: { date: 'asc' } }),
      this.prisma.activityLog.findMany({ where, orderBy: { date: 'asc' } }),
      this.prisma.savedContent.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.shoppingItem.findMany({ where, orderBy: { name: 'asc' } }),
      this.prisma.planTaskCompletion.findMany({
        where,
        orderBy: { date: 'asc' },
      }),
      this.prisma.symptomCheck.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.kickSession.findMany({
        where,
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.contraction.findMany({
        where,
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.weightEntry.findMany({ where, orderBy: { date: 'asc' } }),
    ]);
    const birthPreferences = await this.prisma.birthPreferences.findMany({
      where: { pregnancyId: { in: pregnancies.map((p) => p.id) } },
    });

    const bundle = {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      account:
        owner.kind === 'user'
          ? {
              kind: 'user',
              id: owner.id,
              email: owner.user.email,
              name: owner.user.name,
            }
          : { kind: 'anonymous', id: owner.id },
      profile: profile && {
        timeZone: profile.timeZone,
        locale: profile.locale,
        planningHorizonMonths: profile.planningHorizonMonths,
        countryCode: profile.countryCode,
        dietPattern: profile.dietPattern,
        foodAllergies: profile.foodAllergies,
        activityLevel: profile.activityLevel,
        foodIntolerances: profile.foodIntolerances,
        excludedFoods: profile.excludedFoods,
        cuisinePreferences: profile.cuisinePreferences,
        contentTopics: profile.contentTopics,
        reducedMotion: profile.reducedMotion,
        largerText: profile.largerText,
        quietHoursStart: profile.quietHoursStart,
        quietHoursEnd: profile.quietHoursEnd,
        weightTrackingEnabled: profile.weightTrackingEnabled,
      },
      pregnancies: pregnancies.map((p) => ({
        status: p.status,
        dueDate: toIsoDate(p.dueDate),
        datingMethod: p.datingMethod,
        firstPregnancy: p.firstPregnancy,
        fetusCount: p.fetusCount,
        confirmedByClinician: p.confirmedByClinician,
        restrictExercise: p.restrictExercise,
        foodRestrictions: p.foodRestrictions,
        clinicianNutritionPlan: p.clinicianNutritionPlan,
        kickThreshold:
          p.kickThresholdCount !== null && p.kickThresholdMinutes !== null
            ? {
                count: p.kickThresholdCount,
                windowMinutes: p.kickThresholdMinutes,
                source: 'clinician',
              }
            : null,
        outcome: p.outcome,
        endedOn: p.endedOn ? toIsoDate(p.endedOn) : null,
        datingHistory: p.datings.map((d) => ({
          method: d.method,
          source: d.source,
          inputs: d.inputs,
          dueDate: toIsoDate(d.dueDate),
          recordedAt: d.createdAt.toISOString(),
        })),
        birthPreferences: (() => {
          const b = birthPreferences.find((x) => x.pregnancyId === p.id);
          return b
            ? {
                birthSetting: b.birthSetting,
                painRelief: b.painRelief,
                supportPeople: b.supportPeople,
                feedingIntention: b.feedingIntention,
                notes: this.cipher.decrypt(
                  b.notes,
                  ENCRYPTED_COLUMNS.birthNotes,
                ),
              }
            : null;
        })(),
      })),
      consentHistory: consents.map((c) => ({
        purpose: c.purpose,
        granted: c.granted,
        policyVersion: c.policyVersion,
        source: c.source,
        recordedAt: c.createdAt.toISOString(),
      })),
      cycles: cycles.map((c) => ({
        periodStart: toIsoDate(c.periodStart),
        periodEnd: c.periodEnd ? toIsoDate(c.periodEnd) : null,
      })),
      dailyLogs: dailyLogs.map((d) => ({
        date: toIsoDate(d.date),
        symptoms: d.symptoms,
        note: this.cipher.decrypt(d.note, ENCRYPTED_COLUMNS.dailyLogNote),
        mood: d.mood,
        sleepMinutes: d.sleepMinutes,
        waterGlasses: d.waterGlasses,
        activityMinutes: d.activityMinutes,
        questions: this.cipher.decrypt(
          d.questions,
          ENCRYPTED_COLUMNS.dailyLogQuestions,
        ),
      })),
      readinessProgress: progress.map((p) => ({
        task: p.task.key,
        completedAt: p.completedAt?.toISOString() ?? null,
        note: this.cipher.decrypt(p.note, ENCRYPTED_COLUMNS.taskNote),
      })),
      reminders: reminders.map((r) => ({
        kind: r.kind,
        enabled: r.enabled,
        localTime: r.localTime,
        recurrence: r.recurrence,
        label: r.label,
        channel: r.channel,
        recentDeliveries: r.deliveries.map((d) => ({
          scheduledFor: d.scheduledFor.toISOString(),
          status: d.status,
          sentAt: d.sentAt?.toISOString() ?? null,
        })),
      })),
      appointments: appointments.map((a) => ({
        kind: a.kind,
        title: a.title,
        startsAt: a.startsAt.toISOString(),
        location: a.location,
        notes: this.cipher.decrypt(a.notes, ENCRYPTED_COLUMNS.appointmentNotes),
        questions: this.cipher.decryptList(
          a.questions,
          ENCRYPTED_COLUMNS.appointmentQuestions,
        ),
      })),
      mealLogs: mealLogs.map((m) => ({
        date: toIsoDate(m.date),
        slot: m.slot,
        recipe: m.recipeSlug,
      })),
      activityLogs: activityLogs.map((a) => ({
        date: toIsoDate(a.date),
        activity: a.activitySlug,
        minutes: a.minutes,
      })),
      savedContent: saved.map((x) => ({
        kind: x.kind,
        slug: x.slug,
        savedAt: x.createdAt.toISOString(),
      })),
      shoppingList: shopping.map((x) => ({
        name: x.name,
        quantity: x.quantity,
        checked: x.checked,
      })),
      planTaskCompletions: planCompletions.map((c) => ({
        date: toIsoDate(c.date),
        task: c.taskKey,
        completedAt: c.completedAt.toISOString(),
      })),
      symptomChecks: symptomChecks.map((c) => ({
        date: toIsoDate(c.date),
        symptoms: c.symptoms,
        level: c.level,
        matchedRules: c.matchedRules,
        stage: c.stage,
        rulesVersion: c.rulesVersion,
        checkedAt: c.createdAt.toISOString(),
      })),
      kickSessions: kickSessions.map((k) => ({
        date: toIsoDate(k.date),
        startedAt: k.startedAt.toISOString(),
        endedAt: k.endedAt?.toISOString() ?? null,
        count: k.count,
      })),
      contractions: contractions.map((c) => ({
        startedAt: c.startedAt.toISOString(),
        endedAt: c.endedAt?.toISOString() ?? null,
      })),
      weightEntries: weightEntries.map((w) => ({
        date: toIsoDate(w.date),
        weightKg: Number(w.weightKg),
      })),
      subscriptions: subscriptions.map((s) => ({
        provider: s.provider,
        productId: s.productId,
        state: s.state,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
      })),
    };
    return bundle;
  }

  /**
   * Immediate, irreversible deletion. Cascades remove health records, consent history,
   * reminders, subscriptions, sessions and credentials; the job and audit rows survive with
   * user_id set to NULL. Staff accounts must be deprovisioned first so review trails stay intact.
   */
  async deleteAccount(userId: string, requestId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          staffRole: true,
          _count: { select: { contentReviews: true } },
        },
      });
      if (user.staffRole || user._count.contentReviews > 0) {
        throw new ConflictException(
          'Staff accounts must be deprovisioned by an administrator before deletion.',
        );
      }
      const job = await tx.privacyJob.create({
        data: { userId, kind: 'deletion', status: 'processing' },
      });
      await tx.anonymousSession.deleteMany({ where: { linkedUserId: userId } });
      // Audit rows outlive the account without a link to it. audit_events is append-only;
      // this transaction-local opt-in permits only clearing these ids (see migration
      // 20261108130000_audit_append_only).
      await tx.$executeRaw`SELECT set_config('app.audit_anonymise', 'on', true)`;
      await tx.auditEvent.updateMany({
        where: { actorUserId: userId },
        data: { actorUserId: null },
      });
      await tx.auditEvent.updateMany({
        where: { targetId: userId },
        data: { targetId: null },
      });
      await tx.user.delete({ where: { id: userId } });
      await tx.privacyJob.update({
        where: { id: job.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      await this.audit.record(
        {
          action: 'account.deleted',
          targetType: 'user',
          requestId,
          metadata: { subjectRef: this.audit.subjectRef(userId) },
        },
        tx,
      );
    });
  }

  listJobs(userId: string) {
    return this.prisma.privacyJob.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
      take: 50,
    });
  }
}
