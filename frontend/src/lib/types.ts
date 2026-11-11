/**
 * Response and request shapes of the NestJS API (v1). Mirrors `packages/contracts` in the
 * backend repo; keep the two in sync when an endpoint changes (see docs/api/openapi.json).
 */

export type IsoDate = string;
export type IsoDateTime = string;

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONSENT_REQUIRED"
  | "PREMIUM_REQUIRED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface PageInfo {
  limit: number;
  offset: number;
  total: number;
}

export interface Page<T> {
  items: T[];
  page: PageInfo;
}

export type StaffRole =
  | "support"
  | "content_editor"
  | "clinical_reviewer"
  | "administrator";

export type Me =
  | {
      kind: "user";
      id: string;
      email: string;
      name: string | null;
      emailVerified: boolean;
      staffRole: StaffRole | null;
      twoFactorEnabled: boolean;
    }
  | { kind: "anonymous"; id: string; expiresAt: IsoDateTime };

export interface AnonymousSessionCreated {
  id: string;
  secret: string;
  expiresAt: IsoDateTime;
}

export interface LinkResult {
  pregnancies: number;
  cycles: number;
  dailyLogs: number;
  taskProgress: number;
  consentRecords: number;
  reminders: number;
  profile: boolean;
}

export type ConsentPurpose =
  | "health_data_processing"
  | "product_analytics"
  | "marketing_email";

export interface ConsentState {
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string | null;
  updatedAt: IsoDateTime | null;
}

export type DietPattern =
  | "no_restriction"
  | "vegetarian"
  | "eggetarian"
  | "vegan"
  | "pescatarian"
  | "other";
export type ActivityLevel = "low" | "moderate" | "high";

export interface Profile {
  timeZone: string;
  locale: "en";
  planningHorizonMonths: number | null;
  countryCode: string | null;
  dietPattern: DietPattern | null;
  foodAllergies: string[];
  activityLevel: ActivityLevel | null;
}

export interface Entitlement {
  premium: boolean;
  status: "none" | "active" | "grace_period" | "expired" | "revoked";
  expiresAt: IsoDateTime | null;
}

export type SymptomCode =
  | "cramps"
  | "headache"
  | "bloating"
  | "breast_tenderness"
  | "fatigue"
  | "acne"
  | "nausea"
  | "back_pain"
  | "mood_low"
  | "mood_irritable"
  | "spotting"
  | "discharge_change"
  | "insomnia"
  | "appetite_change";

export interface DailyLog {
  date: IsoDate;
  symptoms: SymptomCode[];
  note: string | null;
  mood?: MoodCode | null;
  sleepMinutes?: number | null;
  waterGlasses?: number | null;
  activityMinutes?: number | null;
  questions?: string | null;
  updatedAt: IsoDateTime;
}

export type MoodCode = "great" | "good" | "okay" | "low" | "very_low";

export interface ReadinessTask {
  id: string;
  key: string;
  title: string;
  description: string | null;
  category: string;
  premium: boolean;
  locked: boolean;
  articleSlug: string | null;
  completedAt: IsoDateTime | null;
  note: string | null;
  fromWeek?: number | null;
  toWeek?: number | null;
  recommendedNow?: boolean | null;
}

export interface Reference {
  title: string;
  url?: string;
}

export interface ReviewInfo {
  reviewerCredentials: string;
  reviewedAt: IsoDateTime;
}

export interface ArticleSummary {
  slug: string;
  locale: "en";
  version: number;
  title: string;
  summary: string;
  premium: boolean;
  publishedAt: IsoDateTime;
}

export interface Article extends ArticleSummary {
  body: string | null;
  locked: boolean;
  references: Reference[];
  review: ReviewInfo | null;
  nextReviewDue: IsoDate | null;
}

export type ReminderKind =
  | "daily_log"
  | "period_expected"
  | "readiness_checkin"
  | "custom";

export interface Reminder {
  id: string;
  kind: ReminderKind;
  enabled: boolean;
  localTime: string;
  recurrence: string;
  label: string | null;
  /** `none`: in-app only. `email`: also sent to the account's confirmed address. */
  channel: "none" | "email";
  /** Next scheduled send (UTC); null when paused or in-app only. */
  nextRunAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export type DatingMethod = "lmp" | "due_date" | "ultrasound" | "ivf";
export type DatingSource = "self" | "clinician";
export type FetusCount = "one" | "twins" | "triplets_or_more" | "unknown";
export type PregnancyOutcome = "birth" | "loss" | "other";
export type TermStatus =
  | "preterm"
  | "early_term"
  | "full_term"
  | "late_term"
  | "postterm";

export type DatingInput =
  | { method: "lmp"; lmpDate: IsoDate; cycleLengthDays?: number }
  | { method: "due_date"; dueDate: IsoDate }
  | {
      method: "ultrasound";
      scanDate: IsoDate;
      gestationalWeeks: number;
      gestationalDays: number;
    }
  | { method: "ivf"; transferDate: IsoDate; embryoAgeDays: number };

export interface GestationalAge {
  weeks: number;
  days: number;
}

export interface PregnancyDetails {
  firstPregnancy?: boolean | null;
  fetusCount?: FetusCount;
  confirmedByClinician?: boolean | null;
  restrictExercise?: boolean;
  foodRestrictions?: string[];
}

export interface Pregnancy {
  id: string;
  status: "active" | "ended";
  dueDate: IsoDate;
  datingMethod: DatingMethod;
  datingSource: DatingSource;
  today: IsoDate;
  gestationalAge: GestationalAge;
  week: number;
  trimester: 1 | 2 | 3;
  termStatus: TermStatus;
  daysUntilDue: number;
  firstPregnancy: boolean | null;
  fetusCount: FetusCount;
  confirmedByClinician: boolean | null;
  restrictExercise: boolean;
  foodRestrictions: string[];
  outcome: PregnancyOutcome | null;
  endedOn: IsoDate | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface DatingRecord {
  id: string;
  method: DatingMethod;
  source: DatingSource;
  inputs: DatingInput;
  dueDate: IsoDate;
  createdAt: IsoDateTime;
}

export type MilestoneKey =
  | "second_trimester"
  | "third_trimester"
  | "early_term"
  | "full_term"
  | "due_date"
  | "late_term"
  | "postterm";

export interface Timeline {
  dueDate: IsoDate;
  today: IsoDate;
  weeks: {
    week: number;
    startDate: IsoDate;
    endDate: IsoDate;
    trimester: 1 | 2 | 3;
  }[];
  milestones: {
    key: MilestoneKey;
    date: IsoDate;
    gestationalAge: GestationalAge;
    status: "past" | "today" | "upcoming";
  }[];
}

export interface WeekGuideSections {
  baby: string;
  body: string;
  symptoms: string[];
  eat: string;
  move: string;
  visits: string;
  askAtVisit: string[];
  prepare: string[];
  avoid: string[];
  whenToGetHelp: string[];
  checklist: string[];
  message: string;
  firstPregnancyNote: string | null;
  subsequentPregnancyNote: string | null;
}

export interface WeekGuide {
  week: number;
  locale: "en";
  version: number;
  title: string;
  summary: string;
  sections: WeekGuideSections;
  references: Reference[];
  review: ReviewInfo | null;
  publishedAt: IsoDateTime;
  nextReviewDue: IsoDate | null;
}

export interface ThisWeek {
  pregnancy: Pregnancy;
  guide: WeekGuide | null;
}

export interface PrivacyJob {
  id: string;
  kind: "export" | "deletion";
  status: "requested" | "processing" | "completed" | "failed" | "cancelled";
  requestedAt: IsoDateTime;
  completedAt: IsoDateTime | null;
}

// --- Admin -----------------------------------------------------------------

export type ContentStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "archived";

export interface AdminArticle {
  id: string;
  kind: "article" | "week_guide";
  week: number | null;
  sections: WeekGuideSections | null;
  slug: string;
  locale: "en";
  version: number;
  title: string;
  summary: string;
  body: string | null;
  references: Reference[];
  premium: boolean;
  status: ContentStatus;
  publishedAt: IsoDateTime | null;
  nextReviewDue: IsoDate | null;
  createdById: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface AdminTask {
  id: string;
  key: string;
  locale: string;
  title: string;
  description: string;
  category: string;
  sortOrder: number;
  premium: boolean;
  status: ContentStatus;
  articleId: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "pending_deletion" | "deleted";
  staffRole: StaffRole | null;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  createdAt: IsoDateTime;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorUserId: string | null;
  actorRole: string | null;
  targetType: string | null;
  targetId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Structured content and personal planning (backend docs/api/FRONTEND_INTEGRATION.md)
// ---------------------------------------------------------------------------

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodAllergy =
  | "milk" | "egg" | "peanut" | "tree_nut" | "wheat_gluten" | "soy" | "fish" | "shellfish" | "sesame";

interface ContentBase {
  slug: string;
  locale: "en";
  version: number;
  title: string;
  summary: string;
  category: string | null;
  trimester: 1 | 2 | 3 | null;
  tags: string[];
  references: Reference[];
  review: ReviewInfo | null;
  publishedAt: IsoDateTime;
  nextReviewDue: IsoDate | null;
}

export interface Recipe extends ContentBase {
  allergens: FoodAllergy[];
  sections: {
    mealSlots: MealSlot[];
    servings: number;
    prepMinutes: number | null;
    ingredients: { name: string; quantity: string | null; allergens: FoodAllergy[] }[];
    steps: string[];
    dietPatterns: DietPattern[];
    nutrients: { name: string; note: string }[];
    foodSafetyNotes: string[];
    substitutions: { ingredient: string; alternatives: string[] }[];
    cuisine: string | null;
  };
}

export interface Activity extends ContentBase {
  sections: {
    type: string;
    instructions: string[];
    durationMinutes: number | null;
    intensity: "gentle" | "light" | "moderate" | null;
    trimesters: (1 | 2 | 3)[];
    fromWeek: number | null;
    toWeek: number | null;
    safetyNotes: string[];
    contraindications: string[];
    stopSigns: string[];
  };
}

export type PlanAvailability =
  | "available" | "no_pregnancy" | "clinician_guidance" | "none_published" | "none_matching";

export interface PersonalMealPlan {
  availability: PlanAvailability;
  planSlug: string | null;
  hydrationNote: string | null;
  days: { date: IsoDate; meals: { slot: MealSlot; recipe: Recipe; eaten: boolean }[] }[];
  filters: { dietPattern: DietPattern | null; excludedAllergens: FoodAllergy[]; excludedFoods: string[] };
}

export interface ExercisePlan {
  availability: PlanAvailability;
  week: number | null;
  activities: (Activity & { doneToday: boolean })[];
  disclaimer: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string | null;
  checked: boolean;
  recipeSlug: string | null;
  updatedAt: IsoDateTime;
}

export type AppointmentKind =
  | "antenatal" | "scan" | "blood_test" | "glucose_test" | "specialist" | "postnatal" | "newborn_check" | "other";

export interface Appointment {
  id: string;
  kind: AppointmentKind;
  title: string;
  startsAt: IsoDateTime;
  location: string | null;
  notes: string | null;
  questions: string[];
  pregnancyId: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface BirthPreferences {
  birthSetting: "hospital" | "birth_centre" | "home" | "undecided" | null;
  painRelief: string[];
  supportPeople: string[];
  feedingIntention: "breastfeeding" | "formula" | "combination" | "undecided" | null;
  notes: string | null;
  updatedAt: IsoDateTime | null;
}
