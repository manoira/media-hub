import { Router, type IRouter } from "express";
import {
  assertLoginCsrf,
  clearOwnerSession,
  createOwnerSession,
  isOwnerRequest,
  ownerPasswordConfigured,
  passwordMatches,
} from "../lib/owner-session";
import { clearLoginFailures, recordLoginFailure, tooManyLoginAttempts } from "../lib/login-limit";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});

router.get("/session", async (req, res) => {
  res.json({ authenticated: await isOwnerRequest(req) });
});

router.post("/session/login", async (req, res) => {
  if (!assertLoginCsrf(req, res)) return;
  const ip = req.ip || "local";
  if (await tooManyLoginAttempts(ip)) {
    res.status(429).json({ error: "Too many sign-in attempts. Wait a few minutes." });
    return;
  }
  if (!ownerPasswordConfigured()) {
    res.status(503).json({ error: "Owner access is not configured on this server." });
    return;
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!passwordMatches(password)) {
    await recordLoginFailure(ip);
    res.status(401).json({ error: "That password was not accepted." });
    return;
  }
  await clearLoginFailures(ip);
  await createOwnerSession(res);
  res.json({ authenticated: true });
});

router.post("/session/logout", async (req, res) => {
  await clearOwnerSession(req, res);
  res.json({ authenticated: false });
});

export default router;
