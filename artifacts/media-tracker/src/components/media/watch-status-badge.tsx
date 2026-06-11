import { useGetWatchStatus, getGetWatchStatusQueryKey } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

interface WatchStatusBadgeProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
}

const STATUS_CONFIG = {
  watching: { label: "Watching", className: "bg-blue-500 text-white border-0 shadow-md" },
  watched: { label: "Watched", className: "bg-green-500 text-white border-0 shadow-md" },
  want_to_watch: { label: "Want to Watch", className: "bg-amber-500 text-white border-0 shadow-md" },
} as const;

export function WatchStatusBadge({ mediaType, tmdbId }: WatchStatusBadgeProps) {
  const { data } = useGetWatchStatus(mediaType, tmdbId, {
    query: {
      enabled: !!tmdbId,
      queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId),
    },
  });

  const status = data?.entry?.status;
  if (!status) return null;

  const config = STATUS_CONFIG[status];
  return (
    <Badge className={`absolute top-2 left-2 text-[10px] px-1.5 py-0.5 ${config.className}`}>
      {config.label}
    </Badge>
  );
}
