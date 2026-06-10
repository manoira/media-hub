import { useGetWatchlist, getGetWatchlistQueryKey, WatchlistItemStatus } from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

export function Watchlist() {
  const [status, setStatus] = useState<WatchlistItemStatus | undefined>();

  const { data: watchlist, isLoading } = useGetWatchlist(
    { status },
    { query: { queryKey: getGetWatchlistQueryKey({ status }) } }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">My List</h1>
        
        <Tabs value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? undefined : v as WatchlistItemStatus)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="watching">Watching</TabsTrigger>
            <TabsTrigger value="want_to_watch">Want to Watch</TabsTrigger>
            <TabsTrigger value="watched">Watched</TabsTrigger>
          </TabsList>
        </Tabs>
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
      ) : watchlist?.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {watchlist.map(item => (
            <MediaCard key={item.id} item={item} showProgress={item.mediaType === "tv"} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-xl border border-border/50">
          <p className="text-muted-foreground text-lg">Your list is empty.</p>
        </div>
      )}
    </div>
  );
}
