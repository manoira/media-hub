import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import express from "express";
import {
  customListItemsTable,
  customListsTable,
  db,
  pool,
  watchlistTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { listIntegrations } from "./lib/integrations";
import {
  LOCAL_EXPORT_PROFILE,
  LOCAL_EXPORT_TARGET,
  exportFingerprint,
  exportList,
  exportStillMatches,
  setListExport,
} from "./lib/list-export";
import { claimExport, EXPORT_ATTEMPT_LIMIT, runExclusiveListJob } from "./lib/export-lock";
import { loginSubjectHash } from "./lib/login-limit";
import { METADATA_ATTEMPT_LIMIT, fillMissingMetadata } from "./lib/metadata-fill";
import { deleteLocalMyList, readLocalMyList, saveLocalMyList } from "./lib/my-lists-sandbox";
import { ownerGate, sessionTokenHash } from "./lib/owner-session";
import integrationsRouter from "./routes/integrations";
import sessionRouter from "./routes/session";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const createdWatchIds: number[] = [];
const createdListIds: number[] = [];
const sessionHashes: string[] = [];

function cookiePair(response: Response): string {
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith("mh_session="));
  assert.ok(cookie, "session cookie missing");
  return cookie.split(";")[0] ?? "";
}

function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

function testApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", ownerGate);
  app.use("/api", sessionRouter);
  app.use("/api", integrationsRouter);
  app.get("/api/watchlist", (_req, res) => res.json({ ok: true }));
  app.post("/api/watchlist", (_req, res) => res.json({ ok: true }));
  return app;
}

function rowsInAnotherProcess(hash: string): Promise<number> {
  const script = `
    import { pool } from "@workspace/db";
    const found = await pool.query("select 1 from owner_sessions where token_hash = $1", [process.env.SESSION_HASH]);
    process.stdout.write(String(found.rowCount ?? 0));
    await pool.end();
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: path.join(repoRoot, "scripts"),
      env: { ...process.env, SESSION_HASH: hash },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://redacted") || `session probe exited ${code}`));
        return;
      }
      resolve(Number(stdout.trim()));
    });
  });
}

function claimFromAnotherProcess(listId: number): Promise<string> {
  const moduleUrl = pathToFileURL(path.join(repoRoot, "artifacts", "api-server", "src", "lib", "export-lock.ts")).href;
  const script = `
    import { claimExport } from ${JSON.stringify(moduleUrl)};
    import { pool } from "@workspace/db";
    const result = await claimExport(Number(process.env.LIST_ID), "other-process", 30);
    process.stdout.write(result);
    await pool.end();
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: path.join(repoRoot, "scripts"),
      env: { ...process.env, LIST_ID: String(listId) },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://redacted") || `export probe exited ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function insertWatch(tmdbId: number, title: string, imdbId: string | null): Promise<number> {
  await pool.query("DELETE FROM watchlist WHERE media_type = 'movie' AND tmdb_id = $1", [tmdbId]);
  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO watchlist (tmdb_id, media_type, status, title, production_countries, runtime_minutes, imdb_id)
     VALUES ($1, 'movie', 'watched', $2, ARRAY['SE'], 100, $3)
     RETURNING id`,
    [tmdbId, title, imdbId],
  );
  const id = inserted.rows[0]?.id;
  assert.ok(id);
  createdWatchIds.push(id);
  return id;
}

describe("review fixes", { concurrency: 1 }, () => {
  const servers: Array<{ url: string; close: () => Promise<void> }> = [];

  before(async () => {
    process.env.MY_LISTS_MODE = "simulator";
    assert.ok(process.env.OWNER_PASSWORD, "OWNER_PASSWORD is not set");
    servers.push(await listen(testApp()), await listen(testApp()));
  });

  after(async () => {
    await Promise.all(servers.map((server) => server.close()));
    if (createdListIds.length > 0) {
      await db.delete(customListsTable).where(eq(customListsTable.id, createdListIds[0]!));
      for (const id of createdListIds.slice(1)) {
        await db.delete(customListsTable).where(eq(customListsTable.id, id));
      }
    }
    for (const id of createdWatchIds) {
      await pool.query("DELETE FROM watchlist WHERE id = $1", [id]);
    }
    for (const hash of sessionHashes) {
      await pool.query("DELETE FROM owner_sessions WHERE token_hash = $1", [hash]);
    }
    for (const ip of ["127.0.0.1", "::ffff:127.0.0.1", "::1", "local"]) {
      await pool.query("DELETE FROM login_failures WHERE subject_hash = $1", [loginSubjectHash(ip)]);
    }
    await pool.end();
  });

  it("keeps a session across two servers and another process, then expires and logs out", async () => {
    const [first, second] = servers;
    assert.ok(first && second);
    const login = await fetch(`${first.url}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: JSON.stringify({ password: process.env.OWNER_PASSWORD }),
    });
    assert.equal(login.status, 200);
    const cookie = cookiePair(login);
    const hash = sessionTokenHash(decodeURIComponent(cookie.slice("mh_session=".length)));
    sessionHashes.push(hash);

    const rejected = await fetch(`${second.url}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: process.env.OWNER_PASSWORD }),
    });
    assert.equal(rejected.status, 403);

    const seen = await fetch(`${second.url}/api/watchlist`, { headers: { cookie } });
    assert.equal(seen.status, 200);
    assert.equal(await rowsInAnotherProcess(hash), 1);

    const missingCsrf = await fetch(`${second.url}/api/watchlist`, { method: "POST", headers: { cookie } });
    assert.equal(missingCsrf.status, 403);
    const accepted = await fetch(`${second.url}/api/watchlist`, {
      method: "POST",
      headers: { cookie, "x-media-hub-request": "1" },
    });
    assert.equal(accepted.status, 200);

    await pool.query("UPDATE owner_sessions SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [hash]);
    assert.equal(await rowsInAnotherProcess(hash), 1);
    const expired = await fetch(`${second.url}/api/watchlist`, { headers: { cookie } });
    assert.equal(expired.status, 401);
    assert.equal(await rowsInAnotherProcess(hash), 0);

    const again = await fetch(`${first.url}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: JSON.stringify({ password: process.env.OWNER_PASSWORD }),
    });
    const nextCookie = cookiePair(again);
    const nextHash = sessionTokenHash(decodeURIComponent(nextCookie.slice("mh_session=".length)));
    sessionHashes.push(nextHash);
    const logout = await fetch(`${first.url}/api/session/logout`, {
      method: "POST",
      headers: { cookie: nextCookie, "x-media-hub-request": "1" },
    });
    assert.equal(logout.status, 200);
    const afterLogout = await fetch(`${second.url}/api/watchlist`, { headers: { cookie: nextCookie } });
    assert.equal(afterLogout.status, 401);
    assert.equal(await rowsInAnotherProcess(nextHash), 0);
  });

  it("reads keys from the environment and refuses to store them", async () => {
    const previous = process.env.SIMKL_TOKEN;
    const marker = "local-check-token";
    process.env.SIMKL_TOKEN = marker;
    try {
      const listed = listIntegrations().find((item) => item.provider === "simkl");
      assert.equal(listed?.configured, true);
      assert.equal(listed?.verified, false);
      assert.equal(listed?.masked, "••••oken");
      assert.equal(JSON.stringify(listed).includes(marker), false);

      const login = await fetch(`${servers[0]?.url}/api/session/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-media-hub-request": "1" },
        body: JSON.stringify({ password: process.env.OWNER_PASSWORD }),
      });
      const cookie = cookiePair(login);
      sessionHashes.push(sessionTokenHash(decodeURIComponent(cookie.slice("mh_session=".length))));
      const refused = await fetch(`${servers[0]?.url}/api/integrations/simkl`, {
        method: "PUT",
        headers: { cookie, "content-type": "application/json", "x-media-hub-request": "1" },
        body: JSON.stringify({ secret: "placeholder-secret" }),
      });
      assert.equal(refused.status, 409);
      const body = await refused.text();
      assert.equal(body.includes("placeholder-secret"), false);
      assert.equal(process.env.SIMKL_TOKEN, marker);
    } finally {
      if (previous === undefined) delete process.env.SIMKL_TOKEN;
      else process.env.SIMKL_TOKEN = previous;
    }
  });

  it("retries a failed metadata fetch without erasing stored details", async () => {
    const before = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM watchlist");
    const failedId = await insertWatch(990000201, "Review retry", "tt9900201");
    const otherId = await insertWatch(990000202, "Review neighbor", "tt9900202");
    const exhaustedId = await insertWatch(990000203, "Review exhausted", "tt9900203");

    const first = await fillMissingMetadata({
      ids: [failedId, otherId],
      load: async (row) => {
        if (row.id === failedId) throw new Error("metadata unavailable");
        return { tmdbId: row.tmdbId, imdbId: null, productionCountryCodes: ["NO"], runtime: 88 };
      },
    });
    assert.deepEqual({ filled: first.filled, failed: first.failed, lookedAt: first.lookedAt }, { filled: 1, failed: 1, lookedAt: 2 });

    const failed = await pool.query<{
      metadata_fetched_at: Date | null;
      metadata_attempt_count: number;
      production_countries: string[] | null;
      runtime_minutes: number | null;
      imdb_id: string | null;
    }>("SELECT metadata_fetched_at, metadata_attempt_count, production_countries, runtime_minutes, imdb_id FROM watchlist WHERE id = $1", [failedId]);
    assert.equal(failed.rows[0]?.metadata_fetched_at, null);
    assert.equal(failed.rows[0]?.metadata_attempt_count, 1);
    assert.deepEqual(failed.rows[0]?.production_countries, ["SE"]);
    assert.equal(failed.rows[0]?.runtime_minutes, 100);
    assert.equal(failed.rows[0]?.imdb_id, "tt9900201");

    const neighbor = await pool.query<{ metadata_fetched_at: Date | null; runtime_minutes: number | null; imdb_id: string | null }>(
      "SELECT metadata_fetched_at, runtime_minutes, imdb_id FROM watchlist WHERE id = $1",
      [otherId],
    );
    assert.ok(neighbor.rows[0]?.metadata_fetched_at);
    assert.equal(neighbor.rows[0]?.runtime_minutes, 88);
    assert.equal(neighbor.rows[0]?.imdb_id, "tt9900202");

    const second = await fillMissingMetadata({
      ids: [failedId, otherId],
      load: async (row) => ({ tmdbId: row.tmdbId, imdbId: null, productionCountryCodes: [], runtime: null }),
    });
    assert.equal(second.filled, 1);
    assert.equal(second.lookedAt, 1);
    const recovered = await pool.query<{
      metadata_fetched_at: Date | null;
      production_countries: string[] | null;
      runtime_minutes: number | null;
      imdb_id: string | null;
      metadata_last_error: string | null;
    }>("SELECT metadata_fetched_at, production_countries, runtime_minutes, imdb_id, metadata_last_error FROM watchlist WHERE id = $1", [failedId]);
    assert.ok(recovered.rows[0]?.metadata_fetched_at);
    assert.deepEqual(recovered.rows[0]?.production_countries, ["SE"]);
    assert.equal(recovered.rows[0]?.runtime_minutes, 100);
    assert.equal(recovered.rows[0]?.imdb_id, "tt9900201");
    assert.equal(recovered.rows[0]?.metadata_last_error, null);

    for (let attempt = 0; attempt < METADATA_ATTEMPT_LIMIT; attempt += 1) {
      await fillMissingMetadata({
        ids: [exhaustedId],
        load: async () => { throw new Error("still unavailable"); },
      });
    }
    const stopped = await fillMissingMetadata({
      ids: [exhaustedId],
      load: async () => { throw new Error("should not be called"); },
    });
    assert.equal(stopped.lookedAt, 0);
    const exhausted = await pool.query<{ metadata_fetched_at: Date | null; metadata_attempt_count: number; imdb_id: string | null }>(
      "SELECT metadata_fetched_at, metadata_attempt_count, imdb_id FROM watchlist WHERE id = $1",
      [exhaustedId],
    );
    assert.equal(exhausted.rows[0]?.metadata_fetched_at, null);
    assert.equal(exhausted.rows[0]?.metadata_attempt_count, METADATA_ATTEMPT_LIMIT);
    assert.equal(exhausted.rows[0]?.imdb_id, "tt9900203");

    for (const id of [failedId, otherId, exhaustedId]) {
      await pool.query("DELETE FROM watchlist WHERE id = $1", [id]);
    }
    createdWatchIds.splice(0, createdWatchIds.length);
    const after = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM watchlist");
    assert.equal(after.rows[0]?.count, before.rows[0]?.count);
  });

  it("rewrites the simulator when the exported content, target, or copy changes", async () => {
    const base = {
      target: LOCAL_EXPORT_TARGET,
      profile: LOCAL_EXPORT_PROFILE,
      name: "A",
      visibility: "private",
      items: [{ imdbId: "tt0000001", title: "A", year: 1999, type: "movie" }],
    };
    const original = exportFingerprint(base);
    assert.notEqual(original, exportFingerprint({ ...base, name: "B" }));
    assert.notEqual(original, exportFingerprint({ ...base, target: "other-target" }));
    assert.notEqual(original, exportFingerprint({ ...base, profile: "other-profile" }));
    assert.notEqual(original, exportFingerprint({
      ...base,
      items: [{ imdbId: "tt0000002", title: "A", year: 1999, type: "movie" }],
    }));
    assert.notEqual(original, exportFingerprint({
      ...base,
      items: [{ ...base.items[0]!, type: "series" }],
    }));
    assert.equal(exportStillMatches({
      storedHash: original,
      storedTarget: LOCAL_EXPORT_TARGET,
      slug: "mh-1",
      nextHash: original,
      target: LOCAL_EXPORT_TARGET,
      remotePresent: false,
    }), false);

    const watchId = await insertWatch(990000301, "Review export", null);
    const [list] = await db.insert(customListsTable).values({ name: "Review export", kind: "manual" }).returning();
    assert.ok(list);
    createdListIds.push(list.id);
    const [firstItem] = await db.insert(customListItemsTable).values({
      listId: list.id,
      tmdbId: 990000301,
      mediaType: "movie",
      title: "First",
      releaseDate: "2001-01-01",
      addedAt: new Date("2020-01-01T00:00:00Z"),
    }).returning();
    const [secondItem] = await db.insert(customListItemsTable).values({
      listId: list.id,
      tmdbId: 990000302,
      mediaType: "movie",
      title: "Second",
      releaseDate: "2002-01-01",
      addedAt: new Date("2021-01-01T00:00:00Z"),
    }).returning();
    assert.ok(firstItem && secondItem);

    const opened = await setListExport(list.id, "enable");
    assert.equal(opened.status, "simulated");
    assert.match(opened.detail, /local test simulator/);
    assert.match(opened.detail, /not a verified sync/);
    const slug = opened.slug ?? "";
    const repeat = await exportList(list.id);
    assert.match(repeat.detail, /already has this list/);
    const firstRemote = readLocalMyList(slug);
    assert.equal(firstRemote.items?.[0]?.imdbId, "tmdb-movie-990000301");
    assert.equal(firstRemote.items?.[1]?.imdbId, "tmdb-movie-990000302");

    await db.update(customListsTable).set({ syncTarget: "other-target" }).where(eq(customListsTable.id, list.id));
    const retargeted = await exportList(list.id);
    assert.match(retargeted.detail, /^Wrote /);

    deleteLocalMyList(slug);
    const restored = await exportList(list.id);
    assert.match(restored.detail, /^Wrote /);
    assert.equal(readLocalMyList(slug).ok, true);

    await setListExport(list.id, "delete-external");
    assert.equal(readLocalMyList(slug).ok, false);
    const reenabled = await setListExport(list.id, "enable");
    assert.match(reenabled.detail, /^Wrote /);

    await db.update(customListsTable).set({ name: "Review export renamed" }).where(eq(customListsTable.id, list.id));
    const renamed = await exportList(list.id);
    assert.match(renamed.detail, /^Wrote /);
    assert.equal(readLocalMyList(slug).name, "Review export renamed");

    await db.update(customListItemsTable).set({ addedAt: new Date("2024-01-01T00:00:00Z") }).where(eq(customListItemsTable.id, firstItem.id));
    const reordered = await exportList(list.id);
    assert.match(reordered.detail, /^Wrote /);
    assert.equal(readLocalMyList(slug).items?.[0]?.title, "Second");

    await pool.query("UPDATE watchlist SET imdb_id = 'tt7654321' WHERE id = $1", [watchId]);
    const completed = await exportList(list.id);
    assert.match(completed.detail, /^Wrote /);
    assert.equal(readLocalMyList(slug).items?.some((item) => item.imdbId === "tt7654321"), true);

    const current = readLocalMyList(slug);
    assert.ok(current.ok && current.items);
    const external = saveLocalMyList({
      slug,
      name: "Externally renamed",
      items: current.items,
      expectedUpdatedAt: current.updatedAt,
    });
    assert.equal(external.ok, true);
    await db.update(customListsTable).set({
      name: "Media Hub rename",
      externalVersion: String(current.updatedAt),
    }).where(eq(customListsTable.id, list.id));
    const conflict = await exportList(list.id);
    assert.equal(conflict.status, "conflict");
    assert.match(conflict.detail, /simulated list/);
    assert.equal(readLocalMyList(slug).name, "Externally renamed");

    deleteLocalMyList(slug);
    await db.delete(customListsTable).where(eq(customListsTable.id, list.id));
    createdListIds.pop();
    await pool.query("DELETE FROM watchlist WHERE id = $1", [watchId]);
    createdWatchIds.pop();
  });

  it("counts sign-in failures across servers and resets when the window expires", async () => {
    const [first, second] = servers;
    assert.ok(first && second);
    const wrong = JSON.stringify({ password: "incorrect-password" });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch(`${first.url}/api/session/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-media-hub-request": "1" },
        body: wrong,
      });
      assert.equal(response.status, 401);
    }
    const blocked = await fetch(`${second.url}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: wrong,
    });
    assert.equal(blocked.status, 429);
    const stored = await pool.query<{ subject_hash: string; failure_count: number }>(
      "SELECT subject_hash, failure_count FROM login_failures WHERE failure_count >= 8",
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0]?.failure_count, 8);
    assert.equal(JSON.stringify(stored.rows).includes("incorrect-password"), false);

    await pool.query("UPDATE login_failures SET reset_at = now() - interval '1 minute' WHERE subject_hash = $1", [stored.rows[0]?.subject_hash]);
    const reset = await fetch(`${second.url}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: wrong,
    });
    assert.equal(reset.status, 401);
    const reopened = await pool.query<{ failure_count: number }>(
      "SELECT failure_count FROM login_failures WHERE subject_hash = $1",
      [stored.rows[0]?.subject_hash],
    );
    assert.equal(reopened.rows[0]?.failure_count, 1);

    const accepted = await fetch(`${first.url}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: JSON.stringify({ password: process.env.OWNER_PASSWORD }),
    });
    assert.equal(accepted.status, 200);
    sessionHashes.push(sessionTokenHash(decodeURIComponent(cookiePair(accepted).slice("mh_session=".length))));
    const cleared = await pool.query(
      "SELECT 1 FROM login_failures WHERE subject_hash = $1",
      [stored.rows[0]?.subject_hash],
    );
    assert.equal(cleared.rowCount, 0);
  });

  it("runs one export at a time and resumes an interrupted lock", async () => {
    const [list] = await db.insert(customListsTable).values({ name: "Review lock", kind: "manual" }).returning();
    assert.ok(list);
    createdListIds.push(list.id);
    let active = 0;
    let peak = 0;
    const held = { ok: true, status: "simulated", detail: "held" };
    await Promise.all([0, 1].map(() => runExclusiveListJob(list.id, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 150));
      active -= 1;
      return held;
    })));
    assert.equal(peak, 1);

    await pool.query(
      `INSERT INTO list_export_locks (list_id, owner, status, attempt_count, expires_at)
       VALUES ($1, 'dead-worker', 'running', 1, now() - interval '1 minute')
       ON CONFLICT (list_id) DO UPDATE SET owner = 'dead-worker', status = 'running', attempt_count = 1, expires_at = now() - interval '1 minute'`,
      [list.id],
    );
    let resumed = 0;
    const recovered = await runExclusiveListJob(list.id, async () => {
      resumed += 1;
      return held;
    });
    assert.equal(resumed, 1);
    assert.equal(recovered.status, "simulated");
    const afterRecovery = await pool.query<{ status: string; attempt_count: number }>(
      "SELECT status, attempt_count FROM list_export_locks WHERE list_id = $1",
      [list.id],
    );
    assert.equal(afterRecovery.rows[0]?.status, "done");
    assert.equal(afterRecovery.rows[0]?.attempt_count, 0);

    await pool.query(
      `UPDATE list_export_locks
       SET owner = 'dead-worker', status = 'running', attempt_count = $2, expires_at = now() - interval '1 minute'
       WHERE list_id = $1`,
      [list.id, EXPORT_ATTEMPT_LIMIT],
    );
    let blocked = 0;
    const stopped = await runExclusiveListJob(list.id, async () => {
      blocked += 1;
      return held;
    });
    assert.equal(blocked, 0);
    assert.equal(stopped.status, "error");

    await pool.query("DELETE FROM list_export_locks WHERE list_id = $1", [list.id]);
    const heldByParent = await claimExport(list.id, "parent-worker", 30);
    assert.equal(heldByParent, "claimed");
    const other = await claimFromAnotherProcess(list.id);
    assert.equal(other, "busy");
    await pool.query("UPDATE list_export_locks SET expires_at = now() - interval '1 minute' WHERE list_id = $1", [list.id]);
    const taken = await claimFromAnotherProcess(list.id);
    assert.equal(taken, "claimed");

    await db.delete(customListsTable).where(eq(customListsTable.id, list.id));
    createdListIds.pop();
  });
});
