import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { customListItemsTable, customListsTable, db, listContentHash, pool } from "@workspace/db";
import { loadApiServerEnv } from "./lib/load-env.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main() {
  await loadApiServerEnv(repoRoot);
  const lists = await db
    .select({ id: customListsTable.id, updatedAt: customListsTable.updatedAt })
    .from(customListsTable)
    .where(isNull(customListsTable.contentHash));

  let filled = 0;
  for (const list of lists) {
    const items = await db
      .select({ mediaType: customListItemsTable.mediaType, tmdbId: customListItemsTable.tmdbId })
      .from(customListItemsTable)
      .where(and(eq(customListItemsTable.listId, list.id), isNotNull(customListItemsTable.mediaType), isNotNull(customListItemsTable.tmdbId)));
    const hash = listContentHash(items.map((item) => ({
      mediaType: item.mediaType as string,
      tmdbId: item.tmdbId as number,
    })));
    await pool.query(
      "UPDATE custom_lists SET content_hash = $1 WHERE id = $2 AND content_hash IS NULL",
      [hash, list.id],
    );
    const [after] = await db
      .select({ updatedAt: customListsTable.updatedAt })
      .from(customListsTable)
      .where(eq(customListsTable.id, list.id));
    if (after && after.updatedAt.getTime() !== list.updatedAt.getTime()) {
      throw new Error(`List ${list.id} updated_at changed while filling the content hash.`);
    }
    filled += 1;
  }

  console.log(JSON.stringify({ filled }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
