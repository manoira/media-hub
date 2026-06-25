import { useMemo } from "react";
import {
  useGetWatchlist,
  getGetWatchlistQueryKey,
  type WatchlistInputStatus,
} from "@workspace/api-client-react";

export function watchlistMediaKey(mediaType: "movie" | "tv", tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

export type WatchlistIndexEntry = {
  id: number;
  status: WatchlistInputStatus;
};

export function useWatchlistIndex() {
  const { data: watchlist, isLoading, isFetching } = useGetWatchlist(undefined, {
    query: {
      queryKey: getGetWatchlistQueryKey(),
      staleTime: 60_000,
    },
  });

  const index = useMemo(() => {
    const map = new Map<string, WatchlistIndexEntry>();
    for (const item of watchlist ?? []) {
      map.set(watchlistMediaKey(item.mediaType as "movie" | "tv", item.tmdbId), {
        id: item.id,
        status: item.status as WatchlistInputStatus,
      });
    }
    return map;
  }, [watchlist]);

  const getEntry = (mediaType: "movie" | "tv", tmdbId: number) =>
    index.get(watchlistMediaKey(mediaType, tmdbId));

  const isTracked = (mediaType: "movie" | "tv", tmdbId: number) =>
    index.has(watchlistMediaKey(mediaType, tmdbId));

  return { index, getEntry, isTracked, isLoading, isFetching };
}

export function filterUntracked<T extends { mediaType: string; tmdbId: number }>(
  items: T[],
  index: Map<string, WatchlistIndexEntry>,
  hideTracked: boolean,
): T[] {
  if (!hideTracked) return items;
  return items.filter(
    (item) => !index.has(watchlistMediaKey(item.mediaType as "movie" | "tv", item.tmdbId)),
  );
}
