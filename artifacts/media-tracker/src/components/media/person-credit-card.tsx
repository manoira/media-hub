import { Link } from "wouter";
import { Star } from "lucide-react";
import { cn, getTmdbImageUrl } from "@/lib/utils";
import { PersonCredit } from "@workspace/api-client-react";
import { QuickAddButton } from "./quick-add-button";

interface PersonCreditCardProps {
  credit: PersonCredit;
  className?: string;
}

export function PersonCreditCard({ credit, className }: PersonCreditCardProps) {
  const imageUrl = getTmdbImageUrl(credit.posterPath, "poster");

  return (
    <Link
      href={`/media/${credit.mediaType}/${credit.tmdbId}`}
      className={cn("group flex flex-col gap-2", className)}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:scale-[1.02]">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={credit.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-card text-muted-foreground p-4 text-center">
            {credit.title}
          </div>
        )}

        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-xs font-medium text-white">
          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
          <span>{credit.voteAverage ? credit.voteAverage.toFixed(1) : "NR"}</span>
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3 gap-2">
          <div className="text-white text-sm font-medium line-clamp-2">{credit.overview}</div>
          <div className="flex justify-end">
            <QuickAddButton mediaType={credit.mediaType} tmdbId={credit.tmdbId} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
          {credit.title}
        </h3>
        {credit.character && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">as {credit.character}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {credit.releaseDate ? new Date(credit.releaseDate).getFullYear() : "TBA"} • {credit.mediaType === "movie" ? "Movie" : "TV"}
        </p>
      </div>
    </Link>
  );
}
