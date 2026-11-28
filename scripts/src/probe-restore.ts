import { catalogCounts, db, fileRestoreDecision, pool, readCatalogBackup, restoreCatalog } from "@workspace/db";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApiServerEnv } from "./lib/load-env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const ROLLBACK = "ROLLBACK_PROBE";

function sameCounts(left: Record<string, number>, right: Record<string, number>): boolean {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

async function main() {
  await loadApiServerEnv(repoRoot);
  const decision = fileRestoreDecision({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }
  const before = await catalogCounts(db);
  const backup = await readCatalogBackup(db);

  try {
    await db.transaction(async (tx) => {
      await restoreCatalog(tx, backup);
      const restored = await catalogCounts(tx);
      if (!sameCounts(before, restored)) {
        throw new Error(`Restore counts differed: ${JSON.stringify({ before, restored })}`);
      }
      throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== ROLLBACK) throw err;
  }

  const after = await catalogCounts(db);
  if (!sameCounts(before, after)) {
    throw new Error(`The probe changed the database: ${JSON.stringify({ before, after })}`);
  }
  console.log(JSON.stringify({ ok: true, counts: after }));
}

main()
  .catch((err) => {
    console.error("Probe restore failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
