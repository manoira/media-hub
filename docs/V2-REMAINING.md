# Kvar på v2-local-foundation

Branchen är inte mergad till `main` och deployas inte som produktion. Vercel publicerar `main`. Migrationerna 006, 007, 008 och 009 är körda bara mot dev-databasen. Ingen ny migration ingick i HTTP-adaptern.

## Kontroller som är gröna här

- API-typecheck, frontend-typecheck och API-bygget.
- Beteendetester för session, miljövariabler, metadataförsök, simulaterexport, delad inloggningsspärr och delat exportlås.
- HTTP-adaptern mot en lokal server som talar det granskade My Lists-formatet. Inget anrop gick till mylistsaddon.com.

## Vad adaptern gör

- Simulator och HTTP är skilda. `MY_LISTS_MODE=simulator` är det enda simulerade läget. Saknad origin, creator name eller serverhemlighet ger fel och skriver ingen låtsaslista.
- HTTP-läge kräver `MY_LISTS_ORIGIN`, `MY_LISTS_CREATOR_NAME` och `MY_LISTS_CREATOR_KEY`. Origin ska vara HTTPS. Loopback-HTTP finns bara för det lokala kontraktstestet. `mylistsaddon.com` avvisas. Redirects följs inte, så nyckeln skickas inte vidare till en annan origin.
- Status skiljer unconfigured, simulated, configured och verified. Verified sätts bara efter återläsning av identiteter, ordning, antal och namn. Synligheten är privat och slug stannar `mh-<list-id>`.
- Hashen innehåller mål och profil. En äldre `expectedUpdatedAt` blir 409 och skrivs inte över. Timeout efter en möjlig skrivning läses tillbaka innan ett begränsat nytt försök. 429 får ett begränsat antal försök. 401 och 403 försöks inte om.
- Ett saknat giltigt IMDb-id (`tt` och 7–8 siffror) skickas inte och namnges. Media Hub hittar inte på ett id från TMDB i HTTP-läget.
- Långsamma HTTP-anrop ligger under samma Postgres-lås. Ett utgånget lås kan tas över.

## Fortfarande ogjort

- Ingen egen My Lists-worker, inget konto och ingen nyckel är skapade. Variablerna är tomma. Underlaget ligger i `docs/MY-LISTS-TEST.md`.
- TV-protokollet är inte kört: installera katalograden, ändra och töm samma lista, mät cachefördröjningen, prova en film och en serie med fjärrkontrollen. En katalograd är inte Wakos inbyggda My Lists, och en synlig rad är inte verifierad uppspelning.
- SIMKL anropas inte.
- Ingen Cloudflare-flytt av Media Hub. Appen stannar på Vercel och Neon.
- Produktionsdatabasen har inte fått migrationerna 006, 007, 008 eller 009. `OWNER_PASSWORD` är inte satt för produktion.
- Hela katalogen är inte kompletterad med land, längd och IMDb-id.
- Jira MB-29 till MB-38 saknar acceptanstest mot en riktig testinstallation, nyckel och TV, så de är inte klara.

## Nästa avgränsade steg

Skapa den pinnade testinstallationen och nyckeln utanför det här repot, sätt de tre variablerna på en icke-produktiv server, och kör TV-protokollet. Det steget är fortfarande inte en produktionspublicering.
