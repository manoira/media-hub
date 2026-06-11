import { useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MediaCard } from "./media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MediaItem, Genre } from "@workspace/api-client-react";

interface MediaSliderProps {
  title: string;
  items?: MediaItem[];
  isLoading?: boolean;
  genres?: { movieGenres: Genre[]; tvGenres: Genre[] };
  className?: string;
}

const CARD_WIDTH = 160;
const SCROLL_AMOUNT = CARD_WIDTH * 4 + 12 * 4;

export function MediaSlider({ title, items, isLoading, genres, className }: MediaSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -SCROLL_AMOUNT : SCROLL_AMOUNT, behavior: "smooth" });
  };

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="p-1.5 rounded-full bg-muted hover:bg-muted/80 disabled:opacity-30 disabled:cursor-default transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="p-1.5 rounded-full bg-muted hover:bg-muted/80 disabled:opacity-30 disabled:cursor-default transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex gap-3 overflow-x-auto scroll-smooth pb-2 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {isLoading
          ? Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex-none w-[160px] space-y-2">
                <Skeleton className="aspect-[2/3] w-full rounded-lg" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))
          : items?.map(item => (
              <div key={item.tmdbId} className="flex-none w-[160px]">
                <MediaCard item={item} genres={genres} />
              </div>
            ))
        }
      </div>
    </section>
  );
}
