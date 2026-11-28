# Utvecklings- och deploy-flöde (Media Hub)

Guide för daglig utveckling i den här workspace och push till produktion.

**Prod:** https://media.emmyzettergren.se · **GitHub:** `manoira/media-hub` · **Levande sajt:** Vercel auto-deploy från `main`

Push till `main` deployar fortfarande Vercel. Branchen `v2-local-foundation` deployar inte. Nästa publiceringsmål är Cloudflare Workers, och det är inte publicerat. DNS är oförändrad. Se `docs/CLOUDFLARE.md`.

---

## Engångs-setup (den här workspace)

1. `corepack pnpm install`
2. Skapa `artifacts/api-server/.env` (se `.env.example`):
   - `TMDB_API_KEY`
   - `DATABASE_URL` — **dev-databas** (Neon branch), aldrig prod
   - `PORT=5000`
3. Valfritt: `corepack pnpm config set verify-deps-before-run false` (Windows)

**Portar:** frontend **5174**, API **5000** (se `replit.md`).

---

## Lokal utveckling (två terminaler)

**Terminal 1 — API:**
```powershell
cd artifacts/api-server
corepack pnpm --filter @workspace/api-server run build
node --enable-source-maps --env-file=.env dist/index.mjs
```

**Terminal 2 — Frontend:**
```powershell
$env:PORT="5174"; $env:BASE_PATH="/"
corepack pnpm --filter @workspace/media-tracker run dev
```

Öppna http://localhost:5174 — `/api` proxas till port 5000.

| Funktion | Kräver DB lokalt? |
| -------- | ----------------- |
| Browse, Search, detaljsidor | Nej (bara TMDB) |
| My List, Stats, progress | Ja |

---

## Checklista innan push

| Du ändrat… | Gör också… |
| ---------- | ---------- |
| Bara UI (`artifacts/media-tracker/`) | Testa lokalt |
| API (`artifacts/api-server/`) | Bygg om API, testa `/api/watchlist` |
| OpenAPI (`lib/api-spec/openapi.yaml`) | `corepack pnpm --filter @workspace/api-spec run codegen` |
| DB-schema (`lib/db/src/schema/`) | `push` mot **dev-DB**; planera **prod-migrering** före deploy |
| Genererade filer (`lib/api-client-react`, `lib/api-zod`) | Committa tillsammans med OpenAPI-ändringen |

Kör vid behov: `corepack pnpm run typecheck`

---

## Push till produktion

Standardflöde:

```text
Utveckla → testa lokalt → git commit → git push origin main → Vercel deployar
```

Efter deploy (1–2 min):

1. https://media.emmyzettergren.se/api/healthz → `{"status":"ok"}`
2. https://media.emmyzettergren.se/api/watchlist → **200** (inte 500)
3. My List visar titlar

---

## Databasschema och prod (viktigt)

Prod kraschar om koden förväntar sig kolumner/tabeller som inte finns i Neon.

**Innan deploy av schema-ändringar**, kör mot prod (pooled Neon-URL från Vercel):

```powershell
$env:DATABASE_URL="<prod pooled url>"
corepack pnpm --filter @workspace/db run push-force
```

Alternativ: kör SQL i Neon-konsolen (t.ex. `lib/db/migrations/*.sql`).

**Regel:** lokal dev = dev-DB. Prod-DB = bara medveten migrering.

Vad som återstår på `v2-local-foundation` står i `docs/V2-REMAINING.md`. Migrationerna 006–009 ska inte köras mot produktion förrän den branchen ska publiceras.

---

## Push-alternativ (välj med agenten)

Skriv **`push`** eller **`/push`** i Cursor. Agenten analyserar diffen och frågar hur du vill gå vidare:

| Alternativ | När |
| ---------- | --- |
| **Push direkt till main** | Enbart frontend, eller backend utan schema-ändringar |
| **Push + prod schema först** | Ändringar i `lib/db/src/schema/` |
| **Push + verifiera efter deploy** | API-ändringar som påverkar watchlist/stats |
| **Skapa PR istället** | Större eller riskfyllda ändringar |
| **Bara commit, ingen push** | Spara lokalt, deploy senare |
| **Avvakta** | Agenten hittat blockerare (typecheck, codegen saknas, m.m.) |

---

## Felsökning prod

| Symptom | Trolig orsak |
| ------- | ------------- |
| My List tom, `/api/watchlist` → 500 | Schema/code mismatch — se Vercel Function Logs |
| Browse funkar, My List inte | DB-route kraschar; TMDB OK |
| Deploy lyckas men gammal UI | Hard refresh / cache |
| E-post om misslyckad Render-deploy | Suspend/delete `media-hub` i Render Dashboard — prod är bara Vercel |

**Loggar:** Vercel → project `media-hub` → Deployments → senaste → Functions / Logs

---

## Relaterade filer

- `docs/VERCEL.md` — Vercel/Neon/DNS
- `replit.md` — kommandon, portar, backup (`data/watchlist.json`)
- `.cursor/rules/push-workflow.mdc` — agent-regel för push
- `.cursor/commands/push.md` — slash-kommando `/push`
