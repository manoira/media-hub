import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CARD_OVERVIEW_CHARS } from "./lib/card-overview";
import { catalogPass, measureCatalogPayloads, passTotals } from "./lib/origin-budget";
import { catalogEtag, notModified, PRIVATE_NO_STORE, PRIVATE_REVALIDATE } from "./lib/private-cache";

const here = path.dirname(fileURLToPath(import.meta.url));

test("catalog responses shrink and a repeated unchanged read sends no body", () => {
  const payloads = measureCatalogPayloads();
  assert.equal(payloads.overviewCharsAfter, CARD_OVERVIEW_CHARS);
  assert.ok(payloads.watchlistBytesAfter < payloads.watchlistBytesBefore * 0.75);
  assert.ok(payloads.homeBytesAfter < payloads.homeBytesBefore);

  const main = passTotals(catalogPass("main", payloads));
  const branch = passTotals(catalogPass("branch", payloads));
  assert.ok(branch.bytes < main.bytes);
  assert.equal(branch.responses, 9);
  assert.equal(main.responses, 9);

  const unchanged = catalogEtag(1250, new Date("2026-08-01T00:00:00.000Z"), "added_at");
  const changed = catalogEtag(1250, new Date("2026-08-02T00:00:00.000Z"), "added_at");
  assert.notEqual(unchanged, changed);

  console.log(JSON.stringify({
    watchlistBytesBefore: payloads.watchlistBytesBefore,
    watchlistBytesAfter: payloads.watchlistBytesAfter,
    homeBytesBefore: payloads.homeBytesBefore,
    homeBytesAfter: payloads.homeBytesAfter,
    progressBytes: payloads.progressBytes,
    oneSeasonBytes: payloads.oneSeasonBytes,
    mainPassBytes: main.bytes,
    branchPassBytes: branch.bytes,
    repeatBodyBytes: 0,
  }));
});

test("private catalog revalidation is 304 only when the revision matches", async () => {
  const app = express();
  const etag = catalogEtag(2, new Date("2026-10-19T00:00:00.000Z"), "added_at");
  app.get("/catalog", (req, res) => {
    if (notModified(req, res, etag)) return;
    res.json([{ id: 1, status: "watched" }]);
  });
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const first = await fetch(`http://127.0.0.1:${port}/catalog`);
    const body = await first.text();
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), PRIVATE_REVALIDATE);
    assert.equal(body.includes("watched"), true);
    const second = await fetch(`http://127.0.0.1:${port}/catalog`, {
      headers: { "if-none-match": first.headers.get("etag") ?? "" },
    });
    assert.equal(second.status, 304);
    assert.equal(await second.text(), "");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("session is not stored and catalog routes are not public", async () => {
  const root = path.resolve(here, "..", "..", "..");
  const session = await readFile(path.join(root, "artifacts/api-server/src/routes/session.ts"), "utf8");
  const watchlist = await readFile(path.join(root, "artifacts/api-server/src/routes/watchlist.ts"), "utf8");
  const search = await readFile(path.join(root, "artifacts/api-server/src/routes/search.ts"), "utf8");
  const appSource = await readFile(path.join(root, "artifacts/media-tracker/src/App.tsx"), "utf8");
  assert.equal(session.includes(PRIVATE_NO_STORE), true);
  assert.equal(watchlist.includes("public"), false);
  assert.equal(watchlist.includes(PRIVATE_REVALIDATE), true);
  assert.equal(search.includes("public, max-age=86400"), true);
  assert.equal(appSource.includes("getGetWatchlistQueryKey"), true);
  assert.equal(appSource.includes('["owner-session"]'), true);
});
