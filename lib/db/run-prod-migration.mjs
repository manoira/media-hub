import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const files = [
  path.join(rootDir, "lib/db/migrations/prod_schema_fix.sql"),
  path.join(rootDir, "lib/db/migrations/004_add_tags.sql"),
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString?.startsWith("postgresql://")) {
  console.error("Set DATABASE_URL to the production Neon pooled connection string.");
  console.error("Example:");
  console.error('  $env:DATABASE_URL="<url>"; node lib/db/run-prod-migration.mjs');
  process.exit(1);
}

const host = new URL(connectionString).hostname;
console.log(`Target host: ${host}`);

if (!host.includes("neon.tech")) {
  throw new Error(`Refusing to migrate non-Neon host: ${host}`);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
console.log("Connected");

for (const file of files) {
  const sql = fs.readFileSync(file, "utf8");
  await client.query(sql);
  console.log(`Applied: ${path.relative(rootDir, file)}`);
}

const cols = await client.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name = 'watchlist' ORDER BY column_name`,
);
console.log("watchlist columns:", cols.rows.map((r) => r.column_name).join(", "));

const tables = await client.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
);
console.log("public tables:", tables.rows.map((r) => r.table_name).join(", "));

await client.end();
console.log("Done");
