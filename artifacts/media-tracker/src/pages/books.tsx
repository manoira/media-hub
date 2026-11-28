import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Status = "want-to-read" | "reading" | "read";
type Book = {
  id: string; title: string; author: string; status: Status;
  isbns: string[]; tags: string[]; sources: string[];
};
type ImportSummary = { added: number; updated: number; total: number; ambiguousTitles: number };
const filters = [
  { value: "want-to-read", label: "Want to read" },
  { value: "reading", label: "Currently reading" },
  { value: "read", label: "Read" },
  { value: "all", label: "All" },
] as const;
const statusLabels = { "want-to-read": "Want to read", reading: "Currently reading", read: "Read" };
const PAGE_SIZE = 60;
const libraryKey = ["book-library"] as const;
const localCoverIsbns = new Set([
  "9780060850524", "9780062060624", "9780062315007", "9780143130727", "9780307277671",
  "9780307588371", "9780345339706", "9780356500157", "9780385486804", "9780385534635",
  "9780385547345", "9780441172719", "9780593135204", "9780593321201", "9780804139021",
  "9780812993547", "9781400033416", "9781476753836", "9781501161933",
]);

function BookCover({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false);
  const coverIsbn = book.isbns.find((isbn) => localCoverIsbns.has(isbn));
  return <div className="relative flex aspect-[2/3] flex-col items-center justify-center gap-3 overflow-hidden border-b bg-gradient-to-br from-primary/15 via-muted to-background p-4 text-center">
    <BookOpen aria-hidden="true" className="size-6 shrink-0 text-primary" />
    <span className="line-clamp-6 font-serif text-lg leading-tight">{book.title}</span>
    {book.author && <span className="line-clamp-2 text-xs text-muted-foreground">{book.author}</span>}
    {coverIsbn && !failed && <img alt="" className="absolute inset-0 size-full object-cover"
      decoding="async" loading="lazy" onError={() => setFailed(true)}
      src={`${import.meta.env.BASE_URL}books/covers/${coverIsbn}.jpg`} />}
  </div>;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new Error("Sign in again to access your book library.");
  if (response.status === 413) throw new Error("Choose CSV files with a combined size below 4 MB.");
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("The book service did not return a valid response. Try again.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request failed.");
  return body as T;
}

export function BooksPage({ view }: { view: "tracking" | "lists" }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);
  const [goodreadsFile, setGoodreadsFile] = useState<File>();
  const [storytelFile, setStorytelFile] = useState<File>();
  const queryClient = useQueryClient();
  const library = useQuery({
    queryKey: libraryKey,
    queryFn: async () => readResponse<Book[]>(await fetch("/api/books", { credentials: "include" })),
  });
  const importMutation = useMutation({
    mutationFn: async () => {
      if (!goodreadsFile && !storytelFile) throw new Error("Choose at least one CSV file.");
      if ((goodreadsFile?.size ?? 0) + (storytelFile?.size ?? 0) > 4 * 1024 * 1024) {
        throw new Error("Choose CSV files with a combined size below 4 MB.");
      }
      const [goodreadsCsv, storytelCsv] = await Promise.all([goodreadsFile?.text(), storytelFile?.text()]);
      return readResponse<ImportSummary>(await fetch("/api/books/import", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", "x-media-hub-request": "1" },
        body: JSON.stringify({ goodreadsCsv, storytelCsv }),
      }));
    },
    onSuccess: async () => {
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: libraryKey });
    },
  });
  const books = library.data ?? [];
  const term = query.trim().toLocaleLowerCase();
  const filtered = books.filter((book) =>
    (filter === "all" || book.status === filter) &&
    [book.title, book.author, ...book.tags].join(" ").toLocaleLowerCase().includes(term),
  ).sort((a, b) => a.title.localeCompare(b.title, "sv"));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{view === "lists" ? "My lists" : "Books"}</h1>
        <Button variant="outline" aria-expanded={showImport} onClick={() => setShowImport(!showImport)}>
          <Upload className="mr-2 size-4" aria-hidden="true" />Import books
        </Button>
      </header>
      {showImport && (
        <form className="space-y-4 rounded-xl border bg-card p-5" onSubmit={(event) => {
          event.preventDefault();
          importMutation.mutate();
        }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>Goodreads CSV</span>
              <Input type="file" accept=".csv,text/csv" disabled={importMutation.isPending}
                onChange={(event) => { setGoodreadsFile(event.target.files?.[0]); importMutation.reset(); }} />
            </label>
            <label className="space-y-2 text-sm font-medium">
              <span>Storytel CSV</span>
              <Input type="file" accept=".csv,text/csv" disabled={importMutation.isPending}
                onChange={(event) => { setStorytelFile(event.target.files?.[0]); importMutation.reset(); }} />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            Goodreads sets reading status. Storytel-only books use Currently reading. Other shelves become tags.
          </p>
          <Button type="submit" disabled={importMutation.isPending || (!goodreadsFile && !storytelFile)}>
            {importMutation.isPending ? "Importing." : "Import selected files"}
          </Button>
          {importMutation.error && <p role="alert" className="text-sm text-destructive">{importMutation.error.message}</p>}
          {importMutation.data && <p role="status" className="text-sm">
            Imported. {importMutation.data.added} added, {importMutation.data.updated} updated. {importMutation.data.total} books in total.
            {importMutation.data.ambiguousTitles > 0 && " Books with ambiguous title matches were kept separately."}
          </p>}
        </form>
      )}
      {view === "lists" ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          No manual lists yet. Imported shelves are saved as tags on your books in Tracking.
        </p>
      ) : (
        <section aria-label="Book library" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div aria-label="Reading status" role="group" className="flex flex-wrap gap-2">
              {filters.map(({ value, label }) => (
                <Button key={value} size="sm" variant={filter === value ? "default" : "outline"}
                  aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>
                  {label}
                </Button>
              ))}
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Search books" className="pl-9" placeholder="Search title, author or tag"
                type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
            </div>
          </div>
          {library.isPending && <p role="status" className="text-sm text-muted-foreground">Loading books.</p>}
          {library.error && <div role="alert" className="space-y-2 text-sm text-destructive">
            <p>{library.error.message}</p><Button variant="outline" onClick={() => void library.refetch()}>Try again</Button>
          </div>}
          {library.isSuccess && <>
            <p className="text-sm text-muted-foreground" aria-live="polite">{filtered.length} books</p>
            {filtered.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {books.length ? "No books match your filters." : "Import your Goodreads and Storytel files to add your books."}
            </p> : <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visible.map((book) => <li key={book.id} className="min-w-0 overflow-hidden rounded-xl border bg-card">
                <BookCover book={book} />
                <div className="space-y-2 p-3 sm:p-4">
                  <h2 className="break-words text-sm font-semibold leading-snug">{book.title}</h2>
                  {book.author && <p className="text-xs text-muted-foreground">{book.author}</p>}
                  <p className="text-xs font-medium text-primary">{statusLabels[book.status]}</p>
                  {book.tags.length > 0 && <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Tags ({book.tags.length})</summary>
                    <ul className="mt-2 flex flex-wrap gap-1">{book.tags.map((tag) => <li key={tag} className="break-all rounded border px-1.5 py-0.5">{tag}</li>)}</ul>
                  </details>}
                </div>
              </li>)}
            </ul>}
            {pageCount > 1 && <nav aria-label="Book pages" className="flex items-center justify-center gap-4">
              <Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
              <span className="text-sm">{currentPage} / {pageCount}</span>
              <Button variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
            </nav>}
          </>}
        </section>
      )}
    </div>
  );
}
