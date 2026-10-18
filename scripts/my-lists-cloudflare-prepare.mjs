/**
 * Validate the pinned My Lists test install without creating anything.
 *
 * Checks the upstream SHA, the worker artifact, the staging Wrangler file,
 * and that schema.sql can only be named against the new empty test database.
 * Then compiles the worker with `wrangler deploy --dry-run`. That command
 * does not upload. This script never logs in, never calls create, and never
 * executes schema.sql.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PIN = "b9c0a951787019f5d30065b5c2e7e5492472d3e2";
const WORKER_NAME = "mediahub-mylists-test";
const DATABASE_NAME = "mediahub-mylists-test";
const KV_SENTINEL = "00000000000000000000000000000000";
const D1_SENTINEL = "00000000-0000-0000-0000-000000000000";
const MIGRATION_ORDER = [
  "0001a_add_likes_column.sql",
  "0001b_add_likes_index.sql",
  "0002_add_stats_table.sql",
  "0003_add_missing_indexes.sql",
  "0004_add_creator_tombstones.sql",
  "0005_index_stats_totals.sql",
  "0006_add_published_lists.sql",
  "0007_add_lists_fts.sql",
  "0008_add_list_tombstones_and_creator_columns.sql",
  "0009_add_phase3_tables.sql",
  "0010_add_phase4_sync_tables.sql",
  "0011_add_streaming_events.sql",
  "0012_add_airing_next_removals.sql",
  "0013_add_creator_key_lookups.sql",
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const upstreamDir = process.env.MY_LISTS_UPSTREAM_DIR ?? path.resolve(repoRoot, "../my-lists-b9c0a951");
const configPath = path.join(repoRoot, "deploy", "my-lists-test", "wrangler.toml");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function git(args) {
  const result = spawnSync("git", args, { cwd: upstreamDir, encoding: "utf8" });
  if (result.status !== 0) fail(result.stderr || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

function assertConfig(text) {
  const required = [
    `name = "${WORKER_NAME}"`,
    'main = "worker_entry_combined.js"',
    'compatibility_date = "2024-01-01"',
    "workers_dev = true",
    "preview_urls = false",
    'binding = "CONFIGS"',
    `id = "${KV_SENTINEL}"`,
    'binding = "DB"',
    `database_name = "${DATABASE_NAME}"`,
    `database_id = "${D1_SENTINEL}"`,
    'BULK_RESOLVE_SUBREQUEST_BUDGET = "48"',
    'DETAILS_BATCH_SUBREQUEST_BUDGET = "48"',
    'CRON_SUBREQUEST_BUDGET = "48"',
  ];
  for (const line of required) {
    if (!text.includes(line)) fail(`Staging config is missing ${line}`);
  }
  if (/^\s*routes?\s*=/m.test(text) || /^\s*\[triggers\]/m.test(text) || /crons\s*=/.test(text)) {
    fail("Staging config must not declare a route, a custom domain, or a cron trigger.");
  }
  if (/account_id|mylistsaddon\.com|ep-wandering-morning|ep-nameless-bread|mh-2|ADMIN_KEY|TMDB_API_KEY|SIMKL_/i.test(text)) {
    fail("Staging config names a forbidden target or a secret.");
  }
}

function assertSchema(schema) {
  if (!schema.includes("DROP TABLE IF EXISTS creators")) {
    fail("schema.sql is not the blank-database provision this install expects.");
  }
  if (!schema.includes("DO NOT run it against a") && !schema.includes("will destroy all existing data")) {
    fail("schema.sql no longer carries its destructive-use warning.");
  }
}

function assertMigrations() {
  const names = readdirSync(path.join(upstreamDir, "migrations")).filter((name) => name.endsWith(".sql")).sort();
  if (names.join("\n") !== MIGRATION_ORDER.join("\n")) {
    fail("Migration filenames are not the pinned order. Do not apply them.");
  }
  for (const name of names) {
    const sql = readFileSync(path.join(upstreamDir, "migrations", name), "utf8");
    if (/^DROP\s/m.test(sql)) fail(`${name} contains DROP. It is not safe to treat as additive.`);
  }
}

const sha = git(["rev-parse", "HEAD"]);
if (sha !== PIN) fail(`Upstream HEAD is ${sha}. Expected ${PIN}.`);
const dirty = git(["status", "--short", "--", "worker_entry_combined.js", "schema.sql", "migrations", "wrangler.toml"]);
if (dirty) fail(`Pinned files differ from ${PIN}:\n${dirty}`);

const workerPath = path.join(upstreamDir, "worker_entry_combined.js");
const worker = readFileSync(workerPath);
if (!worker.includes('"/api/creator/lists/save"') && !worker.includes("/api/creator/lists/save")) {
  fail("The pinned worker artifact does not contain the list save route.");
}
const digest = createHash("sha256").update(worker).digest("hex");

const config = readFileSync(configPath, "utf8");
assertConfig(config);
assertSchema(readFileSync(path.join(upstreamDir, "schema.sql"), "utf8"));
assertMigrations();

const stage = mkdtempSync(path.join(tmpdir(), "mediahub-mylists-test-"));
const output = path.join(stage, "dry-run");
try {
  linkSync(workerPath, path.join(stage, "worker_entry_combined.js"));
  const stagedConfig = path.join(stage, "wrangler.toml");
  copyFileSync(configPath, stagedConfig);
  const dryRun = spawnSync(`npx --yes wrangler deploy --dry-run --outdir "${output}" --config "${stagedConfig}"`, {
    cwd: stage,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    timeout: 120_000,
  });
  const combined = `${dryRun.stdout ?? ""}\n${dryRun.stderr ?? ""}`;
  const redacted = combined
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]")
    .replace(/\b[0-9a-f]{32}\b/g, "[redacted-id]");
  if (dryRun.error || dryRun.status !== 0) {
    const reason = dryRun.error ? dryRun.error.message : "";
    process.stderr.write(`${reason}\n${redacted}`.slice(-2000));
    fail(`Wrangler dry-run exited ${dryRun.status ?? "null"}. Nothing was uploaded.`);
  }
  const produced = readdirSync(output, { recursive: true }).map(String);
  const bundleName = produced.find((name) => name.endsWith(".js"));
  if (!bundleName) {
    process.stderr.write(`${produced.join("\n")}\n${redacted.slice(-1500)}`);
    fail("Wrangler dry-run did not write a JavaScript bundle.");
  }
  const bundled = path.join(output, bundleName);
  const bundleStat = statSync(bundled);
  if (bundleStat.size < 1000 || !readFileSync(bundled, "utf8").includes("/api/creator/lists/save")) {
    fail("The dry-run bundle does not contain the list save route.");
  }
  process.stdout.write(`pin ${PIN}\n`);
  process.stdout.write(`artifact-bytes ${worker.length}\n`);
  process.stdout.write(`artifact-sha256 ${digest}\n`);
  process.stdout.write(`bundle-bytes ${bundleStat.size}\n`);
  const who = spawnSync("npx --yes wrangler whoami", {
    cwd: stage,
    encoding: "utf8",
    shell: true,
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false" },
    timeout: 60_000,
  });
  const whoText = `${who.stdout ?? ""}\n${who.stderr ?? ""}`;
  const authenticated = !/not authenticated|not logged in/i.test(whoText);
  process.stdout.write("dry-run compiled\n");
  process.stdout.write("uploaded no\n");
  process.stdout.write(`authenticated ${authenticated ? "yes" : "no"}\n`);
  process.stdout.write("resources-not-created\n");
  process.stdout.write(`worker ${WORKER_NAME} on workers.dev, no route and no cron\n`);
  process.stdout.write(`kv CONFIGS name ${WORKER_NAME}-CONFIGS sentinel-only\n`);
  process.stdout.write(`d1 ${DATABASE_NAME} binding DB sentinel-only\n`);
  process.stdout.write("schema.sql only after that new database exists and is empty\n");
  process.stdout.write("migrations not applied; they are the upgrade path for an older database\n");
  process.stdout.write("secrets none\n");
  process.stdout.write("paid-plan no\n");
} finally {
  rmSync(stage, { recursive: true, force: true });
}
