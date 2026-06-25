# AGENTS.md

## Cursor Cloud specific instructions

This repo is **Media Hub** (`workspace`): a **pnpm** monorepo (npm/yarn are blocked by the root
`preinstall` hook). Key packages: `artifacts/api-server` (Express API, esbuild bundle, port
**5000**), `artifacts/media-tracker` (Vite + React UI, port **5174**), and `lib/db` (PostgreSQL +
Drizzle ORM). Standard commands live in `.cursor/rules/media-hub-ops.mdc`, `docs/DEV-WORKFLOW.md`,
and the package `package.json`s. Non-obvious things for this VM:

- **Use `corepack pnpm`** for all commands. Quality gate is `corepack pnpm run typecheck` (passes;
  there is no eslint). `prettier` is available for formatting.
- **esbuild build-script approval:** pnpm marks `esbuild` build as "ignored", which makes any
  `pnpm run` fail with `ERR_PNPM_IGNORED_BUILDS` during the deps-status check. Fix is idempotent:
  run `corepack pnpm rebuild esbuild` once after install (the update script already does this).
  esbuild's JS API itself works regardless (bundles build fine).

- **PostgreSQL is required even to *start* the api-server** (`lib/db` throws if `DATABASE_URL`
  is unset). A local Postgres 16 cluster is provisioned in the VM snapshot with database/role
  `mediahub` / password `mediahub`. It is **not auto-started** — start it each session with:
  `sudo pg_ctlcluster 16 main start` (verify with `pg_lsclusters`). Connection string:
  `postgresql://mediahub:mediahub@127.0.0.1:5432/mediahub`. Apply the schema with
  `DATABASE_URL=... corepack pnpm --filter @workspace/db run push` (idempotent).
- **Env loading in dev:** the `api-server` `dev`/`start` scripts run plain
  `node dist/index.mjs` and do **not** read `.env`. Export env vars in the shell before running,
  e.g. `export DATABASE_URL=postgresql://mediahub:mediahub@127.0.0.1:5432/mediahub`, or use
  `--env-file=.env` (see `.cursor/rules/media-hub-ops.mdc`). `artifacts/api-server/.env` is
  gitignored — create it from `.env.example`.
- **Run services:**
  - API: `export DATABASE_URL=... NODE_ENV=development PORT=5000` then
    `corepack pnpm --filter @workspace/api-server run dev` → builds, then serves on :5000.
    Health: `curl http://127.0.0.1:5000/api/healthz` → `{"status":"ok"}`.
  - Frontend: `PORT=5174 BASE_PATH=/ corepack pnpm --filter @workspace/media-tracker run dev`.
- **`TMDB_API_KEY` is required for all content** (trending/search/browse and adding to the
  watchlist — see `artifacts/api-server/src/lib/tmdb.ts`). Without it the UI renders and the
  DB-backed pages (`/watchlist`, `/stats`) work, but TMDB sections stay empty and
  `/api/trending` returns 500. The key is a user-provided secret, not present by default.
- No automated test suite is configured.
