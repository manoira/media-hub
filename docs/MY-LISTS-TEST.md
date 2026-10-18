# Egen My Lists-testinstallation

Media Hub stannar på Vercel och Neon. My Lists är en separat installation. Inget Cloudflare-konto, ingen publicering och ingen riktig tjänstenyckel ingår här. `mylistsaddon.com` anropas inte.

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

## Stagingkonfiguration, inte driftsatt

Filen `deploy/my-lists-test/wrangler.toml` är den granskade konfigurationen. Worker-namnet är `mediahub-mylists-test`. Den publiceras bara på `workers.dev`, utan route och utan ändring av någon befintlig domän. KV-bindingen heter `CONFIGS` och D1-bindingen heter `DB`. Databasnamnet är `mediahub-mylists-test`, inte `my-lists-db`. Id-fälten i den committade filen är platshållare. Riktiga id:n hör hemma i `deploy/my-lists-test/wrangler.local.toml`, som är gitignorerad.

Cron är av. Katalogtestet behöver den inte: Continue Watching och diagramförvärmning är det cron gör, och båda anropar yttre tjänster. Budgetarna är satta till det fria taket `48`, så ett senare påslag av cron inte ärver upstream-filens betalda `10000`. Ingen betald Workers-plan ska slås på.

Free-planens gränser, lästa i den pinnade README:n den 8 september 2026 och inte observerade på en live-installation: 100 000 requests per dag, 50 utgående anrop per request, 10 ms CPU, 1 000 KV-skrivningar till olika nycklar per dag. Med D1 bunden flyttar sidräknarna dit och belastar inte KV-taket. Creator Key använder PBKDF2, som den pinnade README:n mätte till ungefär 15–18 ms. Det kan överskrida free-planens CPU-tak vid inloggning. Om det händer ska installationen stanna och rapporteras. Den ska inte uppgraderas till en betald plan utan ett separat beslut. En cron var sjätte minut skulle dessutom bli ungefär 240 anrop per dag plus yttre hämtningar. Därför är den av.

Förberedelsen, från reporoten, skapar inga molnresurser:

```powershell
node scripts/my-lists-cloudflare-prepare.mjs
```

Resultat 18 oktober 2026: pin oförändrad, artefaktens sha256 `15d980a92a0b81231d7a8c56fc505759c365aa91d40ddb6a3c1d0672f6a0a3a6` (4 284 418 byte), dry-run-bundle 3 709 359 byte, `uploaded no`, `authenticated no`. Wrangler 4.151.1 finns via `npx` och är inte inloggad. Ingen kontoskapning och ingen API-nyckel gjordes.

`schema.sql` droppar varje tabell och är bara giltig mot en ny, tom databas. Migrationerna `0001a` till `0013` är additiva och i den ordningen, men `schema.sql` innehåller redan deras slutresultat. Kör dem inte efter `schema.sql` på den nya databasen, och kör dem inte mot en databas som redan har data. Den committade Wrangler-filen nämner inte `mh-2`, inte Neon och inte `mylistsaddon.com`.

Media Hubs `MY_LISTS_ORIGIN`, `MY_LISTS_CREATOR_NAME` och `MY_LISTS_CREATOR_KEY` är tomma. `MY_LISTS_MODE` är inte `simulator`. Exporten är därför unconfigured, inte simulated och inte verified.

## Vad nästa driftsättning skulle skapa

Inget av detta är kört. Wrangler måste först vara inloggad på det konto som ska äga testworkern.

1. En ny KV-namespace, föreslaget namn `mediahub-mylists-test-CONFIGS`, bunden som `CONFIGS`.
2. En ny tom D1-databas med namnet `mediahub-mylists-test`, bunden som `DB`.
3. `schema.sql` exekverad en gång mot just den nya databasen, efter kontroll att den inte har några tabeller.
4. En Worker med namnet `mediahub-mylists-test` på `workers.dev`, utan cron, utan hemligheter och utan egen domän.

Kommandona, körda från checkouten av `b9c0a951` och bara efter inloggning:

```powershell
npx wrangler kv namespace create mediahub-mylists-test-CONFIGS
npx wrangler d1 create mediahub-mylists-test
npx wrangler d1 execute mediahub-mylists-test --remote --file=schema.sql
npx wrangler deploy --config <sökväg till wrangler.local.toml>
```

`d1 execute` ska vägras om namnet inte är exakt `mediahub-mylists-test`. Lägg id:n från de två första kommandona i den gitignorerade `wrangler.local.toml`, kopierad från stagingfilen. Committa den inte. Sätt inga `wrangler secret put` för katalogtestet: varken `ADMIN_KEY`, `TMDB_API_KEY`, Trakt, SIMKL eller MDBList.

Den publika adressen finns inte förrän de kommandona har körts. Den blir `https://mediahub-mylists-test.<kontots-subdomän>.workers.dev`. Subdomänen väljs av Cloudflare-kontot vid första workern och ska inte pekas om från någon befintlig tjänst.

## Kontrollprotokoll efter att adressen finns

Gör inte detta mot `mh-2` eller mot produktionsdatabasen. Skapa en ny Media Hub-lista. Låt `MY_LISTS_*` vara tomma tills HTTPS-adressen svarar, så statusen inte blir simulated eller verified i förtid.

HTTPS:

1. `GET /manifest.json` utan `Sec-Fetch-Mode: navigate` svarar JSON 200 från samma värd.
2. En webbläsarnavigering till manifestet svarar 302 till `/{config}/configure` på samma värd, utan creator key i adressen.
3. `MY_LISTS_ORIGIN` är `https://` plus den värden, utan sökväg. HTTP, interna adresser och `mylistsaddon.com` ska fortfarande avvisas.

Ägarprofil och privat katalog:

1. Skapa en privat Creator Profile på testworkern. Nyckeln visas en gång. Lägg den bara i servermiljön på den icke-produktiva Media Hub-processen, aldrig i git eller i Vercel-produktion.
2. Exportera en ny lista med `tt0133093`, `tt0245429` och `tt14452776`. Slug ska bli `mh-<nytt id>`, inte `mh-2`. Synlighet privat. Återläsning krävs för verified.
3. Fel nyckel ger 401 och skriver inget. En titel utan giltigt IMDb-id gör hela listan till error, inte verified.
4. Filmkatalogen visar filmerna och seriekatalogen visar serien när install-configen bär ägarnyckeln. Utan nyckel ska den levande privata listan inte komma ut. List-API:t är en annan yta än katalogen.

Serverhemligheter:

1. Bara de tre `MY_LISTS_*`-variablerna, och bara på den icke-produktiva servern.
2. Inga provider-hemligheter på testworkern för det här provet.
3. Redirects följs inte, så nyckeln inte skickas till en annan origin.

Installations-URL, creator key och origin är hemligheter. Lägg dem inte i git, i en delad anteckning eller i en publik katalog. Saknas någon av de tre Media Hub-variablerna blir exporten ett fel, inte en simulerad framgång.

## TV-protokoll

Det här är inte kört. Ingen fysisk Google TV, ingen Wako-installation och ingen uppspelning har verifierats.

1. Installera katalograden från testinstallationens manifest i Wako. Det är addons katalograd, inte Wakos inbyggda My Lists.
2. Ändra samma lista och töm den sedan. Slug ska vara oförändrad. Skriv upp hur många sekunder TV:n behöver för att visa varje ändring.
3. Öppna en film och en serie med fjärrkontrollen. Att raden syns är inte verifierad uppspelning.
4. Behandla installations-URL:en som en hemlighet.
