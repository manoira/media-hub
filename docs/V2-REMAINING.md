# Kvar på v2-local-foundation

Branchen är inte mergad till `main` och deployas inte som produktion. Vercel publicerar `main`. Migrationerna 006, 007, 008 och 009 är körda bara mot dev-databasen.

## Kontroller som är gröna här

- API-typecheck, frontend-typecheck och API-bygget.
- Beteendetester för session, miljövariabler, metadataförsök, exporthash, delad inloggningsspärr och delat exportlås.

## Vad som finns lokalt

- Ägarsessioner är en hash i Postgres. Utgång, utloggning och CSRF gäller över processer.
- Misslyckade inloggningar räknas i Postgres. Åtta försök spärrar i 15 minuter, sedan nollställs fönstret. Ett lyckat inloggande tar bort räknaren.
- `MY_LISTS_CREATOR_KEY` och `SIMKL_TOKEN` läses från serverns miljö. Sidan kan inte spara eller återkalla dem. Konfigurerad betyder inte verifierad.
- Metadata sätter `metadata_fetched_at` bara efter lyckad hämtning. Tre misslyckanden lämnar titeln tills räknaren nollställs. Tidigare land, längd och IMDb-id lämnas kvar vid fel.
- Exportens hash följer namn, ordning, IMDb-id, typ, synlighet och mål. Ett saknat simulatorkopia, ett annat mål eller en ändrad version skrivs igen. Återläsning jämför antal, ordning, titel och typ.
- Exportlåset ligger i Postgres. En lista körs av en instans i taget. Ett avbrutet jobb kan tas över tills tre försök är förbrukade.

## Vad som bara är en simulator

Listexporten skriver till en minneslista i den process som kör jobbet. Texten säger lokal testsimulator. Den försvinner när processen startar om, och nästa export skriver om den. Det är inte en lista hos My Lists och inte en verifierad synk.

SIMKL-sidan förhandsvisar lokala ändringar. Den anropar inte SIMKL.

## Fortfarande ogjort

- Google TV och en riktig Wako-installation är inte testade.
- Inga riktiga anrop eller skrivningar till My Lists eller SIMKL. Nycklarna är inte inhämtade och inte verifierade.
- Ingen Cloudflare-flytt. Appen stannar på Vercel och Neon tills ett separat driftbeslut tas.
- Produktionsdatabasen har inte fått migrationerna 006, 007, 008 eller 009. `OWNER_PASSWORD` är inte satt för produktion.
- Hela katalogen är inte kompletterad med land, längd och IMDb-id.
- Jira MB-29 till MB-38 saknar acceptanstest mot TV och de riktiga tjänsterna, så de är inte klara.

## Nästa avgränsade steg

Välj om den privata My Lists-katalogen ska ligga på en egen installation eller på den publika tjänsten, och sätt därefter en testnyckel. Det steget är fortfarande inte en produktionspublicering.
