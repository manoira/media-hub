import { pool } from "@workspace/db";

type Token = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type Device = {
  device_code: string;
  user_code: string;
  expires_in: number;
  interval: number;
};

let pending: { clientId: string; device: Device; expiresAt: number; nextPoll: number; interval: number } | undefined;
let schema: Promise<unknown> | undefined;

function ensureStorage() {
  schema ??= pool.query(`CREATE TABLE IF NOT EXISTS mediahub_simkl_connection (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    client_id text NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamptz NOT NULL
  )`).catch(error => {
    schema = undefined;
    throw error;
  });
  return schema;
}

async function request(path: "device" | "token", body: Record<string, string>) {
  const response = await fetch(`https://api.simkl.com/oauth2/${path}`, {
    method: "POST",
    headers: { "User-Agent": "MediaHub/1.0", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  return { ok: response.ok, data: await response.json() };
}

function tokenFrom(data: Partial<Token>): Token {
  if (!data.access_token || !data.refresh_token || !Number.isFinite(data.expires_in) || Number(data.expires_in) <= 0) {
    throw new Error("SIMKL did not return a renewable session.");
  }
  return data as Token;
}

export async function startSimklDevice(clientId: string) {
  await ensureStorage();
  const result = await request("device", { client_id: clientId, scope: "media:read media:write" });
  const device = result.data as Device;
  if (!result.ok || !device.device_code || !device.user_code || !Number.isFinite(device.expires_in) || !Number.isFinite(device.interval)) {
    throw new Error("SIMKL did not issue a device code.");
  }
  const interval = Math.max(5, device.interval) * 1000;
  pending = { clientId, device, expiresAt: Date.now() + device.expires_in * 1000, nextPoll: Date.now() + interval, interval };
  return { userCode: device.user_code, expiresAt: pending.expiresAt };
}

export async function finishSimklDevice() {
  const attempt = pending;
  if (!attempt || attempt.expiresAt <= Date.now()) return "expired";
  if (attempt.nextPoll > Date.now()) return "pending";
  attempt.nextPoll = Date.now() + attempt.interval;
  const result = await request("token", {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: attempt.clientId,
    device_code: attempt.device.device_code,
  });
  if (!result.ok) {
    if (result.data.error === "authorization_pending") return "pending";
    if (result.data.error === "slow_down") {
      attempt.interval += 5000;
      attempt.nextPoll = Date.now() + attempt.interval;
      return "pending";
    }
    if (result.data.error === "expired_token") return "expired";
    throw new Error("SIMKL authorization failed.");
  }
  if (pending !== attempt) return "expired";
  const scopes = typeof result.data.scope === "string" ? result.data.scope.split(/\s+/) : [];
  if (!scopes.includes("media:read") || !scopes.includes("media:write")) return "read-only";
  const token = tokenFrom(result.data);
  await pool.query(`
    INSERT INTO mediahub_simkl_connection (client_id, access_token, refresh_token, expires_at)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (singleton) DO UPDATE SET client_id = excluded.client_id,
      access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at
  `, [attempt.clientId, token.access_token, token.refresh_token, new Date(Date.now() + token.expires_in * 1000)]);
  pending = undefined;
  return "connected";
}

export async function hasSimklConnection() {
  const { rows: [row] } = await pool.query<{ present: boolean }>(
    "SELECT to_regclass('mediahub_simkl_connection') IS NOT NULL AS present",
  );
  if (!row?.present) return false;
  const result = await pool.query("SELECT 1 FROM mediahub_simkl_connection WHERE singleton");
  return Boolean(result.rowCount);
}

export async function getSimklConnection() {
  if (!(await hasSimklConnection())) return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [row] } = await client.query<{
      client_id: string; access_token: string; refresh_token: string; expires_at: Date;
    }>("SELECT client_id, access_token, refresh_token, expires_at FROM mediahub_simkl_connection WHERE singleton FOR UPDATE");
    if (!row) {
      await client.query("COMMIT");
      return null;
    }
    let token = row.access_token;
    if (row.expires_at.getTime() <= Date.now() + 60_000) {
      const result = await request("token", { grant_type: "refresh_token", client_id: row.client_id, refresh_token: row.refresh_token });
      if (!result.ok) throw new Error("Reconnect MediaHub to SIMKL to renew the session.");
      const refreshed = tokenFrom(result.data);
      token = refreshed.access_token;
      await client.query("UPDATE mediahub_simkl_connection SET access_token = $1, refresh_token = $2, expires_at = $3 WHERE singleton",
        [token, refreshed.refresh_token, new Date(Date.now() + refreshed.expires_in * 1000)]);
    }
    await client.query("COMMIT");
    return { clientId: row.client_id, token };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
