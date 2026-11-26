import { Router } from "express";
import { db, episodeProgressTable, tmdbCacheTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { getSeasonDetails, getTvDetails, getTmdbLanguage } from "../lib/tmdb";
import { syncWatchlistStatusFromProgress } from "../lib/watchlist-status-sync";

import { countAiredTvProgress } from "../lib/aired-tv-progress";
import { tmdbCacheKey } from "../lib/tmdb-cache";
import { withManualTmdbBudget } from "../lib/tmdb-budget";

const router = Router();

const BATCH_MAX_IDS = 500;
const BATCH_REFRESH_LIMIT = 4;

async function loadAiredProgress(rowsByShow: Map<number, { seasonNumber: number; episodeNumber: number }[]>) {
  const keys = new Map([...rowsByShow].filter(([, rows]) => rows.some(row => row.seasonNumber > 0))
    .map(([id]) => [tmdbCacheKey(`/tv/${id}`, { language: getTmdbLanguage() }), id]));
  if (!keys.size) return new Map<number, ReturnType<typeof countAiredTvProgress>>();

  const read = () => db.select().from(tmdbCacheTable).where(inArray(tmdbCacheTable.cacheKey, [...keys.keys()]));
  let cached = await read();
  const byKey = new Map(cached.map(row => [row.cacheKey, row]));
  const missing = [...keys].filter(([key]) => !byKey.has(key));
  const stale = [...keys].filter(([key]) => {
    const row = byKey.get(key);
    return row && row.expiresAt.getTime() <= Date.now();
  }).sort(([a], [b]) => byKey.get(a)!.expiresAt.getTime() - byKey.get(b)!.expiresAt.getTime());
  const refresh = [...missing, ...stale].slice(0, BATCH_REFRESH_LIMIT);
  if (refresh.length) {
    await withManualTmdbBudget(() => Promise.allSettled(refresh.map(([, id]) => getTvDetails(id))));
    cached = await read();
  }

  return new Map(cached.map(row => {
    const id = keys.get(row.cacheKey)!;
    return [id, countAiredTvProgress(row.payload as Parameters<typeof countAiredTvProgress>[0], rowsByShow.get(id)!)];
  }));
}

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

  const aired = await loadAiredProgress(rowsByShow).catch(() => new Map());
  const items: Record<string, ReturnType<typeof buildProgressFromRows> & { airedProgress?: ReturnType<typeof countAiredTvProgress> }> = {};
  for (const tmdbId of tmdbIds) {
    items[String(tmdbId)] = { ...buildProgressFromRows(tmdbId, rowsByShow.get(tmdbId) ?? []), airedProgress: aired.get(tmdbId) ?? null };
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
  const aired = await loadAiredProgress(new Map([[tmdbId, rows]])).catch(() => new Map());
  res.json({ ...buildProgressFromRows(tmdbId, rows, tvDetails.numberOfEpisodes ?? null), airedProgress: aired.get(tmdbId) ?? null });
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
    const today = new Date().toISOString().slice(0, 10);
    const values = seasonDetails.episodes.filter(ep => ep.airDate && ep.airDate <= today).map(ep => ({
      tmdbId,
      seasonNumber,
      episodeNumber: ep.episodeNumber,
    }));
    if (values.length > 0) {
      await db.insert(episodeProgressTable).values(values).onConflictDoNothing();
    }
    await syncWatchlistStatusFromProgress(tmdbId);
    res.json({ tmdbId, seasonNumber, watched: true, episodeCount: values.length });
  } else {
    await db.delete(episodeProgressTable).where(
      and(eq(episodeProgressTable.tmdbId, tmdbId), eq(episodeProgressTable.seasonNumber, seasonNumber))
    );
    await syncWatchlistStatusFromProgress(tmdbId);
    res.json({ tmdbId, seasonNumber, watched: false });
  }
});

router.post("/progress/tv/:tmdbId/watch-all", async (req, res) => {
  const tmdbId = Number(req.params.tmdbId);
  const { watched } = req.body as { watched: boolean };

  if (isNaN(tmdbId)) { res.status(400).json({ error: "Invalid tmdbId" }); return; }

  if (watched) {
    const tvDetails = await getTvDetails(tmdbId);
    const today = new Date().toISOString().slice(0, 10);
    const seasonNumbers = (tvDetails.seasons ?? [])
      .filter(season => season.seasonNumber > 0 && season.airDate && season.airDate <= today)
      .map(season => season.seasonNumber);

    const allEpisodes: { tmdbId: number; seasonNumber: number; episodeNumber: number }[] = [];
    await Promise.all(
      seasonNumbers.map(async (sn) => {
        const season = await getSeasonDetails(tmdbId, sn);
        for (const ep of season.episodes) {
          if (!ep.airDate || ep.airDate > today) continue;
          allEpisodes.push({ tmdbId, seasonNumber: sn, episodeNumber: ep.episodeNumber });
        }
      })
    );

    if (allEpisodes.length > 0) {
      await db.insert(episodeProgressTable).values(allEpisodes).onConflictDoNothing();
    }
    await syncWatchlistStatusFromProgress(tmdbId);
    res.json({ tmdbId, watched: true, episodeCount: allEpisodes.length });
  } else {
    await db.delete(episodeProgressTable).where(eq(episodeProgressTable.tmdbId, tmdbId));
    await syncWatchlistStatusFromProgress(tmdbId);
    res.json({ tmdbId, watched: false });
  }
});

export default router;
