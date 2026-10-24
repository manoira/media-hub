import { httpServerHandler } from "cloudflare:node";
import { pool, withDirectClient } from "@workspace/db";
import app from "./app";
import { claimExport } from "./lib/export-lock";
import { createFixtureLockDb } from "./lib/fixture-lock-db";
import { catalogEtag, notModified } from "./lib/private-cache";
import { sessionCookieAttributes, sessionTokenHash } from "./lib/owner-session";
import { serializeCustomListDisplayItem } from "./lib/list-item-serialize";

const port = 3000;
const catalogStamp = new Date("2026-10-24T00:00:00.000Z");

app.get("/__worker/hash", (_req, res) => {
  res.json({ hash: sessionTokenHash("fixture-token") });
});

app.get("/__worker/cookie", (_req, res) => {
  res.json({ attributes: sessionCookieAttributes("production") });
});

app.get("/__worker/catalog", (req, res) => {
  const etag = catalogEtag(2, catalogStamp, "added_at");
  if (notModified(req, res, etag)) return;
  res.json({ items: [{ id: 1, title: "Fixture" }] });
});

app.get("/__worker/list", (_req, res) => {
  const now = catalogStamp;
  const item = serializeCustomListDisplayItem(null, {
    id: 1,
    tmdbId: 603,
    mediaType: "movie",
    status: "watched",
    userRating: 8,
    notes: "Fixture note",
    addedAt: now,
    updatedAt: now,
    title: "Fixture title",
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    releaseDate: "1999-03-31",
    originalLanguage: "en",
    adult: false,
    voteAverage: 8.2,
    genreIds: ["28"],
    keywordIds: [1, 2, 3],
    tags: ["fixture"],
    overview: "A ".repeat(300),
  } as never);
  res.json(item);
});

const RESTORE_BRANCH = "br-proud-smoke-asy4fsyv";
const RESTORE_DATABASE = "mediahub_restore_empty";
const PROBE_TMDB_ID = 990000241;

async function restoreDbOrRefuse(res: { status: (code: number) => { json: (body: unknown) => void } }): Promise<boolean> {
  const found = await pool.query(
    "SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch_id",
  );
  const row = found.rows[0] as { database?: string; branch_id?: string } | undefined;
  if (row?.database !== RESTORE_DATABASE || row.branch_id !== RESTORE_BRANCH) {
    res.status(403).json({ error: "refused" });
    return false;
  }
  return true;
}

app.get("/__worker/db", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  const counts = await pool.query(
    "SELECT (SELECT count(*)::int FROM watchlist) AS watchlist, (SELECT count(*)::int FROM custom_lists) AS lists",
  );
  res.json({ database: RESTORE_DATABASE, branchId: RESTORE_BRANCH, ...counts.rows[0] });
});

app.post("/__worker/locks-real", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  try {
  const result = await withDirectClient(async (client) => {
    const list = await client.query("SELECT id FROM custom_lists ORDER BY id LIMIT 1");
    const listId = Number(list.rows[0]?.id);
    if (!Number.isInteger(listId)) throw new Error("no list");
    const before = await client.query(
      "SELECT status, owner, attempt_count FROM list_export_locks WHERE list_id = $1",
      [listId],
    );
    await client.query("BEGIN");
    const claim = await claimExport(listId, "restore-probe", 30, client);
    await client.query("ROLLBACK");
    const after = await client.query(
      "SELECT status, owner, attempt_count FROM list_export_locks WHERE list_id = $1",
      [listId],
    );
    return {
      claim,
      unchanged: JSON.stringify(before.rows) === JSON.stringify(after.rows),
    };
  });
  res.json(result);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "error";
    const message = String(error instanceof Error ? error.message : error).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted");
    console.log(`locks-real ${code} ${message}`);
    res.status(500).json({ error: code });
  }
});

app.post("/__worker/probe", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  await pool.query(
    `INSERT INTO watchlist (tmdb_id, media_type, status, title)
     VALUES ($1, 'movie', 'planned', 'restore-probe')
     ON CONFLICT (media_type, tmdb_id) DO UPDATE SET status = 'planned', title = 'restore-probe', updated_at = now()`,
    [PROBE_TMDB_ID],
  );
  res.json({ status: "planned" });
});

app.post("/__worker/probe-status", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  await pool.query(
    "UPDATE watchlist SET status = 'watched', updated_at = now() WHERE tmdb_id = $1 AND media_type = 'movie' AND title = 'restore-probe'",
    [PROBE_TMDB_ID],
  );
  res.json({ status: "watched" });
});

app.get("/__worker/probe", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  const found = await pool.query(
    "SELECT status FROM watchlist WHERE tmdb_id = $1 AND media_type = 'movie' AND title = 'restore-probe'",
    [PROBE_TMDB_ID],
  );
  res.json({ status: found.rows[0]?.status ?? null });
});

app.delete("/__worker/probe", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  const removed = await pool.query(
    "DELETE FROM watchlist WHERE tmdb_id = $1 AND media_type = 'movie' AND title = 'restore-probe'",
    [PROBE_TMDB_ID],
  );
  const count = await pool.query("SELECT count(*)::int AS n FROM watchlist");
  res.json({ removed: removed.rowCount, watchlist: count.rows[0].n });
});

app.get("/__worker/cpu", async (_req, res) => {
  if (!(await restoreDbOrRefuse(res))) return;
  const queryStarted = performance.now();
  const rows = await pool.query("SELECT overview FROM watchlist");
  const queryWallMs = performance.now() - queryStarted;
  const serializeStarted = performance.now();
  const bytes = Buffer.byteLength(JSON.stringify(rows.rows));
  const serializeWallMs = performance.now() - serializeStarted;
  res.json({ rows: rows.rows.length, bytes, queryWallMs, serializeWallMs });
});

app.post("/__worker/locks", async (_req, res) => {
  const db = createFixtureLockDb();
  const first = await claimExport(7, "owner-a", 120, db);
  const second = await claimExport(7, "owner-b", 120, db);
  await db.begin();
  const inside = await claimExport(9, "owner-a", 120, db);
  await db.rollback();
  const afterRollback = await claimExport(9, "owner-c", 120, db);
  res.json({ first, second, inside, afterRollback });
});

app.listen(port);

export default httpServerHandler({ port });
