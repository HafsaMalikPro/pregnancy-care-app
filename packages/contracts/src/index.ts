/**
 * Shared request/response contracts for web, mobile and admin clients.
 *
 * Schemas only — no server code, secrets or business logic. Cycle estimates are
 * calculated by the API; clients render the result, method and limitations it returns.
 */
import { z } from 'zod';

export const API_VERSION = 'v1';

export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  /** 403: the owner has not granted health_data_processing consent. */
  'CONSENT_REQUIRED',
  /** 403: the resource needs an active premium entitlement. */
  'PREMIUM_REQUIRED',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    requestId: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/** Calendar date without time or zone, e.g. "2026-10-17". */
export const IsoDate = z.iso.date();
export const Trimester = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Trimester = z.infer<typeof Trimester>;

export const CycleEntryInput = z
  .strictObject({
    periodStart: IsoDate,
    periodEnd: IsoDate.nullable().optional(),
  })
  .refine((v) => !v.periodEnd || v.periodEnd >= v.periodStart, {
    message: 'periodEnd must be on or after periodStart',
    path: ['periodEnd'],
  });
export type CycleEntryInput = z.infer<typeof CycleEntryInput>;

export const CycleEntry = z.object({
  id: z.uuid(),
  periodStart: IsoDate,
  periodEnd: IsoDate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type CycleEntry = z.infer<typeof CycleEntry>;

export const EstimateConfidence = z.enum(['insufficient_history', 'low', 'moderate']);
export type EstimateConfidence = z.infer<typeof EstimateConfidence>;

export const CycleEstimate = z.object({
  /** Versioned calculation identifier, e.g. "calendar-average@1". */
  method: z.string(),
  confidence: EstimateConfidence,
  nextPeriodWindow: z.object({ earliest: IsoDate, latest: IsoDate }).nullable(),
  cyclesUsed: z.number().int().nonnegative(),
  /** Plain-language limitations shown alongside every estimate. */
  limitations: z.array(z.string()).min(1),
});
export type CycleEstimate = z.infer<typeof CycleEstimate>;

export const EntitlementStatus = z.enum(['none', 'active', 'grace_period', 'expired', 'revoked']);
export type EntitlementStatus = z.infer<typeof EntitlementStatus>;

export const Entitlement = z.object({
  premium: z.boolean(),
  status: EntitlementStatus,
  expiresAt: z.iso.datetime().nullable(),
});
export type Entitlement = z.infer<typeof Entitlement>;

export const ConsentPurpose = z.enum([
  'health_data_processing',
  'product_analytics',
  'marketing_email',
]);
export type ConsentPurpose = z.infer<typeof ConsentPurpose>;

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['up', 'down']),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 100;

export const PageInfo = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type PageInfo = z.infer<typeof PageInfo>;

export function Page<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), page: PageInfo });
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Clients send `Authorization: Anonymous <secret>`; the server stores only a hash. */
export const ANONYMOUS_AUTH_SCHEME = 'Anonymous';

export const Platform = z.enum(['ios', 'android', 'web']);
export type Platform = z.infer<typeof Platform>;

export const AnonymousSessionCreated = z.object({
  id: z.uuid(),
  /** Shown once. Store in platform-secure storage; it cannot be recovered. */
  secret: z.string().min(43),
  expiresAt: z.iso.datetime(),
});
export type AnonymousSessionCreated = z.infer<typeof AnonymousSessionCreated>;

export const StaffRole = z.enum([
  'support',
  'content_editor',
  'clinical_reviewer',
  'administrator',
]);
export type StaffRole = z.infer<typeof StaffRole>;

export const Me = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('user'),
    id: z.uuid(),
    email: z.email(),
    name: z.string().nullable(),
    emailVerified: z.boolean(),
    staffRole: StaffRole.nullable(),
    twoFactorEnabled: z.boolean(),
  }),
  z.object({ kind: z.literal('anonymous'), id: z.uuid(), expiresAt: z.iso.datetime() }),
]);
export type Me = z.infer<typeof Me>;

// ---------------------------------------------------------------------------
// Profile and consent
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES = ['en'] as const;
export const Locale = z.enum(SUPPORTED_LOCALES);

export const Profile = z.object({
  timeZone: z.string(),
  locale: Locale,
  planningHorizonMonths: z.number().int().min(0).max(60).nullable(),
  countryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
  dietPattern: z
    .enum(['no_restriction', 'vegetarian', 'eggetarian', 'vegan', 'pescatarian', 'other'])
    .nullable(),
  foodAllergies: z.array(z.string()),
  activityLevel: z.enum(['low', 'moderate', 'high']).nullable(),
  foodIntolerances: z.array(z.string()).max(20),
  excludedFoods: z.array(z.string()).max(30),
  cuisinePreferences: z.array(z.string()).max(10),
  contentTopics: z.array(z.string()).max(20),
  reducedMotion: z.boolean(),
  largerText: z.boolean(),
});
export type Profile = z.infer<typeof Profile>;

export const ConsentState = z.object({
  purpose: ConsentPurpose,
  granted: z.boolean(),
  policyVersion: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type ConsentState = z.infer<typeof ConsentState>;

// ---------------------------------------------------------------------------
// Daily logs
// ---------------------------------------------------------------------------

/** Fixed symptom vocabulary. Free text belongs in `note`, never in `symptoms`. */
export const SymptomCode = z.enum([
  'cramps',
  'headache',
  'bloating',
  'breast_tenderness',
  'fatigue',
  'acne',
  'nausea',
  'back_pain',
  'mood_low',
  'mood_irritable',
  'spotting',
  'discharge_change',
  'insomnia',
  'appetite_change',
]);
export type SymptomCode = z.infer<typeof SymptomCode>;

export const NOTE_MAX_LENGTH = 2000;

/** Self-reported mood. A check-in, not an assessment. */
export const MoodCode = z.enum(['great', 'good', 'okay', 'low', 'very_low']);
export type MoodCode = z.infer<typeof MoodCode>;

export const DailyLog = z.object({
  date: IsoDate,
  symptoms: z.array(SymptomCode),
  note: z.string().nullable(),
  mood: MoodCode.nullable(),
  sleepMinutes: z.number().int().min(0).max(1440).nullable(),
  /** Counted by the user. The API sets no target. */
  waterGlasses: z.number().int().min(0).max(40).nullable(),
  activityMinutes: z.number().int().min(0).max(1440).nullable(),
  /** Questions to ask a clinician. */
  questions: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type DailyLog = z.infer<typeof DailyLog>;

// ---------------------------------------------------------------------------
// Readiness plan and content
// ---------------------------------------------------------------------------

export const ReadinessTask = z.object({
  id: z.uuid(),
  key: z.string(),
  title: z.string(),
  /** Null when the task is premium and the caller has no active entitlement. */
  description: z.string().nullable(),
  category: z.string(),
  premium: z.boolean(),
  locked: z.boolean(),
  articleSlug: z.string().nullable(),
  completedAt: z.iso.datetime().nullable(),
  note: z.string().nullable(),
  /** Pregnancy weeks when the task is most relevant; null = any time. */
  fromWeek: z.number().int().min(1).max(42).nullable(),
  toWeek: z.number().int().min(1).max(42).nullable(),
  /**
   * True when the caller's current pregnancy week is inside the window. Null when there is no
   * active pregnancy or the task has no window. Never hides a task.
   */
  recommendedNow: z.boolean().nullable(),
});
export type ReadinessTask = z.infer<typeof ReadinessTask>;

/** Readiness task categories used by the newborn and birth preparation checklists. */
export const PreparationCategory = z.enum([
  'newborn_clothing',
  'diapering',
  'bathing_hygiene',
  'feeding',
  'breastfeeding',
  'safe_sleep',
  'car_seat',
  'hospital_bag',
  'newborn_appointments',
  'postpartum_home',
  'birth_preparation',
]);
export type PreparationCategory = z.infer<typeof PreparationCategory>;

/** What a piece of clinical content is about. Drives filtering and the admin coverage report. */
export const ContentCategory = z.enum([
  'pregnancy',
  'trimester_guide',
  'nutrition',
  'food_safety',
  'exercise',
  'physical_wellbeing',
  'mental_wellbeing',
  'baby_development',
  'birth_preparation',
  'hospital_bag',
  'breastfeeding',
  'newborn_care',
  'postpartum',
  'warning_signs',
]);
export type ContentCategory = z.infer<typeof ContentCategory>;

export const ContentKind = z.enum(['article', 'week_guide', 'recipe', 'activity', 'meal_plan']);
export type ContentKind = z.infer<typeof ContentKind>;

export const ArticleSummary = z.object({
  slug: z.string(),
  locale: Locale,
  version: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  premium: z.boolean(),
  publishedAt: z.iso.datetime(),
  category: ContentCategory.nullable(),
  trimester: Trimester.nullable(),
  tags: z.array(z.string()),
});
export type ArticleSummary = z.infer<typeof ArticleSummary>;

export const ArticleReviewInfo = z.object({
  reviewerCredentials: z.string(),
  reviewedAt: z.iso.datetime(),
});

export const Article = ArticleSummary.extend({
  /** Null when premium and locked. */
  body: z.string().nullable(),
  locked: z.boolean(),
  references: z.array(z.object({ title: z.string(), url: z.url().optional() })),
  review: ArticleReviewInfo.nullable(),
  nextReviewDue: IsoDate.nullable(),
});
export type Article = z.infer<typeof Article>;

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export const ReminderKind = z.enum(['daily_log', 'period_expected', 'readiness_checkin', 'custom']);
export type ReminderKind = z.infer<typeof ReminderKind>;

/** "FREQ=DAILY" or "FREQ=WEEKLY;BYDAY=MO,WE,FR". */
export const RECURRENCE_PATTERN =
  /^FREQ=(DAILY|WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU)){0,6})$/;
export const LOCAL_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** `none`: shown in the app only. `email`: also sent to the account's verified address. */
export const ReminderChannel = z.enum(['none', 'email']);
export type ReminderChannel = z.infer<typeof ReminderChannel>;

export const Reminder = z.object({
  id: z.uuid(),
  kind: ReminderKind,
  enabled: z.boolean(),
  localTime: z.string().regex(LOCAL_TIME_PATTERN),
  recurrence: z.string().regex(RECURRENCE_PATTERN),
  label: z.string().nullable(),
  channel: ReminderChannel,
  /** Next scheduled send (UTC); null when paused, in-app only, or delivery is off. */
  nextRunAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Reminder = z.infer<typeof Reminder>;

/** What reminder delivery this deployment and account can use. */
export const ReminderDeliveryOptions = z.object({
  /** Channels the server can deliver right now. */
  channels: z.array(ReminderChannel.exclude(['none'])),
  /** Email reminders need an account with a confirmed address. */
  emailVerified: z.boolean(),
});
export type ReminderDeliveryOptions = z.infer<typeof ReminderDeliveryOptions>;

// ---------------------------------------------------------------------------
// Pregnancy
// ---------------------------------------------------------------------------

export const DatingMethod = z.enum(['lmp', 'due_date', 'ultrasound', 'ivf']);
export type DatingMethod = z.infer<typeof DatingMethod>;
export const DatingSource = z.enum(['self', 'clinician']);
export type DatingSource = z.infer<typeof DatingSource>;
export const FetusCount = z.enum(['one', 'twins', 'triplets_or_more', 'unknown']);
export type FetusCount = z.infer<typeof FetusCount>;
export const PregnancyOutcome = z.enum(['birth', 'loss', 'other']);
export type PregnancyOutcome = z.infer<typeof PregnancyOutcome>;

/** How the due date was estimated. Clients send one of these; the API computes the date. */
export const DatingInput = z.discriminatedUnion('method', [
  z.object({
    method: z.literal('lmp'),
    lmpDate: IsoDate,
    /** 20-45 days; the estimate shifts by (cycle length - 28) days. */
    cycleLengthDays: z.number().int().min(20).max(45).optional(),
  }),
  z.object({ method: z.literal('due_date'), dueDate: IsoDate }),
  z.object({
    method: z.literal('ultrasound'),
    scanDate: IsoDate,
    gestationalWeeks: z.number().int().min(4).max(40),
    gestationalDays: z.number().int().min(0).max(6),
  }),
  z.object({
    method: z.literal('ivf'),
    transferDate: IsoDate,
    /** Embryo age at transfer, usually 3 or 5 days. */
    embryoAgeDays: z.number().int().min(2).max(7),
  }),
]);
export type DatingInput = z.infer<typeof DatingInput>;

export const GestationalAge = z.object({
  weeks: z.number().int().nonnegative(),
  days: z.number().int().min(0).max(6),
});
export type GestationalAge = z.infer<typeof GestationalAge>;

export const TermStatus = z.enum(['preterm', 'early_term', 'full_term', 'late_term', 'postterm']);
export type TermStatus = z.infer<typeof TermStatus>;

export const Pregnancy = z.object({
  id: z.uuid(),
  status: z.enum(['active', 'ended']),
  /** Always an estimate; a clinician may revise it. */
  dueDate: IsoDate,
  datingMethod: DatingMethod,
  datingSource: DatingSource,
  today: IsoDate,
  gestationalAge: GestationalAge,
  /** Week-guide week for today: completed weeks, clamped to 1-42. */
  week: z.number().int().min(1).max(42),
  trimester: Trimester,
  termStatus: TermStatus,
  daysUntilDue: z.number().int(),
  firstPregnancy: z.boolean().nullable(),
  fetusCount: FetusCount,
  confirmedByClinician: z.boolean().nullable(),
  restrictExercise: z.boolean(),
  foodRestrictions: z.array(z.string()),
  /** A clinician or dietitian manages this person's eating; generic meal plans are withheld. */
  clinicianNutritionPlan: z.boolean(),
  outcome: PregnancyOutcome.nullable(),
  endedOn: IsoDate.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Pregnancy = z.infer<typeof Pregnancy>;

export const TimelineWeek = z.object({
  week: z.number().int().min(1).max(42),
  startDate: IsoDate,
  endDate: IsoDate,
  trimester: Trimester,
});

export const MilestoneKey = z.enum([
  'second_trimester',
  'third_trimester',
  'early_term',
  'full_term',
  'due_date',
  'late_term',
  'postterm',
]);

export const Milestone = z.object({
  key: MilestoneKey,
  date: IsoDate,
  gestationalAge: GestationalAge,
  status: z.enum(['past', 'today', 'upcoming']),
});

export const Timeline = z.object({
  dueDate: IsoDate,
  today: IsoDate,
  weeks: z.array(TimelineWeek),
  milestones: z.array(Milestone),
});
export type Timeline = z.infer<typeof Timeline>;

/** Structured fields of a reviewed week guide (PRD §5). */
export const WeekGuideSections = z.object({
  baby: z.string().min(1),
  body: z.string().min(1),
  symptoms: z.array(z.string()),
  eat: z.string(),
  move: z.string(),
  visits: z.string(),
  askAtVisit: z.array(z.string()),
  prepare: z.array(z.string()),
  avoid: z.array(z.string()),
  whenToGetHelp: z.array(z.string()).min(1),
  checklist: z.array(z.string()),
  message: z.string(),
  firstPregnancyNote: z.string().nullable(),
  subsequentPregnancyNote: z.string().nullable(),
  /** Short development milestones for the week, from the reviewed guide. */
  babyMilestones: z.array(z.string()).default([]),
  /**
   * Only when the reviewing clinician supports it. Typical values, never a measurement of the
   * user's baby. Null otherwise.
   */
  sizeComparison: z
    .object({
      label: z.string(),
      lengthCm: z.number().positive().nullable(),
      weightG: z.number().positive().nullable(),
    })
    .nullable()
    .default(null),
});
export type WeekGuideSections = z.infer<typeof WeekGuideSections>;

export const WeekGuide = z.object({
  week: z.number().int().min(1).max(42),
  locale: Locale,
  version: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  sections: WeekGuideSections,
  references: z.array(z.object({ title: z.string(), url: z.url().optional() })),
  review: ArticleReviewInfo.nullable(),
  publishedAt: z.iso.datetime(),
  nextReviewDue: IsoDate.nullable(),
});
export type WeekGuide = z.infer<typeof WeekGuide>;

export const DietPattern = z.enum([
  'no_restriction',
  'vegetarian',
  'eggetarian',
  'vegan',
  'pescatarian',
  'other',
]);
export type DietPattern = z.infer<typeof DietPattern>;
export const FoodAllergy = z.enum([
  'milk',
  'egg',
  'peanut',
  'tree_nut',
  'wheat_gluten',
  'soy',
  'fish',
  'shellfish',
  'sesame',
]);
export type FoodAllergy = z.infer<typeof FoodAllergy>;
export const ActivityLevel = z.enum(['low', 'moderate', 'high']);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

// ---------------------------------------------------------------------------
// Structured clinical content: recipes, activities and meal plans.
// Stored as content versions (kind = recipe | activity | meal_plan) and published only through
// the clinical review workflow. `sections` holds the kind's schema below.
// ---------------------------------------------------------------------------

const Reference = z.object({ title: z.string(), url: z.url().optional() });
const Media = z.object({
  url: z.url(),
  alt: z.string().min(1),
  kind: z.enum(['image', 'video']),
});

export const MealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealSlot = z.infer<typeof MealSlot>;

export const RecipeSections = z.object({
  mealSlots: z.array(MealSlot).min(1),
  servings: z.number().int().min(1).max(20),
  prepMinutes: z.number().int().min(0).max(600).nullable(),
  ingredients: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.string().nullable(),
        /** Allergens this ingredient contains (FoodAllergy codes). */
        allergens: z.array(FoodAllergy),
      }),
    )
    .min(1),
  steps: z.array(z.string().min(1)).min(1),
  /** Diet patterns the recipe suits as written. */
  dietPatterns: z.array(DietPattern),
  /** Reviewed nutrient notes, e.g. { name: "Iron", note: "Source of non-haem iron" }. No targets. */
  nutrients: z.array(z.object({ name: z.string(), note: z.string() })),
  foodSafetyNotes: z.array(z.string()),
  substitutions: z.array(
    z.object({ ingredient: z.string(), alternatives: z.array(z.string()).min(1) }),
  ),
  cuisine: z.string().nullable(),
  media: z.array(Media),
});
export type RecipeSections = z.infer<typeof RecipeSections>;

export const ActivityType = z.enum([
  'walking',
  'stretching',
  'yoga',
  'breathing',
  'pelvic_floor',
  'mobility',
  'relaxation',
  'posture',
]);
export type ActivityType = z.infer<typeof ActivityType>;

export const ActivitySections = z.object({
  type: ActivityType,
  instructions: z.array(z.string().min(1)).min(1),
  /** Only as approved by the reviewing clinician; null when they did not set one. */
  durationMinutes: z.number().int().min(1).max(120).nullable(),
  intensity: z.enum(['gentle', 'light', 'moderate']).nullable(),
  /** Trimesters the activity is reviewed for. */
  trimesters: z.array(Trimester).min(1),
  fromWeek: z.number().int().min(1).max(42).nullable(),
  toWeek: z.number().int().min(1).max(42).nullable(),
  safetyNotes: z.array(z.string()),
  contraindications: z.array(z.string()),
  /** Signs to stop and seek care. Required: every activity must say when to stop. */
  stopSigns: z.array(z.string().min(1)).min(1),
  media: z.array(Media),
});
export type ActivitySections = z.infer<typeof ActivitySections>;

export const MealPlanSections = z.object({
  /** 1 = a daily plan; 7 = a weekly plan (day 1 = Monday). */
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        meals: z.array(z.object({ slot: MealSlot, recipeSlug: z.string() })).min(1),
      }),
    )
    .min(1)
    .max(7),
  dietPatterns: z.array(DietPattern).min(1),
  trimesters: z.array(Trimester).min(1),
  /** Reviewed hydration guidance text. No numeric target unless the clinician wrote one. */
  hydrationNote: z.string(),
  cuisine: z.string().nullable(),
});
export type MealPlanSections = z.infer<typeof MealPlanSections>;

const ContentBase = z.object({
  slug: z.string(),
  locale: Locale,
  version: z.number().int().positive(),
  title: z.string(),
  summary: z.string(),
  category: ContentCategory.nullable(),
  trimester: Trimester.nullable(),
  tags: z.array(z.string()),
  references: z.array(Reference),
  review: ArticleReviewInfo.nullable(),
  publishedAt: z.iso.datetime(),
  nextReviewDue: IsoDate.nullable(),
});

export const Recipe = ContentBase.extend({
  sections: RecipeSections,
  allergens: z.array(FoodAllergy),
});
export type Recipe = z.infer<typeof Recipe>;
export const Activity = ContentBase.extend({ sections: ActivitySections });
export type Activity = z.infer<typeof Activity>;
export const MealPlan = ContentBase.extend({
  sections: MealPlanSections,
  /** The published recipes the plan refers to; unpublished ones are left out. */
  recipes: z.array(Recipe),
});
export type MealPlan = z.infer<typeof MealPlan>;

// ---------------------------------------------------------------------------
// Personal planning
// ---------------------------------------------------------------------------

/**
 * Why a personal plan is or isn't shown. `clinician_guidance`: the user said a clinician manages
 * their eating, or was asked to limit exercise, so no generic plan is offered.
 */
export const PlanAvailability = z.enum([
  'available',
  'no_pregnancy',
  'clinician_guidance',
  'none_published',
  'none_matching',
]);
export type PlanAvailability = z.infer<typeof PlanAvailability>;

export const PersonalMealDay = z.object({
  date: IsoDate,
  meals: z.array(
    z.object({
      slot: MealSlot,
      recipe: Recipe,
      /** True when the user has logged this meal as eaten on this date. */
      eaten: z.boolean(),
    }),
  ),
});

export const PersonalMealPlan = z.object({
  availability: PlanAvailability,
  planSlug: z.string().nullable(),
  hydrationNote: z.string().nullable(),
  days: z.array(PersonalMealDay),
  /** What the plan was filtered by, so the UI can explain it. */
  filters: z.object({
    dietPattern: DietPattern.nullable(),
    excludedAllergens: z.array(FoodAllergy),
    excludedFoods: z.array(z.string()),
  }),
});
export type PersonalMealPlan = z.infer<typeof PersonalMealPlan>;

export const ExercisePlan = z.object({
  availability: PlanAvailability,
  week: z.number().int().min(1).max(42).nullable(),
  activities: z.array(Activity.extend({ doneToday: z.boolean() })),
  /** Always shown with the plan. */
  disclaimer: z.string(),
});
export type ExercisePlan = z.infer<typeof ExercisePlan>;

export const MealLog = z.object({
  id: z.uuid(),
  date: IsoDate,
  slot: MealSlot,
  recipeSlug: z.string(),
  createdAt: z.iso.datetime(),
});
export type MealLog = z.infer<typeof MealLog>;

export const ActivityLog = z.object({
  id: z.uuid(),
  date: IsoDate,
  activitySlug: z.string(),
  minutes: z.number().int().min(1).max(600).nullable(),
  createdAt: z.iso.datetime(),
});
export type ActivityLog = z.infer<typeof ActivityLog>;

export const SavedItem = z.object({
  kind: ContentKind,
  slug: z.string(),
  savedAt: z.iso.datetime(),
});
export type SavedItem = z.infer<typeof SavedItem>;

export const ShoppingItem = z.object({
  id: z.uuid(),
  name: z.string(),
  quantity: z.string().nullable(),
  checked: z.boolean(),
  recipeSlug: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});
export type ShoppingItem = z.infer<typeof ShoppingItem>;

export const AppointmentKind = z.enum([
  'antenatal',
  'scan',
  'blood_test',
  'glucose_test',
  'specialist',
  'postnatal',
  'newborn_check',
  'other',
]);
export type AppointmentKind = z.infer<typeof AppointmentKind>;

export const Appointment = z.object({
  id: z.uuid(),
  kind: AppointmentKind,
  title: z.string(),
  startsAt: z.iso.datetime(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  questions: z.array(z.string()),
  pregnancyId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Appointment = z.infer<typeof Appointment>;

export const BirthPreferences = z.object({
  birthSetting: z.enum(['hospital', 'birth_centre', 'home', 'undecided']).nullable(),
  painRelief: z.array(z.string()).max(10),
  supportPeople: z.array(z.string()).max(10),
  feedingIntention: z.enum(['breastfeeding', 'formula', 'combination', 'undecided']).nullable(),
  notes: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type BirthPreferences = z.infer<typeof BirthPreferences>;

/** Where a daily-plan task's state lives. Only `plan` tasks are completed via the plan endpoint. */
export const PlanTaskSource = z.enum([
  'plan',
  'journal',
  'meal',
  'activity',
  'hydration',
  'checklist',
  'appointment',
  'reminder',
]);
export type PlanTaskSource = z.infer<typeof PlanTaskSource>;

export const PlanTask = z.object({
  /** Stable for the same day: requesting the plan again never creates new tasks. */
  key: z.string(),
  source: PlanTaskSource,
  title: z.string(),
  /** True only when the matching record is saved (journal entry, meal log, checklist tick…). */
  done: z.boolean(),
  /** Tasks like reminders and appointments are informational: null. */
  completable: z.boolean(),
  /** Slug, task id or reminder id the task refers to. */
  ref: z.string().nullable(),
  time: z.string().nullable(),
});
export type PlanTask = z.infer<typeof PlanTask>;

export const DailyPlanDay = z.object({
  date: IsoDate,
  pregnancyWeek: z.number().int().min(1).max(42).nullable(),
  tasks: z.array(PlanTask),
  done: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type DailyPlanDay = z.infer<typeof DailyPlanDay>;

export const DailyPlan = z.object({ days: z.array(DailyPlanDay) });
export type DailyPlan = z.infer<typeof DailyPlan>;

export const PregnancyWeekDetail = z.object({
  week: z.number().int().min(1).max(42),
  trimester: Trimester,
  /** The calendar dates of this week for the caller's pregnancy. */
  startDate: IsoDate,
  endDate: IsoDate,
  status: z.enum(['past', 'current', 'upcoming']),
  guide: WeekGuide.nullable(),
});
export type PregnancyWeekDetail = z.infer<typeof PregnancyWeekDetail>;

export const ContentCoverage = z.object({
  weekGuides: z.array(
    z.object({
      week: z.number().int().min(1).max(42),
      published: z.boolean(),
      workingStatus: z.enum(['draft', 'in_review', 'approved']).nullable(),
    }),
  ),
  byKind: z.array(
    z.object({
      kind: ContentKind,
      category: ContentCategory.nullable(),
      draft: z.number().int(),
      inReview: z.number().int(),
      approved: z.number().int(),
      published: z.number().int(),
    }),
  ),
});
export type ContentCoverage = z.infer<typeof ContentCoverage>;
