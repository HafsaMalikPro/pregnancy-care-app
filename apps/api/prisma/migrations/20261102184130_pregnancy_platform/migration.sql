-- CreateEnum
CREATE TYPE "AppointmentKind" AS ENUM ('antenatal', 'scan', 'blood_test', 'glucose_test', 'specialist', 'postnatal', 'newborn_check', 'other');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentKind" ADD VALUE 'recipe';
ALTER TYPE "ContentKind" ADD VALUE 'activity';
ALTER TYPE "ContentKind" ADD VALUE 'meal_plan';

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "category" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "trimester" SMALLINT;

-- AlterTable
ALTER TABLE "daily_logs" ADD COLUMN     "activity_minutes" SMALLINT,
ADD COLUMN     "mood" TEXT,
ADD COLUMN     "questions" TEXT,
ADD COLUMN     "sleep_minutes" SMALLINT,
ADD COLUMN     "water_glasses" SMALLINT;

-- AlterTable
ALTER TABLE "pregnancies" ADD COLUMN     "clinician_nutrition_plan" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "content_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cuisine_preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "excluded_foods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "food_intolerances" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "larger_text" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduced_motion" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "readiness_tasks" ADD COLUMN     "from_week" SMALLINT,
ADD COLUMN     "to_week" SMALLINT;

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "pregnancy_id" UUID,
    "kind" "AppointmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "date" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "recipe_slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "date" DATE NOT NULL,
    "activity_slug" TEXT NOT NULL,
    "minutes" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_content" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "kind" "ContentKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_items" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "name" TEXT NOT NULL,
    "quantity" TEXT,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "recipe_slug" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "birth_preferences" (
    "id" UUID NOT NULL,
    "pregnancy_id" UUID NOT NULL,
    "birth_setting" TEXT,
    "pain_relief" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "support_people" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feeding_intention" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "birth_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_task_completions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "date" DATE NOT NULL,
    "task_key" TEXT NOT NULL,
    "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_user_id_starts_at_idx" ON "appointments"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_anonymous_session_id_starts_at_idx" ON "appointments"("anonymous_session_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "meal_logs_user_id_date_slot_recipe_slug_key" ON "meal_logs"("user_id", "date", "slot", "recipe_slug");

-- CreateIndex
CREATE UNIQUE INDEX "meal_logs_anonymous_session_id_date_slot_recipe_slug_key" ON "meal_logs"("anonymous_session_id", "date", "slot", "recipe_slug");

-- CreateIndex
CREATE UNIQUE INDEX "activity_logs_user_id_date_activity_slug_key" ON "activity_logs"("user_id", "date", "activity_slug");

-- CreateIndex
CREATE UNIQUE INDEX "activity_logs_anonymous_session_id_date_activity_slug_key" ON "activity_logs"("anonymous_session_id", "date", "activity_slug");

-- CreateIndex
CREATE UNIQUE INDEX "saved_content_user_id_kind_slug_key" ON "saved_content"("user_id", "kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "saved_content_anonymous_session_id_kind_slug_key" ON "saved_content"("anonymous_session_id", "kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_items_user_id_name_key" ON "shopping_items"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_items_anonymous_session_id_name_key" ON "shopping_items"("anonymous_session_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "birth_preferences_pregnancy_id_key" ON "birth_preferences"("pregnancy_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_task_completions_user_id_date_task_key_key" ON "plan_task_completions"("user_id", "date", "task_key");

-- CreateIndex
CREATE UNIQUE INDEX "plan_task_completions_anonymous_session_id_date_task_key_key" ON "plan_task_completions"("anonymous_session_id", "date", "task_key");

-- CreateIndex
CREATE INDEX "articles_kind_locale_status_category_idx" ON "articles"("kind", "locale", "status", "category");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_pregnancy_id_fkey" FOREIGN KEY ("pregnancy_id") REFERENCES "pregnancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_content" ADD CONSTRAINT "saved_content_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_content" ADD CONSTRAINT "saved_content_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "birth_preferences" ADD CONSTRAINT "birth_preferences_pregnancy_id_fkey" FOREIGN KEY ("pregnancy_id") REFERENCES "pregnancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_task_completions" ADD CONSTRAINT "plan_task_completions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_task_completions" ADD CONSTRAINT "plan_task_completions_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (Prisma can't express these)
-- ---------------------------------------------------------------------------

-- Content shape by kind. New enum values can't be referenced in the transaction that adds
-- them, so recipes, activities and meal plans fall to the ELSE branch: structured sections,
-- no week column (their week ranges live inside sections).
ALTER TABLE "articles" DROP CONSTRAINT "articles_week_guide_shape";
ALTER TABLE "articles" ADD CONSTRAINT "articles_kind_shape" CHECK (
  CASE
    WHEN "kind" = 'week_guide' THEN "week" IS NOT NULL AND "sections" IS NOT NULL
    WHEN "kind" = 'article' THEN "week" IS NULL AND "sections" IS NULL
    ELSE "week" IS NULL AND "sections" IS NOT NULL
  END
);
ALTER TABLE "articles" ADD CONSTRAINT "articles_trimester_range" CHECK ("trimester" IS NULL OR "trimester" BETWEEN 1 AND 3);
ALTER TABLE "articles" ADD CONSTRAINT "articles_tags_max" CHECK (cardinality("tags") <= 20);

ALTER TABLE "readiness_tasks" ADD CONSTRAINT "readiness_tasks_week_window" CHECK (
  ("from_week" IS NULL OR "from_week" BETWEEN 1 AND 42)
  AND ("to_week" IS NULL OR "to_week" BETWEEN 1 AND 42)
  AND ("from_week" IS NULL OR "to_week" IS NULL OR "from_week" <= "to_week")
);

ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_ranges" CHECK (
  ("sleep_minutes" IS NULL OR "sleep_minutes" BETWEEN 0 AND 1440)
  AND ("water_glasses" IS NULL OR "water_glasses" BETWEEN 0 AND 40)
  AND ("activity_minutes" IS NULL OR "activity_minutes" BETWEEN 0 AND 1440)
);

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_preference_sizes" CHECK (
  cardinality("food_intolerances") <= 20
  AND cardinality("excluded_foods") <= 30
  AND cardinality("cuisine_preferences") <= 10
  AND cardinality("content_topics") <= 20
);

-- Every user-owned row has exactly one owner.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "saved_content" ADD CONSTRAINT "saved_content_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "plan_task_completions" ADD CONSTRAINT "plan_task_completions_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);

ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_slot" CHECK ("slot" IN ('breakfast', 'lunch', 'dinner', 'snack'));
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_minutes" CHECK ("minutes" IS NULL OR "minutes" BETWEEN 1 AND 600);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_questions_max" CHECK (cardinality("questions") <= 20);
ALTER TABLE "birth_preferences" ADD CONSTRAINT "birth_preferences_list_sizes" CHECK (
  cardinality("pain_relief") <= 10 AND cardinality("support_people") <= 10
);
