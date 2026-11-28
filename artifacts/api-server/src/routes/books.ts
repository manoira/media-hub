import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { BookImportError, importBooks, type LibraryBook } from "../lib/books-import";

const router: IRouter = Router();

async function withBookLibrary<T>(run: (client: Pick<typeof pool, "query">) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(735281, 1)");
    await client.query(`CREATE TABLE IF NOT EXISTS book_library (
      id text PRIMARY KEY,
      document jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

router.get("/books", async (_req, res) => {
  try {
    const books = await withBookLibrary(async (client) => {
      const result = await client.query<{ document: LibraryBook }>("SELECT document FROM book_library ORDER BY id");
      return result.rows.map(({ document }) => document);
    });
    // Source records can contain private notes and account IDs. Send only card data.
    res.set("Cache-Control", "private, no-store");
    res.json(books.map((book) => ({
      id: book.id, title: book.title, author: book.author, status: book.status,
      isbns: book.isbns, tags: book.tags,
      sources: [book.goodreads.length ? "Goodreads" : null, book.storytel.length ? "Storytel" : null].filter(Boolean),
    })));
  } catch {
    res.status(500).json({ error: "The book library could not be loaded." });
  }
});

router.post("/books/import", async (req, res) => {
  const { goodreadsCsv, storytelCsv } = req.body ?? {};
  if ((goodreadsCsv !== undefined && typeof goodreadsCsv !== "string") ||
      (storytelCsv !== undefined && typeof storytelCsv !== "string")) {
    res.status(400).json({ error: "CSV contents must be text." });
    return;
  }
  try {
    const summary = await withBookLibrary(async (client) => {
      const current = await client.query<{ id: string; document: LibraryBook }>("SELECT id, document FROM book_library FOR UPDATE");
      const imported = importBooks(current.rows.map(({ document }) => document), goodreadsCsv, storytelCsv);
      for (const book of imported.books) {
        await client.query(`INSERT INTO book_library (id, document) VALUES ($1, $2::jsonb)
          ON CONFLICT (id) DO UPDATE SET document = EXCLUDED.document, updated_at = now()
          WHERE book_library.document IS DISTINCT FROM EXCLUDED.document`, [book.id, JSON.stringify(book)]);
      }
      const retainedIds = new Set(imported.books.map((book) => book.id));
      const mergedIds = current.rows.filter(({ id }) => !retainedIds.has(id)).map(({ id }) => id);
      if (mergedIds.length) await client.query("DELETE FROM book_library WHERE id = ANY($1::text[])", [mergedIds]);
      return imported.summary;
    });
    res.set("Cache-Control", "private, no-store");
    res.json(summary);
  } catch (error) {
    if (error instanceof BookImportError) res.status(400).json({ error: error.message });
    else res.status(500).json({ error: "The import could not be saved. No books were changed." });
  }
});

export default router;
