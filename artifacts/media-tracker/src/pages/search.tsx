import { useSearchMedia, getSearchMediaQueryKey, useGetGenres, getGetGenresQueryKey } from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search as SearchIcon } from "lucide-react";

export function Search() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = searchParams.get("q") || "";
  
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: results, isLoading } = useSearchMedia(
    { query: debouncedQuery },
    { query: { enabled: !!debouncedQuery, queryKey: getSearchMediaQueryKey({ query: debouncedQuery }) } }
  );

  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });

  return (
    <div className="space-y-6">
      <div className="relative max-w-2xl mx-auto">
        <SearchIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search movies & TV shows..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 h-12 text-lg"
          autoFocus
        />
      </div>

      {!debouncedQuery && (
        <div className="text-center py-20 text-muted-foreground">
          Type something to start searching...
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {results?.results && results.results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.results.map(item => (
            <MediaCard key={item.tmdbId} item={item} genres={genres} />
          ))}
        </div>
      )}

      {results?.results && results.results.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">
          No results found for "{debouncedQuery}"
        </div>
      )}
    </div>
  );
}
