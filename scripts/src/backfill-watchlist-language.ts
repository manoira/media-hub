import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, isNull } from "drizzle-orm";
import { db, pool, watchlistTable } from "@workspace/db";
import { loadApiServerEnv } from "./lib/load-env.js";
import { sleep } from "./lib/tmdb-client.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

type CliOptions = {
  dryRun: boolean;
  apply: boolean;
  delayMs: number;
  limit?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const apply = argv.includes("--apply");
  const dryRun = !apply;
  const delayArg = argv.find((arg) => arg.startsWith("--delay-ms="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const delayMs = delayArg ? Number(delayArg.slice("--delay-ms=".length)) : 120;
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;

  return { dryRun, apply, delayMs, limit };
}

function printHelp() {
  console.log(`Backfill watchlist original_language from TMDB.

Usage:
  pnpm --filter @workspace/scripts run backfill-watchlist-language -- --dry-run
  pnpm --filter @workspace/scripts run backfill-watchlist-language -- --apply

Options:
  --dry-run          Preview updates (default)
  --apply            Write original_language to DATABASE_URL
  --delay-ms=120     Delay between TMDB requests (default 120)
  --limit=N          Process at most N rows

Requires TMDB_API_KEY and DATABASE_URL (loads artifacts/api-server/.env if unset).

Prod deploy order:
  1. Run lib/db/migrations/001_add_original_language.sql in Neon
  2. Deploy API code
  3. Run this script with --apply against prod DATABASE_URL
`);
}

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");
  return key;
}

async function fetchOriginalLanguage(
  tmdbId: number,
  mediaType: string,
): Promise<string | null> {
  const endpoint = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const url = `${TMDB_BASE}${endpoint}?api_key=${getApiKey()}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { original_language?: string };
  return data.original_language ?? null;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  await loadApiServerEnv(repoRoot);
  const options = parseArgs(argv);

  const rows = await db
    .select({
      id: watchlistTable.id,
      tmdbId: watchlistTable.tmdbId,
      mediaType: watchlistTable.mediaType,
      title: watchlistTable.title,
    })
    .from(watchlistTable)
    .where(isNull(watchlistTable.originalLanguage));

  const toProcess = options.limit ? rows.slice(0, options.limit) : rows;
  console.log(
    `${options.dryRun ? "[dry-run] " : ""}Found ${rows.length} rows missing original_language; processing ${toProcess.length}.`,
  );

  let updated = 0;
  let failed = 0;

  for (const row of toProcess) {
    const language = await fetchOriginalLanguage(row.tmdbId, row.mediaType);
    if (!language) {
      failed++;
      console.warn(`FAIL ${row.title} (${row.mediaType}:${row.tmdbId}): TMDB lookup failed`);
    } else if (options.dryRun) {
      updated++;
      console.log(`Would set ${row.title} -> ${language}`);
    } else {
      await db
        .update(watchlistTable)
        .set({ originalLanguage: language })
        .where(eq(watchlistTable.id, row.id));
      updated++;
      process.stdout.write(".");
    }

    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  if (!options.dryRun && updated > 0) console.log("");

  console.log(
    `Done: ${updated} ${options.dryRun ? "would update" : "updated"}, ${failed} failed.`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
