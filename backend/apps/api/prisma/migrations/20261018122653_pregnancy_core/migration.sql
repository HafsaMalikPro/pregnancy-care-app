-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('article', 'week_guide');

-- CreateEnum
CREATE TYPE "PregnancyStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "PregnancyOutcome" AS ENUM ('birth', 'loss', 'other');

-- CreateEnum
CREATE TYPE "DatingMethod" AS ENUM ('lmp', 'due_date', 'ultrasound', 'ivf');

-- CreateEnum
CREATE TYPE "DatingSource" AS ENUM ('self', 'clinician');

-- CreateEnum
CREATE TYPE "FetusCount" AS ENUM ('one', 'twins', 'triplets_or_more', 'unknown');

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "kind" "ContentKind" NOT NULL DEFAULT 'article',
ADD COLUMN     "sections" JSONB,
ADD COLUMN     "week" SMALLINT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "activity_level" TEXT,
ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "diet_pattern" TEXT,
ADD COLUMN     "food_allergies" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "pregnancies" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "status" "PregnancyStatus" NOT NULL DEFAULT 'active',
    "due_date" DATE NOT NULL,
    "dating_method" "DatingMethod" NOT NULL,
    "dating_source" "DatingSource" NOT NULL,
    "first_pregnancy" BOOLEAN,
    "fetus_count" "FetusCount" NOT NULL DEFAULT 'unknown',
    "confirmed_by_clinician" BOOLEAN,
    "restrict_exercise" BOOLEAN NOT NULL DEFAULT false,
    "food_restrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcome" "PregnancyOutcome",
    "ended_on" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pregnancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pregnancy_datings" (
    "id" UUID NOT NULL,
    "pregnancy_id" UUID NOT NULL,
    "method" "DatingMethod" NOT NULL,
    "source" "DatingSource" NOT NULL,
    "inputs" JSONB NOT NULL,
    "due_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pregnancy_datings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pregnancies_user_id_created_at_idx" ON "pregnancies"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pregnancies_anonymous_session_id_created_at_idx" ON "pregnancies"("anonymous_session_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pregnancy_datings_pregnancy_id_created_at_idx" ON "pregnancy_datings"("pregnancy_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "articles_kind_locale_week_status_idx" ON "articles"("kind", "locale", "week", "status");

-- AddForeignKey
ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pregnancy_datings" ADD CONSTRAINT "pregnancy_datings_pregnancy_id_fkey" FOREIGN KEY ("pregnancy_id") REFERENCES "pregnancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma cannot express
-- ---------------------------------------------------------------------------

-- Every pregnancy has exactly one owner.
ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);

-- At most one active pregnancy per owner.
CREATE UNIQUE INDEX "pregnancies_one_active_user" ON "pregnancies" ("user_id") WHERE "status" = 'active' AND "user_id" IS NOT NULL;
CREATE UNIQUE INDEX "pregnancies_one_active_anonymous" ON "pregnancies" ("anonymous_session_id") WHERE "status" = 'active' AND "anonymous_session_id" IS NOT NULL;

-- An ended pregnancy records how and when; an active one records neither.
ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_end_fields" CHECK (
  ("status" = 'ended') = ("outcome" IS NOT NULL AND "ended_on" IS NOT NULL)
);

ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_food_restrictions_max" CHECK (cardinality("food_restrictions") <= 20);

-- Week guides carry a week (1-42), structured sections and the matching slug; articles carry neither.
ALTER TABLE "articles" ADD CONSTRAINT "articles_week_guide_shape" CHECK (
  ("kind" = 'week_guide') = ("week" IS NOT NULL AND "sections" IS NOT NULL)
);
ALTER TABLE "articles" ADD CONSTRAINT "articles_week_range" CHECK ("week" IS NULL OR "week" BETWEEN 1 AND 42);
ALTER TABLE "articles" ADD CONSTRAINT "articles_week_guide_slug" CHECK (
  "kind" <> 'week_guide' OR "slug" = 'pregnancy-week-' || "week"
);

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_country_code_format" CHECK ("country_code" IS NULL OR "country_code" ~ '^[A-Z]{2}$');
