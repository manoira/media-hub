import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  catalogCounts,
  db,
  listRulesSchema,
  pool,
  watchEventsTable,
  watchlistTable,
} from "@workspace/db";
import { explainListRules } from "../lib/list-rules";
import { checkLocalListRoundTrip, readListSync, setListExport } from "../lib/list-export";
import { finishSimklDevice, getSimklConnection, hasSimklConnection, startSimklDevice } from "../lib/simkl-device";
import { watchlistMetadata } from "../lib/watchlist-metadata";
import { invalidateWatchlistCache } from "../lib/watchlist-cache";
import { readSimklPreview, writeSimklStatus } from "../lib/simkl-preview";
import { integrationSecret, listIntegrations } from "../lib/integrations";
import { demonstrateNotificationLock } from "../lib/notification-sync";
import { mergeWatchState, practiceMergeSamples } from "../lib/simkl-sync";
import { getCredits, getMovieDetails, getTvDetails } from "../lib/tmdb";
import { fillMissingMetadata } from "../lib/metadata-fill";
import { withManualTmdbBudget } from "../lib/tmdb-budget";
import { readTmdbUsage, recordLocalRead } from "../lib/tmdb-cache";

const router: IRouter = Router();

const hosting = {
  decision: "stay",
  checkedOn: "2026-10-18",
  summary: "Media Hub stays on Vercel and Neon. A separate My Lists test install can be pointed at later. Moving Media Hub itself is not part of this work.",
  reasons: [
    "The catalog uses Postgres arrays, jsonb rules, and unique indexes. D1 is not a drop-in replacement.",
    "Owner sessions, login throttling, and the list export lock are rows in Postgres, so a second instance shares them.",
    "The dev catalog is already on Neon. Moving it is a separate rehearsed restore, not part of this local pass.",
    "My Lists and SIMKL secrets are server environment variables. A value there means configured, not that the remote account was verified.",
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
  const result = await withManualTmdbBudget(() => fillMissingMetadata({
    load: async (row) => {
      const details = row.mediaType === "tv" ? await getTvDetails(row.tmdbId) : await getMovieDetails(row.tmdbId);
      return {
        tmdbId: details.tmdbId,
        imdbId: details.imdbId ?? null,
        productionCountryCodes: details.productionCountryCodes,
        runtime: details.runtime,
      };
    },
  }));
  res.json(result);
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
  const configured = listIntegrations().some((item) => item.provider === "simkl" && item.configured);
  const events = await db.select().from(watchEventsTable);
  const connected = await hasSimklConnection();
  res.json({
    configured: configured || connected,
    verified: connected,
    liveSync: false,
    pendingEvents: events.length,
    connected,
    canPreview: Boolean(configured && process.env.SIMKL_CLIENT_ID?.trim()) || connected,
    policy: "Watch sync reads SIMKL on request and transfers selected statuses. Unsure and waiting stay local. A series you are still watching is not marked completed. Watch dates are not invented. Notes, labels, and list membership stay put.",
  });
});

router.post("/v2/simkl/connect", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  if (!/^[0-9a-f]{64}$/i.test(clientId)) {
    res.status(400).json({ error: "Enter your SIMKL app Client ID." });
    return;
  }
  try {
    res.json(await startSimklDevice(clientId));
  } catch {
    res.status(502).json({ error: "Could not get a code from SIMKL. Check the Client ID." });
  }
});

router.post("/v2/simkl/connect/check", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    res.json({ state: await finishSimklDevice() });
  } catch {
    res.status(502).json({ error: "Could not complete the SIMKL connection." });
  }
});

router.get("/v2/simkl/compare", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  let preview: Awaited<ReturnType<typeof readSimklPreview>>;
  try {
    const connection = await getSimklConnection();
    const token = connection?.token ?? integrationSecret("simkl");
    const clientId = connection?.clientId ?? process.env.SIMKL_CLIENT_ID?.trim();
    if (!token || !clientId) {
      res.status(409).json({ error: "Connect your SIMKL account before comparing statuses." });
      return;
    }
    preview = await readSimklPreview(clientId, token);
  } catch {
    res.status(502).json({ error: "Could not read SIMKL. Reconnect your account or try again later." });
    return;
  }

  const rows = await db.select({
    tmdbId: watchlistTable.tmdbId,
    mediaType: watchlistTable.mediaType,
    title: watchlistTable.title,
    status: watchlistTable.status,
  }).from(watchlistTable);
  const differences = [];
  const remaining = preview.matches;
  for (const row of rows) {
    const key = `${row.mediaType}:${row.tmdbId}`;
    const remote = remaining.get(key);
    remaining.delete(key);
    if (preview.unsupported.has(key) || !["want_to_watch", "watching", "watched"].includes(row.status)) continue;
    if (!remote || remote.status !== row.status) {
      differences.push({ ...row, simklStatus: remote?.status ?? null });
    }
  }
  for (const remote of remaining.values()) {
    differences.push({ ...remote, status: null, simklStatus: remote.status });
  }
  res.json({ differences, skipped: preview.skipped });
});

router.post("/v2/simkl/transfer-status", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const { tmdbId, mediaType, direction, status, simklStatus } = req.body ?? {};
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0 ||
      (mediaType !== "movie" && mediaType !== "tv") ||
      (direction !== "to-mediahub" && direction !== "to-simkl")) {
    res.status(400).json({ error: "Choose a valid title and sync direction." });
    return;
  }

  try {
    const connection = await getSimklConnection();
    if (!connection) {
      res.status(409).json({ error: "Connect MediaHub to SIMKL first." });
      return;
    }
    const preview = await readSimklPreview(connection.clientId, connection.token);
    const key = `${mediaType}:${tmdbId}`;
    const remote = preview.matches.get(key);
    const condition = and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, mediaType));
    const [local] = await db.select().from(watchlistTable).where(condition);
    const localStatus = local?.status ?? null;
    if (preview.unsupported.has(key) || localStatus !== status || (remote?.status ?? null) !== simklStatus ||
        (localStatus && !["want_to_watch", "watching", "watched"].includes(localStatus))) {
      res.status(409).json({ error: "The status changed or is not supported. Compare statuses again." });
      return;
    }

    if (direction === "to-simkl") {
      if ((localStatus !== "want_to_watch" && localStatus !== "watching" && localStatus !== "watched") ||
          (mediaType === "movie" && localStatus === "watching")) {
        res.status(400).json({ error: "SIMKL does not support this status for the title." });
        return;
      }
      if (!await writeSimklStatus(connection, mediaType, tmdbId, localStatus)) {
        res.status(409).json({ error: "SIMKL did not confirm the exact status. Compare again before retrying." });
        return;
      }
    } else {
      if (!remote) {
        res.status(400).json({ error: "There is no supported SIMKL status to copy." });
        return;
      }
      const details = local ? null : await withManualTmdbBudget(() =>
        mediaType === "movie" ? getMovieDetails(tmdbId) : getTvDetails(tmdbId),
      ).catch(() => null);
      const metadata = details?.tmdbId === tmdbId
        ? { ...watchlistMetadata(tmdbId, details), metadataFetchedAt: new Date() }
        : { title: remote.title };

      const changed = await db.transaction(async tx => {
        const now = new Date();
        const updated = local
          ? await tx.update(watchlistTable).set({ status: remote.status, statusChangedAt: now, updatedAt: now })
            .where(and(condition, eq(watchlistTable.status, local.status))).returning({ id: watchlistTable.id })
          : await tx.insert(watchlistTable).values({
            ...metadata, tmdbId, mediaType, status: remote.status, statusChangedAt: now,
          }).onConflictDoNothing().returning({ id: watchlistTable.id });
        if (!updated.length) return false;
        if ((localStatus === "watched") !== (remote.status === "watched")) {
          await tx.insert(watchEventsTable).values({
            tmdbId, mediaType, action: remote.status === "watched" ? "watched" : "unwatched", occurredAt: null,
          });
        }
        return true;
      });
      if (!changed) {
        res.status(409).json({ error: "MediaHub changed. Compare statuses again." });
        return;
      }
      invalidateWatchlistCache();
    }
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: "Could not verify the status transfer. Compare again before retrying." });
  }
});

router.post("/v2/simkl/preview", async (req, res) => {
  const configured = listIntegrations().some((item) => item.provider === "simkl" && item.configured);
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
    configured,
    verified: false,
    liveSync: false,
    changes,
    detail: configured
      ? "A SIMKL token is configured in the server environment. It has not been verified, and this preview does not call SIMKL."
      : "No SIMKL token is configured. Nothing was sent.",
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
      "SIMKL and the My Lists creator key are not verified, so those services were not called.",
      "Nothing has been published.",
    ],
  });
});

export default router;
