import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const COOKIE = "mh_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const CSRF_HEADER = "x-media-hub-request";

const PERSONAL_PREFIXES = [
  "/api/watchlist",
  "/api/lists",
  "/api/progress",
  "/api/notifications",
  "/api/stats",
  "/api/wako-probe",
  "/api/recommendations",
  "/api/integrations",
  "/api/home",
  "/api/backup",
  "/api/v2",
];

type Session = { expiresAt: number };

const sessions = new Map<string, Session>();

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

export function readSessionToken(req: Request): string | null {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return token;
}

export function isOwnerRequest(req: Request): boolean {
  return readSessionToken(req) !== null;
}

export function createOwnerSession(res: Response): void {
  const token = randomBytes(32).toString("base64url");
  sessions.set(token, { expiresAt: Date.now() + SESSION_MS });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`,
  );
}

export function clearOwnerSession(req: Request, res: Response): void {
  const token = readCookie(req, COOKIE);
  if (token) sessions.delete(token);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`,
  );
}

function isPersonalPath(path: string): boolean {
  return PERSONAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function hasCsrfHeader(req: Request): boolean {
  return req.get(CSRF_HEADER) === "1";
}

function requestPath(req: Request): string {
  return (req.originalUrl || req.path).split("?")[0];
}

export function ownerGate(req: Request, res: Response, next: NextFunction): void {
  const path = requestPath(req);
  const logout = path === "/api/session/logout";
  if (!logout && !isPersonalPath(path)) {
    next();
    return;
  }
  if (!isOwnerRequest(req)) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD" && !hasCsrfHeader(req)) {
    res.status(403).json({ error: "This request was rejected." });
    return;
  }
  next();
}

export function assertLoginCsrf(req: Request, res: Response): boolean {
  if (hasCsrfHeader(req)) return true;
  res.status(403).json({ error: "This request was rejected." });
  return false;
}
