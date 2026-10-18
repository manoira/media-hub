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

## Cloudflare-testinstallationen har en privat testprofil

`https://mediahub-mylists-test.emmyznet.workers.dev` är testworkern. Profilen `hubcloudtest` skapades en gång. Nyckeln och de tre `MY_LISTS_*`-variablerna ligger bara i den lokala serverfilen, inte i Vercel och inte i git. Exporten av `mh-52` är verified över HTTPS. Detaljerna står i `docs/MY-LISTS-TEST.md`.

Första skrivförsöket mot `mh-52` avbröts efter 10 sekunder. Inget fanns på workern då. Omkörningen med 30 sekunder passerade utan en ny profil. Ett senare läsanrop, begränsat till 15 sekunder, svarade 200 och visade två privata listor: `mh-52` med tre titlar och `mh-54` med konfliktnamnet orört. Inget anrop blockerades.

Den privata katalogen kräver ägarnyckeln. Utan nyckel syntes bara en locktitel. Fel nyckel skrev inget. En titel utan IMDb-id stoppade hela exporten. `mh-2` och de tidigare 1250 katalograderna är kvar. Fyra syntetiska rader lades till.

Installationslänken för TV finns bara i gitignorerade `artifacts/api-server/.env.my-lists-install.local`.

## Fortfarande ogjort

- Fysiskt Wako-prov på Google TV har misslyckats två gånger: katalograderna syns, titlarna inte. Affischfältet räckte inte. Meta-anropen svarade `meta: null` eftersom testworkern saknar TMDB-nyckel. Version `ec34c0d6-0a4c-459f-a8e6-3b68078f5e33` bygger metadata från listan i stället. TV:n är inte klar förrän ägaren ser titlarna. Ingen uppspelning är provad.
- SIMKL anropas inte.
- Ingen Cloudflare-flytt av Media Hub. Appen stannar på Vercel och Neon.
- Produktionsdatabasen har inte fått migrationerna 006, 007, 008 eller 009. `OWNER_PASSWORD` är inte satt för produktion.
- Hela katalogen är inte kompletterad med land, längd och IMDb-id.
- Jira MB-29 till MB-38 är inte klara. HTTPS-protokollet är kört, men den fysiska TV-kontrollen är inte gjord.

## Nästa avgränsade steg

1. Stäng Wako helt och öppna samma redan installerade rad. Installera inte en ny länk. Bekräfta att The Matrix, Spirited Away och The Bear syns.
2. Ändra listan, töm den, och skriv upp hur många sekunder TV:n behöver. Slug ska stanna `mh-52`.
3. Öppna en film och en serie med fjärrkontrollen. Det är inte verifierad uppspelning förrän det är gjort.

Det steget är fortfarande inte en produktionspublicering.
