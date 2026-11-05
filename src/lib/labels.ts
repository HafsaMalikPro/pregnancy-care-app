import type {
  ActivityLevel,
  DatingMethod,
  DietPattern,
  FetusCount,
  MilestoneKey,
  ReminderKind,
  StaffRole,
  SymptomCode,
  TermStatus,
} from "./types";

export const SYMPTOMS: Record<SymptomCode, string> = {
  nausea: "Nausea",
  fatigue: "Tiredness",
  breast_tenderness: "Breast tenderness",
  back_pain: "Back pain",
  headache: "Headache",
  cramps: "Cramps",
  bloating: "Bloating",
  insomnia: "Trouble sleeping",
  appetite_change: "Appetite change",
  mood_low: "Low mood",
  mood_irritable: "Irritable",
  spotting: "Spotting",
  discharge_change: "Discharge change",
  acne: "Skin changes",
};

export const DATING_METHODS: Record<DatingMethod, string> = {
  lmp: "First day of my last period",
  due_date: "I know my due date",
  ultrasound: "From an ultrasound scan",
  ivf: "IVF transfer date",
};

export const FETUS_COUNTS: Record<FetusCount, string> = {
  one: "One baby",
  twins: "Twins",
  triplets_or_more: "Triplets or more",
  unknown: "Not sure yet",
};

export const TERM_STATUS: Record<TermStatus, string> = {
  preterm: "Preterm",
  early_term: "Early term",
  full_term: "Full term",
  late_term: "Late term",
  postterm: "Post-term",
};

export const MILESTONES: Record<MilestoneKey, string> = {
  second_trimester: "Second trimester begins",
  third_trimester: "Third trimester begins",
  early_term: "Early term (37 weeks)",
  full_term: "Full term (39 weeks)",
  due_date: "Due date",
  late_term: "Late term (41 weeks)",
  postterm: "Post-term (42 weeks)",
};

export const DIET_PATTERNS: Record<DietPattern, string> = {
  no_restriction: "No restrictions",
  vegetarian: "Vegetarian",
  eggetarian: "Vegetarian + eggs",
  vegan: "Vegan",
  pescatarian: "Pescatarian",
  other: "Other",
};

export const FOOD_ALLERGIES: Record<string, string> = {
  milk: "Milk",
  egg: "Egg",
  peanut: "Peanut",
  tree_nut: "Tree nuts",
  wheat_gluten: "Wheat / gluten",
  soy: "Soy",
  fish: "Fish",
  shellfish: "Shellfish",
  sesame: "Sesame",
};

export const ACTIVITY_LEVELS: Record<ActivityLevel, string> = {
  low: "Mostly resting",
  moderate: "Some activity",
  high: "Very active",
};

export const REMINDER_KINDS: Record<ReminderKind, string> = {
  daily_log: "Daily check-in",
  readiness_checkin: "Checklist review",
  period_expected: "Cycle reminder",
  custom: "Custom",
};

export const STAFF_ROLES: Record<StaffRole, string> = {
  support: "Support",
  content_editor: "Content editor",
  clinical_reviewer: "Clinical reviewer",
  administrator: "Administrator",
};

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const WEEKDAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

export function describeRecurrence(rule: string): string {
  if (rule === "FREQ=DAILY") return "Every day";
  const days = rule.split("BYDAY=")[1]?.split(",") ?? [];
  return days
    .map((d) => WEEKDAY_LABELS[d as (typeof WEEKDAYS)[number]] ?? d)
    .join(", ");
}

export const humanize = (code: string) =>
  code.charAt(0).toUpperCase() + code.slice(1).replaceAll("_", " ");
