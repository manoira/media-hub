import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CardHoverActionsProps {
  detailHref: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  className?: string;
}

export function CardHoverActions({
  detailHref,
  mediaType,
  tmdbId,
  className,
}: CardHoverActionsProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-20 flex flex-col justify-end gap-2 bg-gradient-to-t from-black via-black/40 to-transparent p-4",
        "opacity-0 transition-opacity duration-300 group-hover:opacity-100",
        className,
      )}
    >
      <Link href={detailHref}>
        <Button size="sm" className="w-full bg-white text-black hover:bg-white/90 font-semibold">
          Edit Details
        </Button>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="secondary"
            className="w-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm"
          >
            Quick Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={detailHref}>Open details</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/media/${mediaType}/${tmdbId}`}>View on TMDB page</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
