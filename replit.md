# Media Hub

Track movies and TV shows with TMDB discovery, watchlist, episode progress, and stats.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Local development on Windows

This repo targets Replit (Linux x64), but it also runs locally on Windows. Notes:

- Use `corepack pnpm ...` to invoke pnpm (the global shim can't be written under `C:\Program Files\nodejs`).
- Windows-native binaries (`rollup`/`esbuild`/`lightningcss`/`@tailwindcss/oxide` `win32-x64`) are enabled in `pnpm-workspace.yaml`; Linux/Replit is unaffected (optional deps).
- Secrets live in `artifacts/api-server/.env` (gitignored). See `artifacts/api-server/.env.example`. Required: `TMDB_API_KEY`, `DATABASE_URL`, `PORT`.

Run both services (two terminals):

```powershell
# 1) API server (port 5000) — TMDB + Postgres
cd artifacts/api-server
corepack pnpm --filter @workspace/api-server run build   # rebuild after API code changes
node --enable-source-maps --env-file=.env dist/index.mjs

# 2) Frontend (port 5174) — proxies /api -> http://localhost:5000
$env:PORT="5174"; $env:BASE_PATH="/"; corepack pnpm --filter @workspace/media-tracker run dev
```

- TMDB browse/search/trending/details work with just `TMDB_API_KEY` (no DB needed).
- Watchlist/Stats/progress need a real `DATABASE_URL`. **Use a separate dev database — never point local dev at the production/published DB.**

### Backing up / moving tracked data

A backup of the tracked data lives at `data/watchlist.json` (committed). Scripts read the DB from `DATABASE_URL`:

```powershell
# Export from a DB (e.g. production, read-only) -> data/watchlist.json
$env:DATABASE_URL="<source-url>"; corepack pnpm --filter @workspace/scripts run export-data

# Import data/watchlist.json into a DB (REPLACES rows — dev DB only)
$env:DATABASE_URL="<dev-url>"; corepack pnpm --filter @workspace/db run push        # create tables first
$env:DATABASE_URL="<dev-url>"; corepack pnpm --filter @workspace/scripts run import-data
```

## Production (Vercel — primary)

- **URL:** https://media.emmyzettergren.se/ (after DNS) · https://media-hub-one.vercel.app/ (Vercel alias)
- **Host:** Vercel project `media-hub`, auto-deploys from `main` on GitHub
- **Build:** `pnpm --filter @workspace/api-server run build` (see `vercel.json`)
- **Health check:** `/api/healthz`
- **Env on Vercel:** `DATABASE_URL` (Neon **pooled** URL), `TMDB_API_KEY`, `NODE_ENV=production`, `BASE_PATH=/`
- **Architecture:** Vite static output + serverless Express for `/api/*` (see `docs/VERCEL.md`, `api/index.mjs`)
- **Neon production host:** `ep-wandering-morning-apbbwjdd` (us-east-1). Set this in Vercel **Production** `DATABASE_URL`. Local `.env` uses dev DB only.
- **DNS:** At Websupport/Loopia, add **A** record `media` → `76.76.21.21` (see Vercel → Domains for current value)

**Render:** Avvecklat. Suspend/delete service `media-hub` in Render Dashboard if deploy notifications still arrive after push.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

### Local dev port registry

Each Cursor project gets its own dedicated localhost port so multiple dev servers can run side by side without collisions. Assign the next free port to any new project (uploaded or created in Cursor):

| Port | Project |
| ---- | ------- |
| 5173 | mail-web-client |
| 5174 | media-hub (this project — `@workspace/media-tracker`) |
| 5175 | notes_hub |
| 5176 | _next new project_ |

Start this project's web app with:

```powershell
$env:PORT="5174"; $env:BASE_PATH="/"; corepack pnpm --filter @workspace/media-tracker run dev
```

## Gotchas

- The root `preinstall` hook uses `sh`, which doesn't exist on Windows, so every `corepack pnpm install` ends with a benign `'sh' is not recognized ... preinstall: Failed` — package linking still completes.
- pnpm re-runs `install` before any `run` script; on Windows that re-triggers the failing `sh` hook. Disable it locally with `corepack pnpm config set verify-deps-before-run false` (already set).
- The frontend dev server uses `strictPort`. On Windows `localhost` resolves to IPv6 first — if another project's dev server holds the port on `::1`, you'll silently hit the wrong app. Keep one port per project (see port registry).
- Never point local dev at the production/published `DATABASE_URL`; use a separate dev DB (Neon branch or fresh project + `import-data`).

## Pointers

- **Dev + push workflow:** `docs/DEV-WORKFLOW.md` — use **`/push`** in Cursor for guided deploy
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
