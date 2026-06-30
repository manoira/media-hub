import { useGetPersonCredits, getGetPersonCreditsQueryKey } from "@workspace/api-client-react";
import { keepPreviousData } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonCreditCard } from "@/components/media/person-credit-card";
import { ContentFilterToggles } from "@/components/media/content-filter-toggles";
import { getTmdbImageUrl } from "@/lib/utils";
import { useHideTrackedPreference } from "@/hooks/use-hide-tracked";
import { useHideAdultPreference } from "@/hooks/use-hide-adult";
import { withExcludeAdult } from "@/lib/exclude-adult";
import { filterUntracked, useWatchlistIndex } from "@/hooks/use-watchlist-index";
import type { GetPersonCreditsType, PersonCredit, PersonDetails } from "@workspace/api-client-react";

type CreditFilter = GetPersonCreditsType;

export function PersonDetail() {
  const { personId } = useParams();
  const id = Number(personId);
  const [filter, setFilter] = useState<CreditFilter>("all");
  const [page, setPage] = useState(1);
  const [allCredits, setAllCredits] = useState<PersonCredit[]>([]);
  const [person, setPerson] = useState<PersonDetails | null>(null);
  const mergedPageRef = useRef(0);
  const scrollYRef = useRef<number | null>(null);

  const { hideTracked, setHideTracked } = useHideTrackedPreference();
  const { hideAdult, setHideAdult } = useHideAdultPreference();
  const creditParams = withExcludeAdult({ type: filter, page, page_size: 24 }, hideAdult);

  const { data, isLoading, isFetching, isError } = useGetPersonCredits(
    id,
    creditParams,
    {
      query: {
        enabled: !!id,
        queryKey: getGetPersonCreditsQueryKey(id, creditParams),
        placeholderData: keepPreviousData,
      },
    },
  );

  useEffect(() => {
    setPage(1);
    setAllCredits([]);
    setPerson(null);
    mergedPageRef.current = 0;
    scrollYRef.current = null;
    window.scrollTo(0, 0);
  }, [filter, id, hideAdult]);

  useEffect(() => {
    if (data?.person) setPerson(data.person);
  }, [data?.person]);

  useEffect(() => {
    if (!data?.results || data.page <= mergedPageRef.current) return;
    mergedPageRef.current = data.page;
    setAllCredits(prev => (data.page === 1 ? data.results : [...prev, ...data.results]));
  }, [data]);

  useEffect(() => {
    if (scrollYRef.current === null || isFetching) return;
    window.scrollTo(0, scrollYRef.current);
    scrollYRef.current = null;
  }, [allCredits.length, isFetching]);

  const handleFilterChange = useCallback((next: CreditFilter) => {
    setFilter(next);
  }, []);

  const handleLoadMore = useCallback(() => {
    scrollYRef.current = window.scrollY;
    setPage(p => p + 1);
  }, []);

  const { index } = useWatchlistIndex();
  const visibleCredits = useMemo(
    () => filterUntracked(allCredits, index, hideTracked),
    [allCredits, index, hideTracked],
  );

  const hasMore = data ? page < data.totalPages : false;
  const profileUrl = getTmdbImageUrl(person?.profilePath, "profile");
  const isInitialLoading = isLoading && page === 1 && !person;

  if (isInitialLoading) {
    return (
      <div className="space-y-8">
        <div className="flex gap-6">
          <Skeleton className="h-48 w-36 rounded-xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-20 w-full max-w-2xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!person && !isInitialLoading) {
    return <div>{isError ? "Failed to load person" : "Person not found"}</div>;
  }

  if (!person) return null;

  const filters: { value: CreditFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "movie", label: "Movies" },
    { value: "tv", label: "TV Shows" },
  ];

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row gap-6">
        <img
          src={profileUrl || "/favicon.svg"}
          alt={person.name}
          className="h-56 w-40 shrink-0 rounded-xl object-cover bg-muted shadow-lg mx-auto md:mx-0"
        />
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-4xl font-bold">{person.name}</h1>
          {person.knownForDepartment && (
            <p className="text-muted-foreground">{person.knownForDepartment}</p>
          )}
          {(person.birthday || person.placeOfBirth) && (
            <p className="text-sm text-muted-foreground">
              {[person.birthday, person.placeOfBirth].filter(Boolean).join(" • ")}
            </p>
          )}
          {person.biography && (
            <p className="text-muted-foreground leading-relaxed max-w-3xl">{person.biography}</p>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Filmography</h2>
          <div className="flex flex-wrap items-center gap-4">
            <ContentFilterToggles
              hideAdult={hideAdult}
              onHideAdultChange={setHideAdult}
              hideTracked={hideTracked}
              onHideTrackedChange={setHideTracked}
              idPrefix="person"
            />
            <div className="flex gap-2">
              {filters.map(({ value, label }) => (
                <Button
                  key={value}
                  variant={filter === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleFilterChange(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {data && (
          <p className="text-sm text-muted-foreground">
            {data.totalResults} {filter === "movie" ? "movie" : filter === "tv" ? "TV show" : "title"}
            {data.totalResults === 1 ? "" : "s"}
          </p>
        )}

        {allCredits.length > 0 ? (
          visibleCredits.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visibleCredits.map(credit => (
                <PersonCreditCard key={`${credit.mediaType}-${credit.tmdbId}`} credit={credit} />
              ))}
            </div>
          ) : (
            <p className="text-center py-12 text-muted-foreground">
              All loaded credits are already on your watchlist. Turn off &quot;Hide items already on my watchlist&quot; to see them.
            </p>
          )
        ) : (
          !isFetching && (
            <p className="text-center py-12 text-muted-foreground">
              No acting credits found for this filter.
            </p>
          )
        )}

        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isFetching}
              className="min-w-36 cursor-pointer transition-colors hover:bg-primary/10 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed"
            >
              {isFetching ? "Loading..." : "Load more"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
