-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('routine', 'call_clinic_today', 'emergency');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentKind" ADD VALUE 'visit_schedule';
ALTER TYPE "ContentKind" ADD VALUE 'postpartum_guide';

-- AlterTable
ALTER TABLE "pregnancies" ADD COLUMN     "kick_threshold_count" SMALLINT,
ADD COLUMN     "kick_threshold_minutes" SMALLINT,
ADD COLUMN     "kick_threshold_updated_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "quiet_hours_end" TEXT,
ADD COLUMN     "quiet_hours_start" TEXT,
ADD COLUMN     "weight_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "symptom_checks" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "date" DATE NOT NULL,
    "symptoms" TEXT[],
    "level" "TriageLevel" NOT NULL,
    "matched_rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stage" TEXT NOT NULL,
    "rules_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "symptom_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kick_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "pregnancy_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "count" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "kick_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "pregnancy_id" UUID,
    "date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "date" DATE NOT NULL,
    "weight_kg" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "weight_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "symptom_checks_user_id_date_idx" ON "symptom_checks"("user_id", "date");

-- CreateIndex
CREATE INDEX "symptom_checks_anonymous_session_id_date_idx" ON "symptom_checks"("anonymous_session_id", "date");

-- CreateIndex
CREATE INDEX "kick_sessions_user_id_date_idx" ON "kick_sessions"("user_id", "date");

-- CreateIndex
CREATE INDEX "kick_sessions_anonymous_session_id_date_idx" ON "kick_sessions"("anonymous_session_id", "date");

-- CreateIndex
CREATE INDEX "contractions_user_id_date_idx" ON "contractions"("user_id", "date");

-- CreateIndex
CREATE INDEX "contractions_anonymous_session_id_date_idx" ON "contractions"("anonymous_session_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "contractions_user_id_started_at_key" ON "contractions"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "contractions_anonymous_session_id_started_at_key" ON "contractions"("anonymous_session_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_user_id_date_key" ON "weight_entries"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "weight_entries_anonymous_session_id_date_key" ON "weight_entries"("anonymous_session_id", "date");

-- AddForeignKey
ALTER TABLE "symptom_checks" ADD CONSTRAINT "symptom_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "symptom_checks" ADD CONSTRAINT "symptom_checks_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kick_sessions" ADD CONSTRAINT "kick_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kick_sessions" ADD CONSTRAINT "kick_sessions_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kick_sessions" ADD CONSTRAINT "kick_sessions_pregnancy_id_fkey" FOREIGN KEY ("pregnancy_id") REFERENCES "pregnancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractions" ADD CONSTRAINT "contractions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractions" ADD CONSTRAINT "contractions_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractions" ADD CONSTRAINT "contractions_pregnancy_id_fkey" FOREIGN KEY ("pregnancy_id") REFERENCES "pregnancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Integrity rules (hand-written). New ContentKind values are not referenced here: Postgres
-- can't use an enum value in the transaction that adds it. visit_schedule and postpartum_guide
-- fall to the existing articles_kind_shape ELSE branch (structured sections, no week column);
-- a postpartum guide's week lives in its sections.
-- ---------------------------------------------------------------------------

ALTER TABLE "symptom_checks" ADD CONSTRAINT "symptom_checks_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "kick_sessions" ADD CONSTRAINT "kick_sessions_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "contractions" ADD CONSTRAINT "contractions_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);

ALTER TABLE "symptom_checks" ADD CONSTRAINT "symptom_checks_sizes" CHECK (
  cardinality("symptoms") BETWEEN 1 AND 30
  AND cardinality("matched_rules") <= 30
  AND "stage" IN ('pregnancy', 'postpartum', 'unknown')
);
ALTER TABLE "kick_sessions" ADD CONSTRAINT "kick_sessions_ranges" CHECK (
  "count" BETWEEN 0 AND 500
  AND ("ended_at" IS NULL OR "ended_at" >= "started_at")
);
ALTER TABLE "contractions" ADD CONSTRAINT "contractions_order" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");
ALTER TABLE "weight_entries" ADD CONSTRAINT "weight_entries_range" CHECK ("weight_kg" BETWEEN 20 AND 300);

ALTER TABLE "pregnancies" ADD CONSTRAINT "pregnancies_kick_threshold" CHECK (
  (num_nonnulls("kick_threshold_count", "kick_threshold_minutes") IN (0, 2))
  AND ("kick_threshold_count" IS NULL OR "kick_threshold_count" BETWEEN 1 AND 100)
  AND ("kick_threshold_minutes" IS NULL OR "kick_threshold_minutes" BETWEEN 10 AND 720)
);
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_quiet_hours" CHECK (
  num_nonnulls("quiet_hours_start", "quiet_hours_end") IN (0, 2)
  AND ("quiet_hours_start" IS NULL OR "quiet_hours_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  AND ("quiet_hours_end" IS NULL OR "quiet_hours_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
