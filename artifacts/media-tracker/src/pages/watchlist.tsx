import { useMemo, useCallback } from "react";
import {
  useGetWatchlist,
  getGetWatchlistQueryKey,
  useGetGenres,
  getGetGenresQueryKey,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { WatchlistListRow } from "@/components/media/watchlist-list-row";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link, useSearchParams } from "wouter";
import { ListPlus } from "lucide-react";
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
import {
  parseWatchlistSearch,
  buildWatchlistSearchParams,
  filterWatchlistItems,
  sortWatchlistItems,
  hasActiveWatchlistFilters,
  filtersToListRules,
  type WatchlistFilterState,
} from "@/lib/watchlist-filters";
import { useHideAdultPreference } from "@/hooks/use-hide-adult";
import { useListViewMode } from "@/hooks/use-list-view-mode";
import { filterAdultItems } from "@/lib/filter-adult";
import { ListsSectionLayout } from "@/components/lists/lists-section-layout";
import { StatusFilterPills } from "@/components/lists/status-filter-pills";
import { SharedFilterBar, type MediaTypeTab } from "@/components/lists/shared-filter-bar";
import { WatchlistFilterPanel } from "@/components/lists/watchlist-filter-panel";

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

function toMediaTypeTab(mediaType?: WatchlistFilterState["mediaType"]): MediaTypeTab {
  if (mediaType === "movie") return "movie";
  if (mediaType === "tv") return "tv";
  return "all";
}

export function WatchlistContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseWatchlistSearch(searchParams), [searchParams]);
  const { hideAdult, setHideAdult } = useHideAdultPreference();
  const { viewMode, setViewMode } = useListViewMode();

  const updateFilters = useCallback(
    (patch: Partial<WatchlistFilterState>) => {
      const next = { ...filters, ...patch };
      setSearchParams(buildWatchlistSearchParams(next), { replace: true });
    },
    [filters, setSearchParams],
  );

  const { data: watchlist, isLoading } = useGetWatchlist(undefined, {
    query: { queryKey: getGetWatchlistQueryKey() },
  });

  const displayItems = useMemo(
    () => filterAdultItems(
      sortWatchlistItems(filterWatchlistItems(watchlist ?? [], filters), filters.sortBy),
      hideAdult,
    ),
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

  const handleMediaTypeChange = (tab: MediaTypeTab) => {
    if (tab === "all") {
      updateFilters({ mediaType: undefined, genres: [] });
      return;
    }
    updateFilters({ mediaType: tab, genres: [] });
  };

  const saveAsListButton = filtersActive ? (
    <Link
      href={`/lists/new?${new URLSearchParams({
        rules: JSON.stringify(filtersToListRules(filters)),
      }).toString()}`}
    >
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
        <ListPlus className="h-3.5 w-3.5" />
        Save as list
      </Button>
    </Link>
  ) : null;

  return (
    <ListsSectionLayout
      activeSection="tracking"
      contextTabs={
        <StatusFilterPills
          selected={filters.statuses}
          onChange={(statuses) => updateFilters({ statuses })}
        />
      }
    >
      <div className="space-y-6">
        <SharedFilterBar
          mediaType={toMediaTypeTab(filters.mediaType)}
          onMediaTypeChange={handleMediaTypeChange}
          itemCount={displayItems.length}
          searchQuery={filters.query}
          onSearchChange={(query) => updateFilters({ query })}
          searchPlaceholder="Search your list..."
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortLabel={currentSort.label}
          sortOptions={WATCHLIST_SORT_OPTIONS}
          currentSort={filters.sortBy}
          onSortChange={(sortBy) => updateFilters({ sortBy: sortBy as WatchlistFilterState["sortBy"] })}
          filterActive={filtersActive || hideAdult}
          trailing={saveAsListButton}
          filterPanel={
            <WatchlistFilterPanel
              hideAdult={hideAdult}
              onHideAdultChange={setHideAdult}
              statusOptions={STATUS_OPTIONS}
              selectedStatuses={filters.statuses}
              onStatusesChange={(statuses) => updateFilters({ statuses })}
              yearOptions={YEAR_FILTER_OPTIONS}
              selectedYearKeys={selectedYearKeys}
              onYearKeysChange={(keys) =>
                updateFilters({
                  yearRanges: keys
                    .map(key => decodeYearRange(key))
                    .filter((range): range is NonNullable<typeof range> => range !== null),
                })
              }
              ratingOptions={RATING_FILTER_OPTIONS}
              selectedRatings={filters.minRatings}
              onRatingsChange={(minRatings) => updateFilters({ minRatings })}
              languageOptions={LANGUAGE_FILTER_OPTIONS}
              selectedLanguages={filters.languages}
              onLanguagesChange={(languages) => updateFilters({ languages })}
              genreOptions={genreOptions}
              selectedGenres={filters.genres}
              onGenresChange={(genres) => updateFilters({ genres })}
            />
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="aspect-[2/3] w-full rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : displayItems.length ? (
          viewMode === "list" ? (
            <div className="flex flex-col gap-2">
              {displayItems.map(item => (
                <WatchlistListRow key={item.id} item={item} showProgress={item.mediaType === "tv"} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {displayItems.map(item => (
                <MediaCard
                  key={item.id}
                  item={item}
                  variant="tracking"
                  showProgress={item.mediaType === "tv"}
                />
              ))}
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card py-20 text-center">
            <p className="text-lg text-muted-foreground">
              {hasNoMatches || filtersActive
                ? "No items match these filters."
                : "Your list is empty."}
            </p>
          </div>
        )}
      </div>
    </ListsSectionLayout>
  );
}
