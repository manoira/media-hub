import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, pool, readCatalogBackup } from "@workspace/db";
import { loadApiServerEnv } from "./lib/load-env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

async function main() {
  await loadApiServerEnv(repoRoot);
  console.log("Exporting catalog from the dev database...");

  const backup = await readCatalogBackup(db);
  const outDir = path.join(repoRoot, "data");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "local-backup.json");
  await writeFile(outFile, JSON.stringify(backup, null, 2), "utf8");

  console.log(JSON.stringify(backup.counts));
  console.log(`Wrote ${outFile}`);
  console.log("Left data/watchlist.json unchanged.");
}

main()
  .catch((err) => {
    console.error("Export failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
