/**
 * Local My Lists worker for the pinned checkout.
 *
 * Run with the working directory set to that checkout. It uses Miniflare's
 * local KV and D1 only. schema.sql drops tables, so this process must never
 * be pointed at a database that already has data.
 */
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = process.cwd();
const miniflareEntry = path.join(root, "node_modules", "miniflare", "dist", "src", "index.js");
if (!existsSync(miniflareEntry) || !existsSync(path.join(root, "worker_entry_combined.js"))) {
  process.stderr.write("Run this inside the pinned My Lists checkout after npm install miniflare@3.\n");
  process.exit(1);
}

const { Miniflare } = await import(pathToFileURL(miniflareEntry).href);
const mf = new Miniflare({
  modules: true,
  scriptPath: path.join(root, "worker_entry_combined.js"),
  compatibilityDate: "2024-01-01",
  kvNamespaces: ["CONFIGS"],
  d1Databases: ["DB"],
});

function sqlStatements(file) {
  const withoutComments = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments.split(";").map((statement) => statement.trim()).filter(Boolean);
}

const database = await mf.getD1Database("DB");
for (const statement of sqlStatements(path.join(root, "schema.sql"))) {
  await database.exec(statement.replace(/\s+/g, " "));
}
const migrationDir = path.join(root, "migrations");
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
for (const name of migrations) {
  for (const statement of sqlStatements(path.join(migrationDir, name))) {
    try {
      await database.exec(statement.replace(/\s+/g, " "));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column|already exists/i.test(message)) throw error;
    }
  }
}

const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const response = await mf.dispatchFetch(`http://127.0.0.1:${port}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const out = {};
    response.headers.forEach((value, key) => {
      if (key === "content-encoding" || key === "content-length" || key === "transfer-encoding") return;
      out[key] = value;
    });
    res.writeHead(response.status, out);
    res.end(bytes);
  } catch {
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("local runtime error");
  }
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.stdout.write(`ready http://127.0.0.1:${port}\n`);
});
