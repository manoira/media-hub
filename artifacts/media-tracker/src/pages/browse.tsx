import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useDiscoverMedia, useGetGenres, getGetGenresQueryKey, getDiscoverMediaQueryKey } from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { HideTrackedToggle } from "@/components/media/hide-tracked-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { withExcludeTracked } from "@/lib/exclude-tracked";
import { useHideTrackedPreference } from "@/hooks/use-hide-tracked";
import {
  YEAR_OPTIONS,
  RATING_OPTIONS,
  LANGUAGE_OPTIONS,
  type YearRange,
} from "@/lib/browse-filters";
import { SlidersHorizontal, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MediaItem } from "@workspace/api-client-react";

type SortValue =
  | "popularity.desc"
  | "vote_average.desc"
  | "vote_count.desc"
  | "release_date.desc"
  | "release_date.asc"
  | "revenue.desc"
  | "title.asc";
type MediaType = "movie" | "tv";

const SORT_OPTIONS: { value: SortValue; label: string; movieOnly?: boolean }[] = [
  { value: "popularity.desc", label: "Most Popular" },
  { value: "vote_average.desc", label: "Top Rated" },
  { value: "vote_count.desc", label: "Most Voted" },
  { value: "release_date.desc", label: "Newest" },
  { value: "release_date.asc", label: "Oldest" },
  { value: "revenue.desc", label: "Highest Grossing", movieOnly: true },
  { value: "title.asc", label: "Title (A–Z)" },
];

function FilterMenu({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", active && "border-primary text-foreground")}
        >
          {label}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Browse() {
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<SortValue>("popularity.desc");
  const [yearRange, setYearRange] = useState<YearRange>(YEAR_OPTIONS[0]);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const { hideTracked, setHideTracked } = useHideTrackedPreference();

  const params = withExcludeTracked({
    type: mediaType,
    genre: selectedGenre ?? undefined,
    sort_by: sortBy,
    min_rating: minRating,
    min_year: yearRange.min,
    max_year: yearRange.max,
    language,
    page,
  }, hideTracked);

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
      setHasMore(page < (data.totalPages ?? 1) && page < 100);
    }
  }, [data, page]);

  useEffect(() => {
    setAllItems([]);
    setHasMore(true);
    setPage(1);
  }, [hideTracked]);

  const resetAndFilter = useCallback((opts: {
    type?: MediaType;
    genre?: number | null;
    sort?: SortValue;
    year?: YearRange;
    rating?: number;
    lang?: string;
  }) => {
    setAllItems([]);
    setHasMore(true);
    setPage(1);
    if (opts.type !== undefined) setMediaType(opts.type);
    if (opts.genre !== undefined) setSelectedGenre(opts.genre);
    if (opts.sort !== undefined) setSortBy(opts.sort);
    if (opts.year !== undefined) setYearRange(opts.year);
    if ("rating" in opts) setMinRating(opts.rating);
    if ("lang" in opts) setLanguage(opts.lang);
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
  const visibleSortOptions = SORT_OPTIONS.filter(o => !o.movieOnly || mediaType === "movie");
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
              {visibleSortOptions.map(opt => (
                <DropdownMenuItem
                  key={opt.value}
                  className={cn("cursor-pointer", sortBy === opt.value && "bg-muted")}
                  onClick={() => resetAndFilter({ sort: opt.value })}
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
            onClick={() => resetAndFilter({ type: "tv", genre: null, sort: sortBy === "revenue.desc" ? "popularity.desc" : undefined })}
          >
            TV Shows
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterMenu
            label={yearRange.min !== undefined || yearRange.max !== undefined ? yearRange.label : "Year"}
            active={yearRange.min !== undefined || yearRange.max !== undefined}
          >
            {YEAR_OPTIONS.map(opt => (
              <DropdownMenuItem
                key={opt.label}
                className={cn("cursor-pointer", yearRange.label === opt.label && "bg-muted")}
                onClick={() => resetAndFilter({ year: opt })}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </FilterMenu>

          <FilterMenu
            label={minRating !== undefined ? `Rating ${minRating}+` : "Rating"}
            active={minRating !== undefined}
          >
            {RATING_OPTIONS.map(opt => (
              <DropdownMenuItem
                key={opt.label}
                className={cn("cursor-pointer", minRating === opt.value && "bg-muted")}
                onClick={() => resetAndFilter({ rating: opt.value })}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </FilterMenu>

          <FilterMenu
            label={language !== undefined ? (LANGUAGE_OPTIONS.find(l => l.value === language)?.label ?? "Language") : "Language"}
            active={language !== undefined}
          >
            {LANGUAGE_OPTIONS.map(opt => (
              <DropdownMenuItem
                key={opt.label}
                className={cn("cursor-pointer", language === opt.value && "bg-muted")}
                onClick={() => resetAndFilter({ lang: opt.value })}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
          </FilterMenu>

          <FilterMenu
            label={activeGenres?.find(g => g.id === selectedGenre)?.name ?? "Genre"}
            active={selectedGenre !== null}
          >
            <DropdownMenuItem
              className={cn("cursor-pointer", selectedGenre === null && "bg-muted")}
              onClick={() => resetAndFilter({ genre: null })}
            >
              All
              {selectedGenre === null && <span className="ml-auto text-[10px] text-muted-foreground">✓</span>}
            </DropdownMenuItem>
            {activeGenres?.map(genre => (
              <DropdownMenuItem
                key={genre.id}
                className={cn("cursor-pointer", selectedGenre === genre.id && "bg-muted")}
                onClick={() => resetAndFilter({ genre: genre.id })}
              >
                {genre.name}
                {selectedGenre === genre.id && <span className="ml-auto text-[10px] text-muted-foreground">✓</span>}
              </DropdownMenuItem>
            ))}
          </FilterMenu>
        </div>
      </div>

      <HideTrackedToggle
        checked={hideTracked}
        onCheckedChange={setHideTracked}
        id="hide-tracked-browse"
      />

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

      {!isFetching && allItems.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          {hideTracked
            ? "No untracked items match these filters. Try turning off \"Hide items already on my watchlist\"."
            : "No items match these filters."}
        </p>
      )}
    </div>
  );
}
