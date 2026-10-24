import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  return url;
}

function createPool(): pg.Pool {
  const connectionString = databaseUrl();
  const isServerless = Boolean(process.env.VERCEL)
    || (typeof navigator !== "undefined" && navigator.userAgent.includes("Cloudflare-Workers"));
  const neonSsl = connectionString.includes("neon.tech")
    ? { rejectUnauthorized: true as const }
    : undefined;
  return new Pool({
    connectionString,
    max: isServerless ? 1 : 10,
    maxUses: isServerless ? 1 : undefined,
    idleTimeoutMillis: isServerless ? 1 : 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isServerless ? neonSsl : undefined,
  });
}

let poolInstance: pg.Pool | undefined;

function activePool(): pg.Pool {
  if (!poolInstance) poolInstance = createPool();
  return poolInstance;
}

export const pool: pg.Pool = new Proxy({} as pg.Pool, {
  get(_target, property) {
    const real = activePool();
    const value = Reflect.get(real, property, real) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export async function withDirectClient<T>(
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const connectionString = databaseUrl();
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString.includes("neon.tech") ? { rejectUnauthorized: true } : undefined,
  });
  await client.connect();
  try {
    return await run(client as unknown as pg.PoolClient);
  } finally {
    await client.end();
  }
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

let databaseInstance: Database | undefined;

function activeDatabase(): Database {
  if (!databaseInstance) databaseInstance = drizzle(activePool(), { schema });
  return databaseInstance;
}

export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const real = activeDatabase();
    const value = Reflect.get(real, property, real) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});

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
