import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, watchlistTable } from "@workspace/db";
import {
  isIntegrationProvider,
  listIntegrations,
  revokeIntegration,
  setIntegration,
} from "../lib/integrations";

const router: IRouter = Router();

async function catalogCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(watchlistTable);
  return row?.count ?? 0;
}

router.get("/integrations", async (_req, res) => {
  const count = await catalogCount();
  res.json({ integrations: listIntegrations(), catalogCount: count });
});

router.put("/integrations/:provider", async (req, res) => {
  const provider = String(req.params.provider);
  if (!isIntegrationProvider(provider)) {
    res.status(404).json({ error: "Unknown connection." });
    return;
  }
  const secret = typeof req.body?.secret === "string" ? req.body.secret.trim() : "";
  if (secret.length < 8) {
    res.status(400).json({ error: "Use at least 8 characters." });
    return;
  }
  const integration = setIntegration(provider, secret);
  res.json({ integration, catalogCount: await catalogCount() });
});

router.post("/integrations/:provider/rotate", async (req, res) => {
  const provider = String(req.params.provider);
  if (!isIntegrationProvider(provider)) {
    res.status(404).json({ error: "Unknown connection." });
    return;
  }
  const secret = typeof req.body?.secret === "string" ? req.body.secret.trim() : "";
  if (secret.length < 8) {
    res.status(400).json({ error: "Use at least 8 characters." });
    return;
  }
  const integration = setIntegration(provider, secret);
  res.json({ integration, catalogCount: await catalogCount() });
});

router.delete("/integrations/:provider", async (req, res) => {
  const provider = String(req.params.provider);
  if (!isIntegrationProvider(provider)) {
    res.status(404).json({ error: "Unknown connection." });
    return;
  }
  const integration = revokeIntegration(provider);
  res.json({ integration, catalogCount: await catalogCount() });
});

export default router;
