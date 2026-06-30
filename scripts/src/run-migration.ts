import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { loadApiServerEnv } from "./lib/load-env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const migrationFile = args[0];
  if (!migrationFile || migrationFile === "--help" || migrationFile === "-h") {
    console.log(`Run a SQL migration file against DATABASE_URL.

Usage:
  $env:DATABASE_URL="<url>"; corepack pnpm --filter @workspace/scripts run migrate -- 003_add_adult.sql

Loads artifacts/api-server/.env when DATABASE_URL is not already set.
`);
    process.exit(migrationFile ? 0 : 1);
  }

  await loadApiServerEnv(repoRoot);

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const sqlPath = path.join(repoRoot, "lib", "db", "migrations", migrationFile);
  const sql = await readFile(sqlPath, "utf8");

  try {
    await pool.query(sql);
    console.log(`Applied ${migrationFile}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
