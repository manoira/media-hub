import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isServerless = Boolean(process.env.VERCEL)
  || (typeof navigator !== "undefined" && navigator.userAgent.includes("Cloudflare-Workers"));
const neonSsl = process.env.DATABASE_URL?.includes("neon.tech")
  ? { rejectUnauthorized: true as const }
  : undefined;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: isServerless ? 1 : 10,
  maxUses: isServerless ? 1 : undefined,
  idleTimeoutMillis: isServerless ? 1 : 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: isServerless ? neonSsl : undefined,
});

export async function withDirectClient<T>(
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    ssl: neonSsl,
  });
  await client.connect();
  try {
    return await run(client as unknown as pg.PoolClient);
  } finally {
    await client.end();
  }
}

export const db = drizzle(pool, { schema });

export * from "./schema";
export {
  acceptImdbId,
  catalogCounts,
  listContentHash,
  readCatalogBackup,
  restoreCatalog,
} from "./catalog-backup";
export {
  EMPTY_RESTORE_BRANCH,
  EMPTY_RESTORE_DATABASE,
  emptyRestoreTargetDecision,
  fileRestoreDecision,
  testCopyReadDecision,
} from "./file-restore-guard";
export type { CatalogBackup } from "./catalog-backup";
