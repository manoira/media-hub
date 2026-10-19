import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { planCacheEvictions } from "./lib/cache-eviction";
import { eachTmdbHttpAttempt } from "./lib/tmdb-attempts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

test("shared budget charges every HTTP attempt, including retries", async () => {
  let charges = 0;
  let sends = 0;
  const response = await eachTmdbHttpAttempt(
    async () => {
      charges += 1;
    },
    async () => {
      sends += 1;
      return new Response(null, { status: sends < 3 ? 503 : 200 });
    },
    async () => undefined,
  );
  assert.equal(response.status, 200);
  assert.equal(charges, 3);
  assert.equal(sends, 3);
});

test("a budget refusal stops the next HTTP attempt", async () => {
  let sends = 0;
  await assert.rejects(
    () => eachTmdbHttpAttempt(
      async () => {
        if (sends >= 1) throw Object.assign(new Error("TMDB daily budget reached"), { budget: true });
      },
      async () => {
        sends += 1;
        return new Response(null, { status: 429 });
      },
      async () => undefined,
    ),
    (error: unknown) => Boolean(error && typeof error === "object" && (error as { budget?: boolean }).budget),
  );
  assert.equal(sends, 1);
});

test("cache eviction drops stale rows, then rows past the count and byte caps", () => {
  const now = 1_000_000;
  const dropped = planCacheEvictions(
    [
      { key: "stale", bytes: 10, fetchedAt: now, staleUntil: now },
      { key: "newest", bytes: 60, fetchedAt: now, staleUntil: now + 1 },
      { key: "middle", bytes: 50, fetchedAt: now - 1, staleUntil: now + 1 },
      { key: "oldest", bytes: 10, fetchedAt: now - 2, staleUntil: now + 1 },
    ],
    now,
    { maxRows: 2, maxBytes: 100 },
  );
  assert.deepEqual(dropped.sort(), ["middle", "oldest", "stale"]);
});

test("production runtime does not restore a local backup file", async () => {
  const files = [
    "artifacts/api-server/src/index.ts",
    "artifacts/api-server/src/vercel-entry.ts",
    "artifacts/api-server/src/app.ts",
  ];
  for (const file of files) {
    const text = await readFile(path.join(repoRoot, file), "utf8");
    assert.equal(text.includes("restoreCatalog"), false, file);
    assert.equal(text.includes("watchlist.json"), false, file);
    assert.equal(text.includes("local-backup"), false, file);
  }
  const vercel = await readFile(path.join(repoRoot, "vercel.json"), "utf8");
  assert.equal(vercel.includes("crons"), false);
});

test("file restore is refused for production and allowed only for another host", async () => {
  const guardUrl = pathToFileURL(path.join(repoRoot, "lib/db/src/file-restore-guard.ts")).href;
  const { fileRestoreDecision } = await import(guardUrl);
  assert.equal(fileRestoreDecision({ nodeEnv: "production", databaseUrl: "postgres://db.example/app" }).allowed, false);
  assert.equal(
    fileRestoreDecision({
      nodeEnv: "development",
      databaseUrl: "postgres://ep-wandering-morning-example.neon.tech/app",
    }).allowed,
    false,
  );
  assert.equal(fileRestoreDecision({ nodeEnv: "development", databaseUrl: "not a url" }).allowed, false);
  const dev = fileRestoreDecision({
    nodeEnv: "development",
    databaseUrl: "postgres://ep-nameless-bread-example.neon.tech/app",
  });
  assert.equal(dev.allowed, true);
});

test("migrations 006-009 are additive and were not applied to a separate database", async () => {
  assert.equal(process.env.MEDIA_HUB_TEST_DATABASE_URL, undefined);
  for (const name of [
    "006_v2_identity_and_backup.sql",
    "007_v2_cache_and_sync.sql",
    "008_v2_sessions_and_retries.sql",
    "009_v2_shared_queue_and_login.sql",
  ]) {
    const sql = await readFile(path.join(repoRoot, "lib/db/migrations", name), "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS/);
    assert.equal(/DROP TABLE/i.test(sql), false, name);
    assert.equal(/DELETE FROM watchlist/i.test(sql), false, name);
  }
});
