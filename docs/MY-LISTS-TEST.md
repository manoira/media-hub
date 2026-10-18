# Egen My Lists-testinstallation

Media Hub stannar på Vercel och Neon. My Lists-testet är en separat worker på `workers.dev`. En privat testprofil finns bara där, och nyckeln ligger bara i den gitignorerade lokala serverfilen. Ingen SIMKL-koppling ingår. `mylistsaddon.com` anropas inte. Den publika tomma konfiguratorn är inte en verifierad privat katalog.

Pinnad kod: My Lists 1.5.5, commit `b9c0a951787019f5d30065b5c2e7e5492472d3e2` (26 september 2026, "Every list updates live"). Följ inte nyare `main`.

## Lokal körning som redan är gjord

Checkouten ligger utanför det här repot, i `../my-lists-b9c0a951` sett från reporoten. Annan plats sätts med `MY_LISTS_UPSTREAM_DIR`. Den lokala `package.json` där är gitignorerad och skapad bara för att installera Miniflare. Den ska ha `"type": "module"`, annars läses `worker_entry_combined.js` som CommonJS.

Förberedelse, utan Cloudflare-konto:

```powershell
git clone https://github.com/Br0ck25/My-Lists.git ..\my-lists-b9c0a951
git -C ..\my-lists-b9c0a951 checkout b9c0a951787019f5d30065b5c2e7e5492472d3e2
npm --prefix ..\my-lists-b9c0a951 install miniflare@3
```

Miniflare som användes: `3.20250718.3` (workerd `1.20250718.0`). `scripts/my-lists-local-runtime.mjs` startar workern med lokal KV `CONFIGS` och lokal D1 `DB`, applicerar `schema.sql` och migrationerna, och lyssnar på `127.0.0.1` med en slumpad port. `schema.sql` droppar tabeller. Kör det bara mot den tomma lokala D1:n, aldrig mot användardata.

Testet startar och stänger den processen själv. Profilen `hublocaltest` fanns bara i det minnet. Kommandot, från reporoten:

```powershell
corepack pnpm --filter @workspace/scripts exec node --env-file="C:\Users\emmyz\Projects\Media-Hub\Media-Hub\artifacts\api-server\.env" --import tsx --test "C:\Users\emmyz\Projects\Media-Hub\Media-Hub\artifacts\api-server\src\my-lists-upstream.test.ts"
```

Resultat 18 oktober 2026: 6 av 6 gröna. Dev-databasen `ep-nameless-bread` användes. Listan `mh-2` var oförändrad efteråt, och katalogen var fortfarande 1250 rader. Testet raderade bara listor och katalograder som det själv hade skapat. Ingen manuell rensning av användardata behövs.

Adaptern pekades dit med `useMyListsTestInstall`. Den kroken tillåter HTTP bara mot `127.0.0.1` eller `localhost`, bara när `NODE_ENV` inte är `production`, och vägrar `mylistsaddon.com`. `MY_LISTS_ORIGIN` i miljön kräver fortfarande publik HTTPS. Redirects följs inte, så nyckeln skickas inte till en annan origin.

## Vad som kontrollerades mot den riktiga koden

- `POST /api/creator/lists/save`, `POST /api/creator/lists`, `POST /api/creator/lists/items` och `POST /api/creator/lists/delete`.
- Privat lista, slug `mh-<id>`, två filmer (`tt0133093`, `tt0245429`) och en serie (`tt14452776`). Namnbyte, ny ordning, tom lista och återläsning.
- Fel nyckel: 401, ingen lista skapad, och svaret innehöll inte titlarnas id.
- En nyare `updatedAt` hos workern: 409, och Media Hub skrev inte över namnet.
- En titel utan giltigt IMDb-id: inget anrop, status error, inte verified.
- Samma worker lagrar en titel utan id om den skickas direkt. List-API:t returnerar den. Katalogen tappar den, eftersom en katalogpost kräver `imdbId`, `id` eller `showId`.
- Manifestet via lokal HTTP var JSON, med filmrad, serierad och sökatalogerna. Kroppen innehöll inte creator key.
- En blandad lista läggs i katalogen som två rader, film och serie, på samma sätt som den pinnade klienten. Filmkatalogen visade filmerna. Seriekatalogen visade serien. List-API:t visade alla tre i en lista.
- Utan ägarnyckel vägrade `POST /api/save` en config som namngav profilen. En config utan nyckel föll tillbaka till radens inbakade kopia: en tom kopia gav ingen data, och en kopia med `tt0000001` gav bara den, inte den levande privata listan. Med nyckel ersatte den levande listan kopian.
- Webbläsarnavigering av manifestet, `Sec-Fetch-Mode: navigate`, anropades mot den pinnade worker-modulen och svarade 302 till `/{config}/configure`. Adressen innehöll ingen nyckel. Samma header genom den lokala Miniflare-proxyn gav JSON 200. Redirecten är därför belagd mot modulen, inte genom proxyn.

## Stagingkonfiguration

Filen `deploy/my-lists-test/wrangler.toml` är den granskade konfigurationen. Worker-namnet är `mediahub-mylists-test`. Den publiceras bara på `workers.dev`, utan route och utan ändring av någon befintlig domän. KV-bindingen heter `CONFIGS` och D1-bindingen heter `DB`. Databasnamnet är `mediahub-mylists-test`, inte `my-lists-db`. Id-fälten i den committade filen är platshållare. Riktiga id:n hör hemma i `deploy/my-lists-test/wrangler.local.toml`, som är gitignorerad.

Cron är av. Katalogtestet behöver den inte: Continue Watching och diagramförvärmning är det cron gör, och båda anropar yttre tjänster. Budgetarna är satta till det fria taket `48`, så ett senare påslag av cron inte ärver upstream-filens betalda `10000`. Ingen betald Workers-plan ska slås på.

Free-planens gränser, lästa i den pinnade README:n den 8 september 2026 och inte observerade på en live-installation: 100 000 requests per dag, 50 utgående anrop per request, 10 ms CPU, 1 000 KV-skrivningar till olika nycklar per dag. Med D1 bunden flyttar sidräknarna dit och belastar inte KV-taket. Creator Key använder PBKDF2, som den pinnade README:n mätte till ungefär 15–18 ms. Det kan överskrida free-planens CPU-tak vid inloggning. Om det händer ska installationen stanna och rapporteras. Den ska inte uppgraderas till en betald plan utan ett separat beslut. En cron var sjätte minut skulle dessutom bli ungefär 240 anrop per dag plus yttre hämtningar. Därför är den av.

Förberedelsen, från reporoten, skapar inga molnresurser:

```powershell
node scripts/my-lists-cloudflare-prepare.mjs
```

Resultat av den körningen, före inloggning: pin oförändrad, artefaktens sha256 `15d980a92a0b81231d7a8c56fc505759c365aa91d40ddb6a3c1d0672f6a0a3a6` (4 284 418 byte), dry-run-bundle 3 709 359 byte, `uploaded no`, `authenticated no`. Wrangler 4.151.1 finns via `npx`. Ingen kontoskapning och ingen API-nyckel gjordes. Publiceringen nedan gjordes senare, efter att ägaren själv loggat in.

`schema.sql` droppar varje tabell och är bara giltig mot en ny, tom databas. Migrationerna `0001a` till `0013` är additiva och i den ordningen, men `schema.sql` innehåller redan deras slutresultat. Kör dem inte efter `schema.sql` på den nya databasen, och kör dem inte mot en databas som redan har data. Den committade Wrangler-filen nämner inte `mh-2`, inte Neon och inte `mylistsaddon.com`.

Media Hubs `MY_LISTS_ORIGIN`, `MY_LISTS_CREATOR_NAME` och `MY_LISTS_CREATOR_KEY` är tomma. `MY_LISTS_MODE` är inte `simulator`. Exporten är därför unconfigured, inte simulated och inte verified.

## Vad som skapades och publicerades

18 oktober 2026, på det enda kontot under emmyznet@gmail.com (`Emmyznet@gmail.com's Account`). Inget annat konto användes. Namnen `mediahub-mylists-test-CONFIGS`, `mediahub-mylists-test` som databas och `mediahub-mylists-test` som worker saknades före skapandet. Inga befintliga tjänster, domäner, Media Hub, `main` eller Neon ändrades. Ingen betald plan slogs på. Ingen ny Cloudflare API-token, Creator-profil, Creator Key eller SIMKL-koppling skapades.

- KV-namespace `mediahub-mylists-test-CONFIGS`, bunden som `CONFIGS`. Exakt en träff med det namnet.
- Ny D1 `mediahub-mylists-test` i region EEUR, bunden som `DB`. Före `schema.sql` hade den inga användartabeller. `schema.sql` från pin `b9c0a951` kördes en gång där och rapporterade 25 tabeller. `creators` och `creator_lists` hade 0 rader. Migrationerna kördes inte.
- Worker `mediahub-mylists-test` från den rena `worker_entry_combined.js` på samma pin. Uppladdningen var 3622,42 KiB. Ingen cron, ingen route, ingen egen domän och inga hemligheter. Budgetarna är 48.

Resurs-id:n ligger bara i gitignorerade `deploy/my-lists-test/wrangler.local.toml`. Den committade `wrangler.toml` har fortfarande platshållare.

Publik adress: `https://mediahub-mylists-test.emmyznet.workers.dev`

Verifiering samma dag:

- Version `7d2d169b-de1e-4ab6-bcec-3cee83de4555` tar 100 procent av trafiken. Källa Upload, skapad 2026-10-18T16:54:50Z, författare emmyznet@gmail.com.
- Bindningarna är `CONFIGS` mot den nya KV-namespacen, `DB` mot den nya D1-databasen, och de tre budgetvariablerna `48`.
- Deployment-listan nämner ingen cron. Den enda triggern i deploy-utskriften var adressen på `workers.dev`.
- `GET /` svarade 200 med konfiguratorns HTML. Orden creatorKey, oauth och Simkl finns i sidans egen text och i localStorage-nyckelnamn. Kroppen innehöll inga resurs-id, inga tokens och ingen `DATABASE_URL`.
- `GET /manifest.json` utan `Sec-Fetch-Mode: navigate` svarade 200 JSON, addon-id `app.my-list`, version `1.5.5`, utan creator key.
- Samma adress med `Sec-Fetch-Mode: navigate` svarade 302 till `https://mediahub-mylists-test.emmyznet.workers.dev/configure`, utan nyckel i adressen.

En publik tom konfigurator är inte en verifierad privat katalog. Profilen och de tre `MY_LISTS_*`-variablerna finns bara i den lokala icke-produktiva serverfilen. De är inte satta i Vercel.

## Kontrollprotokoll

Kört 18 oktober 2026 mot dev-databasen `ep-nameless-bread` och testworkern. Listan `mh-2` var oförändrad. Inga befintliga katalograder togs bort. Fyra syntetiska katalograder lades till, så antalet gick från 1250 till 1254. Ingen andra profil skapades.

Första exportförsöket av `mh-52` avbröts av klientens tidsgräns på 10 sekunder medan workern var kall. Fjärrlistan fanns inte efter det avbrottet, så inget skrevs. Omkörningen använde 30 sekunder, läste tillståndet först och skapade inga dubbletter. Inget anrop hänger.

HTTPS, kontrollerat mot den tomma tjänsten samma dag:

1. `GET /manifest.json` utan `Sec-Fetch-Mode: navigate` svarade JSON 200 från `mediahub-mylists-test.emmyznet.workers.dev`.
2. En navigering med `Sec-Fetch-Mode: navigate` svarade 302 till `/configure` på samma värd, utan creator key i adressen.
3. `MY_LISTS_ORIGIN` är `https://mediahub-mylists-test.emmyznet.workers.dev`, utan sökväg, bara i den lokala serverfilen.

Ägarprofil och privat katalog, verifierat:

1. En profil, `hubcloudtest`, skapades en gång. Nyckeln sparades direkt i `artifacts/api-server/.env`. Den skrivs inte här.
2. Listan `Cloud fixture renamed`, id 52, exporterades som `mh-52`. Synlighet privat. Återläsningen matchade namn, ordning och de tre titlarna `tt14452776`, `tt0133093`, `tt0245429` efter namnbyte och ny ordning. Status verified.
3. Fel nyckel gav avvisning och skapade ingen lista. Listan `Cloud missing id` har en titel utan IMDb-id. Exporten blev error, inte verified, och `mh-51` finns inte på workern.
4. Med ägarnyckel i installationsconfigen visade filmkatalogen `tt0133093` och `tt0245429`, och seriekatalogen visade `tt14452776`. Utan nyckel kom bara locktiteln `tt0000001`, inte den levande privata listan. Fel nyckel på `/api/save` gav 401.
5. Konfliktprovet mot `mh-54` lämnade fjärrnamnet `Changed on the worker`. Media Hub skrev inte över det.

Installationslänken ligger i gitignorerade `artifacts/api-server/.env.my-lists-install.local`. Den innehåller inte nyckeln, men länken själv är en hemlighet och står inte här.

Serverhemligheter:

1. Bara de tre `MY_LISTS_*`-variablerna, och bara på den icke-produktiva servern.
2. Inga provider-hemligheter på testworkern för det här provet.
3. Redirects följs inte, så nyckeln inte skickas till en annan origin.

Installations-URL, creator key och origin är hemligheter. Lägg dem inte i git, i en delad anteckning eller i en publik katalog. Saknas någon av de tre Media Hub-variablerna blir exporten ett fel, inte en simulerad framgång.

## TV-protokoll

Fysiskt prov 18 oktober 2026: ägaren installerade den sparade länken i Wako på Google TV. Två katalograder syntes, filmer och serier, men inga titlar. Det är ett misslyckat TV-test. Uppspelning är inte verifierad, och TV:n är inte klar.

Länken pekade redan rätt: profil `hubcloudtest`, lista `mh-52`, katalog-id `mh-52-movies` (`Fixture movies`) och `mh-52-series` (`Fixture series`). Samma anrop som Wako gör, med och utan `skip=0`, svarade 200 på under en halv sekund. Filmkatalogen hade The Matrix och Spirited Away. Seriekatalogen hade The Bear. Nyckeln fanns inte i svaren. Tidsgränsen på 10 sekunder var inte orsaken.

Första gissningen var att varje post hade id, typ och namn, men inget `poster`. Den inbakade kopian i länken är tom, och de levande titlarna kom från den privata listan utan bildadress. Version `4d5f1169-23bd-4805-89c9-a32f47f1d10a` fyllde i en Metahub-adress som slutade på `/img`. Den adressen är WebP utan filändelse. Ägaren såg fortfarande inga titlar efter den publiceringen.

Nästa avläsning visade att katalogerna redan var snabba och hade de tre titlarna. Det som Wako hämtar när en post öppnas, `/meta/movie/tt0133093.json` och `/meta/series/tt14452776.json`, svarade `{ "meta": null }` på under en sekund. Orsaken är att testworkern inte har någon TMDB-nyckel, och den vanliga metadatafunktionen avbryter direkt utan nyckel. Manifestet annonserar ändå meta för IMDb-id, så Wako äger de anropen. Ingen TMDB-nyckel lades till.

Testworkern publicerades om igen, version `ec34c0d6-0a4c-459f-a8e6-3b68078f5e33`, ovanpå pin `b9c0a951`. Patchen är `deploy/my-lists-test/custom-list-poster.patch`. Egna listor får nu JPEG-affisch på `.../img.jpg`, år som fyrsiffrig text, och `showId` bara på serier. Saknas vanlig metadata för ett `tt`-id byggs den från den installerade listan. Efteråt svarade filmkatalogen 200 på 541 ms med The Matrix och Spirited Away, seriekatalogen 200 på 238 ms med The Bear, och båda meta-anropen hade namn och poster. Nyckeln fanns inte i svaren. Installationsfilen är oförändrad.

Ägaren ska stänga Wako helt och öppna samma redan installerade rad igen. Ingen ny länk.

Kvar, och inte gjort:

1. Bekräfta på TV:n att The Matrix, Spirited Away och The Bear syns efter omstarten. TV:n är inte klar förrän det är sett.
2. Ändra samma lista och töm den. Skriv upp sekunderna. Slug ska stanna `mh-52`.
3. Öppna en film och en serie med fjärrkontrollen. Att raden syns är inte verifierad uppspelning.
