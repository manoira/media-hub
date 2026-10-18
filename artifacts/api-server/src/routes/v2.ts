import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  acceptImdbId,
  catalogCounts,
  db,
  listRulesSchema,
  pool,
  watchEventsTable,
  watchlistTable,
} from "@workspace/db";
import { explainListRules } from "../lib/list-rules";
import { checkLocalListRoundTrip, readListSync, setListExport } from "../lib/list-export";
import { listIntegrations } from "../lib/integrations";
import { demonstrateNotificationLock } from "../lib/notification-sync";
import { mergeWatchState, practiceMergeSamples } from "../lib/simkl-sync";
import { getCredits, getMovieDetails, getTvDetails } from "../lib/tmdb";
import { readTmdbUsage, recordLocalRead } from "../lib/tmdb-cache";

const router: IRouter = Router();
const FILL_LIMIT = 10;

const hosting = {
  decision: "stay",
  checkedOn: "2026-10-18",
  summary: "Stay on the current Vercel and Neon Postgres setup. A Cloudflare move stays a later choice, after the Google TV check.",
  reasons: [
    "The catalog uses Postgres arrays, jsonb rules, and unique indexes. D1 is not a drop-in replacement.",
    "Sessions are in memory today and the export queue runs in this process. A Worker would need its own session and queue store.",
    "The dev catalog is already on Neon. Moving it is a separate rehearsed restore, not part of this local pass.",
    "My Lists keys and the SIMKL token are still unset, so hosted addon or Worker KV usage is not measured against a live account.",
  ],
  notDoing: "No production cutover and no shutdown of the current host.",
};

router.get("/v2/usage", async (_req, res) => {
  res.json({
    ...(await readTmdbUsage()),
    notes: [
      "List reads are counted on the list surface and do not fetch TMDB per title.",
      "A fresh response is reused until TMDB_CACHE_TTL_MS, including after a restart. A failed fetch can use the stale copy until TMDB_CACHE_STALE_MS.",
      "Notification checks cover at most 20 watching shows and 20 want-to-watch titles per pass, and a second pass waits.",
    ],
  });
});

router.post("/v2/usage/measure", async (_req, res) => {
  const started = Date.now();
  await db.select({ id: watchlistTable.id }).from(watchlistTable).limit(1);
  await recordLocalRead("list", Date.now() - started);
  const [movie] = await db.select().from(watchlistTable).where(eq(watchlistTable.mediaType, "movie")).limit(1);
  if (movie) {
    await getMovieDetails(movie.tmdbId);
    await getMovieDetails(movie.tmdbId);
    await Promise.all([
      getCredits("movie", movie.tmdbId),
      getCredits("movie", movie.tmdbId),
    ]);
  }
  const lock = await demonstrateNotificationLock();
  const usage = await readTmdbUsage();
  res.json({
    usage,
    lock,
    sampleTitle: movie?.title ?? null,
    beforeAfter: "The first detail fetch is an external call. The second detail fetch and the second credits fetch reuse the cache.",
  });
});

router.post("/v2/metadata/fill", async (_req, res) => {
  const rows = await db.select().from(watchlistTable).where(isNull(watchlistTable.metadataFetchedAt)).limit(FILL_LIMIT);
  let filled = 0;
  for (const row of rows) {
    try {
      const details = row.mediaType === "tv" ? await getTvDetails(row.tmdbId) : await getMovieDetails(row.tmdbId);
      const imdbId = acceptImdbId({
        requestedTmdbId: row.tmdbId,
        returnedTmdbId: details.tmdbId,
        imdbId: details.imdbId,
      });
      await pool.query(
        `UPDATE watchlist
         SET production_countries = $1, runtime_minutes = $2, imdb_id = COALESCE($3, imdb_id), metadata_fetched_at = now()
         WHERE id = $4`,
        [details.productionCountryCodes, details.runtime, imdbId, row.id],
      );
      filled += 1;
    } catch {
      await pool.query("UPDATE watchlist SET metadata_fetched_at = now() WHERE id = $1", [row.id]);
    }
  }
  res.json({ filled, remainingLookedAt: rows.length });
});

router.post("/v2/rules/preview", async (req, res) => {
  const parsed = listRulesSchema.safeParse(req.body?.rules ?? req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const items = await db.select().from(watchlistTable);
  const explained = explainListRules(items, parsed.data);
  res.json({
    count: explained.matches.length,
    missingCountry: explained.missingCountry,
    missingRuntime: explained.missingRuntime,
    missingUserRating: explained.missingUserRating,
    samples: explained.matches.slice(0, 8).map((item) => item.title),
    logic: "Each filter is combined with AND. Several values inside one filter are combined with OR. A title missing that stored value is left out rather than guessed.",
  });
});

router.get("/v2/lists/:id/sync", async (req, res) => {
  const id = Number(req.params.id);
  const status = await readListSync(id);
  if (!status) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(status);
});

router.post("/v2/lists/:id/sync", async (req, res) => {
  const id = Number(req.params.id);
  const action = req.body?.action;
  if (action !== "enable" && action !== "pause" && action !== "sync" && action !== "delete-external") {
    res.status(400).json({ error: "Choose enable, pause, sync, or delete-external." });
    return;
  }
  if (action === "delete-external" && req.body?.confirm !== "delete-external") {
    res.status(400).json({ error: "External removal needs an explicit confirmation." });
    return;
  }
  const result = await setListExport(id, action);
  res.status(result.ok ? 200 : 409).json(result);
});

router.get("/v2/simkl", async (_req, res) => {
  const connected = listIntegrations().some((item) => item.provider === "simkl" && item.connected);
  const events = await db.select().from(watchEventsTable);
  res.json({
    connected,
    liveSync: false,
    pendingEvents: events.length,
    policy: "SIMKL is not called while the token is unset. Unsure and waiting stay local. A series you are still watching is not marked completed. Watch dates are not invented. Notes, labels, and list membership stay put.",
  });
});

router.post("/v2/simkl/preview", async (req, res) => {
  const connected = listIntegrations().some((item) => item.provider === "simkl" && item.connected);
  const remote = Array.isArray(req.body?.remote) ? req.body.remote.slice(0, 20) : [];
  const changes = [];
  for (const entry of remote) {
    const tmdbId = Number(entry?.tmdbId);
    const mediaType = entry?.mediaType === "tv" ? "tv" : "movie";
    if (!Number.isFinite(tmdbId)) continue;
    const [local] = await db.select().from(watchlistTable).where(and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, mediaType)));
    if (!local) continue;
    const change = mergeWatchState(
      {
        tmdbId: local.tmdbId,
        mediaType: local.mediaType,
        status: local.status,
        notes: local.notes,
        tags: local.tags,
        occurredAt: local.statusChangedAt?.toISOString() ?? null,
      },
      {
        tmdbId,
        mediaType,
        watched: typeof entry.watched === "boolean" ? entry.watched : null,
        occurredAt: typeof entry.occurredAt === "string" ? entry.occurredAt : null,
      },
    );
    if (change) changes.push({ ...change, title: local.title, notes: local.notes, tags: local.tags });
  }
  res.json({
    connected,
    liveSync: false,
    changes,
    detail: connected
      ? "The token is stored. This preview still uses the local stand-in and does not call SIMKL."
      : "SIMKL is not connected. Nothing was sent.",
  });
});

router.post("/v2/simkl/apply", async (req, res) => {
  if (req.body?.confirm !== true || !Array.isArray(req.body?.changes)) {
    res.status(400).json({ error: "Apply needs an explicit confirmation and the previewed changes." });
    return;
  }
  let applied = 0;
  for (const change of req.body.changes.slice(0, 20)) {
    const tmdbId = Number(change?.tmdbId);
    const mediaType = change?.mediaType === "tv" ? "tv" : "movie";
    const to = change?.to === "watched" ? "watched" : change?.to === "want_to_watch" ? "want_to_watch" : null;
    if (!to || !Number.isFinite(tmdbId)) continue;
    const [local] = await db.select().from(watchlistTable).where(and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, mediaType)));
    if (!local || local.status === to) continue;
    await pool.query(
      "UPDATE watchlist SET status = $1, status_changed_at = now() WHERE id = $2",
      [to, local.id],
    );
    await db.insert(watchEventsTable).values({
      tmdbId,
      mediaType,
      action: to === "watched" ? "watched" : "unwatched",
      occurredAt: typeof change.occurredAt === "string" ? new Date(change.occurredAt) : null,
    });
    applied += 1;
  }
  res.json({ applied, liveSync: false, detail: "Applied on the local catalog only. SIMKL was not called." });
});

router.get("/v2/hosting", async (_req, res) => {
  res.json(hosting);
});

router.post("/v2/release-check", async (_req, res) => {
  const items = await db.select().from(watchlistTable);
  const swedishWatched = explainListRules(items, { mediaType: "movie", languages: ["sv"], statuses: ["watched"] });
  const swedishUnseenCrime = explainListRules(items, {
    mediaType: "movie",
    languages: ["sv"],
    genreIds: [80],
    statuses: ["want_to_watch", "watching", "unsure", "waiting"],
  });
  const shortUnseen = explainListRules(items, {
    mediaType: "movie",
    statuses: ["want_to_watch", "watching", "unsure", "waiting"],
    runtimeBelow: 100,
  });
  const roundTrip = await checkLocalListRoundTrip();
  const watchPolicy = practiceMergeSamples();
  const counts = await catalogCounts(db);
  const usage = await readTmdbUsage();
  res.json({
    rules: {
      swedishWatched: swedishWatched.matches.length,
      swedishUnseenCrime: swedishUnseenCrime.matches.length,
      shortUnseen: shortUnseen.matches.length,
      missingRuntime: shortUnseen.missingRuntime,
    },
    myLists: roundTrip,
    simkl: watchPolicy,
    counts,
    usage,
    blocked: [
      "Google TV playback and the real Wako install are still unchecked.",
      "SIMKL and the My Lists creator key are not connected, so those services were not called.",
      "Nothing has been published.",
    ],
  });
});

export default router;
