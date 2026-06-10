import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookmarkPlus, BookmarkCheck, Eye, EyeOff, Loader2 } from "lucide-react";
import { 
  useGetWatchStatus, 
  useAddToWatchlist, 
  useUpdateWatchlistItem, 
  useRemoveFromWatchlist,
  getGetWatchStatusQueryKey,
  getGetWatchlistQueryKey,
  getGetStatsSummaryQueryKey,
  WatchlistInputStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

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

  const statusConfig = {
    watching: { icon: Eye, label: "Watching", color: "text-blue-500", bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30" },
    watched: { icon: BookmarkCheck, label: "Watched", color: "text-green-500", bg: "bg-green-500/10 hover:bg-green-500/20 border-green-500/30" },
    want_to_watch: { icon: BookmarkPlus, label: "Want to Watch", color: "text-amber-500", bg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30" },
  };

  const activeConfig = currentStatus ? statusConfig[currentStatus] : null;
  const ActiveIcon = activeConfig ? activeConfig.icon : BookmarkPlus;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant={currentStatus ? "outline" : "default"} 
          size="sm" 
          disabled={isPending}
          className={cn(className, currentStatus ? activeConfig?.bg : "")}
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
        <DropdownMenuItem onClick={() => handleStatusChange("want_to_watch")}>
          <BookmarkPlus className="w-4 h-4 mr-2 text-amber-500" />
          Want to Watch
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("watching")}>
          <Eye className="w-4 h-4 mr-2 text-blue-500" />
          Watching
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("watched")}>
          <BookmarkCheck className="w-4 h-4 mr-2 text-green-500" />
          Watched
        </DropdownMenuItem>
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
