# syntax=docker/dockerfile:1.7
#
# Production image for the API. Build from the backend/ directory:
#   docker build -f apps/api/Dockerfile -t pregnancy-care-api .
# Run (read-only root filesystem; secrets from the environment, never baked in):
#   docker run --read-only --tmpfs /tmp --env-file <secrets> -p 4000:4000 pregnancy-care-api
# Migrations run from the separate `migrate` target, which has the Prisma CLI:
#   docker build -f apps/api/Dockerfile --target migrate -t pregnancy-care-api-migrate .

# Node 22.17.1 on Alpine 3.22, pinned by digest (multi-arch index). Dependabot proposes updates.
ARG NODE_IMAGE=node:22.17.1-alpine3.22@sha256:5539840ce9d013fa13e3b9814c9353024be7ac75aca5db6d039504a56c04ea59

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN corepack enable
# Manifests first so the dependency layer is cached between source changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/utils/package.json packages/utils/
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
# prisma generate (postinstall) reads DATABASE_URL from prisma.config.ts but never connects;
# this placeholder exists only for that command and is not kept in any image.
RUN DATABASE_URL=postgresql://build:build@build.invalid:5432/build pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://build:build@build.invalid:5432/build pnpm --filter @preconception/api... build
# A self-contained production install of the API: no dev dependencies. Install scripts are
# skipped: the generated Prisma client is already compiled into dist/.
RUN pnpm --filter @preconception/api deploy --prod --legacy --ignore-scripts /out \
 && cp -r apps/api/dist /out/dist

# Migration job: the build stage already has the Prisma CLI and the migrations.
FROM build AS migrate
WORKDIR /repo/apps/api
# The official image's `node` user (uid/gid 1000), numeric so any runtime resolves it.
USER 1000:1000
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Root-owned and read-only for the app user: the process cannot modify its own code.
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
# The official image's `node` user (uid/gid 1000), numeric so any runtime resolves it.
USER 1000:1000
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:4000/v1/health/live"]
CMD ["node", "dist/main.js"]
