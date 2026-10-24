import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { customListItemsTable, customListsTable, db, pool } from "@workspace/db";
import { exportList, setListExport } from "./lib/list-export";
import { MY_LISTS_CONTRACT, useMyListsTestInstall } from "./lib/my-lists-config";

const PIN = "b9c0a951787019f5d30065b5c2e7e5492472d3e2";
const CREATOR = "hublocaltest";
const DISPLAY = "Local Fixture";
const FIXTURE_IP = "203.0.113.44";
const MOVIES = [
  { imdbId: "tt0133093", title: "The Matrix", year: "1999-03-31", mediaType: "movie" as const, tmdbId: 990000511 },
  { imdbId: "tt0245429", title: "Spirited Away", year: "2001-07-20", mediaType: "movie" as const, tmdbId: 990000512 },
];
const SERIES = { imdbId: "tt14452776", title: "The Bear", year: "2022-06-23", mediaType: "tv" as const, tmdbId: 990000513 };
const MISSING = { imdbId: null, title: "Missing Identifier", year: "2004-01-01", mediaType: "movie" as const, tmdbId: 990000514 };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const upstreamDir = process.env.MY_LISTS_UPSTREAM_DIR ?? path.resolve(repoRoot, "../my-lists-b9c0a951");

type RemoteItem = { imdbId?: string; title?: string; type?: string };
type RemoteList = { slug?: string; name?: string; visibility?: string; type?: string; itemCount?: number; items?: RemoteItem[] };

const ownedWatchIds: number[] = [];
const createdListIds: number[] = [];
let protectedList = "";
let watchlistCount = -1;
let origin = "";
let creatorKey = "";
let runtime: ChildProcess | null = null;
let listId = 0;

function upstreamReady(): string | null {
  const needed = ["worker_entry_combined.js", "schema.sql", "migrations", path.join("node_modules", "miniflare", "package.json")];
  const absent = needed.filter((rel) => !existsSync(path.join(upstreamDir, rel)));
  if (absent.length === 0) return null;
  return [
    `Pinned My Lists checkout is not ready at ${upstreamDir}.`,
    `Missing: ${absent.join(", ")}.`,
    "Prepare it outside this repo. Do not use a Cloudflare account:",
    "git clone https://github.com/Br0ck25/My-Lists.git <dir>",
    `git -C <dir> checkout ${PIN}`,
    "npm install miniflare@3",
    "Set MY_LISTS_UPSTREAM_DIR only when the checkout is somewhere else, then rerun this test.",
  ].join("\n");
}

function startRuntime(): Promise<string> {
  const script = path.join(repoRoot, "scripts", "my-lists-local-runtime.mjs");
  const child = spawn(process.execPath, [script], { cwd: upstreamDir, stdio: ["ignore", "pipe", "pipe"] });
  runtime = child;
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error("The local My Lists runtime did not print its ready line."));
    }, 90_000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      if (error) reject(error);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const match = output.match(/ready (http:\/\/127\.0\.0\.1:\d+)/);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      finish(new Error(`The local My Lists runtime exited ${code ?? "null"} before it was ready.`));
    });
  });
}

async function stopRuntime(): Promise<void> {
  const child = runtime;
  runtime = null;
  if (!child || child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => child.once("exit", () => resolve(undefined)));
}

async function workerFetch(pathname: string, init: RequestInit = {}): Promise<{ status: number; json: Record<string, unknown> | null; location: string }> {
  const headers = new Headers(init.headers);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", FIXTURE_IP);
  const response = await fetch(`${origin}${pathname}`, { ...init, headers, redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const text = await response.text();
  if (!text) return { status: response.status, json: null, location };
  try {
    return { status: response.status, json: JSON.parse(text) as Record<string, unknown>, location };
  } catch {
    return { status: response.status, json: null, location };
  }
}

async function creatorPost(pathname: string, body: Record<string, unknown>, key = creatorKey) {
  return workerFetch(pathname, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ creatorName: CREATOR, creatorKey: key, ...body }),
  });
}

function secretFree(value: string) {
  assert.equal(value.includes(creatorKey), false);
}

async function attach(input: { imdbId: string | null; title: string; year: string; mediaType: "movie" | "tv"; tmdbId: number }) {
  if (input.imdbId) {
    const existing = await pool.query<{ tmdb_id: number; media_type: string }>(
      "SELECT tmdb_id, media_type FROM watchlist WHERE imdb_id = $1",
      [input.imdbId],
    );
    const row = existing.rows[0];
    if (row) return { tmdbId: row.tmdb_id, mediaType: row.media_type, title: input.title };
  }
  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO watchlist (tmdb_id, media_type, status, title, imdb_id)
     VALUES ($1, $2, 'watched', $3, $4)
     RETURNING id`,
    [input.tmdbId, input.mediaType, input.title, input.imdbId],
  );
  const id = inserted.rows[0]?.id;
  assert.ok(id);
  ownedWatchIds.push(id);
  return { tmdbId: input.tmdbId, mediaType: input.mediaType, title: input.title };
}

async function makeList(name: string, rows: Array<{ imdbId: string | null; title: string; year: string; mediaType: "movie" | "tv"; tmdbId: number }>) {
  const [list] = await db.insert(customListsTable).values({ name, kind: "manual" }).returning();
  assert.ok(list);
  createdListIds.push(list.id);
  for (const [index, row] of rows.entries()) {
    const attached = await attach(row);
    await db.insert(customListItemsTable).values({
      listId: list.id,
      tmdbId: attached.tmdbId,
      mediaType: attached.mediaType,
      title: attached.title,
      releaseDate: row.year,
      addedAt: new Date(Date.UTC(2020, 0, index + 1)),
    });
  }
  return list.id;
}

function rowUrl(kind: "movie" | "series", items: Array<Record<string, unknown>>) {
  return `customlist:v1:${JSON.stringify({
    listId: kind,
    creatorSlug: `mh-${listId}`,
    listSlug: `mh-${listId}`,
    creatorOwner: CREATOR,
    type: kind,
    items,
    shuffle: false,
  })}`;
}

function catalogEntries(itemsForMovie: Array<Record<string, unknown>>) {
  return [
    { id: `mh-${listId}-movies`, type: "movie", name: "Fixture movies", url: rowUrl("movie", itemsForMovie), enabled: true },
    { id: `mh-${listId}-series`, type: "series", name: "Fixture series", url: rowUrl("series", []), enabled: true },
  ];
}

async function installConfig(body: Record<string, unknown>) {
  const saved = await workerFetch("/api/save", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", "cf-connecting-ip": "203.0.113.45" },
    body: JSON.stringify(body),
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json?.ok, true);
  const id = saved.json?.id;
  assert.equal(typeof id, "string");
  assert.equal(String(id).length, 12);
  return String(id);
}

function pinnedNavigation(): Promise<{ navigate: number; location: string; data: number }> {
  const source = [
    'import { call, makeEnv, makeKv } from "./tests/harness.mjs";',
    "const env = makeEnv({ CONFIGS: makeKv() });",
    'const navigated = await call(env, "/fixturecfg/manifest.json", { headers: { "Sec-Fetch-Mode": "navigate" } });',
    'const data = await call(env, "/fixturecfg/manifest.json");',
    "process.stdout.write(JSON.stringify({ navigate: navigated.status, location: navigated.headers.get(\"location\") || \"\", data: data.status }));",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source], { cwd: upstreamDir, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Pinned navigation check exited ${code ?? "null"}.`));
        return;
      }
      resolve(JSON.parse(stdout) as { navigate: number; location: string; data: number });
      void stderr;
    });
  });
}

async function catalogIds(configId: string, type: "movie" | "series", entryId: string) {
  const response = await workerFetch(`/${configId}/catalog/${type}/${entryId}.json`, {
    headers: { accept: "application/json" },
  });
  assert.equal(response.status, 200);
  const metas = Array.isArray(response.json?.metas) ? response.json.metas as Array<{ id?: string }> : [];
  return metas.map((meta) => meta.id ?? "");
}

describe("pinned My Lists worker", { concurrency: 1 }, () => {
  before(async () => {
    const blocker = upstreamReady();
    if (blocker) throw new Error(blocker);
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: upstreamDir, encoding: "utf8" }).trim();
    assert.equal(sha, PIN);
    const counted = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM watchlist");
    watchlistCount = counted.rows[0]?.n ?? -1;
    const row = await pool.query(
      "SELECT name, content_hash, sync_status, my_lists_slug, sync_target, export_enabled FROM custom_lists WHERE id = 2",
    );
    protectedList = JSON.stringify(row.rows[0] ?? null);
    process.env.MY_LISTS_HTTP_TIMEOUT_MS = "10000";
    process.env.MY_LISTS_RETRY_DELAY_MS = "0";
    delete process.env.MY_LISTS_MODE;
    origin = await startRuntime();
    const created = await workerFetch("/api/creator/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ creatorName: CREATOR, displayName: DISPLAY }),
    });
    assert.equal(created.status, 200);
    assert.equal(created.json?.ok, true);
    assert.equal(typeof created.json?.creatorKey, "string");
    creatorKey = String(created.json?.creatorKey);
    useMyListsTestInstall({ origin, creatorName: CREATOR, creatorKey });
  });

  after(async () => {
    if (createdListIds.length > 0) {
      await pool.query("DELETE FROM custom_lists WHERE id = ANY($1::int[])", [createdListIds]);
    }
    if (ownedWatchIds.length > 0) {
      await pool.query("DELETE FROM watchlist WHERE id = ANY($1::int[])", [ownedWatchIds]);
    }
    const row = await pool.query(
      "SELECT name, content_hash, sync_status, my_lists_slug, sync_target, export_enabled FROM custom_lists WHERE id = 2",
    );
    const counted = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM watchlist");
    useMyListsTestInstall(null);
    await stopRuntime();
    assert.equal(JSON.stringify(row.rows[0] ?? null), protectedList);
    assert.equal(counted.rows[0]?.n, watchlistCount);
    await pool.end();
  });

  it("refuses a partial list before anything is written", async () => {
    listId = await makeList("Upstream partial", [...MOVIES, SERIES, MISSING]);
    const refused = await setListExport(listId, "enable");
    secretFree(refused.detail);
    assert.equal(refused.ok, false);
    assert.match(refused.detail, /not verified/);
    assert.match(refused.detail, /Missing Identifier/);
    const listed = await creatorPost(MY_LISTS_CONTRACT.listsPath, { limit: 100, offset: 0 });
    assert.equal(listed.status, 200);
    const lists = Array.isArray(listed.json?.lists) ? listed.json.lists as RemoteList[] : [];
    assert.equal(lists.some((list) => list.slug === `mh-${listId}`), false);
    await pool.query("DELETE FROM custom_list_items WHERE list_id = $1 AND title = 'Missing Identifier'", [listId]);
  });

  it("saves, renames, and reorders a private list of two movies and one series", async () => {
    const written = await setListExport(listId, "enable");
    secretFree(written.detail);
    assert.equal(written.status, "verified");
    assert.equal(written.slug, `mh-${listId}`);
    const items = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: [`mh-${listId}`] });
    const row = (Array.isArray(items.json?.lists) ? items.json.lists as RemoteList[] : [])[0];
    assert.deepEqual(row?.items?.map((item) => item.imdbId), ["tt0133093", "tt0245429", "tt14452776"]);
    const summary = await creatorPost(MY_LISTS_CONTRACT.listsPath, { limit: 100, offset: 0 });
    const stored = (Array.isArray(summary.json?.lists) ? summary.json.lists as RemoteList[] : []).find((list) => list.slug === `mh-${listId}`);
    assert.equal(stored?.visibility, "private");
    assert.equal(stored?.type, "mixed");
    assert.equal(stored?.name, "Upstream partial");

    await db.update(customListsTable).set({ name: "Upstream renamed" }).where(eq(customListsTable.id, listId));
    const renamed = await exportList(listId);
    secretFree(renamed.detail);
    assert.equal(renamed.status, "verified");
    assert.equal(renamed.slug, `mh-${listId}`);
    const afterRename = await creatorPost(MY_LISTS_CONTRACT.listsPath, { limit: 100, offset: 0 });
    const renamedRow = (Array.isArray(afterRename.json?.lists) ? afterRename.json.lists as RemoteList[] : []).find((list) => list.slug === `mh-${listId}`);
    assert.equal(renamedRow?.name, "Upstream renamed");

    const membership = await pool.query<{ id: number; title: string }>(
      "SELECT id, title FROM custom_list_items WHERE list_id = $1 ORDER BY added_at, id",
      [listId],
    );
    const bear = membership.rows.find((item) => item.title === "The Bear");
    const matrix = membership.rows.find((item) => item.title === "The Matrix");
    const away = membership.rows.find((item) => item.title === "Spirited Away");
    assert.ok(bear && matrix && away);
    await pool.query("UPDATE custom_list_items SET added_at = $2 WHERE id = $1", [bear.id, "2019-01-01"]);
    await pool.query("UPDATE custom_list_items SET added_at = $2 WHERE id = $1", [matrix.id, "2019-01-02"]);
    await pool.query("UPDATE custom_list_items SET added_at = $2 WHERE id = $1", [away.id, "2019-01-03"]);
    const reordered = await exportList(listId);
    secretFree(reordered.detail);
    assert.equal(reordered.status, "verified");
    const ordered = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: [`mh-${listId}`] });
    const orderedRow = (Array.isArray(ordered.json?.lists) ? ordered.json.lists as RemoteList[] : [])[0];
    assert.deepEqual(orderedRow?.items?.map((item) => item.imdbId), ["tt14452776", "tt0133093", "tt0245429"]);
  });

  it("keeps the private catalog closed unless the install carries the owner key", async () => {
    const slug = `mh-${listId}`;
    const authorized = await installConfig({
      trackCreatorName: CREATOR,
      trackCreatorKey: creatorKey,
      entries: catalogEntries([]),
    });
    const stranger = await workerFetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.46" },
      body: JSON.stringify({
        trackCreatorName: CREATOR,
        trackCreatorKey: "wrong-local-key",
        entries: catalogEntries([]),
      }),
    });
    assert.equal(stranger.status, 401);
    const open = await installConfig({
      entries: catalogEntries([{ imdbId: "tt0000001", id: "tt0000001", title: "Decoy", type: "movie" }]),
    });

    const manifest = await workerFetch(`/${authorized}/manifest.json`, { headers: { accept: "application/json" } });
    assert.equal(manifest.status, 200);
    assert.equal(manifest.location, "");
    const catalogs = Array.isArray(manifest.json?.catalogs) ? manifest.json.catalogs as Array<{ type?: string; id?: string }> : [];
    const pairs = catalogs.map((catalog) => `${catalog.id}:${catalog.type}`);
    assert.ok(pairs.includes(`${slug}-movies:movie`));
    assert.ok(pairs.includes(`${slug}-series:series`));
    assert.ok(pairs.includes("search_movies:movie"));
    assert.equal(JSON.stringify(manifest.json).includes(creatorKey), false);

    const navigated = await pinnedNavigation();
    assert.equal(navigated.data, 200);
    assert.equal(navigated.navigate, 302);
    assert.equal(navigated.location.includes(creatorKey), false);
    assert.match(navigated.location, /\/fixturecfg\/configure$/);

    assert.deepEqual(await catalogIds(authorized, "movie", `${slug}-movies`), ["tt0133093", "tt0245429"]);
    assert.deepEqual(await catalogIds(authorized, "series", `${slug}-series`), ["tt14452776"]);
    assert.deepEqual(await catalogIds(open, "movie", `${slug}-movies`), ["tt0000001"]);
    assert.deepEqual(await catalogIds(open, "series", `${slug}-series`), []);

    const denied = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: [slug] }, "wrong-local-key");
    assert.equal(denied.status, 401);
    assert.equal(JSON.stringify(denied.json).includes("tt0133093"), false);
    const webList = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: [slug] });
    const webItems = (Array.isArray(webList.json?.lists) ? webList.json.lists as RemoteList[] : [])[0]?.items ?? [];
    assert.deepEqual(webItems.map((item) => item.imdbId), ["tt14452776", "tt0133093", "tt0245429"]);
    assert.notDeepEqual(webItems.map((item) => item.imdbId), await catalogIds(authorized, "movie", `${slug}-movies`));
  });

  it("saves an empty list on the same slug and refuses a stale version", async () => {
    await pool.query("DELETE FROM custom_list_items WHERE list_id = $1", [listId]);
    const emptied = await exportList(listId);
    secretFree(emptied.detail);
    assert.equal(emptied.status, "verified");
    assert.equal(emptied.slug, `mh-${listId}`);
    const emptyItems = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: [`mh-${listId}`] });
    const emptyRow = (Array.isArray(emptyItems.json?.lists) ? emptyItems.json.lists as RemoteList[] : [])[0];
    assert.equal(emptyRow?.items?.length, 0);

    const outside = await creatorPost(MY_LISTS_CONTRACT.savePath, {
      slug: `mh-${listId}`,
      name: "Changed on the worker",
      type: "mixed",
      visibility: "private",
      items: [],
    });
    assert.equal(outside.status, 200);
    await db.update(customListsTable).set({ name: "Media Hub after conflict" }).where(eq(customListsTable.id, listId));
    const conflict = await exportList(listId);
    secretFree(conflict.detail);
    assert.equal(conflict.status, "conflict");
    const afterConflict = await creatorPost(MY_LISTS_CONTRACT.listsPath, { limit: 100, offset: 0 });
    const kept = (Array.isArray(afterConflict.json?.lists) ? afterConflict.json.lists as RemoteList[] : []).find((list) => list.slug === `mh-${listId}`);
    assert.equal(kept?.name, "Changed on the worker");
  });

  it("drops a title with no id from the catalog while the list API still returns it", async () => {
    const saved = await creatorPost(MY_LISTS_CONTRACT.savePath, {
      slug: "probe-missing-id",
      name: "Probe missing id",
      type: "movie",
      visibility: "private",
      items: [
        { imdbId: "tt0133093", id: "tt0133093", title: "The Matrix", year: 1999, type: "movie" },
        { title: "No Identifier", type: "movie" },
      ],
    });
    assert.equal(saved.status, 200);
    const items = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: ["probe-missing-id"] });
    const row = (Array.isArray(items.json?.lists) ? items.json.lists as RemoteList[] : [])[0];
    assert.equal(row?.items?.length, 2);
    assert.equal(row?.items?.some((item) => item.title === "No Identifier" && !item.imdbId), true);
    const config = await installConfig({
      trackCreatorName: CREATOR,
      trackCreatorKey: creatorKey,
      entries: [{
        id: "probe-missing-id",
        type: "movie",
        name: "Probe missing id",
        url: `customlist:v1:${JSON.stringify({ creatorSlug: "probe-missing-id", creatorOwner: CREATOR, type: "movie", items: [] })}`,
        enabled: true,
      }],
    });
    assert.deepEqual(await catalogIds(config, "movie", "probe-missing-id"), ["tt0133093"]);
    const removed = await creatorPost(MY_LISTS_CONTRACT.deletePath, { slug: "probe-missing-id" });
    assert.equal(removed.json?.ok, true);
  });

  it("rejects a wrong key and deletes only the external copy", async () => {
    const refusedId = await makeList("Upstream refused", [MOVIES[0]!]);
    useMyListsTestInstall({ origin, creatorName: CREATOR, creatorKey: "wrong-local-key" });
    const denied = await setListExport(refusedId, "enable");
    secretFree(denied.detail);
    assert.equal(denied.ok, false);
    assert.match(denied.detail, /refused the creator name or key/);
    const absent = await creatorPost(MY_LISTS_CONTRACT.listsPath, { limit: 100, offset: 0 });
    const lists = Array.isArray(absent.json?.lists) ? absent.json.lists as RemoteList[] : [];
    assert.equal(lists.some((list) => list.slug === `mh-${refusedId}`), false);

    useMyListsTestInstall({ origin, creatorName: CREATOR, creatorKey });
    const removed = await setListExport(listId, "delete-external");
    secretFree(removed.detail);
    assert.equal(removed.ok, true);
    const afterDelete = await creatorPost(MY_LISTS_CONTRACT.itemsPath, { slugs: [`mh-${listId}`] });
    const left = Array.isArray(afterDelete.json?.lists) ? afterDelete.json.lists as RemoteList[] : [];
    assert.equal(left.some((list) => list.slug === `mh-${listId}`), false);
    const [still] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
    assert.equal(still?.name, "Media Hub after conflict");
  });
});
