import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookmarkPlus, EyeOff, Loader2 } from "lucide-react";
import { 
  useGetWatchStatus, 
  useAddToWatchlist, 
  useUpdateWatchlistItem, 
  useRemoveFromWatchlist,
  getGetWatchStatusQueryKey,
  getGetStatsSummaryQueryKey,
  WatchlistInputStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { WATCHLIST_STATUS_BY_VALUE, WATCHLIST_STATUS_OPTIONS } from "@/lib/watchlist-status";

interface WatchlistButtonProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  className?: string;
}

export function WatchlistButton({ mediaType, tmdbId, className }: WatchlistButtonProps) {
  const queryClient = useQueryClient();
  
  const { data: statusData, isLoading } = useGetWatchStatus(mediaType, tmdbId, {
    query: {
      enabled: !!tmdbId,
      queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId)
    }
  });

  const addToWatchlist = useAddToWatchlist();
  const updateWatchlistItem = useUpdateWatchlistItem();
  const removeFromWatchlist = useRemoveFromWatchlist();

  const isPending = addToWatchlist.isPending || updateWatchlistItem.isPending || removeFromWatchlist.isPending;

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId) });
    queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
  };

  const handleStatusChange = (newStatus: WatchlistInputStatus | null) => {
    if (!newStatus) {
      if (statusData?.entry) {
        removeFromWatchlist.mutate(
          { id: statusData.entry.id },
          { onSuccess: invalidateQueries }
        );
      }
      return;
    }

    if (statusData?.entry) {
      updateWatchlistItem.mutate(
        { id: statusData.entry.id, data: { status: newStatus } },
        { onSuccess: invalidateQueries }
      );
    } else {
      addToWatchlist.mutate(
        { data: { tmdbId, mediaType, status: newStatus } },
        { onSuccess: invalidateQueries }
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

  const currentStatus = statusData?.entry?.status;
  const activeConfig = currentStatus ? WATCHLIST_STATUS_BY_VALUE[currentStatus] : null;
  const ActiveIcon = activeConfig?.icon ?? BookmarkPlus;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={currentStatus ? "outline" : "default"} 
          size="sm" 
          disabled={isPending}
          className={cn(className, currentStatus ? activeConfig?.buttonBg : "")}
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
          <DropdownMenuItem onClick={() => handleStatusChange(null)} className="text-destructive focus:text-destructive">
            <EyeOff className="w-4 h-4 mr-2" />
            Remove from List
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
