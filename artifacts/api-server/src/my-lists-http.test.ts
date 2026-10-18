import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { customListItemsTable, customListsTable, db, pool } from "@workspace/db";
import { enqueueListExport, exportList, setListExport } from "./lib/list-export";
import { parseCreatorName, parseMyListsOrigin } from "./lib/my-lists-config";
import { myListsRequestUrl } from "./lib/my-lists-http";
import { readLocalMyList } from "./lib/my-lists-sandbox";

const CREATOR = "mediahub-test";
const SECRET = "contract-test-key-99";
const MOVIES = [
  { imdbId: "tt0133093", title: "The Matrix", year: "1999-03-31", mediaType: "movie" as const, tmdbId: 990000411 },
  { imdbId: "tt0245429", title: "Spirited Away", year: "2001-07-20", mediaType: "movie" as const, tmdbId: 990000412 },
];
const SERIES = { imdbId: "tt14452776", title: "The Bear", year: "2022-06-23", mediaType: "tv" as const, tmdbId: 990000413 };

type StoredItem = { imdbId: string; title: string; year: number; type: string };
type StoredList = {
  name: string;
  slug: string;
  type: string;
  visibility: string;
  items: StoredItem[];
  updatedAt: number;
};

type ContractOptions = {
  hangSaveMs?: number;
  rateLimitSaves?: number;
  redirectTo?: string;
  statusOverride?: number;
};

function contractServer(options: ContractOptions = {}) {
  const lists = new Map<string, StoredList>();
  const order: string[] = [];
  let clock = 5_000;
  let rateLimitsLeft = options.rateLimitSaves ?? 0;
  const stats = { saves: 0, peak: 0, inFlight: 0, hits: 0 };
  const server = createServer(async (req, res) => {
    stats.hits += 1;
    const body = await readJson(req);
    if (options.redirectTo && req.url === "/api/creator/lists/save") {
      stats.saves += 1;
      res.writeHead(302, { location: options.redirectTo });
      res.end();
      return;
    }
    if (body.creatorName !== CREATOR || body.creatorKey !== SECRET) {
      send(res, 401, { ok: false, error: "Username or Key is incorrect." });
      return;
    }
    if (options.statusOverride && req.url === "/api/creator/lists/save") {
      stats.saves += 1;
      send(res, options.statusOverride, { ok: false, error: "Username or Key is incorrect." });
      return;
    }
    if (req.url === "/api/creator/lists/save") {
      stats.inFlight += 1;
      stats.peak = Math.max(stats.peak, stats.inFlight);
      stats.saves += 1;
      try {
        if (rateLimitsLeft > 0) {
          rateLimitsLeft -= 1;
          send(res, 429, { ok: false, error: "Too many attempts. Please wait a minute and try again." });
          return;
        }
        const slug = String(body.slug ?? "");
        const name = String(body.name ?? "");
        const items = Array.isArray(body.items) ? body.items as StoredItem[] : [];
        const existing = lists.get(slug);
        const expected = body.expectedUpdatedAt;
        if (existing && typeof expected === "number" && existing.updatedAt > expected) {
          send(res, 409, { ok: false, error: "conflict", conflict: true, slug, updatedAt: existing.updatedAt });
          return;
        }
        clock += 1;
        const updatedAt = clock;
        lists.set(slug, {
          name,
          slug,
          type: String(body.type ?? ""),
          visibility: body.visibility === "public" ? "public" : "private",
          items,
          updatedAt,
        });
        if (!order.includes(slug)) order.push(slug);
        if (options.hangSaveMs) await delay(options.hangSaveMs);
        send(res, 200, { ok: true, slug, updatedAt, url: `http://127.0.0.1/lists/${CREATOR}/${slug}` });
      } finally {
        stats.inFlight -= 1;
      }
      return;
    }
    if (req.url === "/api/creator/lists/items") {
      const slugs = Array.isArray(body.slugs) ? body.slugs.map(String) : [];
      send(res, 200, {
        ok: true,
        lists: slugs.flatMap((slug) => {
          const list = lists.get(slug);
          if (!list) return [];
          return [{ slug, items: list.items, itemCount: list.items.length, updatedAt: list.updatedAt }];
        }),
      });
      return;
    }
    if (req.url === "/api/creator/lists") {
      send(res, 200, {
        ok: true,
        lists: order.flatMap((slug) => {
          const list = lists.get(slug);
          if (!list) return [];
          return [{
            slug,
            name: list.name,
            type: list.type,
            visibility: list.visibility,
            itemCount: list.items.length,
            updatedAt: list.updatedAt,
          }];
        }),
        order,
        hasMore: false,
        total: order.length,
      });
      return;
    }
    if (req.url === "/api/creator/lists/delete") {
      const slug = String(body.slug ?? "");
      lists.delete(slug);
      send(res, 200, { ok: true });
      return;
    }
    send(res, 404, { ok: false, error: "Unknown path." });
  });
  return new Promise<{ url: string; lists: Map<string, StoredList>; stats: typeof stats; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        lists,
        stats,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

const ownedWatchIds: number[] = [];
const createdListIds: number[] = [];
let protectedList = "";

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

function useInstall(url: string) {
  process.env.MY_LISTS_MODE = "http";
  process.env.MY_LISTS_ORIGIN = url;
  process.env.MY_LISTS_CREATOR_NAME = CREATOR;
  process.env.MY_LISTS_CREATOR_KEY = SECRET;
  process.env.MY_LISTS_HTTP_TIMEOUT_MS = "10000";
  process.env.MY_LISTS_RETRY_DELAY_MS = "0";
}

describe("My Lists HTTP contract", { concurrency: 1 }, () => {
  const previous = {
    mode: process.env.MY_LISTS_MODE,
    origin: process.env.MY_LISTS_ORIGIN,
    name: process.env.MY_LISTS_CREATOR_NAME,
    key: process.env.MY_LISTS_CREATOR_KEY,
    timeout: process.env.MY_LISTS_HTTP_TIMEOUT_MS,
    delay: process.env.MY_LISTS_RETRY_DELAY_MS,
  };

  before(async () => {
    const row = await pool.query(
      "SELECT name, content_hash, sync_status, my_lists_slug, sync_target, export_enabled FROM custom_lists WHERE id = 2",
    );
    protectedList = JSON.stringify(row.rows[0] ?? null);
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
    assert.equal(JSON.stringify(row.rows[0] ?? null), protectedList);
    restoreEnv(previous);
    await pool.end();
  });

  it("rejects a public host, a non-HTTPS origin, and a redirected key", () => {
    assert.equal(parseMyListsOrigin("https://mylistsaddon.com").ok, false);
    assert.equal(parseMyListsOrigin("http://example.com").ok, false);
    assert.equal(parseMyListsOrigin("https://user:pass@example.com").ok, false);
    assert.equal(parseMyListsOrigin("https://example.com/lists").ok, false);
    assert.equal(parseMyListsOrigin("http://127.0.0.1:9").ok, true);
    assert.equal(parseCreatorName("ab").ok, false);
    assert.throws(() => myListsRequestUrl("https://good.test", "https://evil.test/steal"));
    assert.throws(() => myListsRequestUrl("https://mylistsaddon.com", "/api/creator/lists/save"));
  });

  it("writes a private list through the reviewed save and read paths", async () => {
    const server = await contractServer();
    try {
      useInstall(server.url);
      const listId = await makeList("Contract list", [
        MOVIES[0]!,
        MOVIES[1]!,
        SERIES,
        { imdbId: null, title: "Missing Identifier", year: "2004-01-01", mediaType: "movie", tmdbId: 990000414 },
      ]);
      const opened = await setListExport(listId, "enable");
      assert.equal(opened.status, "verified");
      assert.equal(opened.slug, `mh-${listId}`);
      assert.match(opened.detail, /Missing Identifier/);
      assert.equal(opened.detail.includes(SECRET), false);
      const stored = server.lists.get(`mh-${listId}`);
      assert.ok(stored);
      assert.equal(stored.visibility, "private");
      assert.equal(stored.type, "mixed");
      assert.deepEqual(stored.items.map((item) => item.imdbId), ["tt0133093", "tt0245429", "tt14452776"]);
      assert.equal(stored.items.some((item) => item.imdbId.startsWith("tmdb-")), false);

      await db.update(customListsTable).set({ name: "Contract list renamed" }).where(eq(customListsTable.id, listId));
      const renamed = await exportList(listId);
      assert.equal(renamed.status, "verified");
      assert.equal(renamed.slug, `mh-${listId}`);
      assert.equal(server.lists.get(`mh-${listId}`)?.name, "Contract list renamed");

      const current = server.lists.get(`mh-${listId}`);
      assert.ok(current);
      server.lists.set(`mh-${listId}`, { ...current, name: "Changed elsewhere", updatedAt: current.updatedAt + 50 });
      await db.update(customListsTable).set({ name: "Media Hub rename" }).where(eq(customListsTable.id, listId));
      const conflict = await exportList(listId);
      assert.equal(conflict.status, "conflict");
      assert.equal(server.lists.get(`mh-${listId}`)?.name, "Changed elsewhere");

      const removed = await setListExport(listId, "delete-external");
      assert.equal(removed.ok, true);
      assert.equal(server.lists.has(`mh-${listId}`), false);
      const [still] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
      assert.equal(still?.name, "Media Hub rename");
    } finally {
      await server.close();
    }
  });

  it("saves an empty list on the same slug", async () => {
    const server = await contractServer();
    try {
      useInstall(server.url);
      const listId = await makeList("Empty contract", []);
      const saved = await setListExport(listId, "enable");
      assert.equal(saved.status, "verified");
      const stored = server.lists.get(`mh-${listId}`);
      assert.ok(stored);
      assert.equal(stored.items.length, 0);
      assert.equal(stored.visibility, "private");
      assert.equal(stored.type, "mixed");
    } finally {
      await server.close();
    }
  });

  it("does not retry a refused key or follow a redirect", async () => {
    const capture = await contractServer();
    const redirected = await contractServer({ redirectTo: `${capture.url}/capture` });
    const forbidden = await contractServer({ statusOverride: 403 });
    const refused = await contractServer();
    try {
      useInstall(refused.url);
      process.env.MY_LISTS_CREATOR_KEY = "wrong-contract-key";
      const refusedList = await makeList("Refused", [MOVIES[0]!]);
      const denied = await setListExport(refusedList, "enable");
      assert.equal(denied.ok, false);
      assert.match(denied.detail, /refused the creator name or key/);
      assert.equal(denied.detail.includes("wrong-contract-key"), false);
      assert.equal(refused.lists.size, 0);
      assert.equal(refused.stats.saves, 0);

      useInstall(forbidden.url);
      const forbiddenList = await makeList("Forbidden", [MOVIES[1]!]);
      const blocked = await setListExport(forbiddenList, "enable");
      assert.equal(blocked.ok, false);
      assert.equal(forbidden.stats.saves, 1);
      assert.equal(forbidden.lists.size, 0);

      useInstall(redirected.url);
      const redirectList = await makeList("Redirected", [SERIES]);
      const bounced = await setListExport(redirectList, "enable");
      assert.equal(bounced.ok, false);
      assert.match(bounced.detail, /redirected/i);
      assert.equal(capture.stats.hits, 0);
      assert.equal(redirected.lists.size, 0);
    } finally {
      await Promise.all([capture.close(), redirected.close(), forbidden.close(), refused.close()]);
    }
  });

  it("retries a rate limit, and a timed-out write is recovered by reading it back", async () => {
    const limited = await contractServer({ rateLimitSaves: 2 });
    const slow = await contractServer({ hangSaveMs: 400 });
    try {
      useInstall(limited.url);
      const limitedList = await makeList("Limited", [MOVIES[0]!, SERIES]);
      const allowed = await setListExport(limitedList, "enable");
      assert.equal(allowed.status, "verified");
      assert.equal(limited.stats.saves, 3);
      assert.deepEqual(limited.lists.get(`mh-${limitedList}`)?.items.map((item) => item.imdbId), ["tt0133093", "tt14452776"]);

      useInstall(slow.url);
      process.env.MY_LISTS_HTTP_TIMEOUT_MS = "150";
      const slowList = await makeList("Timeout", [MOVIES[1]!]);
      const recovered = await setListExport(slowList, "enable");
      assert.equal(recovered.status, "verified");
      assert.equal(slow.stats.saves, 1);
      assert.equal(slow.lists.get(`mh-${slowList}`)?.items[0]?.imdbId, "tt0245429");
    } finally {
      await Promise.all([limited.close(), slow.close()]);
    }
  });

  it("keeps a slow HTTP export inside the shared lock and resumes an expired one", async () => {
    const server = await contractServer({ hangSaveMs: 250 });
    try {
      useInstall(server.url);
      const listId = await makeList("Locked", [MOVIES[0]!, MOVIES[1]!, SERIES]);
      await db.update(customListsTable).set({ exportEnabled: true, syncStatus: "pending" }).where(eq(customListsTable.id, listId));
      const [first, second] = await Promise.all([enqueueListExport(listId), enqueueListExport(listId)]);
      assert.equal(server.stats.peak, 1);
      assert.equal(server.stats.saves, 1);
      assert.equal([first.status, second.status].filter((status) => status === "verified").length, 2);

      await pool.query(
        `UPDATE list_export_locks
         SET owner = 'dead-worker', status = 'running', attempt_count = 1, expires_at = now() - interval '1 minute'
         WHERE list_id = $1`,
        [listId],
      );
      await db.update(customListsTable).set({ contentHash: null, syncStatus: "pending" }).where(eq(customListsTable.id, listId));
      server.lists.clear();
      const resumed = await enqueueListExport(listId);
      assert.equal(resumed.status, "verified");
      assert.equal(server.lists.has(`mh-${listId}`), true);
    } finally {
      await server.close();
    }
  });

  it("does not report a simulator success when HTTP settings are missing", async () => {
    delete process.env.MY_LISTS_MODE;
    delete process.env.MY_LISTS_ORIGIN;
    delete process.env.MY_LISTS_CREATOR_NAME;
    delete process.env.MY_LISTS_CREATOR_KEY;
    const listId = await makeList("Unconfigured", [MOVIES[0]!]);
    const result = await setListExport(listId, "enable");
    assert.equal(result.ok, false);
    assert.match(result.detail, /not configured/);
    assert.equal(readLocalMyList(`mh-${listId}`).ok, false);
  });
});

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries({
    MY_LISTS_MODE: previous.mode,
    MY_LISTS_ORIGIN: previous.origin,
    MY_LISTS_CREATOR_NAME: previous.name,
    MY_LISTS_CREATOR_KEY: previous.key,
    MY_LISTS_HTTP_TIMEOUT_MS: previous.timeout,
    MY_LISTS_RETRY_DELAY_MS: previous.delay,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}
