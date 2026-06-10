import { useGetTrending, useGetGenres, useGetStatsSummary, useGetRecentlyWatched, getGetTrendingQueryKey, getGetGenresQueryKey, getGetStatsSummaryQueryKey, getGetRecentlyWatchedQueryKey } from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link } from "wouter";

export function Home() {
  const [type, setType] = useState<"all" | "movie" | "tv">("all");
  const [timeWindow, setTimeWindow] = useState<"day" | "week">("week");

  const { data: trending, isLoading: isLoadingTrending } = useGetTrending(
    { type, time_window: timeWindow },
    { query: { queryKey: getGetTrendingQueryKey({ type, time_window: timeWindow }) } }
  );

  const { data: genres } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });
  
  const { data: stats } = useGetStatsSummary({ query: { queryKey: getGetStatsSummaryQueryKey() } });
  const { data: recent } = useGetRecentlyWatched({ limit: 4 }, { query: { queryKey: getGetRecentlyWatchedQueryKey({ limit: 4 }) } });

  return (
    <div className="space-y-10 pb-20">
      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-primary/50 transition-colors">
            <span className="text-3xl font-bold text-primary">{stats.totalItems}</span>
            <span className="text-sm text-muted-foreground">Total Tracked</span>
          </div>
          <div className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-green-500/50 transition-colors">
            <span className="text-3xl font-bold text-green-500">{stats.totalWatched}</span>
            <span className="text-sm text-muted-foreground">Watched</span>
          </div>
          <div className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-blue-500/50 transition-colors">
            <span className="text-3xl font-bold text-blue-500">{stats.totalWatching}</span>
            <span className="text-sm text-muted-foreground">Watching</span>
          </div>
          <div className="bg-card border rounded-xl p-4 flex flex-col items-center justify-center text-center hover:border-amber-500/50 transition-colors">
            <span className="text-3xl font-bold text-amber-500">{stats.totalWantToWatch}</span>
            <span className="text-sm text-muted-foreground">Want to Watch</span>
          </div>
        </section>
      )}

      {recent && recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Recently Tracked</h2>
            <Button variant="ghost" asChild><Link href="/watchlist">View All</Link></Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {recent.map(item => (
              <MediaCard key={item.id} item={item} genres={genres} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold">Trending</h2>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : trending?.results ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {trending.results.map(item => (
              <MediaCard key={item.tmdbId} item={item} genres={genres} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
