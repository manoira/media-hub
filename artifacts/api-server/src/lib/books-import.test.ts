import test from "node:test";
import assert from "node:assert/strict";
import { importBooks, parseBookCsv, type LibraryBook } from "./books-import";

const gr = (rows: string) => 'Book Id,Title,Author,Exclusive Shelf,Bookshelves,ISBN13\n' + rows;
const st = (rows: string) => 'Titel,Bokens ISBN,Bokposition,Format\n' + rows;

test("CSV supports a BOM, Excel ISBNs, commas, quotes and multiline notes", () => {
  const rows = parseBookCsv('\uFEFFTitle,ISBN,Notes\r\n"Hello, world","=""9781234567890""","First\nSecond ""quote"""\r\n', ["Title"]);
  assert.equal(rows[0].Title, "Hello, world");
  assert.equal(rows[0].ISBN, '="9781234567890"');
  assert.equal(rows[0].Notes, 'First\nSecond "quote"');
  assert.throws(() => parseBookCsv('Title\n"unfinished', ["Title"]));
});

test("Goodreads shelves become statuses and supplementary tags", () => {
  const result = importBooks([], gr('1,A,Author,vill-l�sa-sp�nning,"2026, vill-l�sa-sp�nning",9781234567890\n2,B,Author,read,"2025, sp�nning",9781234567891'));
  assert.deepEqual(result.summary.counts, { "want-to-read": 1, reading: 0, read: 1 });
  assert.deepEqual(result.books[0].tags, ["2026", "vill-l�sa-sp�nning"]);
  assert.throws(() => importBooks([], gr('1,A,Author,unknown,,9781234567890')));
});

test("Goodreads Read wins; Storytel-only books remain Reading even at 100 percent", () => {
  const result = importBooks([], gr('1,A,Author,read,,9781234567890'), st('A,9781234567890,10%,Ljudbok\nB,9781234567891,100%,Ljudbok\nC,9781234567892,0%,Ljudbok'));
  assert.equal(result.books.length, 3);
  assert.equal(result.books[0].status, "read");
  assert.deepEqual(result.books.slice(1).map((book) => book.status), ["reading", "reading"]);
});

test("a unique exact title matches alternate ISBNs and preserves each listening record", () => {
  const result = importBooks([], gr('1,A,Author,read,,9781234567890'), st('A,9781234567891,99%,Ljudbok\nA,9781234567891,100%,Ljudbok'));
  assert.equal(result.books.length, 1);
  assert.equal(result.books[0].storytel.length, 2);
  assert.equal(result.books[0].isbns.length, 2);
});

test("ambiguous titles remain separate and retain all their listening records", () => {
  const result = importBooks([], gr('1,A,Author One,read,,9781234567890\n2,A,Author Two,to-read,,9781234567891'), st('A,9781234567892,50%,Ljudbok\nA,9781234567892,60%,Ljudbok'));
  assert.equal(result.books.length, 3);
  assert.equal(result.books[2].storytel.length, 2);
});

test("repeat imports are unchanged after PostgreSQL JSONB reorders object keys", () => {
  const goodreads = gr('1,A,Author,read,"2025, genre",9781234567890');
  const storytel = st('A,9781234567890,10%,Ljudbok\nB,9781234567891,100%,Ljudbok');
  const first = importBooks([], goodreads, storytel);
  const reorder = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => [key, reorder(v)]));
    return value;
  };
  const second = importBooks(reorder(first.books) as LibraryBook[], goodreads, storytel);
  assert.equal(second.summary.added, 0);
  assert.equal(second.summary.updated, 0);
  assert.equal(second.books[0].storytel.length, 1);
});

test("importing Storytel before Goodreads converges to Goodreads status", () => {
  const first = importBooks([], undefined, st('A,9781234567890,100%,Ljudbok'));
  const second = importBooks(first.books, gr('1,A,Author,read,,9781234567891'));
  assert.equal(second.books.length, 1);
  assert.equal(second.books[0].status, "read");
  assert.equal(second.books[0].storytel.length, 1);
});

test("invalid data leaves the input library untouched", () => {
  const first = importBooks([], gr('1,A,Author,read,,9781234567890')).books;
  const saved = JSON.stringify(first);
  assert.throws(() => importBooks(first, gr('2,B,Author,to-read,,9781234567891'), st(',9781234567890,10%,Ljudbok')));
  assert.equal(JSON.stringify(first), saved);
});

test("Storytel's missing ISBN sentinel preserves distinct titles", () => {
  const csv = st('A,STORYTEL_BOOK_NOT_FOUND_ISBN,0%,Ljudbok\nB,STORYTEL_BOOK_NOT_FOUND_ISBN,100%,E-bok');
  const first = importBooks([], undefined, csv);
  assert.equal(first.books.length, 2);
  assert.equal(first.books[0].isbns.length, 0);
  assert.equal(importBooks(first.books, undefined, csv).summary.added, 0);
});
