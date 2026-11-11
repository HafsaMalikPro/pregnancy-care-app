-- Sign-in lockout counters (per account and per IP), keyed by a digest, never a raw email.
CREATE TABLE "auth_throttles" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "locked_until" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "auth_throttles_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "auth_throttles_failures_nonnegative" CHECK ("failures" >= 0)
);

CREATE INDEX "auth_throttles_updated_at_idx" ON "auth_throttles"("updated_at");

-- Absolute session lifetime: whatever Better Auth's sliding refresh asks for, a session never
-- lives longer than 30 days after it was created. Enforced in the database so every code path
-- (Nest routes and Better Auth's own endpoints) sees the same expiry.
CREATE FUNCTION "cap_auth_session_lifetime"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."expires_at" > NEW."created_at" + interval '30 days' THEN
    NEW."expires_at" := NEW."created_at" + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "auth_sessions_absolute_lifetime"
BEFORE INSERT OR UPDATE OF "expires_at", "created_at" ON "auth_sessions"
FOR EACH ROW EXECUTE FUNCTION "cap_auth_session_lifetime"();

-- Existing sessions: apply the same cap now.
UPDATE "auth_sessions"
SET "expires_at" = "created_at" + interval '30 days'
WHERE "expires_at" > "created_at" + interval '30 days';
