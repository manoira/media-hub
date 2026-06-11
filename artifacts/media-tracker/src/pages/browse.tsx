import { useState, useEffect, useRef, useCallback } from "react";
import { useDiscoverMedia, useGetGenres, getGetGenresQueryKey, getDiscoverMediaQueryKey } from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import type { MediaItem } from "@workspace/api-client-react";

const SORT_OPTIONS = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "release_date.desc", label: "Latest Release" },
];

type SortValue = "popularity.desc" | "vote_average.desc" | "release_date.desc";
type MediaType = "movie" | "tv";

export function Browse() {
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortValue>("popularity.desc");
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const params = {
    type: mediaType,
    genre: selectedGenre ?? undefined,
    sort_by: sortBy,
    page,
  };

  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });

  const { data, isFetching } = useDiscoverMedia(params, {
    query: { queryKey: getDiscoverMediaQueryKey(params) },
  });

  useEffect(() => {
    if (data?.results) {
      if (page === 1) {
        setAllItems(data.results);
      } else {
        setAllItems(prev => {
          const ids = new Set(prev.map(i => `${i.mediaType}-${i.tmdbId}`));
          const fresh = data.results.filter(i => !ids.has(`${i.mediaType}-${i.tmdbId}`));
          return [...prev, ...fresh];
        });
      }
      setHasMore(page < (data.totalPages ?? 1) && page < 10);
    }
  }, [data, page]);

  const resetAndFilter = useCallback((opts: { type?: MediaType; genre?: number | null; sort?: SortValue }) => {
    setAllItems([]);
    setHasMore(true);
    setPage(1);
    if (opts.type !== undefined) setMediaType(opts.type);
    if (opts.genre !== undefined) setSelectedGenre(opts.genre);
    if (opts.sort !== undefined) setSortBy(opts.sort);
  }, []);

  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetching && hasMore) {
          setPage(p => p + 1);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFetching, hasMore]);

  const activeGenres = mediaType === "movie" ? genres?.movieGenres : genres?.tvGenres;
  const currentSort = SORT_OPTIONS.find(o => o.value === sortBy)!;

  const cardSkeletons = Array.from({ length: 20 }).map((_, i) => (
    <div key={i} className="space-y-2">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <Skeleton className="h-3.5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  ));

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Browse</h1>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                {currentSort.label}
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SORT_OPTIONS.map(opt => (
                <DropdownMenuItem
                  key={opt.value}
                  className={cn("cursor-pointer", sortBy === opt.value && "bg-muted")}
                  onClick={() => resetAndFilter({ sort: opt.value as SortValue })}
                >
                  {opt.label}
                  {sortBy === opt.value && <span className="ml-auto text-[10px] text-muted-foreground">✓</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex bg-muted rounded-lg p-1 w-fit">
          <Button
            variant={mediaType === "movie" ? "default" : "ghost"}
            size="sm"
            onClick={() => resetAndFilter({ type: "movie", genre: null })}
          >
            Movies
          </Button>
          <Button
            variant={mediaType === "tv" ? "default" : "ghost"}
            size="sm"
            onClick={() => resetAndFilter({ type: "tv", genre: null })}
          >
            TV Shows
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => resetAndFilter({ genre: null })}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
              selectedGenre === null
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
            )}
          >
            All
          </button>
          {activeGenres?.map(genre => (
            <button
              key={genre.id}
              onClick={() => resetAndFilter({ genre: genre.id === selectedGenre ? null : genre.id })}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                selectedGenre === genre.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground"
              )}
            >
              {genre.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {allItems.map(item => (
          <MediaCard key={`${item.mediaType}-${item.tmdbId}`} item={item} genres={genres} />
        ))}
        {isFetching && page === 1 && cardSkeletons}
      </div>

      {isFetching && page > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      <div ref={loaderRef} className="h-4" />

      {!hasMore && allItems.length > 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">You've reached the end</p>
      )}
    </div>
  );
}
