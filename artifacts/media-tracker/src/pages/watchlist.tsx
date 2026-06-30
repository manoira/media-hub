import { useMemo, useCallback } from "react";
import {
  useGetWatchlist,
  getGetWatchlistQueryKey,
  useGetGenres,
  getGetGenresQueryKey,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { MultiFilterMenu } from "@/components/media/multi-filter-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSearchParams, Link } from "wouter";
import { SlidersHorizontal, ChevronDown, Search, X, ListPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  YEAR_OPTIONS,
  RATING_OPTIONS,
  LANGUAGE_OPTIONS,
  STATUS_OPTIONS,
  WATCHLIST_SORT_OPTIONS,
  encodeYearRange,
  decodeYearRange,
  isYearRangeActive,
} from "@/lib/browse-filters";
import { HideAdultToggle } from "@/components/media/hide-adult-toggle";
import {
  parseWatchlistSearch,
  buildWatchlistSearchParams,
  filterWatchlistItems,
  hasActiveWatchlistFilters,
  filtersToListRules,
  type WatchlistFilterState,
} from "@/lib/watchlist-filters";
import { useHideAdultPreference } from "@/hooks/use-hide-adult";
import { filterAdultItems } from "@/lib/filter-adult";

const YEAR_FILTER_OPTIONS = YEAR_OPTIONS.filter(isYearRangeActive).map(opt => ({
  label: opt.label,
  value: encodeYearRange(opt)!,
}));

const RATING_FILTER_OPTIONS = RATING_OPTIONS.filter(
  (opt): opt is { label: string; value: number } => opt.value !== undefined,
);

const LANGUAGE_FILTER_OPTIONS = LANGUAGE_OPTIONS.filter(
  (opt): opt is { label: string; value: string } => opt.value !== undefined,
);

export function Watchlist() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseWatchlistSearch(searchParams), [searchParams]);
  const { hideAdult, setHideAdult } = useHideAdultPreference();

  const updateFilters = useCallback(
    (patch: Partial<WatchlistFilterState>) => {
      const next = { ...filters, ...patch };
      setSearchParams(buildWatchlistSearchParams(next), { replace: true });
    },
    [filters, setSearchParams],
  );

  const sortParams = useMemo(
    () => ({ sort_by: filters.sortBy }),
    [filters.sortBy],
  );
  const { data: watchlist, isLoading } = useGetWatchlist(sortParams, {
    query: { queryKey: getGetWatchlistQueryKey(sortParams) },
  });

  const displayItems = useMemo(
    () => filterAdultItems(filterWatchlistItems(watchlist ?? [], filters), hideAdult),
    [watchlist, filters, hideAdult],
  );

  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });

  const activeGenres = useMemo(() => {
    if (filters.mediaType === "movie") return genres?.movieGenres ?? [];
    if (filters.mediaType === "tv") return genres?.tvGenres ?? [];
    const merged = new Map<number, { id: number; name: string }>();
    for (const genre of genres?.movieGenres ?? []) merged.set(genre.id, genre);
    for (const genre of genres?.tvGenres ?? []) merged.set(genre.id, genre);
    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filters.mediaType, genres]);

  const genreOptions = activeGenres.map(genre => ({ label: genre.name, value: genre.id }));
  const selectedYearKeys = filters.yearRanges
    .map(encodeYearRange)
    .filter((value): value is string => value !== null);
  const currentSort = WATCHLIST_SORT_OPTIONS.find(opt => opt.value === filters.sortBy)!;
  const filtersActive = hasActiveWatchlistFilters(filters);
  const listIsEmpty = !watchlist?.length;
  const hasNoMatches = !listIsEmpty && displayItems.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">My List</h1>
            <Link href="/lists">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <ListPlus className="w-4 h-4" />
                Lists
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <HideAdultToggle
              checked={hideAdult}
              onCheckedChange={setHideAdult}
              id="hide-adult-watchlist"
            />
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                {currentSort.label}
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {WATCHLIST_SORT_OPTIONS.map(opt => (
                <DropdownMenuItem
                  key={opt.value}
                  className={cn("cursor-pointer", filters.sortBy === opt.value && "bg-muted")}
                  onClick={() => updateFilters({ sortBy: opt.value })}
                >
                  {opt.label}
                  {filters.sortBy === opt.value && (
                    <span className="ml-auto text-[10px] text-muted-foreground">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search your list..."
            value={filters.query}
            onChange={(e) => updateFilters({ query: e.target.value })}
            className="pl-8 pr-8 bg-muted/50"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => updateFilters({ query: "" })}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {filters.query.trim() && !isLoading && (
          <p className="text-sm text-muted-foreground">
            {displayItems.length} result{displayItems.length === 1 ? "" : "s"}
          </p>
        )}

        {filtersActive && (
          <div className="flex items-center gap-2">
            <Link
              href={`/lists/new?${new URLSearchParams({
                rules: JSON.stringify(filtersToListRules(filters)),
              }).toString()}`}
            >
              <Button variant="outline" size="sm" className="gap-1.5">
                <ListPlus className="w-4 h-4" />
                Save filters as list
              </Button>
            </Link>
          </div>
        )}

        <div className="flex bg-muted rounded-lg p-1 w-fit">
          <Button
            variant={filters.mediaType === "movie" ? "default" : "ghost"}
            size="sm"
            onClick={() =>
              updateFilters({
                mediaType: filters.mediaType === "movie" ? undefined : "movie",
                genres: [],
              })
            }
          >
            Movies
          </Button>
          <Button
            variant={filters.mediaType === "tv" ? "default" : "ghost"}
            size="sm"
            onClick={() =>
              updateFilters({
                mediaType: filters.mediaType === "tv" ? undefined : "tv",
                genres: [],
              })
            }
          >
            TV Shows
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <MultiFilterMenu
            label="Status"
            options={STATUS_OPTIONS}
            selected={filters.statuses}
            onChange={(statuses) => updateFilters({ statuses })}
          />

          <MultiFilterMenu
            label="Year"
            options={YEAR_FILTER_OPTIONS}
            selected={selectedYearKeys}
            onChange={(keys) =>
              updateFilters({
                yearRanges: keys
                  .map(key => decodeYearRange(key))
                  .filter((range): range is NonNullable<typeof range> => range !== null),
              })
            }
          />

          <MultiFilterMenu
            label="Rating"
            options={RATING_FILTER_OPTIONS}
            selected={filters.minRatings}
            onChange={(minRatings) => updateFilters({ minRatings })}
          />

          <MultiFilterMenu
            label="Language"
            options={LANGUAGE_FILTER_OPTIONS}
            selected={filters.languages}
            onChange={(languages) => updateFilters({ languages })}
          />

          <MultiFilterMenu
            label="Genre"
            options={genreOptions}
            selected={filters.genres}
            onChange={(genres) => updateFilters({ genres })}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="aspect-[2/3] w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : displayItems.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {displayItems.map(item => (
            <MediaCard key={item.id} item={item} showProgress={item.mediaType === "tv"} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-xl border border-border/50">
          <p className="text-muted-foreground text-lg">
            {hasNoMatches || filtersActive
              ? "No items match these filters."
              : "Your list is empty."}
          </p>
        </div>
      )}
    </div>
  );
}
