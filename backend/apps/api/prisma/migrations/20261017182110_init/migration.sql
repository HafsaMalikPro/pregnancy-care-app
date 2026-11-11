-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'pending_deletion', 'deleted');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('support', 'content_editor', 'clinical_reviewer', 'administrator');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'in_review', 'approved', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('pending', 'approved', 'changes_requested');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('health_data_processing', 'product_analytics', 'marketing_email');

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('app_store', 'play_store', 'web');

-- CreateEnum
CREATE TYPE "EntitlementState" AS ENUM ('active', 'grace_period', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "PrivacyJobKind" AS ENUM ('export', 'deletion');

-- CreateEnum
CREATE TYPE "PrivacyJobStatus" AS ENUM ('requested', 'processing', 'completed', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "image" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "staff_role" "StaffRole",
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMPTZ,
    "refresh_token_expires_at" TIMESTAMPTZ,
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_sessions" (
    "id" UUID NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "linked_user_id" UUID,
    "linked_at" TIMESTAMPTZ,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "time_zone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "planning_horizon_months" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cycles" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "period_start" DATE NOT NULL,
    "period_end" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "date" DATE NOT NULL,
    "symptoms" TEXT[],
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "readiness_tasks" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "article_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "readiness_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_task_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "task_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_task_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "references" JSONB NOT NULL DEFAULT '[]',
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ,
    "next_review_due" DATE,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reviews" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "reviewer_credentials" TEXT NOT NULL,
    "decision" "ReviewDecision" NOT NULL DEFAULT 'pending',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "comments" TEXT,
    "due_at" DATE,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "purpose" "ConsentPurpose" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "policy_version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "anonymous_session_id" UUID,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "local_time" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "product_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "state" "EntitlementState" NOT NULL,
    "current_period_end" TIMESTAMPTZ,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" UUID NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "subscription_id" UUID,
    "type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ,
    "error" TEXT,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "kind" "PrivacyJobKind" NOT NULL,
    "status" "PrivacyJobStatus" NOT NULL DEFAULT 'requested',
    "result_ref" TEXT,
    "error" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "privacy_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_key" ON "auth_sessions"("token");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_id_account_id_key" ON "auth_accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_sessions_credential_hash_key" ON "anonymous_sessions"("credential_hash");

-- CreateIndex
CREATE INDEX "anonymous_sessions_expires_at_idx" ON "anonymous_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_anonymous_session_id_key" ON "profiles"("anonymous_session_id");

-- CreateIndex
CREATE INDEX "cycles_user_id_period_start_idx" ON "cycles"("user_id", "period_start" DESC);

-- CreateIndex
CREATE INDEX "cycles_anonymous_session_id_period_start_idx" ON "cycles"("anonymous_session_id", "period_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "cycles_user_id_period_start_key" ON "cycles"("user_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "cycles_anonymous_session_id_period_start_key" ON "cycles"("anonymous_session_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_user_id_date_key" ON "daily_logs"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_logs_anonymous_session_id_date_key" ON "daily_logs"("anonymous_session_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "readiness_tasks_key_key" ON "readiness_tasks"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_task_progress_user_id_task_id_key" ON "user_task_progress"("user_id", "task_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_task_progress_anonymous_session_id_task_id_key" ON "user_task_progress"("anonymous_session_id", "task_id");

-- CreateIndex
CREATE INDEX "articles_slug_locale_status_idx" ON "articles"("slug", "locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "articles_slug_locale_version_key" ON "articles"("slug", "locale", "version");

-- CreateIndex
CREATE INDEX "content_reviews_article_id_idx" ON "content_reviews"("article_id");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_created_at_idx" ON "consent_records"("user_id", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "consent_records_anonymous_session_id_purpose_created_at_idx" ON "consent_records"("anonymous_session_id", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscriptions_user_id_state_idx" ON "subscriptions"("user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_external_id_key" ON "subscriptions"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_events_provider_provider_event_id_key" ON "subscription_events"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "privacy_jobs_user_id_kind_idx" ON "privacy_jobs"("user_id", "kind");

-- CreateIndex
CREATE INDEX "privacy_jobs_status_idx" ON "privacy_jobs"("status");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_action_created_at_idx" ON "audit_events"("action", "created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_sessions" ADD CONSTRAINT "anonymous_sessions_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "readiness_tasks" ADD CONSTRAINT "readiness_tasks_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_progress" ADD CONSTRAINT "user_task_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_progress" ADD CONSTRAINT "user_task_progress_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_task_progress" ADD CONSTRAINT "user_task_progress_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "readiness_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reviews" ADD CONSTRAINT "content_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_anonymous_session_id_fkey" FOREIGN KEY ("anonymous_session_id") REFERENCES "anonymous_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_jobs" ADD CONSTRAINT "privacy_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma cannot express
-- ---------------------------------------------------------------------------

-- Every user-owned row has exactly one owner: a registered user or an anonymous session.
ALTER TABLE "profiles"           ADD CONSTRAINT "profiles_single_owner"           CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "cycles"             ADD CONSTRAINT "cycles_single_owner"             CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "daily_logs"         ADD CONSTRAINT "daily_logs_single_owner"         CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "user_task_progress" ADD CONSTRAINT "user_task_progress_single_owner" CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "consent_records"    ADD CONSTRAINT "consent_records_single_owner"    CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);
ALTER TABLE "reminders"          ADD CONSTRAINT "reminders_single_owner"          CHECK (num_nonnulls("user_id", "anonymous_session_id") = 1);

-- Period ranges are valid and of plausible length.
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_valid_range"
  CHECK ("period_end" IS NULL OR ("period_end" >= "period_start" AND "period_end" - "period_start" <= 30));

-- No two periods for the same owner may overlap (open-ended periods count as one day).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_no_overlap_user"
  EXCLUDE USING gist ("user_id" WITH =, daterange("period_start", COALESCE("period_end", "period_start"), '[]') WITH &&)
  WHERE ("user_id" IS NOT NULL);
ALTER TABLE "cycles" ADD CONSTRAINT "cycles_no_overlap_anonymous"
  EXCLUDE USING gist ("anonymous_session_id" WITH =, daterange("period_start", COALESCE("period_end", "period_start"), '[]') WITH &&)
  WHERE ("anonymous_session_id" IS NOT NULL);

-- Reminder times are HH:MM.
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_local_time_format" CHECK ("local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- At most one published version per article slug and locale.
CREATE UNIQUE INDEX "articles_one_published_per_slug" ON "articles" ("slug", "locale") WHERE "status" = 'published';
