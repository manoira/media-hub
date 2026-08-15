import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, watchlistTable, episodeProgressTable } from "@workspace/db";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const inFile = path.join(repoRoot, "data", "watchlist.json");

type Backup = {
  watchlist: Array<Record<string, unknown>>;
  episodeProgress: Array<Record<string, unknown>>;
};

function toDate(value: unknown): Date | undefined {
  if (typeof value === "string" || value instanceof Date) return new Date(value);
  return undefined;
}

async function main() {
  console.warn(
    "WARNING: this REPLACES all rows in the watchlist and episode_progress tables\n" +
      "of the database in DATABASE_URL. Only point this at a DEV database.",
  );

  const raw = await readFile(inFile, "utf8");
  const backup = JSON.parse(raw) as Backup;

  await db.delete(episodeProgressTable);
  await db.delete(watchlistTable);

  if (backup.watchlist.length > 0) {
    await db.insert(watchlistTable).values(
      backup.watchlist.map((w) => ({
        tmdbId: w.tmdbId as number,
        mediaType: w.mediaType as string,
        status: w.status as string,
        userRating: (w.userRating as number | null) ?? null,
        notes: (w.notes as string | null) ?? null,
        title: w.title as string,
        posterPath: (w.posterPath as string | null) ?? null,
        backdropPath: (w.backdropPath as string | null) ?? null,
        releaseDate: (w.releaseDate as string | null) ?? null,
        voteAverage: (w.voteAverage as number | null) ?? null,
        overview: (w.overview as string | null) ?? null,
        genreIds: (w.genreIds as string[] | null) ?? [],
        tags: (w.tags as string[] | null) ?? [],
        ...(toDate(w.addedAt) ? { addedAt: toDate(w.addedAt)! } : {}),
        ...(toDate(w.updatedAt) ? { updatedAt: toDate(w.updatedAt)! } : {}),
      })),
    );
  }

  if (backup.episodeProgress.length > 0) {
    await db.insert(episodeProgressTable).values(
      backup.episodeProgress.map((e) => ({
        tmdbId: e.tmdbId as number,
        seasonNumber: e.seasonNumber as number,
        episodeNumber: e.episodeNumber as number,
        ...(toDate(e.watchedAt) ? { watchedAt: toDate(e.watchedAt)! } : {}),
      })),
    );
  }

  console.log(
    `Imported ${backup.watchlist.length} watchlist item(s) and ${backup.episodeProgress.length} episode-progress row(s).`,
  );
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
