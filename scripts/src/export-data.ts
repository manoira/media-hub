import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, watchlistTable, episodeProgressTable } from "@workspace/db";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const outDir = path.join(repoRoot, "data");

async function main() {
  console.log("Exporting tracked data from DATABASE_URL...");

  const watchlist = await db.select().from(watchlistTable);
  const episodeProgress = await db.select().from(episodeProgressTable);

  const backup = {
    exportedAt: new Date().toISOString(),
    counts: {
      watchlist: watchlist.length,
      episodeProgress: episodeProgress.length,
    },
    watchlist,
    episodeProgress,
  };

  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "watchlist.json");
  await writeFile(outFile, JSON.stringify(backup, null, 2), "utf8");

  console.log(
    `Exported ${watchlist.length} watchlist item(s) and ${episodeProgress.length} episode-progress row(s).`,
  );
  console.log(`Wrote ${outFile}`);
}

main()
  .catch((err) => {
    console.error("Export failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
