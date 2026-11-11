import { Throttle } from '@nestjs/throttler';

const HOUR = 3_600_000;
const MINUTE = 60_000;

/**
 * Per-IP limits for writes that append rows without a per-owner cap (history tables), on top
 * of the global 120/min. Documented in docs/API_INVENTORY.md ("Rate limits").
 */
export const RATE_LIMITS = {
  /** Consent records are append-only history. */
  consentChange: { limit: 30, ttl: HOUR },
  /** Each pregnancy start, re-date or end writes history (pregnancies, pregnancy_datings). */
  pregnancyLifecycle: { limit: 20, ttl: HOUR },
  /** Symptom checks are stored as journal entries. */
  symptomCheck: { limit: 30, ttl: HOUR },
  /** Kick-count and contraction sessions (also capped per owner per day). */
  trackerSession: { limit: 120, ttl: HOUR },
  /**
   * Everyday owner writes (journal, meals, activities, shopping list, reminders,
   * appointments, saved items, weight, plan ticks…): half the default read budget.
   */
  ownerWrite: { limit: 60, ttl: MINUTE },
  /** Staff writes (content workflow, roles). Staff also need 2FA. */
  staffWrite: { limit: 60, ttl: MINUTE },
} as const;

export const ThrottleWrite = (kind: keyof typeof RATE_LIMITS) =>
  Throttle({ default: RATE_LIMITS[kind] });
