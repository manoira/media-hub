import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const COOKIE = "mh_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_HEADER = "x-media-hub-request";

export function ownerPasswordConfigured(): boolean {
  return Boolean(process.env.OWNER_PASSWORD?.trim());
}

export function passwordMatches(input: string): boolean {
  const expected = process.env.OWNER_PASSWORD ?? "";
  if (!expected) return false;
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionCookieAttributes(nodeEnv = process.env.NODE_ENV): string {
  const secure = nodeEnv === "production" ? "; Secure" : "";
  return `HttpOnly; SameSite=Lax; Path=/${secure}`;
}

export async function readSessionToken(req: Request): Promise<string | null> {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const hash = sessionTokenHash(token);
  const found = await pool.query<{ expires_at: Date }>(
    "SELECT expires_at FROM owner_sessions WHERE token_hash = $1",
    [hash],
  );
  const row = found.rows[0];
  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query("DELETE FROM owner_sessions WHERE token_hash = $1", [hash]);
    return null;
  }
  return token;
}

export async function isOwnerRequest(req: Request): Promise<boolean> {
  return (await readSessionToken(req)) !== null;
}

export async function createOwnerSession(res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await pool.query(
    "INSERT INTO owner_sessions (token_hash, expires_at) VALUES ($1, $2)",
    [sessionTokenHash(token), expiresAt],
  );
  res.append(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; ${sessionCookieAttributes()}; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  );
}

export async function clearOwnerSession(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, COOKIE);
  if (token) {
    await pool.query("DELETE FROM owner_sessions WHERE token_hash = $1", [sessionTokenHash(token)]);
  }
  res.append(
    "Set-Cookie",
    `${COOKIE}=; ${sessionCookieAttributes()}; Max-Age=0`,
  );
}

function isPublicApi(method: string, path: string): boolean {
  if (method === "GET" && (path === "/api/healthz" || path === "/api/session")) return true;
  if (method === "POST" && path === "/api/session/login") return true;
  return false;
}

function hasCsrfHeader(req: Request): boolean {
  return req.get(CSRF_HEADER) === "1";
}

function requestPath(req: Request): string {
  return (req.originalUrl || req.path).split("?")[0];
}

export async function ownerGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const path = requestPath(req);
    if (isPublicApi(req.method, path)) {
      next();
      return;
    }
    if (!(await isOwnerRequest(req))) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD" && !hasCsrfHeader(req)) {
      res.status(403).json({ error: "This request was rejected." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function assertLoginCsrf(req: Request, res: Response): boolean {
  if (hasCsrfHeader(req)) return true;
  res.status(403).json({ error: "This request was rejected." });
  return false;
}
