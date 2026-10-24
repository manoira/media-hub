import { Router } from "express";
import { db, episodeProgressTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getSeasonDetails, getTvDetails } from "../lib/tmdb";
import { syncWatchlistStatusFromProgress } from "../lib/watchlist-status-sync";

const router = Router();

const BATCH_MAX_IDS = 500;

function parseTmdbIds(raw: unknown): number[] | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ids = raw
    .split(",")
    .map(part => Number(part.trim()))
    .filter(id => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return null;
  return [...new Set(ids)].slice(0, BATCH_MAX_IDS);
}

function buildProgressFromRows(
  tmdbId: number,
  rows: { seasonNumber: number; episodeNumber: number }[],
  totalEpisodes: number | null = null,
) {
  const watched: Record<number, number[]> = {};
  for (const row of rows) {
    if (!watched[row.seasonNumber]) watched[row.seasonNumber] = [];
    watched[row.seasonNumber].push(row.episodeNumber);
  }
  return {
    tmdbId,
    totalWatched: rows.length,
    totalEpisodes,
    watchedBySeasonNumber: watched,
  };
}

router.get("/progress/tv/batch", async (req, res) => {
  const tmdbIds = parseTmdbIds(req.query.ids);
  if (!tmdbIds) {
    res.status(400).json({ error: "Missing or invalid ids query parameter" });
    return;
  }

  const rows = tmdbIds.length === 1
    ? await db.select().from(episodeProgressTable).where(eq(episodeProgressTable.tmdbId, tmdbIds[0]!))
    : await db.select().from(episodeProgressTable).where(inArray(episodeProgressTable.tmdbId, tmdbIds));

  const rowsByShow = new Map<number, typeof rows>();
  for (const id of tmdbIds) rowsByShow.set(id, []);
  for (const row of rows) {
    const bucket = rowsByShow.get(row.tmdbId);
    if (bucket) bucket.push(row);
  }

  const items: Record<string, ReturnType<typeof buildProgressFromRows>> = {};
  for (const tmdbId of tmdbIds) {
    items[String(tmdbId)] = buildProgressFromRows(tmdbId, rowsByShow.get(tmdbId) ?? []);
  }

  res.set("Cache-Control", "private, no-cache");
  res.json({ items });
});

router.get("/progress/tv/:tmdbId", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  if (isNaN(tmdbId)) { res.status(400).json({ error: "Invalid tmdbId" }); return; }

  const [rows, tvDetails] = await Promise.all([
    db.select().from(episodeProgressTable).where(eq(episodeProgressTable.tmdbId, tmdbId)),
    getTvDetails(tmdbId),
  ]);

  res.set("Cache-Control", "private, no-cache");
  res.json(buildProgressFromRows(tmdbId, rows, tvDetails.numberOfEpisodes ?? null));
});

router.get("/progress/tv/:tmdbId/season/:seasonNumber", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  const seasonNumber = Number(req.params.seasonNumber);
  if (isNaN(tmdbId) || isNaN(seasonNumber)) { res.status(400).json({ error: "Invalid params" }); return; }

  const [seasonDetails, rows] = await Promise.all([
    getSeasonDetails(tmdbId, seasonNumber),
    db.select().from(episodeProgressTable).where(
      and(eq(episodeProgressTable.tmdbId, tmdbId), eq(episodeProgressTable.seasonNumber, seasonNumber))
    ),
  ]);

  const watchedEpisodes = new Set(rows.map(r => r.episodeNumber));
  const episodes = seasonDetails.episodes.map(ep => ({
    ...ep,
    watched: watchedEpisodes.has(ep.episodeNumber),
  }));

  res.json({ ...seasonDetails, episodes, watchedCount: rows.length, totalCount: seasonDetails.episodes.length });
});

router.post("/progress/tv/:tmdbId/episode", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  const { seasonNumber, episodeNumber, watched } = req.body as { seasonNumber: number; episodeNumber: number; watched: boolean };

  if (isNaN(tmdbId) || seasonNumber == null || episodeNumber == null) {
    res.status(400).json({ error: "Missing required fields" }); return;
  }

  if (watched) {
    await db.insert(episodeProgressTable)
      .values({ tmdbId, seasonNumber, episodeNumber })
      .onConflictDoNothing();
  } else {
    await db.delete(episodeProgressTable).where(
      and(
        eq(episodeProgressTable.tmdbId, tmdbId),
        eq(episodeProgressTable.seasonNumber, seasonNumber),
        eq(episodeProgressTable.episodeNumber, episodeNumber)
      )
    );
  }

  await syncWatchlistStatusFromProgress(tmdbId);
  res.json({ tmdbId, seasonNumber, episodeNumber, watched });
});

router.post("/progress/tv/:tmdbId/season/:seasonNumber/watch", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  const seasonNumber = Number(req.params.seasonNumber);
  const { watched } = req.body as { watched: boolean };

  if (isNaN(tmdbId) || isNaN(seasonNumber)) { res.status(400).json({ error: "Invalid params" }); return; }

  if (watched) {
    const seasonDetails = await getSeasonDetails(tmdbId, seasonNumber);
    const values = seasonDetails.episodes.map(ep => ({
      tmdbId,
      seasonNumber,
      episodeNumber: ep.episodeNumber,
    }));
    if (values.length > 0) {
      await db.insert(episodeProgressTable).values(values).onConflictDoNothing();
    }
    res.json({ tmdbId, seasonNumber, watched: true, episodeCount: values.length });
  } else {
    await db.delete(episodeProgressTable).where(
      and(eq(episodeProgressTable.tmdbId, tmdbId), eq(episodeProgressTable.seasonNumber, seasonNumber))
    );
    res.json({ tmdbId, seasonNumber, watched: false });
  }
  await syncWatchlistStatusFromProgress(tmdbId);
});

router.post("/progress/tv/:tmdbId/watch-all", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  const { watched } = req.body as { watched: boolean };

  if (isNaN(tmdbId)) { res.status(400).json({ error: "Invalid tmdbId" }); return; }

  if (watched) {
    const tvDetails = await getTvDetails(tmdbId);
    const seasonNumbers = (tvDetails.seasons ?? [])
      .map(s => s.seasonNumber)
      .filter(n => n > 0);

    const allEpisodes: { tmdbId: number; seasonNumber: number; episodeNumber: number }[] = [];
    await Promise.all(
      seasonNumbers.map(async (sn) => {
        const season = await getSeasonDetails(tmdbId, sn);
        for (const ep of season.episodes) {
          allEpisodes.push({ tmdbId, seasonNumber: sn, episodeNumber: ep.episodeNumber });
        }
      })
    );

    if (allEpisodes.length > 0) {
      await db.insert(episodeProgressTable).values(allEpisodes).onConflictDoNothing();
    }
    res.json({ tmdbId, watched: true, episodeCount: allEpisodes.length });
  } else {
    await db.delete(episodeProgressTable).where(eq(episodeProgressTable.tmdbId, tmdbId));
    res.json({ tmdbId, watched: false });
  }
  await syncWatchlistStatusFromProgress(tmdbId);
});

export default router;
