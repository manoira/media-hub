import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookmarkPlus, EyeOff, Loader2 } from "lucide-react";
import {
  useAddToWatchlist,
  useUpdateWatchlistItem,
  useRemoveFromWatchlist,
  getGetWatchStatusQueryKey,
  getGetWatchlistQueryKey,
  getGetStatsSummaryQueryKey,
  WatchlistInputStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useWatchlistIndex } from "@/hooks/use-watchlist-index";
import {
  WATCHLIST_STATUS_BY_VALUE,
  WATCHLIST_STATUS_OPTIONS,
  WATCHLIST_BUTTON_DEFAULT_HOVER,
} from "@/lib/watchlist-status";

interface WatchlistButtonProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  className?: string;
}

export function WatchlistButton({ mediaType, tmdbId, className }: WatchlistButtonProps) {
  const queryClient = useQueryClient();
  const { getEntry, isLoading } = useWatchlistIndex();
  const entry = getEntry(mediaType, tmdbId);

  const addToWatchlist = useAddToWatchlist();
  const updateWatchlistItem = useUpdateWatchlistItem();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const isPending = addToWatchlist.isPending || updateWatchlistItem.isPending || removeFromWatchlist.isPending;

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId) });
    queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
  };

  const handleStatusChange = (newStatus: WatchlistInputStatus | null) => {
    if (!newStatus) {
      if (entry) {
        removeFromWatchlist.mutate({ id: entry.id }, { onSuccess: invalidateQueries });
      }
      return;
    }

    if (entry) {
      updateWatchlistItem.mutate(
        { id: entry.id, data: { status: newStatus } },
        { onSuccess: invalidateQueries },
      );
    } else {
      addToWatchlist.mutate(
        { data: { tmdbId, mediaType, status: newStatus } },
        { onSuccess: invalidateQueries },
      );
    }
  };

  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled className={className}>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading...
      </Button>
    );
  }

  const currentStatus = entry?.status;
  const activeConfig = currentStatus ? WATCHLIST_STATUS_BY_VALUE[currentStatus] : null;
  const ActiveIcon = activeConfig?.icon ?? BookmarkPlus;
  const hoverClass = activeConfig?.buttonHoverClass ?? WATCHLIST_BUTTON_DEFAULT_HOVER;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={currentStatus ? "outline" : "default"}
          size="sm"
          disabled={isPending}
          className={cn(
            className,
            "transition-all",
            hoverClass,
            currentStatus ? activeConfig?.buttonBg : "",
          )}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <ActiveIcon className={cn("w-4 h-4 mr-2", currentStatus ? activeConfig?.color : "")} />
          )}
          {activeConfig ? activeConfig.label : "Add to List"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {WATCHLIST_STATUS_OPTIONS.map((opt) => {
          const OptionIcon = opt.icon;
          return (
            <DropdownMenuItem key={opt.value} onClick={() => handleStatusChange(opt.value)}>
              <OptionIcon className={cn("w-4 h-4 mr-2", opt.color)} />
              {opt.label}
            </DropdownMenuItem>
          );
        })}
        {currentStatus && (
          <DropdownMenuItem
            onClick={() => handleStatusChange(null)}
            className="text-destructive focus:text-destructive"
          >
            <EyeOff className="w-4 h-4 mr-2" />
            Remove from List
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
