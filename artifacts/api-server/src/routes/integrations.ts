import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, watchlistTable } from "@workspace/db";
import {
  isIntegrationProvider,
  listIntegrations,
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

function refuseStoredSecret(res: { status: (code: number) => { json: (body: unknown) => void } }, provider: string): boolean {
  if (!isIntegrationProvider(provider)) {
    res.status(404).json({ error: "Unknown connection." });
    return true;
  }
  res.status(409).json({
    error: "This server reads that secret from an environment variable. This request did not save or remove it.",
  });
  return true;
}

router.put("/integrations/:provider", (req, res) => {
  refuseStoredSecret(res, String(req.params.provider));
});

router.post("/integrations/:provider/rotate", (req, res) => {
  refuseStoredSecret(res, String(req.params.provider));
});

router.delete("/integrations/:provider", (req, res) => {
  refuseStoredSecret(res, String(req.params.provider));
});

export default router;
