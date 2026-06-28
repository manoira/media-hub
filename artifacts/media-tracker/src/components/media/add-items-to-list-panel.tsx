import { useEffect, useMemo, useState } from "react";
import {
  useGetWatchlist,
  getGetWatchlistQueryKey,
  useAddCustomListItem,
  getGetCustomListQueryKey,
  useSearchMedia,
  getSearchMediaQueryKey,
  type WatchlistItem,
  type MediaItem,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Loader2, X } from "lucide-react";
import { matchesWatchlistQuery } from "@/lib/watchlist-filters";
import { WATCHLIST_STATUS_BY_VALUE } from "@/lib/watchlist-status";
import { getTmdbImageUrl } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type AddMode = "tracked" | "discover";

interface AddItemsToListPanelProps {
  listId: number;
  listMembershipKeys: Set<string>;
}

function mediaKey(mediaType: string, tmdbId: number) {
  return `${mediaType}:${tmdbId}`;
}

export function AddItemsToListPanel({ listId, listMembershipKeys }: AddItemsToListPanelProps) {
  const [mode, setMode] = useState<AddMode>("tracked");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: watchlist, isLoading: watchlistLoading } = useGetWatchlist(undefined, {
    query: { queryKey: getGetWatchlistQueryKey() },
  });

  const { data: searchResults, isLoading: searchLoading } = useSearchMedia(
    { query: debouncedQuery },
    {
      query: {
        enabled: mode === "discover" && debouncedQuery.trim().length > 0,
        queryKey: getSearchMediaQueryKey({ query: debouncedQuery }),
      },
    },
  );

  const addItem = useAddCustomListItem();

  const trackedCandidates = useMemo(() => {
    if (!watchlist || !query.trim()) return [];
    return watchlist
      .filter(item => !listMembershipKeys.has(mediaKey(item.mediaType, item.tmdbId)))
      .filter(item => matchesWatchlistQuery(item.title, query))
      .slice(0, 12);
  }, [watchlist, query, listMembershipKeys]);

  const discoverCandidates = useMemo(() => {
    if (!searchResults?.results || !debouncedQuery.trim()) return [];
    return searchResults.results
      .filter(item => !listMembershipKeys.has(mediaKey(item.mediaType, item.tmdbId)))
      .slice(0, 12);
  }, [searchResults, debouncedQuery, listMembershipKeys]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetCustomListQueryKey(listId) });
  };

  const handleAddTracked = (watchlistId: number) => {
    addItem.mutate(
      { id: listId, data: { watchlistId } },
      { onSuccess: invalidate },
    );
  };

  const handleAddDiscover = (item: MediaItem) => {
    addItem.mutate(
      {
        id: listId,
        data: {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          voteAverage: item.voteAverage ?? null,
        },
      },
      { onSuccess: invalidate },
    );
  };

  const isLoading = mode === "tracked" ? watchlistLoading : searchLoading;
  const candidates = mode === "tracked" ? trackedCandidates : discoverCandidates;

  return (
    <section className="rounded-xl border border-border/50 bg-card/30 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Add titles</h2>
        <p className="text-sm text-muted-foreground mt-1">
          From My List — keeps your watch status. From Discover — adds without tracking
          (won&apos;t appear on My List until you add it there).
        </p>
      </div>

      <div className="flex bg-muted rounded-lg p-1 w-fit">
        <Button
          type="button"
          variant={mode === "tracked" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("tracked")}
        >
          My List
        </Button>
        <Button
          type="button"
          variant={mode === "discover" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("discover")}
        >
          Discover
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder={mode === "tracked" ? "Search My List..." : "Search movies & TV..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading && query.trim() && (
        <p className="text-sm text-muted-foreground">Searching...</p>
      )}

      {!isLoading && query.trim() && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No matches found, or they are already in this list.
        </p>
      )}

      {candidates.length > 0 && (
        <ul className="divide-y divide-border/50 rounded-lg border border-border/50 overflow-hidden">
          {mode === "tracked"
            ? trackedCandidates.map(item => (
                <TrackedSearchRow
                  key={item.id}
                  item={item}
                  isAdding={addItem.isPending}
                  onAdd={() => handleAddTracked(item.id)}
                />
              ))
            : discoverCandidates.map(item => (
                <DiscoverSearchRow
                  key={mediaKey(item.mediaType, item.tmdbId)}
                  item={item}
                  isAdding={addItem.isPending}
                  onAdd={() => handleAddDiscover(item)}
                />
              ))}
        </ul>
      )}
    </section>
  );
}

function TrackedSearchRow({
  item,
  isAdding,
  onAdd,
}: {
  item: WatchlistItem;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const posterUrl = getTmdbImageUrl(item.posterPath, "poster");
  const statusConfig = WATCHLIST_STATUS_BY_VALUE[item.status];

  return (
    <SearchResultRow
      title={item.title}
      mediaType={item.mediaType}
      tmdbId={item.tmdbId}
      posterUrl={posterUrl}
      subtitle={
        <>
          {statusConfig && (
            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusConfig.badgeClass)}>
              {statusConfig.label}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {item.mediaType === "movie" ? "Movie" : "TV"}
            {item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ""}
          </span>
        </>
      }
      isAdding={isAdding}
      onAdd={onAdd}
    />
  );
}

function DiscoverSearchRow({
  item,
  isAdding,
  onAdd,
}: {
  item: MediaItem;
  isAdding: boolean;
  onAdd: () => void;
}) {
  const posterUrl = getTmdbImageUrl(item.posterPath, "poster");

  return (
    <SearchResultRow
      title={item.title}
      mediaType={item.mediaType}
      tmdbId={item.tmdbId}
      posterUrl={posterUrl}
      subtitle={
        <>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            Not tracked
          </Badge>
          <span className="text-xs text-muted-foreground">
            {item.mediaType === "movie" ? "Movie" : "TV"}
            {item.releaseDate ? ` · ${item.releaseDate.slice(0, 4)}` : ""}
          </span>
        </>
      }
      isAdding={isAdding}
      onAdd={onAdd}
    />
  );
}

function SearchResultRow({
  title,
  mediaType,
  tmdbId,
  posterUrl,
  subtitle,
  isAdding,
  onAdd,
}: {
  title: string;
  mediaType: string;
  tmdbId: number;
  posterUrl: string | null;
  subtitle: React.ReactNode;
  isAdding: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-3 p-3 bg-background/50 hover:bg-muted/30 transition-colors">
      <Link href={`/media/${mediaType}/${tmdbId}`} className="shrink-0">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            className="w-10 h-14 object-cover rounded bg-muted"
            loading="lazy"
          />
        ) : (
          <div className="w-10 h-14 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground text-center p-1">
            {title.slice(0, 8)}
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          href={`/media/${mediaType}/${tmdbId}`}
          className="font-medium text-sm truncate block hover:text-primary"
        >
          {title}
        </Link>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">{subtitle}</div>
      </div>

      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 gap-1"
        disabled={isAdding}
        onClick={onAdd}
      >
        {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        Add
      </Button>
    </li>
  );
}
