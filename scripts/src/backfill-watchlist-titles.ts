import path from "node:path";
import { fileURLToPath } from "node:url";
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
  language: string;
};

function parseArgs(argv: string[]): CliOptions {
  const apply = argv.includes("--apply");
  const dryRun = !apply;
  const delayArg = argv.find((arg) => arg.startsWith("--delay-ms="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const languageArg = argv.find((arg) => arg.startsWith("--language="));
  const delayMs = delayArg ? Number(delayArg.slice("--delay-ms=".length)) : 120;
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : undefined;
  const language = languageArg ? languageArg.slice("--language=".length) : "sv-SE";

  return { dryRun, apply, delayMs, limit, language };
}

function printHelp() {
  console.log(`Refresh watchlist titles from TMDB (Swedish locale by default).

Usage:
  pnpm --filter @workspace/scripts run backfill-watchlist-titles -- --dry-run
  pnpm --filter @workspace/scripts run backfill-watchlist-titles -- --apply

Options:
  --dry-run          Preview updates (default)
  --apply            Write titles to DATABASE_URL
  --language=sv-SE   TMDB locale (default sv-SE)
  --delay-ms=120     Delay between TMDB requests (default 120)
  --limit=N          Process at most N rows

Requires TMDB_API_KEY and DATABASE_URL (loads artifacts/api-server/.env if unset).
`);
}

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");
  return key;
}

function resolveTitle(
  mediaType: string,
  data: Record<string, unknown>,
): string {
  const isTv = mediaType === "tv";
  const localized = String(isTv ? data.name : data.title ?? "").trim();
  const original = String(isTv ? data.original_name : data.original_title ?? "").trim();
  const lang = String(data.original_language ?? "").toLowerCase();

  if (lang === "sv" && original && localized.toLowerCase() !== original.toLowerCase()) {
    return original;
  }
  return localized || original || "Unknown";
}

async function fetchLocalizedTitle(
  tmdbId: number,
  mediaType: string,
  language: string,
): Promise<string | null> {
  const endpoint = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("language", language);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  return resolveTitle(mediaType, data);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  await loadApiServerEnv(repoRoot);
  const { eq } = await import("drizzle-orm");
  const { db, pool, watchlistTable } = await import("@workspace/db");
  const options = parseArgs(argv);

  const rows = await db
    .select({
      id: watchlistTable.id,
      tmdbId: watchlistTable.tmdbId,
      mediaType: watchlistTable.mediaType,
      title: watchlistTable.title,
    })
    .from(watchlistTable);

  const toProcess = options.limit ? rows.slice(0, options.limit) : rows;
  console.log(
    `${options.dryRun ? "[dry-run] " : ""}Refreshing ${toProcess.length} watchlist titles (locale: ${options.language}).`,
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of toProcess) {
    const title = await fetchLocalizedTitle(row.tmdbId, row.mediaType, options.language);
    if (!title) {
      failed++;
      console.warn(`FAIL ${row.title} (${row.mediaType}:${row.tmdbId}): TMDB lookup failed`);
    } else if (title === row.title) {
      skipped++;
    } else if (options.dryRun) {
      updated++;
      console.log(`Would rename: "${row.title}" -> "${title}"`);
    } else {
      await db
        .update(watchlistTable)
        .set({ title })
        .where(eq(watchlistTable.id, row.id));
      updated++;
      console.log(`Updated: "${row.title}" -> "${title}"`);
    }

    if (options.delayMs > 0) await sleep(options.delayMs);
  }

  console.log(
    `Done: ${updated} ${options.dryRun ? "would update" : "updated"}, ${skipped} unchanged, ${failed} failed.`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
