# Kvar efter Codex-korrigeringarna

Branchen `v2-local-foundation` är inte publicerad. Den är inte mergad till `main`, och migration `008_v2_sessions_and_retries.sql` är bara körd mot dev-databasen.

## Klart i den här korrigeringen

- Ägarsessioner ligger i Postgres som hash av kakan. Utgång, utloggning och CSRF gäller, och en annan serverprocess kan läsa samma session.
- My Lists-nyckel och SIMKL-token läses från `MY_LISTS_CREATOR_KEY` och `SIMKL_TOKEN`. Sidan kan inte spara eller återkalla dem. Konfigurerad betyder inte verifierad.
- Misslyckad metadatahämtning ökar ett försöksräknare och lämnar tidigare land, längd och IMDb-id orörda. En lyckad hämtning sätter `metadata_fetched_at`. Efter tre misslyckanden väljs titeln inte igen förrän räknaren nollställs.
- Exportens hash följer namn, ordning, IMDb-id, typ och mål. En saknad simulatorlista, ett annat mål eller en ny version skrivs igen. Texten säger lokal testsimulator, inte verifierad My Lists-synk.

## Fortfarande ogjort

- Ingen Google TV-kontroll och ingen riktig Wako-installation.
- Inga riktiga anrop eller skrivningar till My Lists eller SIMKL. Nycklarna är inte inhämtade och inte verifierade.
- Ingen Cloudflare-flytt. Appen stannar på Vercel och Neon.
- Produktionsdatabasen har inte fått migrationerna 006, 007 eller 008. `OWNER_PASSWORD` är inte satt för produktion.
- Hela katalogen är inte kompletterad med land, längd och IMDb-id.
- Exportkön är fortfarande i den process som tog emot anropet. En andra instans delar inte den kön.
- Simulatorlistan ligger i minnet och försvinner vid omstart. Nästa export upptäcker det och skriver om, men det är fortfarande inte en extern katalog.
- Inloggningens spärr för upprepade försök är fortfarande lokal för processen.
- Jira MB-29 till MB-38 är inte klara.
