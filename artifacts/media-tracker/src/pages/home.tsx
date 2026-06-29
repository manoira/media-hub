import {
  useGetTrending, useGetGenres, useGetBrowseCategory,
  getGetTrendingQueryKey, getGetGenresQueryKey,
  getGetBrowseCategoryQueryKey,
  type GetBrowseCategoryParams,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { MediaSlider } from "@/components/media/media-slider";
import { HideTrackedToggle } from "@/components/media/hide-tracked-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useHideTrackedPreference } from "@/hooks/use-hide-tracked";
import { withExcludeTracked } from "@/lib/exclude-tracked";
import { useState } from "react";

function useBrowse(category: GetBrowseCategoryParams["category"], hideTracked: boolean) {
  const params = withExcludeTracked({ category }, hideTracked);
  return useGetBrowseCategory(params, {
    query: { queryKey: getGetBrowseCategoryQueryKey(params) },
  });
}

export function Home() {
  const [type, setType] = useState<"all" | "movie" | "tv">("all");
  const [timeWindow, setTimeWindow] = useState<"day" | "week">("week");
  const { hideTracked, setHideTracked } = useHideTrackedPreference();

  const trendingParams = withExcludeTracked({ type, time_window: timeWindow }, hideTracked);
  const { data: trending, isLoading: isLoadingTrending } = useGetTrending(
    trendingParams,
    { query: { queryKey: getGetTrendingQueryKey(trendingParams) } },
  );
  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });

  const { data: popularMovies, isLoading: loadingPopMovies }     = useBrowse("popular_movies", hideTracked);
  const { data: popularTv, isLoading: loadingPopTv }             = useBrowse("popular_tv", hideTracked);
  const { data: topRatedMovies, isLoading: loadingTopMovies }    = useBrowse("top_rated_movies", hideTracked);
  const { data: topRatedTv, isLoading: loadingTopTv }            = useBrowse("top_rated_tv", hideTracked);
  const { data: nowPlaying, isLoading: loadingNowPlaying }       = useBrowse("now_playing", hideTracked);
  const { data: upcoming, isLoading: loadingUpcoming }           = useBrowse("upcoming", hideTracked);
  const { data: onAir, isLoading: loadingOnAir }                 = useBrowse("on_air", hideTracked);

  return (
    <div className="space-y-10 pb-20">
      <HideTrackedToggle
        checked={hideTracked}
        onCheckedChange={setHideTracked}
        id="hide-tracked-home"
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

        {isLoadingTrending ? (
          <div className="flex gap-3 overflow-x-hidden pb-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-none w-[160px] space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : trending?.results && trending.results.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2" style={{ scrollbarWidth: "none" }}>
            {trending.results.map(item => (
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

      <MediaSlider title="Popular Movies"       items={popularMovies?.results}  isLoading={loadingPopMovies}    genres={genres} />
      <MediaSlider title="Popular TV Shows"     items={popularTv?.results}      isLoading={loadingPopTv}        genres={genres} />
      <MediaSlider title="Now Playing in Cinemas" items={nowPlaying?.results}   isLoading={loadingNowPlaying}   genres={genres} />
      <MediaSlider title="Coming Soon"          items={upcoming?.results}       isLoading={loadingUpcoming}     genres={genres} />
      <MediaSlider title="Top Rated Movies"     items={topRatedMovies?.results} isLoading={loadingTopMovies}    genres={genres} />
      <MediaSlider title="Currently Airing TV"  items={onAir?.results}          isLoading={loadingOnAir}        genres={genres} />
      <MediaSlider title="Top Rated TV Shows"   items={topRatedTv?.results}     isLoading={loadingTopTv}        genres={genres} />
    </div>
  );
}
