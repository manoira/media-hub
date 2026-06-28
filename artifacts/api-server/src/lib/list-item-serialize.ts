import type { customListItemsTable, watchlistTable } from "@workspace/db";
import { serializeWatchlistItem } from "./watchlist-item";

type StoredListItem = typeof customListItemsTable.$inferSelect;
type WatchlistRow = typeof watchlistTable.$inferSelect;

export function serializeCustomListDisplayItem(
  listItem: StoredListItem | null,
  watchlist: WatchlistRow | null,
) {
  if (watchlist) {
    return {
      listItemId: listItem?.id ?? null,
      tracked: true as const,
      ...serializeWatchlistItem(watchlist),
    };
  }

  if (!listItem) {
    throw new Error("List item requires watchlist or stored row");
  }

  return {
    listItemId: listItem.id,
    tracked: false as const,
    tmdbId: listItem.tmdbId!,
    mediaType: listItem.mediaType as "movie" | "tv",
    title: listItem.title ?? "Unknown",
    posterPath: listItem.posterPath ?? null,
    backdropPath: null,
    releaseDate: listItem.releaseDate ?? null,
    originalLanguage: null,
    voteAverage: listItem.voteAverage ?? null,
    genreIds: [] as number[],
    keywordIds: [] as number[],
    overview: null,
  };
}

export function watchlistRowToListItemValues(
  listId: number,
  item: WatchlistRow,
) {
  return {
    listId,
    watchlistId: item.id,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath,
    releaseDate: item.releaseDate,
    voteAverage: item.voteAverage,
  };
}
