import { Link } from "wouter";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, getTmdbImageUrl } from "@/lib/utils";
import { MediaItem, WatchlistItem, Genre } from "@workspace/api-client-react";
import { TvProgressBar } from "./tv-progress-bar";
import { WatchStatusBadge } from "./watch-status-badge";
import { CardHoverActions } from "./card-hover-actions";
import { QuickAddButton } from "./quick-add-button";
import { WATCHLIST_STATUS_BY_VALUE } from "@/lib/watchlist-status";

interface MediaCardProps {
  item: MediaItem | WatchlistItem;
  genres?: { movieGenres: Genre[]; tvGenres: Genre[] };
  className?: string;
  showStatus?: boolean;
  showProgress?: boolean;
  variant?: "default" | "tracking";
}

export function MediaCard({
  item,
  genres,
  className,
  showStatus = true,
  showProgress = false,
  variant = "default",
}: MediaCardProps) {
  const isWatchlistItem = "status" in item;
  const status = isWatchlistItem ? item.status : null;
  const userRating = isWatchlistItem ? item.userRating : null;
  const tmdbRating = item.voteAverage;

  const imageUrl = getTmdbImageUrl(item.posterPath, "poster");
  const statusConfig = status ? WATCHLIST_STATUS_BY_VALUE[status] : null;
  const detailHref = `/media/${item.mediaType}/${item.tmdbId}`;

  const isTracking = variant === "tracking";

  return (
    <div className={cn("group flex flex-col gap-2 relative", className)}>
      <div
        className={cn(
          "relative aspect-[2/3] overflow-hidden bg-muted transition-all duration-300",
          isTracking
            ? "rounded-2xl border border-border/40 shadow-lg group-hover:shadow-xl"
            : "rounded-lg shadow-sm group-hover:shadow-md group-hover:scale-[1.02]",
        )}
      >
        <Link href={detailHref} className="absolute inset-0 z-0 block">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={item.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground p-4 text-center">
              {item.title}
            </div>
          )}
        </Link>

        {isWatchlistItem && statusConfig && showStatus && (
          <Badge
            className={cn(
              "absolute top-3 left-3 z-10 shadow-lg pointer-events-none uppercase tracking-wide text-[11px]",
              statusConfig.badgeClass,
            )}
          >
            {statusConfig.label}
          </Badge>
        )}
        {!isWatchlistItem && showStatus && (
          <WatchStatusBadge mediaType={item.mediaType as "movie" | "tv"} tmdbId={item.tmdbId} />
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1 pointer-events-none">
          {tmdbRating != null && (
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-xs font-medium text-white">
              <Star className="w-3 h-3 text-primary fill-primary/80" />
              <span>{tmdbRating.toFixed(1)}</span>
            </div>
          )}
          {userRating != null && (
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-xs font-medium text-amber-400">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{userRating.toFixed(1)}</span>
            </div>
          )}
          {tmdbRating == null && userRating == null && (
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-xs font-medium text-white">
              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
              <span>NR</span>
            </div>
          )}
        </div>

        {isTracking && isWatchlistItem ? (
          <CardHoverActions
            detailHref={detailHref}
            mediaType={item.mediaType as "movie" | "tv"}
            tmdbId={item.tmdbId}
          />
        ) : (
          <>
            <div className="absolute bottom-2 right-2 z-20">
              <QuickAddButton mediaType={item.mediaType as "movie" | "tv"} tmdbId={item.tmdbId} />
            </div>

            {item.overview && (
              <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 pointer-events-none">
                <div className="text-white text-sm font-medium line-clamp-3 pr-12">{item.overview}</div>
              </div>
            )}
          </>
        )}
      </div>

      <Link href={detailHref} className="block px-1">
        <h3
          className={cn(
            "font-semibold leading-tight line-clamp-1 group-hover:text-primary transition-colors",
            isTracking ? "font-bold text-sm" : "text-sm",
          )}
        >
          {item.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.releaseDate ? new Date(item.releaseDate).getFullYear() : "TBA"} •{" "}
          {item.mediaType === "movie" ? "Movie" : "TV"}
        </p>
        {showProgress && item.mediaType === "tv" && <TvProgressBar tmdbId={item.tmdbId} />}
      </Link>
    </div>
  );
}
