import {
  useGetHomeFeed,
  getGetHomeFeedQueryKey,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { MediaSlider } from "@/components/media/media-slider";
import { ContentFilterToggles } from "@/components/media/content-filter-toggles";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useHideTrackedPreference } from "@/hooks/use-hide-tracked";
import { useHideAdultPreference } from "@/hooks/use-hide-adult";
import { withContentFilters } from "@/lib/content-filters";
import { useMemo, useState } from "react";

export function Home() {
  const [type, setType] = useState<"all" | "movie" | "tv">("all");
  const [timeWindow, setTimeWindow] = useState<"day" | "week">("week");
  const { hideTracked, setHideTracked } = useHideTrackedPreference();
  const { hideAdult, setHideAdult } = useHideAdultPreference();

  const homeParams = useMemo(
    () => withContentFilters({ type, time_window: timeWindow }, { hideTracked, hideAdult }),
    [type, timeWindow, hideTracked, hideAdult],
  );

  const { data: homeFeed, isLoading } = useGetHomeFeed(homeParams, {
    query: { queryKey: getGetHomeFeedQueryKey(homeParams) },
  });

  const genres = homeFeed?.genres;

  return (
    <div className="space-y-10 pb-20">
      <ContentFilterToggles
        hideAdult={hideAdult}
        onHideAdultChange={setHideAdult}
        hideTracked={hideTracked}
        onHideTrackedChange={setHideTracked}
        idPrefix="home"
      />

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold">Trending</h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-muted rounded-md p-1">
              <Button variant={type === "all" ? "default" : "ghost"} size="sm" onClick={() => setType("all")}>All</Button>
              <Button variant={type === "movie" ? "default" : "ghost"} size="sm" onClick={() => setType("movie")}>Movies</Button>
              <Button variant={type === "tv" ? "default" : "ghost"} size="sm" onClick={() => setType("tv")}>TV</Button>
            </div>
            <div className="flex bg-muted rounded-md p-1">
              <Button variant={timeWindow === "day" ? "default" : "ghost"} size="sm" onClick={() => setTimeWindow("day")}>Today</Button>
              <Button variant={timeWindow === "week" ? "default" : "ghost"} size="sm" onClick={() => setTimeWindow("week")}>This Week</Button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex gap-3 overflow-x-hidden pb-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-none w-[160px] space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : homeFeed?.trending?.results && homeFeed.trending.results.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2" style={{ scrollbarWidth: "none" }}>
            {homeFeed.trending.results.map(item => (
              <div key={item.tmdbId} className="flex-none w-[160px]">
                <MediaCard item={item} genres={genres} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {hideTracked
              ? "No untracked trending items right now. Turn off the filter to see everything."
              : "No trending items right now."}
          </p>
        )}
      </section>

      <MediaSlider title="Popular Movies" items={homeFeed?.popularMovies?.results} isLoading={isLoading} genres={genres} />
      <MediaSlider title="Popular TV Shows" items={homeFeed?.popularTv?.results} isLoading={isLoading} genres={genres} />
      {(isLoading || (homeFeed?.watchlistRecommendations?.results?.length ?? 0) > 0) && (
        <MediaSlider
          title="More of what you like"
          items={homeFeed?.watchlistRecommendations?.results}
          isLoading={isLoading}
          genres={genres}
        />
      )}
      <MediaSlider title="Now Playing in Cinemas" items={homeFeed?.nowPlaying?.results} isLoading={isLoading} genres={genres} />
      <MediaSlider title="Coming Soon" items={homeFeed?.upcoming?.results} isLoading={isLoading} genres={genres} />
      <MediaSlider title="Top Rated Movies" items={homeFeed?.topRatedMovies?.results} isLoading={isLoading} genres={genres} />
      <MediaSlider title="Currently Airing TV" items={homeFeed?.onAir?.results} isLoading={isLoading} genres={genres} />
      <MediaSlider title="Top Rated TV Shows" items={homeFeed?.topRatedTv?.results} isLoading={isLoading} genres={genres} />
    </div>
  );
}
