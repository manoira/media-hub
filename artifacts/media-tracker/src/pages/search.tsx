import {
  useSearchMedia,
  getSearchMediaQueryKey,
  useSearchPeople,
  getSearchPeopleQueryKey,
  useSearchByTag,
  getSearchByTagQueryKey,
  useGetGenres,
  getGetGenresQueryKey,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { PersonResultCard } from "@/components/media/person-result-card";
import { TagLink } from "@/components/media/tag-link";
import { ContentFilterToggles } from "@/components/media/content-filter-toggles";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHideTrackedPreference } from "@/hooks/use-hide-tracked";
import { useHideAdultPreference } from "@/hooks/use-hide-adult";
import { withContentFilters } from "@/lib/content-filters";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Search as SearchIcon } from "lucide-react";

type SearchMode = "titles" | "people" | "tags";

function parseSearchMode(value: string | null): SearchMode {
  if (value === "people" || value === "actors") return "people";
  if (value === "tags") return "tags";
  return "titles";
}

function modeToParam(mode: SearchMode): string | null {
  if (mode === "people") return "people";
  if (mode === "tags") return "tags";
  return null;
}

export function Search() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialQuery = searchParams.get("q") || "";
  const initialMode = parseSearchMode(searchParams.get("mode"));

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [mode, setMode] = useState<SearchMode>(initialMode);
  const { hideTracked, setHideTracked } = useHideTrackedPreference();
  const { hideAdult, setHideAdult } = useHideAdultPreference();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    const modeParam = modeToParam(mode);
    if (modeParam) params.set("mode", modeParam);
    const next = params.toString();
    const nextUrl = next ? `/search?${next}` : "/search";
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      setLocation(nextUrl, { replace: true });
    }
  }, [debouncedQuery, mode, setLocation]);

  const titleSearchParams = withContentFilters({ query: debouncedQuery }, { hideTracked, hideAdult });
  const tagSearchParams = withContentFilters({ query: debouncedQuery }, { hideTracked, hideAdult });

  const { data: titleResults, isLoading: titlesLoading } = useSearchMedia(
    titleSearchParams,
    {
      query: {
        enabled: !!debouncedQuery && mode === "titles",
        queryKey: getSearchMediaQueryKey(titleSearchParams),
      },
    },
  );

  const { data: peopleResults, isLoading: peopleLoading } = useSearchPeople(
    { query: debouncedQuery },
    {
      query: {
        enabled: !!debouncedQuery && mode === "people",
        queryKey: getSearchPeopleQueryKey({ query: debouncedQuery }),
      },
    },
  );

  const { data: tagResults, isLoading: tagsLoading } = useSearchByTag(
    tagSearchParams,
    {
      query: {
        enabled: !!debouncedQuery && mode === "tags",
        queryKey: getSearchByTagQueryKey(tagSearchParams),
      },
    },
  );

  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });

  const isLoading =
    mode === "titles" ? titlesLoading : mode === "people" ? peopleLoading : tagsLoading;

  const placeholder =
    mode === "people"
      ? "Search writers, authors, actors..."
      : mode === "tags"
        ? "Search tags like based on novel, vampire, heist..."
        : "Search movies & TV shows...";

  const emptyHint =
    mode === "people"
      ? "Search for a writer, author, or actor to browse their work..."
      : mode === "tags"
        ? "Search theme tags to find related movies and shows..."
        : "Type something to start searching...";

  return (
    <div className="space-y-6">
      <div className="relative max-w-2xl mx-auto">
        <SearchIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10 h-12 text-lg"
          autoFocus
        />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant={mode === "titles" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("titles")}
        >
          Titles
        </Button>
        <Button
          variant={mode === "people" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("people")}
        >
          People
        </Button>
        <Button
          variant={mode === "tags" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("tags")}
        >
          Tags
        </Button>
      </div>

      {(mode === "titles" || mode === "tags") && (
        <ContentFilterToggles
          hideAdult={hideAdult}
          onHideAdultChange={setHideAdult}
          hideTracked={hideTracked}
          onHideTrackedChange={setHideTracked}
          idPrefix="search"
          className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-6"
        />
      )}

      {!debouncedQuery && (
        <div className="text-center py-20 text-muted-foreground">{emptyHint}</div>
      )}

      {isLoading && debouncedQuery && (mode === "titles" || mode === "tags") && (
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

      {isLoading && debouncedQuery && mode === "people" && (
        <div className="max-w-3xl mx-auto space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {mode === "tags" && tagResults?.matchedKeywords && tagResults.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
          <span>Matching tags:</span>
          {tagResults.matchedKeywords.map(tag => (
            <TagLink key={tag.id} name={tag.name} variant="secondary" />
          ))}
        </div>
      )}

      {mode === "titles" && titleResults?.results && titleResults.results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {titleResults.results.map(item => (
            <MediaCard key={`${item.mediaType}-${item.tmdbId}`} item={item} genres={genres} />
          ))}
        </div>
      )}

      {mode === "tags" && tagResults?.results && tagResults.results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {tagResults.results.map(item => (
            <MediaCard key={`${item.mediaType}-${item.tmdbId}`} item={item} genres={genres} />
          ))}
        </div>
      )}

      {mode === "people" && peopleResults?.results && peopleResults.results.length > 0 && (
        <div className="max-w-3xl mx-auto space-y-3">
          {peopleResults.results.map(person => (
            <PersonResultCard key={person.id} person={person} />
          ))}
        </div>
      )}

      {mode === "titles" && titleResults?.results && titleResults.results.length === 0 && debouncedQuery && !titlesLoading && (
        <div className="text-center py-20 text-muted-foreground">
          {hideTracked
            ? `No untracked results for "${debouncedQuery}". Try turning off "Hide items already on my watchlist".`
            : `No results found for "${debouncedQuery}"`}
        </div>
      )}

      {mode === "tags" && tagResults?.results && tagResults.results.length === 0 && debouncedQuery && !tagsLoading && (
        <div className="text-center py-20 text-muted-foreground">
          {tagResults.matchedKeywords.length === 0
            ? `No theme tags found for "${debouncedQuery}"`
            : hideTracked
              ? `No untracked titles for these tags. Try turning off "Hide items already on my watchlist".`
              : `No titles found for these tags.`}
        </div>
      )}

      {mode === "people" && peopleResults?.results && peopleResults.results.length === 0 && debouncedQuery && !peopleLoading && (
        <div className="text-center py-20 text-muted-foreground">
          {`No people found for "${debouncedQuery}"`}
        </div>
      )}
    </div>
  );
}
