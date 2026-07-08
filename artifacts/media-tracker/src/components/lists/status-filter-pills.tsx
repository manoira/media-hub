import type { GetWatchlistStatusItem } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { WATCHLIST_STATUS_OPTIONS } from "@/lib/watchlist-status";

interface StatusFilterPillsProps {
  selected: GetWatchlistStatusItem[];
  onChange: (statuses: GetWatchlistStatusItem[]) => void;
  className?: string;
}

export function StatusFilterPills({ selected, onChange, className }: StatusFilterPillsProps) {
  const toggle = (value: GetWatchlistStatusItem) => {
    if (selected.includes(value)) {
      onChange(selected.filter(s => s !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {WATCHLIST_STATUS_OPTIONS.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => toggle(option.value)}
            className={cn(
              "rounded-full border px-4 py-2 text-sm transition-all",
              active
                ? "border-primary bg-primary/15 font-medium text-foreground"
                : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
