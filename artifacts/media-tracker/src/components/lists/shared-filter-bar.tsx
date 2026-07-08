import { ReactNode, useState } from "react";
import {
  ArrowDownUp,
  Filter,
  Grid2X2,
  LayoutList,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ListViewMode } from "@/hooks/use-list-view-mode";

export type MediaTypeTab = "all" | "movie" | "tv";

interface SortOption {
  value: string;
  label: string;
}

interface SharedFilterBarProps {
  mediaType: MediaTypeTab;
  onMediaTypeChange: (type: MediaTypeTab) => void;
  itemCount: number;
  itemLabel?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  viewMode?: ListViewMode;
  onViewModeChange?: (mode: ListViewMode) => void;
  sortLabel: string;
  sortOptions: SortOption[];
  currentSort: string;
  onSortChange: (value: string) => void;
  filterPanel: ReactNode;
  filterActive?: boolean;
  trailing?: ReactNode;
  className?: string;
}

export function SharedFilterBar({
  mediaType,
  onMediaTypeChange,
  itemCount,
  itemLabel = "Items",
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search...",
  viewMode,
  onViewModeChange,
  sortLabel,
  sortOptions,
  currentSort,
  onSortChange,
  filterPanel,
  filterActive = false,
  trailing,
  className,
}: SharedFilterBarProps) {
  const [filterOpen, setFilterOpen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-2xl border border-border/60 bg-card/40 p-4",
        className,
      )}
    >
      <div className="flex rounded-lg border border-border/40 bg-muted/50 p-1">
        {(["all", "movie", "tv"] as const).map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={mediaType === type ? "secondary" : "ghost"}
            className="h-7 px-3 text-xs"
            onClick={() => onMediaTypeChange(type)}
          >
            {type === "all" ? "All" : type === "movie" ? "Movies" : "TV-Series"}
          </Button>
        ))}
      </div>

      <span className="text-xs font-medium text-muted-foreground">
        {itemCount} {itemLabel}
      </span>

      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 border-border/40 bg-muted/30 pl-9 pr-8 text-xs"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {viewMode && onViewModeChange ? (
          <div className="flex rounded-lg border border-border/40 bg-muted/50 p-1">
            <Button
              type="button"
              size="icon"
              variant={viewMode === "list" ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
            >
              <LayoutList className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              className="h-7 w-7"
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
            >
              <Grid2X2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}

        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-8 gap-2 text-xs", filterActive && "border-primary")}
            >
              <Filter className="h-3.5 w-3.5 text-primary" />
              Filter
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            {filterPanel}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sort: ${sortLabel}`}>
              <ArrowDownUp className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {sortOptions.map((opt) => (
              <DropdownMenuItem
                key={opt.value}
                className={cn("cursor-pointer", currentSort === opt.value && "bg-muted")}
                onClick={() => onSortChange(opt.value)}
              >
                {opt.label}
                {currentSort === opt.value ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">✓</span>
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {trailing}
      </div>
    </div>
  );
}
