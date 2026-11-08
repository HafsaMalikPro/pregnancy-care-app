# Local setup

How to get the API running on your machine against a local database. Nothing here uses
production values, and no secret is written down anywhere: you generate your own.

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | `22.17.1` (from `.nvmrc`; `package.json` requires `>=22.17.0`) | `node --version` |
| pnpm | `11.17.0` (from `packageManager`) | `pnpm --version` (`corepack enable` installs it) |
| Docker | Docker Desktop or Engine with Compose v2 | `docker compose version` |
| OpenSSL | any recent version, used to generate the auth secret | `openssl version` |

## 2. Create `apps/api/.env`

The environment file lives in **`apps/api/`**, not in the repository root. The API, the Prisma
CLI, the seeds and the scripts all load it with `import 'dotenv/config'`, which reads `.env`
from the directory the command runs in, and every command runs from `apps/api`. A
`backend/.env` would be ignored.

```sh
cd apps/api
cp .env.example .env
chmod 600 .env

# Generate BETTER_AUTH_SECRET (48 random bytes, base64) and write it straight into .env.
# Nothing is printed.
SECRET="$(openssl rand -base64 48)" node -e '
  const fs = require("fs");
  const f = ".env";
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(
    /^BETTER_AUTH_SECRET=.*$/m, () => "BETTER_AUTH_SECRET=" + process.env.SECRET));
'
```

Optional locally, required in production: a field-encryption key, written the same way:

```sh
K="$(openssl rand -base64 32)" node -e '
  const fs = require("fs");
  const f = ".env";
  fs.writeFileSync(f, fs.readFileSync(f, "utf8")
    .replace(/^FIELD_ENCRYPTION_KEYS=.*$/m, () => "FIELD_ENCRYPTION_KEYS=k1:" + process.env.K)
    .replace(/^FIELD_ENCRYPTION_ACTIVE_KEY=.*$/m, "FIELD_ENCRYPTION_ACTIVE_KEY=k1"));
'
```

Without it, encryption is off locally and the API logs a warning. Rotation and migration of
existing data: `docs/DEPLOYMENT_SECURITY.md`.

`BETTER_AUTH_SECRET` is the only other secret the API needs locally. Everything else in
`.env.example` already has a safe local value. Every variable is documented there: what it does,
whether it's required, allowed values and its default. `src/config/env-example.spec.ts` fails if
the code reads a variable the template doesn't list.

Keep `EMAIL_PROVIDER=none` unless you're working on email. With `none`, password reset and
email verification routes return 404. For local email work, use `EMAIL_PROVIDER=log`, which
prints each message and its link to the API console. `resend` needs a real Resend account
(`EMAIL_FROM`, `RESEND_API_KEY`). Never put that key in a file that is committed.

`.env` is git-ignored (`.env`, `.env.*`, except `.env.example`). Check with:

```sh
git check-ignore -v apps/api/.env   # prints the matching .gitignore rule
git status --short                   # .env must not appear
```

Turn on the pre-commit hook once per clone. It refuses `.env` files and runs gitleaks
(installed, or through Docker) on what you stage:

```sh
git config core.hooksPath scripts/git-hooks
```

## 3. Start the database and run migrations

From `backend/`:

```sh
pnpm db:up           # PostgreSQL 17 in Docker: container preconception-db, port 5434,
                     # data in the named volume preconception-local_pgdata
pnpm install         # also runs prisma generate (postinstall)
cd apps/api
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

The database credentials in `infra/docker/docker-compose.yml` and `.env.example` are dev-only
and work only for this local container. `pnpm db:down` stops it; the data stays in the volume.

## 4. Run the API, tests and seeds

```sh
# from backend/
pnpm --filter api dev            # http://localhost:4000, OpenAPI UI at /docs

curl -s http://localhost:4000/v1/health        # {"status":"ok","database":"up"}
curl -s http://localhost:4000/v1/health/live   # {"status":"ok"}
```

Tests (from `backend/`):

```sh
pnpm test                                      # unit tests, no database
pnpm --filter api test:e2e                     # e2e against TEST_DATABASE_URL
pnpm --filter api test:coverage                # unit + e2e with coverage
```

The e2e suite only runs against `TEST_DATABASE_URL` (in `.env.example`: the
`preconception_e2e` database in the same container). It refuses non-local hosts and never falls
back to `DATABASE_URL`. Create that database once and migrate it:

```sh
docker exec preconception-db createdb -U preconception preconception_e2e
cd apps/api && DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" pnpm exec prisma migrate deploy
```

Sample content goes into the local database only. The seeds refuse to run unless
`DATABASE_URL` points at `localhost`/`127.0.0.1` and `NODE_ENV` is not `production`:

```sh
cd apps/api
pnpm dlx tsx prisma/seed.ts            # sample articles and week guides
pnpm dlx tsx prisma/seed-journey.ts    # sample 9-month journey content
```

Sample content is for development only. It is not clinically reviewed and must never be
loaded into a real environment.

## 5. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Invalid environment configuration: BETTER_AUTH_SECRET` at boot | `.env` copied from the template without generating the secret (it's empty there on purpose), or a value under 32 characters | Run the generate command in step 2 |
| `Invalid environment configuration: CORS_ORIGINS.0` (or `.1`, …) | An origin isn't exact: missing scheme (`localhost:3000`), trailing slash, a path, upper-case host or `*` | Use `scheme://host[:port]`, comma-separated: `http://localhost:3000,http://localhost:3001` |
| Changes to `backend/.env` have no effect | The code reads `apps/api/.env` only | Move the file to `apps/api/.env` |
| `Cannot connect to the Docker daemon` | Docker Desktop isn't running | `open -a Docker` (macOS), wait until `docker info` succeeds, then `pnpm db:up` |
| `Bind for 0.0.0.0:5434 failed: port is already allocated` | Another Postgres container (for example an older `preconception-postgres-1`) or a local Postgres holds 5434 | `docker ps -a` to find it, then stop that container or service |
| `P1001: Can't reach database server at localhost:5434` | Container not started or not healthy yet | `pnpm db:up`, then `docker ps` should show `preconception-db … (healthy)` |
| e2e: `Set TEST_DATABASE_URL to a disposable database…` | `TEST_DATABASE_URL` missing from `apps/api/.env` | Copy the line from `.env.example` and create the database (step 4) |
| e2e: `database "preconception_e2e" does not exist` | Test database not created yet | `docker exec preconception-db createdb -U preconception preconception_e2e`, then migrate it (step 4) |
| A shell variable overrides `.env` (for example a stale `TEST_DATABASE_URL`) | dotenv never overwrites variables already set in the shell | `unset TEST_DATABASE_URL` or open a new shell |
| `RATE_LIMITED` / 429 on sign-up while running the website's Playwright suite | Sign-up is limited to 10 per hour per IP and the suite signs up about 15 users | Set `RATE_LIMIT_ENABLED=false` in your local `.env` (production refuses it) |
| `EMAIL_PROVIDER: memory is for tests only` | `memory` set outside `NODE_ENV=test` | Use `none` or `log` locally |
| `REMINDER_DELIVERY_ENABLED: needs an EMAIL_PROVIDER` | Delivery on while email is `none` | Turn delivery off, or set `EMAIL_PROVIDER=log` |
| Password reset / verify email return 404 | `EMAIL_PROVIDER=none` disables those routes (documented in OpenAPI) | Set `EMAIL_PROVIDER=log` and restart |
| Everyone is signed out after changing `BETTER_AUTH_SECRET` | Sessions and stored 2FA secrets depend on it | Expected locally; never rotate it casually in a shared environment |

## Not configurable yet

There is no log-level variable: logging is fixed by `NODE_ENV` (JSON and redacted in
production).
