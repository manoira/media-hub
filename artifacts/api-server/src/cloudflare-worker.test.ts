import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { unstable_dev } from "wrangler";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedHash = createHash("sha256").update("fixture-token").digest("hex");

test("workers runtime serves the API, static files, cache, and lock fixture", async () => {
  process.chdir(serverRoot);
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "false";
  const worker = await unstable_dev("./src/cloudflare-harness.ts", {
    config: "./wrangler.harness.jsonc",
    experimental: { disableExperimentalWarning: true },
    ip: "127.0.0.1",
  });
  try {
    const health = await worker.fetch("/api/healthz");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const session = await worker.fetch("/api/session");
    assert.equal(session.status, 200);
    assert.equal(session.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await session.json(), { authenticated: false });

    const login = await worker.fetch("/api/session/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "not-a-real-password" }),
    });
    assert.equal(login.status, 403);

    const lists = await worker.fetch("/api/lists");
    assert.equal(lists.status, 401);

    const hash = await worker.fetch("/__worker/hash");
    assert.equal(hash.status, 200);
    assert.deepEqual(await hash.json(), { hash: expectedHash });

    const cookie = await worker.fetch("/__worker/cookie");
    const attributes = ((await cookie.json()) as { attributes: string }).attributes;
    assert.equal(attributes.includes("HttpOnly"), true);
    assert.equal(attributes.includes("Secure"), true);
    assert.equal(attributes.includes("Domain="), false);

    const catalog = await worker.fetch("/__worker/catalog");
    assert.equal(catalog.status, 200);
    assert.equal(catalog.headers.get("cache-control"), "private, no-cache");
    const etag = catalog.headers.get("etag");
    assert.ok(etag);
    const again = await worker.fetch("/__worker/catalog", {
      headers: { "if-none-match": etag },
    });
    assert.equal(again.status, 304);
    assert.equal(await again.text(), "");

    const list = await worker.fetch("/__worker/list");
    const item = await list.json() as { title: string; status: string; notes: string; keywordIds: number[]; overview: string };
    assert.equal(item.title, "Fixture title");
    assert.equal(item.status, "watched");
    assert.equal(item.notes, "Fixture note");
    assert.deepEqual(item.keywordIds, []);
    assert.equal(item.overview.length, 180);

    const locks = await worker.fetch("/__worker/locks", { method: "POST" });
    assert.deepEqual(await locks.json(), {
      first: "claimed",
      second: "busy",
      inside: "claimed",
      afterRollback: "claimed",
    });

    const page = await worker.fetch("/lists");
    assert.equal(page.status, 200);
    assert.equal((await page.text()).includes("Media Hub fixture"), true);

    const script = await worker.fetch("/assets/app.js");
    assert.equal(script.status, 200);
    assert.equal((await script.text()).includes("fixture-script"), true);
  } finally {
    await worker.stop();
  }
});
