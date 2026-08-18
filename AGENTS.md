# AGENTS.md

Media Hub — a pnpm-workspace monorepo for tracking movies/TV (TMDB discovery, watchlist,
episode progress, stats). Primary docs live in `replit.md` and `docs/DEV-WORKFLOW.md`.
Two dev services: the API server (`@workspace/api-server`, port **5000**) and the web app
(`@workspace/media-tracker`, port **5174**, proxies `/api` → `:5000`).

## Cursor Cloud specific instructions

Dependencies (Node 24, pnpm via corepack, PostgreSQL 16) are already installed on the VM and
`pnpm install` is run automatically on startup. Standard commands are documented in `replit.md`
and `docs/DEV-WORKFLOW.md`. The notes below are the non-obvious, cloud-specific caveats.

### Node version
- The repo targets Node **24** (`.replit` → `nodejs-24`). The VM has a Node 22 binary at
  `/exec-daemon/node` earlier in `PATH`; login shells prepend nvm's Node 24 (via `~/.bashrc`),
  so `node -v` reports 24 in normal shells. If a command unexpectedly runs on Node 22, use a
  login shell (`bash -lc '...'`) or `nvm use 24`.

### PostgreSQL (local dev DB)
- Postgres does not auto-start. Start it each session: `sudo pg_ctlcluster 16 main start`.
- Local dev database (already created, persists on disk):
  `postgresql://mediahub:mediahub@127.0.0.1:5432/mediahub`. Never point local dev at the
  production/Neon DB.
- Apply schema after changes: `pnpm --filter @workspace/db run push`.

### Environment variables / secrets
- `artifacts/api-server/.env` (gitignored) holds `PORT=5000`, `BASE_PATH=/`, `DATABASE_URL`
  (the local dev URL above), and `TMDB_API_KEY`. Recreate it if missing.
- Note: `pnpm --filter @workspace/api-server run dev` does **not** auto-load `.env`; it reads
  from the shell env. Either export vars in the shell, or run the built server with
  `node --enable-source-maps --env-file=.env dist/index.mjs`.
- `TMDB_API_KEY` is required for browse/search/trending/details (those endpoints return HTTP 500
  without it). Watchlist/Lists/Stats are DB-backed and work fully without TMDB. Add
  `TMDB_API_KEY` as a Cursor secret to enable the full experience.

### Running the two services
- API (from `artifacts/api-server`): `pnpm --filter @workspace/api-server run build` then
  `node --enable-source-maps --env-file=.env dist/index.mjs` (serves on :5000 and also serves the
  built frontend). `run dev` = build + start.
- Web app: `PORT=5174 BASE_PATH=/ pnpm --filter @workspace/media-tracker run dev`, then open
  http://localhost:5174 (`/api` is proxied to :5000). `PORT` and `BASE_PATH` are required by
  `vite.config.ts` or it throws.

### Known caveat
- `pnpm run typecheck` currently fails with a pre-existing duplicate-export error in generated
  code (`lib/api-zod/src/generated/api.ts` → `GetPersonCreditsParams` / `GetSimilarMediaParams`).
  This is unrelated to environment setup. The esbuild-based API build and the Vite frontend build
  both succeed regardless.
