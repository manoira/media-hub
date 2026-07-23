# AGENTS.md

## Cursor Cloud specific instructions

This repo is **Media Hub** (`workspace`): a **pnpm** monorepo movie/TV tracker (npm/yarn are blocked
by the root `preinstall` hook). Key packages: `artifacts/api-server` (Express API, esbuild bundle,
port **5000**), `artifacts/media-tracker` (Vite + React UI, port **5174**, proxies `/api` → :5000),
and `lib/db` (PostgreSQL + Drizzle ORM). Standard commands live in `.cursor/rules/media-hub-ops.mdc`,
`docs/DEV-WORKFLOW.md`, `replit.md`, and the package `package.json`s. Non-obvious things for this VM:

### Toolchain (Node 24 + pnpm 10)
- **Node 24** is installed via `nvm` and selected for login shells by `~/.bashrc`. A shadowing
  `/exec-daemon/node` (v22) is first on `PATH` in bare/non-login shells, so prefer login shells
  (`bash -l`) or run `nvm use 24`. The startup update script re-selects Node 24 before installing.
- **Use pnpm 10** (pinned via `corepack prepare pnpm@10.34.5 --activate`). Do **not** use pnpm 11:
  it treats the (already-approved) `esbuild` build script as an ignored build and makes
  `pnpm install` exit 1 (`ERR_PNPM_IGNORED_BUILDS`), which cascades into every `pnpm run` via the
  deps-status check. pnpm 10 honours `onlyBuiltDependencies` and runs esbuild's postinstall cleanly.
  Both `pnpm` and `corepack pnpm` resolve to 10.34.5.

### PostgreSQL (required even to *start* the API)
- `lib/db` throws at import if `DATABASE_URL` is unset, so the api-server won't boot without it.
- A local Postgres 16 cluster is in the VM snapshot with role/db `mediahub` / `mediahub`. It is
  **not auto-started** — run each session: `sudo pg_ctlcluster 16 main start` (check `pg_lsclusters`).
  Connection string: `postgresql://mediahub:mediahub@127.0.0.1:5432/mediahub`.
- Apply/refresh schema (idempotent): `DATABASE_URL=... pnpm --filter @workspace/db run push`.

### Env loading in dev
- The `api-server` `dev`/`start` scripts run plain `node dist/index.mjs` and do **not** read `.env`.
  Export vars in the shell before running, or use `--env-file=.env`. `artifacts/api-server/.env` is
  gitignored — create it from `.env.example`.

### Running the services
- **API:** `export DATABASE_URL=postgresql://mediahub:mediahub@127.0.0.1:5432/mediahub NODE_ENV=development PORT=5000 BASE_PATH=/`
  then `pnpm --filter @workspace/api-server run dev` (builds, then serves on :5000).
  Health: `curl http://127.0.0.1:5000/api/healthz` → `{"status":"ok"}`. Note: when a frontend
  static build exists and `VERCEL` is unset, the API also serves the built UI on :5000.
- **Frontend (dev, HMR):** `PORT=5174 BASE_PATH=/ pnpm --filter @workspace/media-tracker run dev`
  → http://localhost:5174 (proxies `/api` to :5000, override with `API_PROXY_TARGET`).

### TMDB_API_KEY (user secret, required for content)
- All discovery — trending/search/browse, detail pages, and enriching watchlist/list additions —
  needs `TMDB_API_KEY` (see `artifacts/api-server/src/lib/tmdb.ts`). It is **not** present by default.
  Without it: the UI renders and DB-backed features (My List, Lists/Collections, Stats, adding a
  title, changing status, creating custom lists) work, but TMDB sections stay empty and endpoints
  like `/api/trending` return 500. Poster images use the public TMDB CDN and load without the key.

### Quality gate / tests
- Quality gate is `pnpm run typecheck` (there is no eslint; `prettier` is available for formatting).
  **Known pre-existing failure:** `typecheck:libs` (`tsc --build`) fails in `lib/api-zod/src/index.ts`
  with TS2308 duplicate exports of `GetPersonCreditsParams` / `GetSimilarMediaParams` (the names are
  emitted as both a zod const in `generated/api.ts` and a type in `generated/types/`). This exists on
  `main` too and is reproduced verbatim by `orval` codegen — it is a repo/codegen issue, not an
  environment problem. `pnpm --filter @workspace/media-tracker run typecheck` passes on its own.
- No automated test suite is configured.
