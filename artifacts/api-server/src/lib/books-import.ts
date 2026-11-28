import { createHash } from "node:crypto";

export type ReadingStatus = "want-to-read" | "reading" | "read";
export type SourceRow = Record<string, string>;
export type LibraryBook = {
  id: string;
  title: string;
  author: string;
  status: ReadingStatus;
  isbns: string[];
  tags: string[];
  goodreads: SourceRow[];
  storytel: SourceRow[];
};

export class BookImportError extends Error {}

// CSV exports contain quoted commas, embedded newlines and Excel-style ISBN cells.
export function parseBookCsv(text: string, required: string[]): SourceRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;
  const csv = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else value += char;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(value);
      value = "";
      closedQuote = false;
      if (char !== ",") {
        if (char === "\r" && csv[i + 1] === "\n") i++;
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
      }
    } else if (char === '"' && !value && !closedQuote) quoted = true;
    else {
      if (closedQuote || char === '"') throw new BookImportError("Invalid CSV quoting.");
      value += char;
    }
  }
  if (quoted) throw new BookImportError("The CSV ends inside a quoted field.");
  if (value || row.length || closedQuote) {
    row.push(value);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  const headers = rows.shift()?.map((cell) => cell.trim());
  if (!headers || new Set(headers).size !== headers.length || required.some((key) => !headers.includes(key))) {
    throw new BookImportError(`The CSV must contain ${required.join(", ")}.`);
  }
  if (rows.length > 20000) throw new BookImportError("Import at most 20,000 rows per file.");
  return rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new BookImportError(`CSV row ${index + 2} has the wrong number of fields.`);
    return Object.fromEntries(headers.map((key, i) => [key, cells[i]]));
  });
}

function isbn(value: string | undefined): string {
  const clean = (value ?? "").replace(/^="(.*)"$/, "$1").replace(/[\s-]/g, "").toUpperCase();
  return /^(\d{13}|\d{9}[\dX])$/.test(clean) ? clean : "";
}

function titleKey(title: string): string {
  return title.normalize("NFKC").toLocaleLowerCase("sv-SE").replace(/\s+/g, " ").trim();
}

function sourceId(prefix: string, value: string): string {
  return prefix + createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueRows(rows: SourceRow[]): SourceRow[] {
  return [...new Map(rows.map((row) => [JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))), row])).values()];
}

function fingerprint(book: LibraryBook): string {
  return JSON.stringify([
    book.id, book.title, book.author, book.status, book.isbns, book.tags,
    book.goodreads.map((row) => Object.entries(row).sort(([a], [b]) => a.localeCompare(b))),
    book.storytel.map((row) => Object.entries(row).sort(([a], [b]) => a.localeCompare(b))),
  ]);
}

function goodreadsStatus(shelf: string): ReadingStatus {
  if (shelf === "read") return "read";
  if (shelf === "currently-reading") return "reading";
  if (shelf === "to-read" || /^(vill-läsa|att-läsa)/i.test(shelf)) return "want-to-read";
  throw new BookImportError(`Unrecognized Goodreads reading shelf: ${shelf || "(empty)"}.`);
}

function shelfTags(row: SourceRow): string[] {
  return distinct([...(row.Bookshelves ?? "").split(","), row["Exclusive Shelf"]]
    .map((tag) => tag.trim()).filter((tag) => !["read", "currently-reading", "to-read", "all"].includes(tag)));
}

export function importBooks(existing: LibraryBook[], goodreadsCsv?: string, storytelCsv?: string) {
  if (!goodreadsCsv && !storytelCsv) throw new BookImportError("Choose a Goodreads or Storytel CSV file.");
  const goodreads = goodreadsCsv ? parseBookCsv(goodreadsCsv, ["Book Id", "Title", "Author", "Exclusive Shelf", "Bookshelves"]) : [];
  const storytel = storytelCsv ? parseBookCsv(storytelCsv, ["Titel", "Bokens ISBN", "Bokposition", "Format"]) : [];
  const books = new Map(existing.map((book) => [book.id, structuredClone(book)]));
  const before = new Map(existing.map((book) => [book.id, fingerprint(book)]));

  // A Goodreads ID is authoritative on repeat imports, including corrected ISBNs.
  for (const row of goodreads) {
    if (!row["Book Id"].trim() || !row.Title.trim()) throw new BookImportError("A Goodreads row has no book ID or title.");
    const rowIsbns = distinct([isbn(row.ISBN13), isbn(row.ISBN)]);
    const candidates = [...books.values()].filter((book) =>
      book.goodreads.some((source) => source["Book Id"] === row["Book Id"]) ||
      book.isbns.some((id) => rowIsbns.includes(id)),
    );
    const match = candidates.find((book) => book.goodreads.some((source) => source["Book Id"] === row["Book Id"]))
      ?? (candidates.length === 1 ? candidates[0] : undefined);
    const book: LibraryBook = match ?? {
      id: sourceId("gr-", row["Book Id"]), title: row.Title.trim(), author: row.Author.trim(),
      status: goodreadsStatus(row["Exclusive Shelf"]), isbns: [], tags: [], goodreads: [], storytel: [],
    };
    book.title = row.Title.trim();
    book.author = row.Author.trim();
    book.status = goodreadsStatus(row["Exclusive Shelf"]);
    book.isbns = distinct([...book.isbns, ...rowIsbns]);
    book.tags = distinct([...book.tags, ...shelfTags(row)]);
    book.goodreads = uniqueRows([...book.goodreads.filter((source) => source["Book Id"] !== row["Book Id"]), row]);
    if (book.goodreads.some((source) => source["Exclusive Shelf"] === "read")) book.status = "read";
    books.set(book.id, book);
  }

  let matchedByTitle = 0;
  let ambiguousTitles = 0;
  for (const row of storytel) {
    const rowIsbn = isbn(row["Bokens ISBN"]);
    if (!row.Titel.trim()) throw new BookImportError("A Storytel row has no title.");
    const recordId = sourceId("st-", rowIsbn || titleKey(row.Titel));
    const candidates = rowIsbn ? [...books.values()].filter((book) => book.isbns.includes(rowIsbn)) : [];
    let match = books.get(recordId) ?? (candidates.length === 1 ? candidates[0] : candidates.find((book) => book.goodreads.length === 0));
    if (!match && candidates.length === 0) {
      const titles = [...books.values()].filter((book) => titleKey(book.title) === titleKey(row.Titel));
      // Storytel supplies no author. Merge only an exact title with one candidate.
      if (titles.length === 1) {
        match = titles[0];
        matchedByTitle++;
      } else if (titles.length > 1) ambiguousTitles++;
    }
    const book: LibraryBook = match ?? {
      id: recordId, title: row.Titel.trim(), author: "",
      status: "reading", isbns: [], tags: [], goodreads: [], storytel: [],
    };
    book.isbns = distinct([...book.isbns, rowIsbn]);
    book.storytel = uniqueRows([...book.storytel, row]);
    books.set(book.id, book);
  }

  // Merge a former Storytel-only record when Goodreads later supplies its ISBN.
  for (const book of [...books.values()]) {
    if (book.goodreads.length) continue;
    let matches = [...books.values()].filter((candidate) => candidate.goodreads.length &&
      candidate.isbns.some((id) => book.isbns.includes(id)));
    if (matches.length === 0) {
      matches = [...books.values()].filter((candidate) => candidate.goodreads.length && titleKey(candidate.title) === titleKey(book.title));
    }
    if (matches.length !== 1) continue;
    const target = matches[0];
    target.isbns = distinct([...target.isbns, ...book.isbns]);
    target.tags = distinct([...target.tags, ...book.tags]);
    target.storytel = uniqueRows([...target.storytel, ...book.storytel]);
    books.delete(book.id);
  }

  const result = [...books.values()];
  const counts = { "want-to-read": 0, reading: 0, read: 0 };
  for (const book of result) counts[book.status]++;
  return {
    books: result,
    summary: {
      goodreadsRows: goodreads.length, storytelRows: storytel.length,
      added: result.filter((book) => !before.has(book.id)).length,
      updated: result.filter((book) => before.has(book.id) && before.get(book.id) !== fingerprint(book)).length,
      total: result.length, counts, matchedByTitle, ambiguousTitles,
    },
  };
}
