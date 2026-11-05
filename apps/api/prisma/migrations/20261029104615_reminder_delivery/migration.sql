-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('none', 'email');

-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled');

-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "channel" "ReminderChannel" NOT NULL DEFAULT 'none',
ADD COLUMN     "next_run_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "reminder_deliveries" (
    "id" UUID NOT NULL,
    "reminder_id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL,
    "last_error_code" TEXT,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reminder_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_deliveries_status_next_attempt_at_idx" ON "reminder_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_deliveries_reminder_id_scheduled_for_key" ON "reminder_deliveries"("reminder_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "reminders_next_run_at_idx" ON "reminders"("next_run_at");

-- AddForeignKey
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_reminder_id_fkey" FOREIGN KEY ("reminder_id") REFERENCES "reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guests have no email address, so only account-owned reminders can be delivered by email.
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_email_needs_user"
  CHECK ("channel" = 'none' OR "user_id" IS NOT NULL);
