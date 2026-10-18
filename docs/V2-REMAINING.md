# Kvar på v2-local-foundation

Branchen är inte mergad till `main` och deployas inte som produktion. `vercel.json` pekar inte ut en branch. Vercel publicerar `main`. Migrationerna 006, 007, 008 och 009 är körda bara mot dev-databasen. Ingen ny migration ingick i det här steget.

## Kontroller som är gröna här

- API-typecheck, frontend-typecheck och API-bygget.
- Beteendetester för session, miljövariabler, metadataförsök, simulaterexport, delad inloggningsspärr och delat exportlås (6).
- Kontraktsmocken för HTTP-adaptern (7).
- Adaptern mot den pinnade My Lists-workern `b9c0a951787019f5d30065b5c2e7e5492472d3e2`, körd lokalt med Miniflare 3.20250718.3, lokal KV och lokal D1 (6). Inget anrop gick till mylistsaddon.com, Cloudflare eller en fjärrdatabas.

## Vad adaptern gör

- Simulator och HTTP är skilda. `MY_LISTS_MODE=simulator` är det enda simulerade läget. Saknad origin, creator name eller serverhemlighet ger fel och skriver ingen låtsaslista.
- Riktiga mål kräver HTTPS och en publik värd. `MY_LISTS_ORIGIN` avvisar HTTP, interna adresser och `mylistsaddon.com`. Loopback-HTTP finns bara i testprocessen, via `useMyListsTestInstall`, och bara för `127.0.0.1` eller `localhost`. Kroken kastas i produktion och ignoreras när `NODE_ENV=production`. Redirects följs inte.
- Status skiljer unconfigured, simulated, configured och verified. Verified sätts bara efter återläsning av identiteter, ordning, antal och namn. Synligheten är privat och slug stannar `mh-<list-id>`.
- Hashen innehåller mål och profil. En äldre `expectedUpdatedAt` blir 409 och skrivs inte över. Timeout efter en möjlig skrivning läses tillbaka innan ett begränsat nytt försök. 429 får ett begränsat antal försök. 401 och 403 försöks inte om.
- Om någon titel saknar giltigt IMDb-id (`tt` och 7–8 siffror) skrivs ingenting, listan markeras inte verified, och titeln namnges. Media Hub hittar inte på ett id från TMDB i HTTP-läget.
- Långsamma HTTP-anrop ligger under samma Postgres-lås. Ett utgånget lås kan tas över.

## Vad det lokala upstream-testet visade

Körningen står i `docs/MY-LISTS-TEST.md`. Den skapade en isolerad privat testlista med två filmer och en serie, och rörde inte listan `mh-2` eller de 1250 katalograderna. Processen städade bara rader den själv skapat.

- Save, list, items och delete mot den riktiga workern. Fel nyckel gav 401 och skrev ingen lista.
- Namnbyte behöll slug. Ny ordning lästes tillbaka. Tom lista stannade på samma slug. En nyare version hos workern gav 409 och skrevs inte över.
- En titel utan giltigt id stoppade hela exporten innan något anrop.
- List-API:t och katalogen är olika ytor. Filmkatalogen visade filmerna, seriekatalogen visade serien. Utan ägarnyckel syntes inte den levande privata listan. En titel utan id fanns kvar i list-API:t och saknades i katalogen.
- Ett dataanrop hämtade manifestet som JSON. En webbläsarnavigering, anropad mot den pinnade worker-modulen, svarade 302 till `/{config}/configure` utan nyckel i adressen. Samma header genom den lokala Miniflare-proxyn gav fortfarande JSON 200, så redirecten är belagd mot modulen och inte genom proxyn.

## Cloudflare-testinstallationen är förberedd, inte skapad

`deploy/my-lists-test/wrangler.toml` namnger en egen worker, `mediahub-mylists-test`, på `workers.dev`. Den har ingen route, ingen egen domän och ingen cron. KV-bindingen `CONFIGS` och D1-bindingen `DB` pekar på id-platshållare, inte på en riktig databas. `scripts/my-lists-cloudflare-prepare.mjs` kontrollerar den pinnade SHA:n, att `schema.sql` bara får namnges mot den nya tomma databasen `mediahub-mylists-test`, och kompilerar workern med `wrangler deploy --dry-run`. Dry-run laddar inte upp något.

Körningen 18 oktober 2026: pin `b9c0a951787019f5d30065b5c2e7e5492472d3e2`, artefakt 4 284 418 byte, sha256 `15d980a92a0b81231d7a8c56fc505759c365aa91d40ddb6a3c1d0672f6a0a3a6`, bundle 3 709 359 byte, `authenticated no`, `uploaded no`. Wrangler är inte inloggad. Inget konto, ingen KV, ingen D1, ingen worker och ingen profil är skapad.

Media Hubs `MY_LISTS_*` är fortfarande tomma. Exporten är unconfigured, inte simulated och inte verified. Konfigurationen nämner inte `mh-2` och inte någon Neon-databas. Free-plan: budgetarna är 48, cron är av, och ingen betald plan slås på.

## Fortfarande ogjort

- Wrangler är inte autentiserad. Den publika HTTPS-adressen finns därför inte ännu. Nästa åtgärd är att ägaren loggar in på det Cloudflare-konto som ska äga just den här testworkern, och sedan kör skapandekommandona i `docs/MY-LISTS-TEST.md`. Ingen profil och ingen beständig nyckel skapas före det.
- Ingen fysisk Google TV- eller Wako-verifiering är gjord. Ingen uppspelning är provad. En katalograd är inte verifierad uppspelning.
- SIMKL anropas inte.
- Ingen Cloudflare-flytt av Media Hub. Appen stannar på Vercel och Neon.
- Produktionsdatabasen har inte fått migrationerna 006, 007, 008 eller 009. `OWNER_PASSWORD` är inte satt för produktion.
- Hela katalogen är inte kompletterad med land, längd och IMDb-id.
- Jira MB-29 till MB-38 saknar acceptanstest mot en riktig testinstallation, nyckel och TV, så de är inte klara.

## Nästa avgränsade steg

1. Ägaren kör `npx wrangler login` mot det Cloudflare-konto som ska äga `mediahub-mylists-test`. Det kontot är inte Media Hubs Vercel-projekt. Skapa inget konto härifrån.
2. Skapa sedan, och först då, en ny KV och en ny tom D1 med kommandona i `docs/MY-LISTS-TEST.md`. Kör `schema.sql` bara mot `mediahub-mylists-test`. Kör inte migrationerna efter det, och kör inte `schema.sql` mot någon befintlig databas.
3. Deploy till `workers.dev` utan cron, utan egen domän och utan hemligheter. Adressen blir `https://mediahub-mylists-test.<subdomän>.workers.dev`.
4. Skapa en privat profil där. Sätt de tre Media Hub-variablerna bara på en icke-produktiv server. Tills de är satta förblir exporten unconfigured.
5. Kör kontrollprotokollet, inklusive HTTPS, ägarprofil, privat katalog och serverhemligheter. Den fysiska TV-kontrollen kommer sist och är inte körd.

Det steget är fortfarande inte en produktionspublicering.
