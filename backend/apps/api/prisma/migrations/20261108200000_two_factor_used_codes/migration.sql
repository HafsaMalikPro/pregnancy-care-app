-- TOTP replay protection (security finding F-01). A code accepted for a user is reserved here
-- until well after its validity window, so the same code cannot sign in twice. Only a digest
-- of (user, code) is stored. The primary key makes concurrent replays fail atomically.
CREATE TABLE "two_factor_used_codes" (
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "two_factor_used_codes_pkey" PRIMARY KEY ("code_hash")
);

CREATE INDEX "two_factor_used_codes_expires_at_idx" ON "two_factor_used_codes"("expires_at");
