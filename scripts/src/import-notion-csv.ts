import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiServerEnv } from "./lib/load-env.js";
import { loadNotionCsvTables, resolveNotionRows } from "./lib/notion-entries.js";
import { createTmdbClient, sleep } from "./lib/tmdb-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const dataDir = path.join(repoRoot, "data");

type CliOptions = {
  dryRun: boolean;
  apply: boolean;
  apiBase: string;
  delayMs: number;
};

function parseArgs(argv: string[]): CliOptions {
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  const apiBase =
    argv.find((arg) => arg.startsWith("--api="))?.slice("--api=".length) ??
    process.env.MEDIA_HUB_API_URL ??
    "http://localhost:5000/api";
  const delayArg = argv.find((arg) => arg.startsWith("--delay-ms="));
  const delayMs = delayArg ? Number(delayArg.slice("--delay-ms=".length)) : 120;

  return {
    dryRun: apply ? false : dryRun || !apply,
    apply,
    apiBase: apiBase.replace(/\/$/, ""),
    delayMs: Number.isFinite(delayMs) ? delayMs : 120,
  };
}

function printHelp() {
  console.log(`Import Notion CSV exports into Media Hub (local preview or prod).

Usage:
  pnpm --filter @workspace/scripts run import-notion -- --dry-run
  pnpm --filter @workspace/scripts run import-notion -- --apply

Options:
  --dry-run          Resolve rows and write report only (default)
  --apply            POST items to the Media Hub API
  --api=URL          API base URL (default: http://localhost:5000/api)
  --delay-ms=N       Delay between apply requests (default: 120)

Local preview:
  1. Start API + frontend (see docs/DEV-WORKFLOW.md)
  2. Run --dry-run, review data/notion-import-report.json
  3. Run --apply against localhost
  4. Open http://localhost:5174/watchlist?status=watched
`);
}

async function checkApi(apiBase: string): Promise<void> {
  const res = await fetch(`${apiBase}/healthz`);
  if (!res.ok) throw new Error(`API health check failed: ${res.status} ${res.statusText}`);
}

async function applyEntries(
  apiBase: string,
  entries: Awaited<ReturnType<typeof resolveNotionRows>>["entries"],
  delayMs: number,
) {
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const entry of entries) {
    const res = await fetch(`${apiBase}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tmdbId: entry.tmdbId,
        mediaType: entry.mediaType,
        status: entry.status,
      }),
    });

    if (!res.ok) {
      failed++;
      const body = await res.text();
      console.error(`FAIL ${entry.name}: ${res.status} ${body.slice(0, 160)}`);
    } else {
      if (res.status === 201) created++;
      else updated++;
      process.stdout.write(".");
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  console.log("");
  console.log(`Apply complete: ${created} created/updated, ${failed} failed.`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const options = parseArgs(argv);
  await loadApiServerEnv(repoRoot);

  const tmdb = createTmdbClient();
  const { simple, enrichment } = await loadNotionCsvTables(dataDir);

  console.log(`Reading ${path.join(dataDir, "notion-export2.csv")} (${simple.rows.length} rows)...`);

  const { entries, skipped } = await resolveNotionRows(simple, enrichment, {
    findByImdb: (imdbId) => tmdb.findByImdb(imdbId),
    searchByTitle: (title, opts) => tmdb.searchByTitle(title, opts),
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? "dry-run" : "apply",
    apiBase: options.apiBase,
    totals: {
      importable: entries.length,
      skipped: skipped.length,
      byMatchMethod: {
        tmdb_url: entries.filter((e) => e.matchMethod === "tmdb_url").length,
        imdb_url: entries.filter((e) => e.matchMethod === "imdb_url").length,
        title_search: entries.filter((e) => e.matchMethod === "title_search").length,
      },
      byStatus: {
        watched: entries.filter((e) => e.status === "watched").length,
        watching: entries.filter((e) => e.status === "watching").length,
        want_to_watch: entries.filter((e) => e.status === "want_to_watch").length,
        unsure: entries.filter((e) => e.status === "unsure").length,
      },
      movies: entries.filter((e) => e.mediaType === "movie").length,
      tv: entries.filter((e) => e.mediaType === "tv").length,
    },
    skippedByReason: skipped.reduce<Record<string, number>>((acc, row) => {
      acc[row.reason] = (acc[row.reason] ?? 0) + 1;
      return acc;
    }, {}),
    entries,
    skipped,
  };

  await mkdir(dataDir, { recursive: true });
  const reportPath = path.join(dataDir, "notion-import-report.json");
  await writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("");
  console.log("Import summary");
  console.log(`  Ready to import : ${summary.totals.importable}`);
  console.log(`  Skipped           : ${summary.totals.skipped}`);
  console.log(`  TMDB URL          : ${summary.totals.byMatchMethod.tmdb_url}`);
  console.log(`  IMDb lookup       : ${summary.totals.byMatchMethod.imdb_url}`);
  console.log(`  Title search      : ${summary.totals.byMatchMethod.title_search}`);
  console.log(`  Movies / TV       : ${summary.totals.movies} / ${summary.totals.tv}`);
  console.log(
    `  Status            : watched ${summary.totals.byStatus.watched}, watching ${summary.totals.byStatus.watching}, want_to_watch ${summary.totals.byStatus.want_to_watch}, unsure ${summary.totals.byStatus.unsure}`,
  );
  console.log(`  Report            : ${reportPath}`);

  if (skipped.length > 0) {
    console.log("");
    console.log("Skipped examples:");
    for (const row of skipped.slice(0, 8)) {
      console.log(`  - ${row.name}: ${row.reason}`);
    }
    if (skipped.length > 8) console.log(`  ... and ${skipped.length - 8} more (see report)`);
  }

  if (options.dryRun) {
    console.log("");
    console.log("Dry run only — nothing was written.");
    console.log("Next: start local API + frontend, then run with --apply to preview in the hub.");
    return;
  }

  console.log("");
  console.log(`Applying to ${options.apiBase} ...`);
  await checkApi(options.apiBase);
  await applyEntries(options.apiBase, entries, options.delayMs);
  console.log("");
  console.log("Open http://localhost:5174/watchlist?status=watched to review locally.");
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exitCode = 1;
});
