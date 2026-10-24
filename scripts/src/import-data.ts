import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, fileRestoreDecision, pool, restoreCatalog, type CatalogBackup } from "@workspace/db";
import { loadApiServerEnv } from "./lib/load-env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

async function main() {
  await loadApiServerEnv(repoRoot);
  const decision = fileRestoreDecision({
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL,
  });
  if (!decision.allowed) {
    throw new Error(decision.reason);
  }
  const fileArg = process.argv.slice(2).find((arg) => arg !== "--");
  const inFile = path.resolve(repoRoot, fileArg ?? path.join("data", "local-backup.json"));

  console.warn(
    "WARNING: this REPLACES watchlist, episode progress, lists, watch events,\n" +
      "SIMKL markers, and the list sync queue in DATABASE_URL.\n" +
      "Point it at a copy, not the database you are using.",
  );
  console.warn(`Reading ${inFile}`);

  const backup = JSON.parse(await readFile(inFile, "utf8")) as CatalogBackup;
  await restoreCatalog(db, {
    ...backup,
    watchEvents: backup.watchEvents ?? [],
    simklMarkers: backup.simklMarkers ?? [],
    listSyncQueue: backup.listSyncQueue ?? [],
    customLists: backup.customLists ?? [],
    customListItems: backup.customListItems ?? [],
  });
  console.log(JSON.stringify(backup.counts));
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
