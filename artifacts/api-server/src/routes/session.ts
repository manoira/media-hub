import { Router, type IRouter } from "express";
import {
  assertLoginCsrf,
  clearOwnerSession,
  createOwnerSession,
  isOwnerRequest,
  ownerPasswordConfigured,
  passwordMatches,
} from "../lib/owner-session";

const router: IRouter = Router();
const failures = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const current = failures.get(ip);
  if (!current || current.resetAt <= now) return false;
  return current.count >= 8;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const current = failures.get(ip);
  if (!current || current.resetAt <= now) {
    failures.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  current.count += 1;
}

router.get("/session", async (req, res) => {
  res.json({ authenticated: await isOwnerRequest(req) });
});

router.post("/session/login", async (req, res) => {
  if (!assertLoginCsrf(req, res)) return;
  const ip = req.ip || "local";
  if (tooManyAttempts(ip)) {
    res.status(429).json({ error: "Too many sign-in attempts. Wait a few minutes." });
    return;
  }
  if (!ownerPasswordConfigured()) {
    res.status(503).json({ error: "Owner access is not configured on this server." });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!passwordMatches(password)) {
    recordFailure(ip);
    res.status(401).json({ error: "That password was not accepted." });
    return;
  }
  failures.delete(ip);
  await createOwnerSession(res);
  res.json({ authenticated: true });
});

router.post("/session/logout", async (req, res) => {
  await clearOwnerSession(req, res);
  res.json({ authenticated: false });
});

export default router;
