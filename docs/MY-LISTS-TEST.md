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

## Separat Cloudflare-testinstallation

Gör detta i ett eget Cloudflare-konto. Koppla det inte till Media Hubs Vercel-projekt och skapa inga nycklar i det här repot.

1. Checkout av exakt `b9c0a951787019f5d30065b5c2e7e5492472d3e2`.
2. Ny tom D1. Kör `schema.sql` och sedan migrationerna i ordning. `schema.sql` droppar alla tabeller, så den får inte köras mot en databas som redan har data.
3. KV-binding `CONFIGS`. D1-binding `DB`, databasnamn `my-lists-db`. `compatibility_date` `2024-01-01`.
4. På free-plan, `CRON_SUBREQUEST_BUDGET=48`. Lämna import- och detaljbudgetarna på 48.
5. Skapa en privat Creator Profile på den installationen. Listor från Media Hub skickas med `visibility: "private"`.
6. Sätt bara på den icke-produktiva Media Hub-servern, och inte förrän TV-provet ska förberedas:

- `MY_LISTS_ORIGIN` — `https://` plus publik värd, utan sökväg och utan användarnamn. HTTP, interna adresser och `mylistsaddon.com` avvisas.
- `MY_LISTS_CREATOR_NAME`
- `MY_LISTS_CREATOR_KEY`

Alla tre krävs. Saknas en blir exporten ett fel, inte en simulerad framgång. `MY_LISTS_MODE=simulator` är det enda läget som skriver till minnessimulatorn.

7. Kör samma protokoll mot den HTTPS-adressen: två filmer, en serie, namnbyte, ordning, tom lista, versionskonflikt, vägran av en ofullständig lista, och privat katalog med och utan rätt ägaridentitet.

Installations-URL, creator key och origin är hemligheter. Lägg dem inte i git, i en delad anteckning eller i en publik katalog.

## TV-protokoll

Det här är inte kört. Ingen fysisk Google TV, ingen Wako-installation och ingen uppspelning har verifierats.

1. Installera katalograden från testinstallationens manifest i Wako. Det är addons katalograd, inte Wakos inbyggda My Lists.
2. Ändra samma lista och töm den sedan. Slug ska vara oförändrad. Skriv upp hur många sekunder TV:n behöver för att visa varje ändring.
3. Öppna en film och en serie med fjärrkontrollen. Att raden syns är inte verifierad uppspelning.
4. Behandla installations-URL:en som en hemlighet.
