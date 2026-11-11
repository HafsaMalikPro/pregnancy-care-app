# Pregnancy Care platform

| Folder | What it is | Stack |
| --- | --- | --- |
| [`backend/`](backend/README.md) | API + database | NestJS 12, Prisma 7, PostgreSQL, Better Auth (pnpm/Turborepo) |
| [`frontend/`](frontend/README.md) | Website | Next.js 16, TypeScript, Tailwind CSS 4 |

Run the backend first (Postgres in Docker + API on `:4000`), then the frontend on `:3000`.
Setup: [`backend/docs/LOCAL_SETUP.md`](backend/docs/LOCAL_SETUP.md) and [`frontend/README.md`](frontend/README.md).

Both folders keep their full commit history (merged in with `git log -- backend/` and `git log -- frontend/`).
