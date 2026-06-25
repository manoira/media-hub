import type { WatchlistInputStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { useWatchlistIndex } from "@/hooks/use-watchlist-index";
import { WATCHLIST_STATUS_BY_VALUE } from "@/lib/watchlist-status";

interface WatchStatusBadgeProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  status?: WatchlistInputStatus | null;
}

export function WatchStatusBadge({ mediaType, tmdbId, status: statusProp }: WatchStatusBadgeProps) {
  const { getEntry } = useWatchlistIndex();
  const status = statusProp ?? getEntry(mediaType, tmdbId)?.status;
  if (!status) return null;

  const config = WATCHLIST_STATUS_BY_VALUE[status];
  return (
    <Badge
      className={`absolute top-2 left-2 z-10 text-[10px] px-1.5 py-0.5 pointer-events-none ${config.badgeClass}`}
    >
      {config.label}
    </Badge>
  );
}
