import { Link } from "wouter";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, getTmdbImageUrl } from "@/lib/utils";
import { MediaItem, WatchlistItem, Genre } from "@workspace/api-client-react";

interface MediaCardProps {
  item: MediaItem | WatchlistItem;
  genres?: { movieGenres: Genre[]; tvGenres: Genre[] };
  className?: string;
  showStatus?: boolean;
}

export function MediaCard({ item, genres, className, showStatus = true }: MediaCardProps) {
  const isWatchlistItem = "status" in item;
  const status = isWatchlistItem ? item.status : null;
  const rating = isWatchlistItem ? item.userRating : item.voteAverage;

  const imageUrl = getTmdbImageUrl(item.posterPath, "poster");
  
  const statusColors = {
    watching: "bg-blue-500 hover:bg-blue-600",
    watched: "bg-green-500 hover:bg-green-600",
    want_to_watch: "bg-amber-500 hover:bg-amber-600",
  };

  const statusLabels = {
    watching: "Watching",
    watched: "Watched",
    want_to_watch: "Want to Watch",
  };

  return (
    <Link href={`/media/${item.mediaType}/${item.tmdbId}`} className={cn("group flex flex-col gap-2 relative", className)}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:scale-[1.02]">
        {imageUrl ? (
          <img src={imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground p-4 text-center">
            {item.title}
          </div>
        )}
        
        {isWatchlistItem && status && showStatus && (
          <Badge className={cn("absolute top-2 left-2 shadow-md", statusColors[status])}>
            {statusLabels[status]}
          </Badge>
        )}
        
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-xs font-medium text-white">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          <span>{rating ? rating.toFixed(1) : "NR"}</span>
        </div>
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
          <div className="text-white text-sm font-medium line-clamp-2">{item.overview}</div>
        </div>
      </div>
      
      <div>
        <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">{item.title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {item.releaseDate ? new Date(item.releaseDate).getFullYear() : "TBA"} • {item.mediaType === "movie" ? "Movie" : "TV"}
        </p>
      </div>
    </Link>
  );
}
