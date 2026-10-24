# Cloudflare Workers som nästa publiceringsmål

24 oktober 2026. Den levande sajten är kvar på Vercel `main`. DNS är oförändrad. Ingen worker är publicerad och `wrangler deploy` ska inte köras från de här filerna.

## Vad som är provat lokalt

Wrangler 4.152.0 startar Express via `httpServerHandler` från `cloudflare:node`. `app.listen(3000)` och `export default httpServerHandler({ port: 3000 })` är adaptern i `artifacts/api-server/src/cloudflare-entry.ts`. Compatibility date är `2026-10-24`, så `nodejs_compat` läggs inte till för hand. Statiska filer är Vite-byggets `dist/public`, med SPA-fallback. `/api/*` går till workern först.

Det gröna testet är `artifacts/api-server/src/cloudflare-worker.test.ts`. Det kör en separat harness i workerd, med syntetiska svar och utan riktig databas:

- `GET /api/healthz` svarar 200.
- `GET /api/session` svarar 200, `private, no-store`, och `authenticated: false`.
- `POST /api/session/login` utan CSRF svarar 403 innan någon databasfråga.
- `GET /api/lists` utan cookie svarar 401 innan någon databasfråga.
- Sessionshashen matchar SHA-256 av en fixtur.
- Produktionscookien innehåller `HttpOnly` och `Secure` och ingen `Domain`.
- Katalogens ETag ger 200 med `private, no-cache`, och samma anrop igen ger 304 med tom kropp.
- En listpost behåller titel, status och anteckning. Nyckelords-id är tomma och beskrivningen är 180 tecken.
- Exportlåset, i ett minne som bara liknar SQL, ger claimed, busy, claimed inuti en transaktion, och claimed igen efter rollback.
- En statisk HTML-sida och dess skript serveras.

`pino-http` kraschar i workerd på `stringifySym`. Wrangler-konfigurationen aliasar därför `pino-http` till en kort logg som skriver metod, sökväg och status, utan query, cookie eller kropp. Node-servern använder fortfarande riktig `pino-http`. Harnessen sätter `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`, så den lokala `.env` inte följer med. Fixturtestet använder `127.0.0.1:9`.

I Workers stängs varje poolad databasanslutning efter en fråga. Ett andra anrop mot en kvarhållen pool hängde sig i workerd. Transaktioner använder en egen klient som stängs i samma anrop.

## Gränser

Källa: Cloudflare Workers limits, sidan senast uppdaterad 12 oktober 2026. Free: 100 000 requests per dag, 10 ms CPU per HTTP-anrop, 128 MB minne, 50 subrequests, och obegränsad väntetid så länge klienten är ansluten. Betald plan har inget requesttak och 30 sekunder CPU som standard. `limits.cpu_ms` sätts inte här.

Lokal mätning mot den återställda testytan, 24 oktober: en fråga efter 1254 beskrivningar tog 354 ms väggklocka, och `JSON.stringify` av den texten tog 1 ms för 349 472 byte. Väggklockan är inte Cloudflares debiterade CPU. 10 ms-gränsen är därför inte bevisad för ett helt Express- och Zod-svar.

## Databas

Postgres stannar på Neon. Officiell väg från en worker är `pg` 8.16.3 eller nyare via Hyperdrive. Repot har `pg` 8.20.0. Hyperdrive är inte skapad. Workern anropar inte Neon.

## Neon 24 oktober 2026

Kontot visar Free Plan, 0 dollar per månad. Mediahub har högst 2 CU. Tidigare upplupet 3,49 dollar står kvar.

Projekt `holy-wildflower-49410428`. Originalgrenen `br-billowing-frost-asgfiqpu` har endpoint `ep-nameless-bread-askzdueh`. Testkopian heter `mediahub-v2-test-20261024`, id `br-proud-smoke-asy4fsyv`, endpoint `ep-misty-boat-as4ssnx0-pooler.c-4.eu-central-1.aws.neon.tech`, databas `neondb`, roll `neondb_owner`, auto-delete Never. Den gamla värden `ep-wandering-morning` användes inte.

Befintliga lokala uppgifter räckte mot båda värdarna. Lösenordet skrevs inte ut och ligger inte i git. Originalgrenen öppnades bara med `default_transaction_read_only`. Ingen skrivning gjordes mot den, mot testkopian eller mot någon annan databas.

Båda grenarna hade redan objekten från migrationerna 006–009. Ingen migrationsfil kördes. Antalen var lika före och efter, bland annat 1254 watchlist-rader, 7140 avsnittsrader, 9 listor och 14 listrader.

En export från testkopian, inte från verifierad Vercel-produktion, ligger i gitignorerade `data/mediahub-v2-test-20261024-export.json`: 3 212 466 byte, SHA-256 `8fc27390fe02de23ebda456c19f255d4603740d1d58f23b2f0c3c8143d7a0045`, 15 tabeller. Vercel-produktionens databasvärd är olöst. `DATABASE_URL` där är sensitive och går inte att läsa tillbaka.

Lokal Postgres saknades. En ny tom databas, `mediahub_restore_empty`, skapades på testgrenen `br-proud-smoke-asy4fsyv`. Exporten återställdes dit. Antalen matchade, bland annat 1254 watchlist-rader och 7140 avsnittsrader. Identitetshashen för watchlist var `f9b5c4b06a30aab73a68f5b737d3e9eeb098747d67ee78e9d9e69ed796662d10` både i filen och i databasen. Samma gällde avsnittsidentiteterna, `35ada9b5b6d7516df5216b28185f86e2a2c74729f43fab85d93c96ef5f4be2af`. Originalgrenen och testkopians `neondb` hade oförändrade antal. Det här är inte en Vercel-produktionsbackup.

Workern läste samma tomma databas. Inloggning med en tillfällig testhemlighet, CSRF och `HttpOnly`-cookie fungerade. Samma cookie syntes som inloggad i ett andra anrop. Nio listor kom tillbaka med `private, no-cache`. Ett exportlås togs inuti en transaktion och rullades tillbaka utan att raden ändrades. En syntetisk titel gick från `planned` till `watched` mellan två anrop och togs sedan bort. Watchlist var 1254 igen.
