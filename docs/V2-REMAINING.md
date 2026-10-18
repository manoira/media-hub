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

## Cloudflare-testinstallationen är publicerad, tom

`https://mediahub-mylists-test.emmyznet.workers.dev` är den separata testworkern `mediahub-mylists-test`, publicerad 18 oktober 2026 från pin `b9c0a951787019f5d30065b5c2e7e5492472d3e2` på kontot under emmyznet@gmail.com. Den har KV `mediahub-mylists-test-CONFIGS` bunden som `CONFIGS` och en ny D1 `mediahub-mylists-test` bunden som `DB`. `schema.sql` kördes en gång mot den nya tomma databasen. Version `7d2d169b-de1e-4ab6-bcec-3cee83de4555` tar all trafik. Cron är av, det finns ingen egen domän och inga hemligheter. Budgetarna är 48. Ingen betald plan slogs på.

Resurs-id:n ligger bara i gitignorerade `deploy/my-lists-test/wrangler.local.toml`. Den committade konfigurationen har fortfarande platshållare. Detaljerna står i `docs/MY-LISTS-TEST.md`.

`GET /manifest.json` svarade JSON 200 med version 1.5.5. En navigering svarade 302 till `/configure` utan nyckel i adressen. `GET /` är den tomma konfiguratorn. Det är inte en verifierad privat katalog. Ingen profil och ingen Creator Key finns. Media Hubs `MY_LISTS_*` är fortfarande tomma, så exporten är unconfigured, inte simulated och inte verified.

## Fortfarande ogjort

- Ingen privat Creator-profil och ingen beständig testnyckel. De tre `MY_LISTS_*`-variablerna är inte satta, inte ens på en icke-produktiv server.
- Privat katalog, fel nyckel och en titel utan IMDb-id är inte körda mot den publika adressen.
- Ingen fysisk Google TV- eller Wako-verifiering är gjord. Ingen uppspelning är provad. En katalograd är inte verifierad uppspelning.
- SIMKL anropas inte.
- Ingen Cloudflare-flytt av Media Hub. Appen stannar på Vercel och Neon.
- Produktionsdatabasen har inte fått migrationerna 006, 007, 008 eller 009. `OWNER_PASSWORD` är inte satt för produktion.
- Hela katalogen är inte kompletterad med land, längd och IMDb-id.
- Jira MB-29 till MB-38 saknar acceptanstest mot profil, nyckel och TV, så de är inte klara.

## Nästa avgränsade steg

1. Skapa en privat Creator Profile på `https://mediahub-mylists-test.emmyznet.workers.dev`. Nyckeln visas en gång. Spara den bara i den icke-produktiva Media Hub-serverns miljö.
2. Sätt `MY_LISTS_ORIGIN` till den adressen, plus `MY_LISTS_CREATOR_NAME` och `MY_LISTS_CREATOR_KEY`, bara där. Sätt dem inte i Vercel-produktion. Tills de är satta förblir exporten unconfigured.
3. Kör resten av kontrollprotokollet mot en ny lista, inte `mh-2`: export av de tre fixturtitlarna, fel nyckel, titel utan IMDb-id, och att den privata katalogen kräver ägarnyckeln.
4. Den fysiska TV-kontrollen kommer sist och är inte körd.

Det steget är fortfarande inte en produktionspublicering.
