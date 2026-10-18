# Egen My Lists-testinstallation

Det här underlaget är förberett och inte publicerat. Media Hub stannar på Vercel och Neon. My Lists körs som en separat installation, och inget konto, ingen nyckel och ingen worker skapas i det här steget.

Kontraktet är läst i källan för My Lists 1.5.5, commit `b9c0a951787019f5d30065b5c2e7e5492472d3e2` (26 september 2026). Sökvägarna är `POST /api/creator/lists/save`, `POST /api/creator/lists`, `POST /api/creator/lists/items` och `POST /api/creator/lists/delete`. Namn och nyckel ligger i JSON-kroppen. Ett explicit slug behålls. Bara `visibility: "public"` blir publik. `expectedUpdatedAt` som är äldre än lagrad version svarar 409 med `error: "conflict"`. Tom lista är giltig. Ogiltigt eller saknat IMDb-id skickas inte och hittas inte på.

## Minsta installation

1. Pinnad kod: checkout av `b9c0a951787019f5d30065b5c2e7e5492472d3e2`. Följ inte nyare `main`.
2. Cloudflare Workers **free**-plan räcker för en personlig katalog.
3. KV-bindingen måste heta `CONFIGS`. Utan den blir profiler och listor tysta no-ops.
4. D1-bindingen måste heta `DB`, databasnamn `my-lists-db`. Kör `schema.sql` och migrationerna i den pinnade trädet. D1 är det auktoritativa lagret för profiler och listor. KV är cache och spärrar.
5. På free-plan, sätt `CRON_SUBREQUEST_BUDGET=48` så cron-tickan avslutas i stället för att bli avbruten. Lämna import- och detaljbudgetarna på 48.
6. Skapa en privat Creator Profile. Listor från Media Hub skickas med `visibility: "private"`.
7. Installations-URL:en, creator key och origin är hemligheter. Lägg dem inte i git, i en delad anteckning eller i en publik katalog.

## Media Hub, när installationen finns

Sätt bara på den server som ska prova, inte i produktion förrän TV-provet är gjort:

- `MY_LISTS_ORIGIN` — `https://` plus värd, utan sökväg och utan användarnamn. `mylistsaddon.com` avvisas.
- `MY_LISTS_CREATOR_NAME`
- `MY_LISTS_CREATOR_KEY`

Alla tre krävs. Saknas en blir exporten ett fel, inte en simulerad framgång. `MY_LISTS_MODE=simulator` är det enda läget som skriver till minnessimulatorn, och det märks simulated.

Konfigurerad betyder att de tre värdena finns. Verified betyder att samma lista lästs tillbaka med samma identiteter, ordning, antal och namn. Simulated är bara minnessimulatorn.

## TV-protokoll

Gör inte detta förrän en egen installation och en nyckel finns. Publicera inget.

1. Installera katalograden från testinstallationens manifest i Wako. Det är addons katalograd, inte Wakos inbyggda My Lists.
2. Ändra samma lista och töm den sedan. Slug ska vara oförändrad. Skriv upp hur många sekunder TV:n behöver för att visa varje ändring.
3. Öppna en film och en serie med fjärrkontrollen. Att raden syns är inte verifierad uppspelning.
4. Behandla installations-URL:en som en hemlighet.
