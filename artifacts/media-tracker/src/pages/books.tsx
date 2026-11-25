import { useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exampleBooks, readingStatuses, type ReadingStatus } from "@/data/example-books";

const filters = ["All books", ...readingStatuses] as const;
type Filter = (typeof filters)[number];

const statusStyles: Record<ReadingStatus, string> = {
  Reading: "text-sky-700 dark:text-sky-300",
  "Want to Read": "text-amber-700 dark:text-amber-300",
  Read: "text-emerald-700 dark:text-emerald-300",
};

type Book = (typeof exampleBooks)[number];

function BookCover({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative flex aspect-[2/3] items-center justify-center overflow-hidden border-b bg-gradient-to-br from-muted to-background px-4 text-center">
      <div className="flex flex-col items-center gap-3 text-foreground/80">
        <BookOpen aria-hidden="true" className="size-6 text-muted-foreground" />
        <span className="font-serif text-lg leading-tight">{book.title}</span>
        <span className="text-xs text-muted-foreground">{book.author}</span>
      </div>
      {!failed && (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          src={`https://covers.openlibrary.org/b/isbn/${book.isbn}-M.jpg?default=false`}
        />
      )}
    </div>
  );
}

export function BooksPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All books");
  const term = query.trim().toLowerCase();
  const books = exampleBooks.filter((book) =>
    (filter === "All books" || book.status === filter) &&
    `${book.title} ${book.author} ${book.genre}`.toLowerCase().includes(term),
  );

  return (
    <div className="space-y-7">
      <header className="rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card px-6 py-8 sm:px-9 sm:py-10">
        <BookOpen aria-hidden="true" className="mb-4 size-7 text-primary" />
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Books</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          Explore the library layout with 20 sample books.
        </p>
      </header>

      <section aria-label="Book library" className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div aria-label="Reading status" role="group" className="flex flex-wrap gap-2">
            {filters.map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={filter === status ? "secondary" : "outline"}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search books"
              className="pl-9"
              placeholder="Search title, author or genre"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {books.length} {books.length === 1 ? "book" : "books"}
        </p>
        {books.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No books match your filters.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {books.map((book) => (
              <li key={book.isbn} className="min-w-0 overflow-hidden rounded-xl border bg-card">
                <BookCover book={book} />
                <div className="space-y-2 p-3 sm:p-4">
                  <div>
                    <h2 className="break-words text-sm font-semibold leading-snug">{book.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{book.author}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{book.genre}</p>
                  <p className={`text-xs font-medium ${statusStyles[book.status]}`}>{book.status}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
