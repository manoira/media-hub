/**
 * My Lists server settings. The origin is chosen per install, so a later
 * test worker can be pointed at without a code change. Nothing here is
 * assumed to be mylistsaddon.com.
 */

export const MY_LISTS_CONTRACT = {
  addonVersion: "1.5.5",
  commit: "b9c0a951787019f5d30065b5c2e7e5492472d3e2",
  savePath: "/api/creator/lists/save",
  itemsPath: "/api/creator/lists/items",
  listsPath: "/api/creator/lists",
  deletePath: "/api/creator/lists/delete",
} as const;

export type MyListsConnection = "simulated" | "configured" | "verified" | "unconfigured";

export type MyListsTransport =
  | { kind: "simulator"; target: "local-simulator"; profile: "mediahub-local-test"; connection: "simulated" }
  | { kind: "http"; origin: string; originHost: string; creatorName: string; creatorKey: string; target: string; profile: string; connection: "configured" }
  | { kind: "unconfigured"; reason: string; connection: "unconfigured" };

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function parseMyListsOrigin(raw: string): { ok: true; origin: string; host: string } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "MY_LISTS_ORIGIN must be an absolute URL." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "MY_LISTS_ORIGIN must not include a username or password." };
  }
  if (url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    return { ok: false, reason: "MY_LISTS_ORIGIN must be only the scheme and host." };
  }
  const host = url.hostname.toLowerCase();
  if (host === "mylistsaddon.com" || host.endsWith(".mylistsaddon.com")) {
    return { ok: false, reason: "MY_LISTS_ORIGIN must be your own install. mylistsaddon.com is not used." };
  }
  const loopback = LOOPBACK.has(host);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    return { ok: false, reason: "MY_LISTS_ORIGIN must be HTTPS. Loopback HTTP is only for the local contract test." };
  }
  return { ok: true, origin: url.origin, host };
}

export function parseCreatorName(raw: string): { ok: true; name: string } | { ok: false; reason: string } {
  const name = raw.trim().toLowerCase();
  if (name.length < 3 || name.length > 25) {
    return { ok: false, reason: "MY_LISTS_CREATOR_NAME must be 3 to 25 characters." };
  }
  if (!/^[a-z0-9_-]+$/.test(name)) {
    return { ok: false, reason: "MY_LISTS_CREATOR_NAME can only contain letters, numbers, hyphens, and underscores." };
  }
  if (name.includes("mylists")) {
    return { ok: false, reason: "MY_LISTS_CREATOR_NAME cannot contain mylists." };
  }
  return { ok: true, name };
}

export function boundedNumber(raw: string, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function myListsTimeoutMs(): number {
  return boundedNumber(readEnv("MY_LISTS_HTTP_TIMEOUT_MS"), 10_000, 50, 30_000);
}

export function myListsRetryDelayMs(): number {
  return boundedNumber(readEnv("MY_LISTS_RETRY_DELAY_MS"), 200, 0, 5_000);
}

export function resolveMyListsTransport(): MyListsTransport {
  const mode = readEnv("MY_LISTS_MODE").toLowerCase();
  if (mode === "simulator") {
    return { kind: "simulator", target: "local-simulator", profile: "mediahub-local-test", connection: "simulated" };
  }
  const origin = parseMyListsOrigin(readEnv("MY_LISTS_ORIGIN"));
  const creatorName = parseCreatorName(readEnv("MY_LISTS_CREATOR_NAME"));
  const creatorKey = readEnv("MY_LISTS_CREATOR_KEY");
  if (origin.ok && creatorName.ok && creatorKey) {
    return {
      kind: "http",
      origin: origin.origin,
      originHost: origin.host,
      creatorName: creatorName.name,
      creatorKey,
      target: origin.origin,
      profile: creatorName.name,
      connection: "configured",
    };
  }
  if (mode === "http" || readEnv("MY_LISTS_ORIGIN") || readEnv("MY_LISTS_CREATOR_NAME") || creatorKey) {
    const reason = !origin.ok
      ? origin.reason
      : !creatorName.ok
        ? creatorName.reason
        : "MY_LISTS_CREATOR_KEY is empty. Nothing was written.";
    return { kind: "unconfigured", reason, connection: "unconfigured" };
  }
  return {
    kind: "unconfigured",
    reason: "My Lists HTTP is not configured. Set MY_LISTS_ORIGIN, MY_LISTS_CREATOR_NAME, and MY_LISTS_CREATOR_KEY. Nothing was written.",
    connection: "unconfigured",
  };
}
