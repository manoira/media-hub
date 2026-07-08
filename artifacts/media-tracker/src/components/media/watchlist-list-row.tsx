import { Link } from "wouter";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, getTmdbImageUrl } from "@/lib/utils";
import type { WatchlistItem } from "@workspace/api-client-react";
import { WATCHLIST_STATUS_BY_VALUE } from "@/lib/watchlist-status";
import { TvProgressBar } from "./tv-progress-bar";

interface WatchlistListRowProps {
  item: WatchlistItem;
  className?: string;
  showProgress?: boolean;
}

export function WatchlistListRow({ item, className, showProgress = false }: WatchlistListRowProps) {
  const imageUrl = getTmdbImageUrl(item.posterPath, "poster");
  const statusConfig = WATCHLIST_STATUS_BY_VALUE[item.status];
  const detailHref = `/media/${item.mediaType}/${item.tmdbId}`;
  const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : "TBA";

  return (
    <Link
      href={detailHref}
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-border/50 bg-card/40 p-3 transition-colors hover:border-primary/30 hover:bg-card/70",
        className,
      )}
    >
      <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
        {imageUrl ? (
          <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
            {item.title}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold group-hover:text-primary transition-colors">{item.title}</h3>
          {statusConfig ? (
            <Badge className={cn("text-[10px]", statusConfig.badgeClass)}>{statusConfig.label}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {year} · {item.mediaType === "movie" ? "Movie" : "TV"}
        </p>
        {showProgress && item.mediaType === "tv" ? <TvProgressBar tmdbId={item.tmdbId} /> : null}
      </div>

      {item.voteAverage != null ? (
        <div className="flex shrink-0 items-center gap-1 text-sm font-medium">
          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
          {item.voteAverage.toFixed(1)}
        </div>
      ) : null}
    </Link>
  );
}
