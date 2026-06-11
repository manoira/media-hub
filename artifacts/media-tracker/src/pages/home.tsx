import {
  useGetTrending, useGetGenres, useGetStatsSummary, useGetRecentlyWatched, useGetBrowseCategory,
  getGetTrendingQueryKey, getGetGenresQueryKey, getGetStatsSummaryQueryKey, getGetRecentlyWatchedQueryKey,
  getGetBrowseCategoryQueryKey,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { MediaSlider } from "@/components/media/media-slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "wouter";

function useBrowse(category: string) {
  return useGetBrowseCategory(
    { category } as Parameters<typeof useGetBrowseCategory>[0],
    { query: { queryKey: getGetBrowseCategoryQueryKey({ category } as Parameters<typeof getGetBrowseCategoryQueryKey>[0]) } }
  );
}

export function Home() {
  const [type, setType] = useState<"all" | "movie" | "tv">("all");
  const [timeWindow, setTimeWindow] = useState<"day" | "week">("week");

  const { data: trending, isLoading: isLoadingTrending } = useGetTrending(
    { type, time_window: timeWindow },
    { query: { queryKey: getGetTrendingQueryKey({ type, time_window: timeWindow }) } }
  );
  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });
  const { data: stats } = useGetStatsSummary({ query: { queryKey: getGetStatsSummaryQueryKey() } });
  const { data: recent } = useGetRecentlyWatched({ limit: 8 }, { query: { queryKey: getGetRecentlyWatchedQueryKey({ limit: 8 }) } });

  const { data: popularMovies, isLoading: loadingPopMovies }     = useBrowse("popular_movies");
  const { data: popularTv, isLoading: loadingPopTv }             = useBrowse("popular_tv");
  const { data: topRatedMovies, isLoading: loadingTopMovies }    = useBrowse("top_rated_movies");
  const { data: topRatedTv, isLoading: loadingTopTv }            = useBrowse("top_rated_tv");
  const { data: nowPlaying, isLoading: loadingNowPlaying }       = useBrowse("now_playing");
  const { data: upcoming, isLoading: loadingUpcoming }           = useBrowse("upcoming");
  const { data: onAir, isLoading: loadingOnAir }                 = useBrowse("on_air");

  return (
    <div className="space-y-10 pb-20">
      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/watchlist" className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-3xl font-bold text-primary">{stats.totalItems}</span>
            <span className="text-sm text-muted-foreground">Total Tracked</span>
          </Link>
          <Link href="/watchlist?status=watched" className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-green-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-3xl font-bold text-green-500">{stats.totalWatched}</span>
            <span className="text-sm text-muted-foreground">Watched</span>
          </Link>
          <Link href="/watchlist?status=watching" className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-blue-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-3xl font-bold text-blue-500">{stats.totalWatching}</span>
            <span className="text-sm text-muted-foreground">Watching</span>
          </Link>
          <Link href="/watchlist?status=want_to_watch" className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-amber-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-3xl font-bold text-amber-500">{stats.totalWantToWatch}</span>
            <span className="text-sm text-muted-foreground">Want to Watch</span>
          </Link>
        </section>
      )}

      {recent && recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Continue Watching</h2>
            <Button variant="ghost" size="sm" asChild><Link href="/watchlist">View All</Link></Button>
          </div>
          <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2" style={{ scrollbarWidth: "none" }}>
            {recent.map(item => (
              <div key={item.id} className="flex-none w-[160px]">
                <MediaCard key={item.id} item={item} genres={genres} />
              </div>
            ))}
          </div>
        </section>
      )}

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
        ) : trending?.results ? (
          <div className="flex gap-3 overflow-x-auto scroll-smooth pb-2" style={{ scrollbarWidth: "none" }}>
            {trending.results.map(item => (
              <div key={item.tmdbId} className="flex-none w-[160px]">
                <MediaCard item={item} genres={genres} />
              </div>
            ))}
          </div>
        ) : null}
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
