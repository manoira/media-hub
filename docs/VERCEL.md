# Deploy Media Hub on Vercel

Vercel hosts the **React frontend** and **Express API** on the same domain — same architecture as Render, with a serverless entrypoint.

## What gets deployed

| Path | Purpose |
| ---- | ------- |
| `/` | React app (Vite build from `artifacts/media-tracker/dist/public`) |
| `/api/*` | Express API (watchlist, progress, stats, TMDB proxy) |
| `/api/healthz` | Health check |

Storage uses **Neon PostgreSQL** (watchlist, episode progress, stats). TMDB metadata uses `TMDB_API_KEY`.

## 1. Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com/) and sign in
2. **Add New → Project**
3. Import **`manoira/media-hub`**
4. Vercel reads `vercel.json`:
   - Install: `corepack enable && pnpm install`
   - Build: `pnpm --filter @workspace/api-server run build`
5. Deploy (first deploy needs env vars — step 3)

## 2. Add Neon Postgres

1. Vercel project → **Storage** / **Marketplace** → **Neon**
2. Create or link a database
3. Use a **separate branch/database for Preview** vs Production
4. Copy the **pooled** connection string (`-pooler` in hostname) for `DATABASE_URL`

## 3. Environment variables

In **Project → Settings → Environment Variables**:

| Variable | Value | Environments |
| -------- | ----- | ------------ |
| `DATABASE_URL` | Neon **pooled** connection string | Production, Preview (different DBs) |
| `TMDB_API_KEY` | TMDB v3 API key | Production, Preview |
| `NODE_ENV` | `production` | Production, Preview |
| `BASE_PATH` | `/` | Production, Preview |

Do **not** set `PORT` on Vercel.

Redeploy after adding variables.

**Important:** Use a **preview-only** database for Preview deployments. Never point Preview at the production Neon database.

### Initial database setup

After the first deploy with `DATABASE_URL` set, run locally against the target database:

```powershell
$env:DATABASE_URL="<neon-url>"
corepack pnpm --filter @workspace/db run push
corepack pnpm --filter @workspace/scripts run import-data   # optional — loads data/watchlist.json
```

## 4. Custom domain (media.emmyzettergren.se)

1. Vercel project → **Settings → Domains**
2. Add `media.emmyzettergren.se`
3. At Websupport/Loopia DNS, add **A** record:

   | Name | Type | Value |
   | ---- | ---- | ----- |
   | `media` | A | `76.76.21.21` |

   (Confirm the exact IP in Vercel → Domains if it differs.)
4. Wait for SSL (automatic)

This does not affect `emmyzettergren.se` (Notes Hub) — separate Vercel project.

## 5. Verify

1. Open your Vercel URL or `https://media.emmyzettergren.se`
2. Visit `/api/healthz` — should return `{"status":"ok"}`
3. Browse / Search — TMDB content loads
4. Add to watchlist — persists after reload
5. Test on a second device — same watchlist (shared Postgres)

## Migration from Render

When Vercel production is verified:

1. Pause or disable auto-deploy on Render (`media-hub-05s0.onrender.com`)
2. Reuse the **same production** `DATABASE_URL` from Render/Neon on Vercel Production — no data migration needed if using the same Neon project

## Local development with Vercel

```powershell
npm install -g vercel
vercel link          # once — link to your Vercel project
vercel env pull .env.local
vercel dev
```

For day-to-day dev, the two-terminal setup in `replit.md` is still recommended (port 5174 + 5000).

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `/api/healthz` 404 | Redeploy after build; check `vercel.json` rewrites |
| Watchlist empty / DB errors | Run `db push` against production Neon (see below); verify pooled `DATABASE_URL` on Vercel |
| `/api/watchlist` returns 500 | Check Vercel function logs. Often a schema/code mismatch — ensure deployed code matches the production Postgres schema. Optional: run `lib/db/migrations/001_add_original_language.sql` in Neon if enabling language storage later. |
| TMDB search fails | Set `TMDB_API_KEY` and redeploy |
| Cold start slow | Normal on Hobby tier — first request may take a few seconds |
