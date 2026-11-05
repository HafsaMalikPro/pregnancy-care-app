# Platform extension: nutrition, exercise, baby care, birth and daily planning (2026-11-03)

Extends the existing API rather than replacing it. Everything new reuses the existing owner
model (user or anonymous session), consent enforcement, clinical review workflow, audit log,
error format, pagination and OpenAPI export.

## 1. Baseline and audit

| Check | Before | After |
| --- | --- | --- |
| Unit tests | 182/182 (the "161/161" in the brief was out of date) | 200/200 |
| End-to-end tests (disposable DB) | 241/242 then 242/242 on a rerun (the reminder retry test is timing-sensitive) | 266/266, twice in a row |
| Build, lint, typecheck, format | pass | pass (0 lint warnings) |
| Migrations from an empty database | 4 | 5, and `prisma migrate diff` reports no drift |
| `pnpm audit --prod --audit-level high` | — | No known vulnerabilities |

Audited: Prisma schema and migrations; auth guard, decorators and owner model; consent,
profile, pregnancy (dating, timeline, week guides), daily logs, readiness, reminders and
delivery, privacy export/deletion, guest linking, entitlements, admin content workflow,
contracts, OpenAPI export and every e2e suite.

Reused instead of duplicated: the `articles` table and its review workflow for all new
clinical content; pregnancy dating functions for every week calculation; readiness tasks for
newborn, hospital-bag and birth checklists; reminders for appointment reminders.

Findings fixed along the way:
- Ending a pregnancy left pregnancy reminders running. It now pauses them (below).
- `createDraft` treated an existing slug of any kind as a previous version. With more content
  kinds this would have merged unrelated items; it now returns 409.
- Fetching all week guides took 42 requests and hit the 120/min per-IP limit during website
  builds. `GET /v1/week-guides` returns a range in one response (two queries).

## 2. New and extended modules

| Module | What it adds |
| --- | --- |
| `content` | Article `category`, `trimester`, `tags` and filters; recipes, activities, meal plans (public catalog); bulk week guides; readiness `fromWeek`/`toWeek`/`recommendedNow` and category filter |
| `admin` | Create recipe/activity/meal-plan drafts (validated against contracts), category/kind/search filters, content coverage report, meal plans publishable only after their recipes |
| `planning` (new) | Personal meal plan, meal logs, shopping list, exercise plan, activity logs, saved content, appointments, daily plan |
| `pregnancy` | Week detail with dates, birth preferences, `clinicianNutritionPlan`, reminder pausing on end |
| `daily-logs`, `profile` | Mood, sleep, hydration, activity, questions; food intolerances, excluded foods, cuisines, content topics, accessibility |
| `common` | `PregnancyContext` (one week/trimester calculation for every module), tag validation |
| `privacy`, `auth` | Export, deletion and guest linking cover every new table |

## 3. Database changes

Migration `20261102184130_pregnancy_platform` is additive only: no column or table is dropped
or retyped, so it is safe on existing data. It adds:

- `ContentKind` values `recipe`, `activity`, `meal_plan`; `articles.category`, `trimester`,
  `tags` and an index on `(kind, locale, status, category)`. The week-guide shape check is
  replaced by a per-kind check (structured kinds need `sections` and no `week`).
- `readiness_tasks.from_week`, `to_week` (1–42, from ≤ to).
- `daily_logs.mood`, `sleep_minutes`, `water_glasses`, `activity_minutes`, `questions` with range checks.
- `profiles.food_intolerances`, `excluded_foods`, `cuisine_preferences`, `content_topics`,
  `reduced_motion`, `larger_text` with size checks.
- `pregnancies.clinician_nutrition_plan`.
- Tables `appointments`, `meal_logs`, `activity_logs`, `saved_content`, `shopping_items`,
  `plan_task_completions` (each with a single-owner CHECK, per-owner unique keys that make
  writes idempotent, and cascade delete with the owner) and `birth_preferences` (owned
  through its pregnancy).

Verified against a disposable database (`preconception_e2e`), a freshly created empty
database, and applied to the local development database.

## 4. API endpoints

Added (38): `GET /v1/week-guides`; `GET /v1/recipes`, `/recipes/{slug}`, `/activities`,
`/activities/{slug}`, `/meal-plans`, `/meal-plans/{slug}`; `GET /v1/me/meal-plan`,
`/me/exercise-plan`; `GET|PUT|DELETE` meal logs and activity logs; shopping list (6);
saved (3); appointments (5); `GET /v1/daily-plan`, `PUT /v1/daily-plan/{date}/tasks/{key}`;
`GET /v1/pregnancies/current/weeks/{week}`, `GET|PUT …/current/birth-preferences`;
`POST /v1/admin/recipes`, `/admin/activities`, `/admin/meal-plans`, `GET /v1/admin/content/coverage`.

Extended without breaking changes: article summaries (`category`, `trimester`, `tags`),
article list filters, readiness tasks, daily logs, profile, pregnancy, week-guide sections
(`babyMilestones`, `sizeComparison`, defaulted for older guides), admin article list filters
and DTOs, the export bundle. New request fields are optional; on daily logs and profile, an
omitted new field keeps its saved value so older clients can't wipe it.

## 5. OpenAPI and contracts

`docs/api/openapi.json` regenerated (96 paths). Every new route has typed request and
response DTOs; the drift and default-deny e2e tests were updated with the new routes and the
seven new public ones. Shared types are in `packages/contracts` (`Recipe`, `Activity`,
`MealPlan`, `RecipeSections`, `ActivitySections`, `MealPlanSections`, `PersonalMealPlan`,
`ExercisePlan`, `DailyPlan`, `PlanTask`, `Appointment`, `BirthPreferences`, `MealLog`,
`ActivityLog`, `SavedItem`, `ShoppingItem`, `PregnancyWeekDetail`, `ContentCoverage`,
`ContentCategory`, `ContentKind`, `PreparationCategory`, `MoodCode`). Frontend guide:
`docs/api/FRONTEND_INTEGRATION.md`.

## 6. Clinical review workflow

Unchanged and now applied to every content kind: draft → submit → clinical review
(approved, or changes requested with comments back to draft) → approved → published →
archived. Reviewer identity, credentials, sources and comments are stored per review;
every transition is audited; every version is kept. Content editors cannot approve; clinical
reviewers cannot author-review their own work. Structured content is validated on create,
edit and again on submit, and needs a category before review. Content is presented as
reviewed only through an approving review record. The content seeding pipeline
(`content/README.md`, `apps/api/scripts/import-content.mjs`) only ever creates drafts and
refuses unfilled templates.

## 7. Meal planning

Reviewed recipes (ingredients with allergens, steps, servings, nutrient notes without targets,
food-safety notes, substitutions, cuisine) and daily or weekly meal plans. The personal plan
filters by diet pattern (vegetarian, eggetarian, vegan, pescatarian), allergies, intolerances,
excluded foods and clinician-advised restrictions; a plan with any unsuitable or unpublished
recipe is skipped entirely. Preferred cuisines rank plans; they never relax a filter. If the
user says a clinician or dietitian manages their eating, no generic plan is offered. No
calorie, weight or supplement figures are computed anywhere. Meal logs and the shopping list
are idempotent.

## 8. Exercise safety

Activities require at least one stop sign; duration and intensity are nullable and come only
from the reviewed content. The personal plan only includes activities reviewed for the user's
trimester and week; when `restrictExercise` is set it returns none
(`availability: clinician_guidance`). Every plan carries a disclaimer that it is not a
prescription and that logging is not medical monitoring. No risk classification is inferred.

## 9. Baby care, birth and postpartum

Newborn, hospital-bag and birth preparation use readiness tasks with `PreparationCategory`
categories and optional week windows (`recommendedNow`); progress and completion times are
per owner. Week guides can carry milestones and a clinician-approved size comparison.
Birth preferences are saved per pregnancy. Ending a pregnancy keeps all history, pauses
readiness check-in reminders, and for a loss or other outcome also the journal reminder,
cancelling their pending sends. Postpartum and newborn education are articles with the
`postpartum`, `newborn_care`, `breastfeeding` and `warning_signs` categories.

## 10. Security and privacy

All new personal routes are owner-scoped through `ownerWhere`; lookups by id include the owner,
so another user's id is indistinguishable from a missing one (tested for read, update and
delete). Health-data writes require consent. New text fields (appointment notes, questions,
birth preferences) are documented as never logged and are not written to audit metadata.
Export includes every new table; deletion cascades; guest linking moves the new data and
refuses to merge into an account that already has health data (as before). Request size is
bounded (list sizes, string lengths, date ranges, per-owner caps on shopping items,
saved items and appointments).

## 11. Tests (actual results)

- Unit: 200/200, including meal and recipe filtering (allergens, whole-word food exclusions,
  diet patterns), plan choice and cuisine ranking, weekly plans by weekday, activity windows,
  daily-plan task keys and done-state, and every week 1–42 on its first and last day,
  trimester boundaries at 14w0d and 28w0d, and a due date spanning 29 Feb 2028.
- End-to-end: 266/266, twice. New suite `test/platform.e2e-spec.ts` (22 tests): structured
  content validation and publication rules, catalog filters, personal plans and clinician
  gates, idempotent logs, consent, the shopping list, daily plan (stable keys, done-state, local
  appointment times), user isolation, week detail, birth preferences, reminder pausing on loss
  versus birth, journal fields, and export/link/delete of the new records.
- The e2e timeouts were raised (20 s per test, 30 s per hook): files run in parallel and each
  hashes passwords for several sign-ups.
- Load testing with k6 was not run in this change. `tests/load` still covers the earlier
  endpoints; the new aggregation endpoints (`/daily-plan`, `/me/meal-plan`) should be added
  before launch.

## 12. Remaining external dependencies

- **Clinical content.** Nothing reviewed exists for weeks 17–42 (only local samples for 6–16),
  recipes, activities, meal plans, newborn or postpartum topics. Clinicians must author and
  review it; `GET /v1/admin/content/coverage` shows the gaps.
- **Push notifications.** Not built: needs a provider (APNs/FCM or a web-push service) and a
  device-registration flow. Email delivery exists and is unchanged.
- **Appointment reminders** are created as ordinary reminders; appointments don't send anything.
- **Payments** remain out of scope (see the 2026-10-29 audit).
- **Translations.** Only `en`; the content model supports more locales without schema changes.

## 13. Deployment

1. `pnpm install && pnpm build`
2. `pnpm --filter @preconception/api db:deploy` (additive migration; back up first as usual)
3. `pnpm --filter @preconception/api openapi:export` is already committed; regenerate after API changes.
4. Deploy the API, then the website. The website keeps working against the old API shape
   because every change is additive.
5. Import authored content as drafts with `scripts/import-content.mjs`, then review and publish.

## 14. Frontend integration

See `docs/api/FRONTEND_INTEGRATION.md` ("Content", "Pregnancy", "Planning"). The website can
now replace its "not available yet" states for meal plans, recipes, hydration, the exercise
library and tracking, appointments, birth preferences and the newborn checklist with these
endpoints, and should switch its week-guide loading to `GET /v1/week-guides`.
