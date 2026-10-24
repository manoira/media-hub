import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const guard = await import(pathToFileURL(path.join(repoRoot, "lib", "db", "src", "file-restore-guard.ts")).href);
const {
  EMPTY_RESTORE_BRANCH,
  EMPTY_RESTORE_DATABASE,
  emptyRestoreTargetDecision,
  testCopyReadDecision,
} = guard as {
  EMPTY_RESTORE_BRANCH: string;
  EMPTY_RESTORE_DATABASE: string;
  emptyRestoreTargetDecision: (databaseUrl: string | undefined) => { allowed: boolean; reason: string };
  testCopyReadDecision: (databaseUrl: string | undefined) => { allowed: boolean; reason: string };
};

const require = createRequire(path.join(repoRoot, "lib", "db", "package.json"));
type Sql = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
  release?: () => void;
};
type SqlPool = { connect: () => Promise<Sql & { release: () => void }>; end: () => Promise<void> };
const pg = require("pg") as { Pool: new (config: object) => SqlPool };

const EXPORT_FILE = path.join(repoRoot, "data", "mediahub-v2-test-20261024-export.json");
const IDENT = /^[a-z_][a-z0-9_]*$/;

function redact(value: unknown): string {
  return String(value ?? "").replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://redacted");
}

function readDatabaseUrl(envText: string): string {
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.slice(0, eq).trim() !== "DATABASE_URL") continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

function rewrite(url: string, host: string, database: string): string {
  const next = new URL(url);
  next.hostname = host;
  next.pathname = `/${database}`;
  return next.toString();
}

async function connect(connectionString: string, readOnly: boolean): Promise<{ pool: SqlPool; client: Sql & { release: () => void } }> {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 180_000,
    ssl: { rejectUnauthorized: true },
  });
  const client = await pool.connect();
  if (readOnly) await client.query("SET default_transaction_read_only = on");
  return { pool, client };
}

async function identity(client: Sql) {
  const row = await client.query(
    "SELECT current_database() AS database, current_setting('neon.branch_id', true) AS branch_id",
  );
  return { database: String(row.rows[0].database), branchId: String(row.rows[0].branch_id) };
}

async function counts(client: Sql): Promise<Record<string, number>> {
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1",
  );
  const result: Record<string, number> = {};
  for (const row of tables.rows) {
    const name = String(row.table_name);
    if (!IDENT.test(name)) continue;
    const counted = await client.query(`SELECT count(*)::int AS n FROM public.${name}`);
    result[name] = Number(counted.rows[0]?.n ?? 0);
  }
  return result;
}

function cell(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function identityHash(rows: Array<Record<string, unknown>>, fields: string[]): string {
  const lines = rows.map((row) => fields.map((field) => cell(row[field])).join("|")).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function main() {
  const envText = await readFile(path.join(repoRoot, "artifacts", "api-server", ".env"), "utf8");
  const localUrl = readDatabaseUrl(envText);
  if (!localUrl.startsWith("postgres")) throw new Error("Local DATABASE_URL is missing.");
  const local = new URL(localUrl);
  const sourceUrl = rewrite(localUrl, "ep-misty-boat-as4ssnx0-pooler.c-4.eu-central-1.aws.neon.tech", "neondb");
  const targetUrl = rewrite(localUrl, "ep-misty-boat-as4ssnx0-pooler.c-4.eu-central-1.aws.neon.tech", EMPTY_RESTORE_DATABASE);
  const sourceDecision = testCopyReadDecision(sourceUrl);
  const targetDecision = emptyRestoreTargetDecision(targetUrl);
  if (!sourceDecision.allowed || !targetDecision.allowed) {
    throw new Error(`${sourceDecision.reason} ${targetDecision.reason}`);
  }
  if (local.hostname.includes("ep-misty-boat") || local.pathname === `/${EMPTY_RESTORE_DATABASE}`) {
    throw new Error("Local credentials already point at the restore target. Refusing to continue.");
  }

  const exportText = await readFile(EXPORT_FILE, "utf8");
  const exported = JSON.parse(exportText) as {
    host?: string;
    database?: string;
    counts?: Record<string, number>;
    tables?: Record<string, Array<Record<string, unknown>>>;
  };
  if (exported.host !== "ep-misty-boat-as4ssnx0-pooler.c-4.eu-central-1.aws.neon.tech" || exported.database !== "neondb") {
    throw new Error("Export file is not the named test-copy export.");
  }
  const tables = exported.tables ?? {};
  const exportHash = createHash("sha256").update(exportText).digest("hex");

  const original = await connect(localUrl, true);
  const source = await connect(sourceUrl, true);
  const target = await connect(targetUrl, false);
  try {
    const originalInfo = await identity(original.client);
    const sourceInfo = await identity(source.client);
    const targetInfo = await identity(target.client);
    if (originalInfo.branchId !== "br-billowing-frost-asgfiqpu" || originalInfo.database !== "neondb") {
      throw new Error("Original connection is not the expected read-only branch.");
    }
    if (sourceInfo.branchId !== EMPTY_RESTORE_BRANCH || sourceInfo.database !== "neondb") {
      throw new Error("Schema source is not the named test copy.");
    }
    if (targetInfo.branchId !== EMPTY_RESTORE_BRANCH || targetInfo.database !== EMPTY_RESTORE_DATABASE) {
      throw new Error("Restore target failed the branch or database check.");
    }
    const beforeOriginal = await counts(original.client);
    const beforeSource = await counts(source.client);
    const existing = await target.client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    if (existing.rows[0].n !== 0) throw new Error("Restore target is not empty. Refusing to drop or overwrite it.");

    const columns = await source.client.query(`
      SELECT c.relname AS table_name, a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             a.attnotnull AS not_null,
             pg_get_expr(d.adbin, d.adrelid) AS column_default,
             a.attidentity AS identity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
    `);
    const sequences = await source.client.query(`
      SELECT c.relname AS name
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY 1
    `);
    const constraints = await source.client.query(`
      SELECT conrelid::regclass::text AS table_name, conname, contype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname
    `);
    const indexes = await source.client.query(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname",
    );
    const triggers = await source.client.query(`
      SELECT pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY t.tgname
    `);

    await target.client.query("BEGIN");
    for (const sequence of sequences.rows) {
      const sequenceName = String(sequence.name);
      if (!IDENT.test(sequenceName)) throw new Error("Unexpected sequence name.");
      await target.client.query(`CREATE SEQUENCE public.${sequenceName}`);
    }
    const byTable = new Map<string, Array<Record<string, unknown>>>();
    for (const column of columns.rows) {
      const table = String(column.table_name);
      if (!IDENT.test(table) || !IDENT.test(String(column.column_name))) throw new Error("Unexpected column name.");
      const list = byTable.get(table) ?? [];
      list.push(column);
      byTable.set(table, list);
    }
    for (const [table, cols] of byTable) {
      const body = cols.map((column) => {
        const identityKind = String(column.identity ?? "");
        const generated = identityKind === "a" ? " GENERATED ALWAYS AS IDENTITY" : identityKind === "d" ? " GENERATED BY DEFAULT AS IDENTITY" : "";
        const fallback = column.column_default && !generated ? ` DEFAULT ${column.column_default}` : "";
        const required = column.not_null ? " NOT NULL" : "";
        return `${column.column_name} ${column.data_type}${generated}${fallback}${required}`;
      }).join(", ");
      await target.client.query(`CREATE TABLE public.${table} (${body})`);
    }
    const constraintNames = new Set<string>();
    for (const constraint of constraints.rows) {
      if (constraint.contype === "f") continue;
      if (!IDENT.test(String(constraint.conname))) throw new Error("Unexpected constraint name.");
      const table = String(constraint.table_name).replace(/^public\./, "").replaceAll('"', "");
      if (!IDENT.test(table)) throw new Error("Unexpected constraint table.");
      constraintNames.add(String(constraint.conname));
      await target.client.query(
        `ALTER TABLE public.${table} ADD CONSTRAINT ${constraint.conname} ${constraint.def}`,
      );
    }
    for (const index of indexes.rows) {
      if (constraintNames.has(String(index.indexname))) continue;
      await target.client.query(String(index.indexdef));
    }
    const identityTables = new Set(
      columns.rows
        .filter((column) => column.identity === "a" || column.identity === "d")
        .map((column) => String(column.table_name)),
    );
    for (const [table, rows] of Object.entries(tables)) {
      if (!IDENT.test(table) || rows.length === 0) continue;
      const override = identityTables.has(table) ? "OVERRIDING SYSTEM VALUE " : "";
      const keys = Object.keys(rows[0]).filter((key) => IDENT.test(key));
      const columnList = keys.join(", ");
      const width = keys.length;
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100);
        const values: unknown[] = [];
        const groups = batch.map((row, rowIndex) => {
          const placeholders = keys.map((key, keyIndex) => {
            values.push(row[key] ?? null);
            return `$${rowIndex * width + keyIndex + 1}`;
          });
          return `(${placeholders.join(", ")})`;
        });
        await target.client.query(
          `INSERT INTO public.${table} (${columnList}) ${override}VALUES ${groups.join(", ")}`,
          values,
        );
      }
    }
    for (const constraint of constraints.rows) {
      if (constraint.contype !== "f") continue;
      const table = String(constraint.table_name).replace(/^public\./, "").replaceAll('"', "");
      if (!IDENT.test(table) || !IDENT.test(String(constraint.conname))) throw new Error("Unexpected foreign key.");
      await target.client.query(
        `ALTER TABLE public.${table} ADD CONSTRAINT ${constraint.conname} ${constraint.def}`,
      );
    }
    for (const trigger of triggers.rows) await target.client.query(String(trigger.def));
    for (const sequence of sequences.rows) {
      const owned = await source.client.query(
        "SELECT a.attname AS column_name, c.relname AS table_name FROM pg_depend d JOIN pg_class s ON s.oid = d.objid JOIN pg_class c ON c.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.refobjsubid JOIN pg_namespace n ON n.oid = s.relnamespace WHERE s.relkind = 'S' AND n.nspname = 'public' AND s.relname = $1",
        [sequence.name],
      );
      const owner = owned.rows[0];
      const ownerTable = String(owner?.table_name ?? "");
      const ownerColumn = String(owner?.column_name ?? "");
      if (!owner || !IDENT.test(ownerTable) || !IDENT.test(ownerColumn)) continue;
      await target.client.query(
        `SELECT setval('public.${String(sequence.name)}', GREATEST((SELECT COALESCE(MAX(${ownerColumn}), 1) FROM public.${ownerTable}), 1), (SELECT MAX(${ownerColumn}) IS NOT NULL FROM public.${ownerTable}))`,
      );
    }
    await target.client.query("COMMIT");

    const restored = await counts(target.client);
    const afterOriginal = await counts(original.client);
    const afterSource = await counts(source.client);
    const watchlist = await target.client.query("SELECT id, tmdb_id, media_type, status FROM watchlist");
    const episodes = await target.client.query("SELECT tmdb_id, season_number, episode_number, watched_at FROM episode_progress");
    console.log(JSON.stringify({
      exportSha256: exportHash,
      exportHost: exported.host,
      calledVercelProductionBackup: false,
      targetDatabase: targetInfo.database,
      targetBranch: targetInfo.branchId,
      restoredCounts: restored,
      declaredCountsMatch: JSON.stringify(exported.counts) === JSON.stringify(restored),
      watchlistIdentitySha256: identityHash(watchlist.rows, ["id", "tmdb_id", "media_type", "status"]),
      exportWatchlistIdentitySha256: identityHash(tables.watchlist ?? [], ["id", "tmdb_id", "media_type", "status"]),
      episodeIdentitySha256: identityHash(episodes.rows, ["tmdb_id", "season_number", "episode_number", "watched_at"]),
      exportEpisodeIdentitySha256: identityHash(tables.episode_progress ?? [], ["tmdb_id", "season_number", "episode_number", "watched_at"]),
      originalUnchanged: JSON.stringify(beforeOriginal) === JSON.stringify(afterOriginal),
      testCopyUnchanged: JSON.stringify(beforeSource) === JSON.stringify(afterSource),
    }));
  } catch (err) {
    await target.client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await original.client.release();
    await source.client.release();
    await target.client.release();
    await original.pool.end();
    await source.pool.end();
    await target.pool.end();
  }
}

main().catch((err) => {
  console.error(redact((err as { message?: string }).message ?? err));
  process.exitCode = 1;
});
