import { useState } from "react";
import { BookmarkPlus, EyeOff, Loader2, ChevronDown } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWatchlistIndex } from "@/hooks/use-watchlist-index";
import {
  WATCHLIST_STATUS_BY_VALUE,
  WATCHLIST_STATUS_OPTIONS,
  QUICK_ADD_DEFAULT_HOVER,
} from "@/lib/watchlist-status";

interface QuickAddButtonProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  className?: string;
}

export function QuickAddButton({ mediaType, tmdbId, className }: QuickAddButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { getEntry } = useWatchlistIndex();
  const entry = getEntry(mediaType, tmdbId);

  const addToWatchlist = useAddToWatchlist();
  const updateWatchlistItem = useUpdateWatchlistItem();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const isPending = addToWatchlist.isPending || updateWatchlistItem.isPending || removeFromWatchlist.isPending;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId) });
    queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetStatsSummaryQueryKey() });
  };

  const handleSelect = (newStatus: WatchlistInputStatus | null) => {
    setOpen(false);
    if (!newStatus) {
      if (entry) {
        removeFromWatchlist.mutate({ id: entry.id }, { onSuccess: invalidate });
      }
      return;
    }
    if (entry) {
      updateWatchlistItem.mutate(
        { id: entry.id, data: { status: newStatus } },
        { onSuccess: invalidate },
      );
    } else {
      addToWatchlist.mutate(
        { data: { tmdbId, mediaType, status: newStatus } },
        { onSuccess: invalidate },
      );
    }
  };

  const currentStatus = entry?.status;
  const activeConfig = currentStatus ? WATCHLIST_STATUS_BY_VALUE[currentStatus] : null;
  const Icon = activeConfig?.icon ?? BookmarkPlus;
  const iconColor = activeConfig?.color ?? "text-white";
  const hoverClass = activeConfig?.quickAddHoverClass ?? QUICK_ADD_DEFAULT_HOVER;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Add to list"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={isPending}
          className={cn(
            "flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all",
            "bg-black/70 backdrop-blur-sm border border-white/10",
            hoverClass,
            className,
          )}
        >
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
          ) : (
            <Icon className={cn("w-3.5 h-3.5", iconColor)} />
          )}
          <ChevronDown className="w-2.5 h-2.5 text-white/60 ml-0.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="top"
        className="w-44 z-50"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {WATCHLIST_STATUS_OPTIONS.map((opt) => {
          const OptionIcon = opt.icon;
          return (
            <DropdownMenuItem
              key={opt.value}
              onSelect={() => handleSelect(opt.value)}
              onPointerDown={(e) => e.stopPropagation()}
              className={cn("cursor-pointer", currentStatus === opt.value && "bg-muted")}
            >
              <OptionIcon className={cn("w-4 h-4 mr-2", opt.color)} />
              {opt.label}
              {currentStatus === opt.value && (
                <span className="ml-auto text-[10px] text-muted-foreground">✓</span>
              )}
            </DropdownMenuItem>
          );
        })}
        {currentStatus && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleSelect(null)}
              onPointerDown={(e) => e.stopPropagation()}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <EyeOff className="w-4 h-4 mr-2" />
              Remove from List
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
