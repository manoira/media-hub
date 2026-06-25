import { useGetWatchStatus, getGetWatchStatusQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { WATCHLIST_STATUS_BY_VALUE } from "@/lib/watchlist-status";

interface WatchStatusBadgeProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
}

export function WatchStatusBadge({ mediaType, tmdbId }: WatchStatusBadgeProps) {
  const { data } = useGetWatchStatus(mediaType, tmdbId, {
    query: {
      enabled: !!tmdbId,
      queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId),
    },
  });

  const status = data?.entry?.status;
  if (!status) return null;

  const config = WATCHLIST_STATUS_BY_VALUE[status];
  return (
    <Badge className={`absolute top-2 left-2 text-[10px] px-1.5 py-0.5 ${config.badgeClass}`}>
      {config.label}
    </Badge>
  );
}
