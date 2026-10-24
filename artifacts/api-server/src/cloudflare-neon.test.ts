import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { unstable_dev } from "wrangler";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(serverRoot, "..", "..");
const devVarsPath = path.join(serverRoot, ".dev.vars");
const TEST_HOST = "ep-misty-boat-as4ssnx0.c-4.eu-central-1.aws.neon.tech";

function databaseUrlFrom(envText: string): string {
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("DATABASE_URL=")) continue;
    let value = trimmed.slice("DATABASE_URL=".length).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

test("worker uses the empty restore database for login, lists, locks, and sync", async () => {
  const guardUrl = pathToFileURL(path.join(repoRoot, "lib", "db", "src", "file-restore-guard.ts")).href;
  const { emptyRestoreTargetDecision } = await import(guardUrl);
  const localUrl = databaseUrlFrom(await readFile(path.join(serverRoot, ".env"), "utf8"));
  const target = new URL(localUrl);
  target.hostname = TEST_HOST;
  target.pathname = "/mediahub_restore_empty";
  assert.equal(emptyRestoreTargetDecision(target.toString()).allowed, true);
  const password = randomBytes(24).toString("base64url");
  await writeFile(
    devVarsPath,
    `DATABASE_URL=${JSON.stringify(target.toString())}\nOWNER_PASSWORD=${JSON.stringify(password)}\n`,
    "utf8",
  );

  process.chdir(serverRoot);
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "false";
  const worker = await unstable_dev("./src/cloudflare-harness.ts", {
    config: "./wrangler.harness.jsonc",
    experimental: { disableExperimentalWarning: true },
    ip: "127.0.0.1",
  });
  try {
    const db = await worker.fetch("/__worker/db");
    assert.equal(db.status, 200);
    const identity = await db.json() as { database: string; branchId: string; watchlist: number; lists: number };
    assert.equal(identity.database, "mediahub_restore_empty");
    assert.equal(identity.branchId, "br-proud-smoke-asy4fsyv");
    assert.equal(identity.watchlist, 1254);
    assert.equal(identity.lists, 9);

    const locks = await worker.fetch("/__worker/locks-real", { method: "POST" });
    assert.equal(locks.status, 200);
    const lockBody = await locks.json() as { claim: string; unchanged: boolean };
    assert.ok(lockBody.claim === "claimed" || lockBody.claim === "busy");
    assert.equal(lockBody.unchanged, true);

    const login = await worker.fetch("/api/session/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /mh_session=/);
    assert.match(setCookie, /HttpOnly/);
    assert.doesNotMatch(setCookie, /Domain=/);
    const cookie = setCookie.split(";")[0] ?? "";

    const session = await worker.fetch("/api/session", { headers: { cookie } });
    assert.equal(session.status, 200);
    assert.deepEqual(await session.json(), { authenticated: true });

    const otherDevice = await worker.fetch("/api/session", { headers: { cookie } });
    assert.deepEqual(await otherDevice.json(), { authenticated: true });

    const lists = await worker.fetch("/api/lists", { headers: { cookie } });
    assert.equal(lists.status, 200);
    assert.equal(lists.headers.get("cache-control"), "private, no-cache");
    const listBody = await lists.json() as unknown[];
    assert.equal(listBody.length, 9);

    const created = await worker.fetch("/__worker/probe", { method: "POST" });
    assert.equal(created.status, 200);
    const firstView = await worker.fetch("/__worker/probe");
    assert.deepEqual(await firstView.json(), { status: "planned" });
    const updated = await worker.fetch("/__worker/probe-status", { method: "POST" });
    assert.equal(updated.status, 200);
    const secondDevice = await worker.fetch("/__worker/probe");
    assert.deepEqual(await secondDevice.json(), { status: "watched" });
    const removed = await worker.fetch("/__worker/probe", { method: "DELETE" });
    assert.equal(removed.status, 200);
    assert.deepEqual(await removed.json(), { removed: 1, watchlist: 1254 });

    const cpu = await worker.fetch("/__worker/cpu");
    assert.equal(cpu.status, 200);
    const timing = await cpu.json() as { rows: number; bytes: number; queryWallMs: number; serializeWallMs: number };
    assert.equal(timing.rows, 1254);
    assert.ok(timing.bytes > 0);
    console.log(JSON.stringify({
      queryWallMs: Math.round(timing.queryWallMs),
      serializeWallMs: Math.round(timing.serializeWallMs),
      catalogBytes: timing.bytes,
      billedCpuMeasured: false,
    }));

    const logout = await worker.fetch("/api/session/logout", {
      method: "POST",
      headers: { cookie, "x-media-hub-request": "1" },
    });
    assert.equal(logout.status, 200);
    const after = await worker.fetch("/api/session", { headers: { cookie } });
    assert.deepEqual(await after.json(), { authenticated: false });
  } finally {
    await worker.stop();
    await rm(devVarsPath, { force: true });
  }
});
