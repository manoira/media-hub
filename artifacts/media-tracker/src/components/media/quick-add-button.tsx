import { useState } from "react";
import { BookmarkPlus, BookmarkCheck, Eye, EyeOff, Loader2, ChevronDown } from "lucide-react";
import {
  useGetWatchStatus,
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

interface QuickAddButtonProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
}

const STATUS_OPTIONS: { value: WatchlistInputStatus; label: string; color: string }[] = [
  { value: "want_to_watch", label: "Want to Watch", color: "text-amber-400" },
  { value: "watching", label: "Watching", color: "text-blue-400" },
  { value: "watched", label: "Watched", color: "text-green-400" },
];

const STATUS_ICONS = {
  watching: Eye,
  watched: BookmarkCheck,
  want_to_watch: BookmarkPlus,
} as const;

const STATUS_COLORS = {
  watching: "text-blue-400",
  watched: "text-green-400",
  want_to_watch: "text-amber-400",
} as const;

export function QuickAddButton({ mediaType, tmdbId }: QuickAddButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: statusData } = useGetWatchStatus(mediaType, tmdbId, {
    query: { enabled: !!tmdbId, queryKey: getGetWatchStatusQueryKey(mediaType, tmdbId) },
  });

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
      if (statusData?.entry) {
        removeFromWatchlist.mutate({ id: statusData.entry.id }, { onSuccess: invalidate });
      }
      return;
    }
    if (statusData?.entry) {
      updateWatchlistItem.mutate(
        { id: statusData.entry.id, data: { status: newStatus } },
        { onSuccess: invalidate }
      );
    } else {
      addToWatchlist.mutate(
        { data: { tmdbId, mediaType, status: newStatus } },
        { onSuccess: invalidate }
      );
    }
  };

  const currentStatus = statusData?.entry?.status;
  const Icon = currentStatus ? STATUS_ICONS[currentStatus] : BookmarkPlus;
  const iconColor = currentStatus ? STATUS_COLORS[currentStatus] : "text-white";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={isPending}
          className={cn(
            "flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all",
            "bg-black/70 backdrop-blur-sm border border-white/10",
            "hover:bg-black/90 hover:border-white/30",
            currentStatus ? "opacity-100" : "opacity-90 hover:opacity-100"
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
      >
        {STATUS_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onSelect={() => handleSelect(opt.value)}
            className={cn("cursor-pointer", currentStatus === opt.value && "bg-muted")}
          >
            {opt.value === "want_to_watch" && <BookmarkPlus className={cn("w-4 h-4 mr-2", opt.color)} />}
            {opt.value === "watching" && <Eye className={cn("w-4 h-4 mr-2", opt.color)} />}
            {opt.value === "watched" && <BookmarkCheck className={cn("w-4 h-4 mr-2", opt.color)} />}
            {opt.label}
            {currentStatus === opt.value && <span className="ml-auto text-[10px] text-muted-foreground">✓</span>}
          </DropdownMenuItem>
        ))}
        {currentStatus && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handleSelect(null)}
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
