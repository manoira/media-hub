import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, describe, it } from "node:test";
import { pool } from "@workspace/db";
import app from "./app";
import { sessionCookieAttributes } from "./lib/owner-session";
import { manualBudgetSurface, takeBudget } from "./lib/tmdb-budget";

const BUDGET_SURFACE = "manual:release-guard-test";

function listen(): Promise<{ url: string; close: () => Promise<void> }> {
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

describe("private catalog guards", () => {
  after(async () => {
    await pool.query("DELETE FROM tmdb_meter WHERE surface = $1", [BUDGET_SURFACE]);
    await pool.end();
  });

  it("keeps health and session open and requires a session for TMDB routes", async () => {
    assert.equal(app.get("trust proxy"), 1);
    assert.match(sessionCookieAttributes("production"), /Secure/);
    assert.equal(sessionCookieAttributes("production").includes("Domain="), false);
    assert.equal(sessionCookieAttributes("development").includes("Secure"), false);

    const server = await listen();
    try {
      const health = await fetch(`${server.url}/api/healthz`);
      assert.equal(health.status, 200);
      const session = await fetch(`${server.url}/api/session`);
      assert.equal(session.status, 200);
      assert.deepEqual(await session.json(), { authenticated: false });
      const login = await fetch(`${server.url}/api/session/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      assert.equal(login.status, 403);

      for (const path of ["/api/search?q=matrix", "/api/browse?category=popular", "/api/media/movie/603", "/api/discover", "/api/notifications?refresh=true"]) {
        const response = await fetch(`${server.url}${path}`);
        assert.equal(response.status, 401, path);
      }
    } finally {
      await server.close();
    }
  });

  it("stops the shared manual TMDB budget at the supplied limit", async () => {
    assert.equal(await takeBudget(BUDGET_SURFACE, 2), true);
    assert.equal(await takeBudget(BUDGET_SURFACE, 2), true);
    assert.equal(await takeBudget(BUDGET_SURFACE, 2), false);
    const stored = await pool.query<{ external: number }>(
      "SELECT external FROM tmdb_meter WHERE surface = $1",
      [BUDGET_SURFACE],
    );
    assert.equal(stored.rows[0]?.external, 2);
  });

  it("opens saved updates with zero TMDB calls and a manual check stops at the daily limit", async () => {
    const password = process.env.OWNER_PASSWORD;
    assert.ok(password, "OWNER_PASSWORD is not set");
    const surface = manualBudgetSurface();
    const external = async () => {
      const found = await pool.query<{ external: number }>(
        "SELECT COALESCE(SUM(external), 0)::int AS external FROM tmdb_meter WHERE surface NOT IN ($1, $2)",
        [BUDGET_SURFACE, surface],
      );
      return found.rows[0]?.external ?? 0;
    };
    const before = await external();
    const saved = await pool.query<{ external: number }>(
      "SELECT external FROM tmdb_meter WHERE surface = $1",
      [surface],
    );
    const server = await listen();
    try {
      const login = await fetch(`${server.url}/api/session/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-media-hub-request": "1" },
        body: JSON.stringify({ password }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.getSetCookie().find((value) => value.startsWith("mh_session="));
      assert.ok(cookie);
      const headers = { cookie: cookie.split(";")[0] ?? "" };
      const notes = await fetch(`${server.url}/api/notifications?refresh=true`, { headers });
      const lists = await fetch(`${server.url}/api/lists`, { headers });
      assert.equal(notes.status, 200);
      assert.equal(lists.status, 200);
      assert.equal(Array.isArray(await notes.json()), true);
      assert.equal(await external(), before);

      await pool.query(
        `INSERT INTO tmdb_meter (surface, external)
         VALUES ($1, 40)
         ON CONFLICT (surface) DO UPDATE SET external = 40`,
        [surface],
      );
      const refresh = await fetch(`${server.url}/api/notifications/refresh`, {
        method: "POST",
        headers: { ...headers, "x-media-hub-request": "1" },
      });
      assert.equal(refresh.status, 200);
      const body = await refresh.json() as { skipped: string | null; checked: number };
      assert.equal(body.skipped, "budget");
      assert.equal(body.checked, 0);
      assert.equal(await external(), before);
    } finally {
      if (saved.rows[0]) {
        await pool.query("UPDATE tmdb_meter SET external = $2 WHERE surface = $1", [surface, saved.rows[0].external]);
      } else {
        await pool.query("DELETE FROM tmdb_meter WHERE surface = $1", [surface]);
      }
      await server.close();
    }
  });
});
