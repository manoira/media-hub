import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  useUpdateWatchlistItem,
  getGetMediaDetailsQueryKey,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WatchlistItem } from "@workspace/api-client-react";

interface UserReviewPanelProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  entry: WatchlistItem | null | undefined;
}

const RATING_STEPS = Array.from({ length: 20 }, (_, i) => (i + 1) * 0.5);

export function UserReviewPanel({ mediaType, tmdbId, entry }: UserReviewPanelProps) {
  const queryClient = useQueryClient();
  const updateWatchlistItem = useUpdateWatchlistItem();

  const [rating, setRating] = useState<number | null>(entry?.userRating ?? null);
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setRating(entry?.userRating ?? null);
    setNotes(entry?.notes ?? "");
    setDirty(false);
  }, [entry?.id, entry?.userRating, entry?.notes]);

  if (!entry) {
    return (
      <section className="rounded-xl border border-border/50 bg-card/30 p-6">
        <h2 className="text-xl font-semibold mb-2">Your review</h2>
        <p className="text-muted-foreground text-sm">
          Add this title to your list to write a review and rate it.
        </p>
      </section>
    );
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMediaDetailsQueryKey(mediaType, tmdbId) });
    queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
  };

  const handleSave = () => {
    updateWatchlistItem.mutate(
      {
        id: entry.id,
        data: {
          userRating: rating,
          notes: notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setDirty(false);
          invalidate();
        },
      },
    );
  };

  const handleClear = () => {
    updateWatchlistItem.mutate(
      { id: entry.id, data: { userRating: null, notes: null } },
      {
        onSuccess: () => {
          setRating(null);
          setNotes("");
          setDirty(false);
          invalidate();
        },
      },
    );
  };

  const isPending = updateWatchlistItem.isPending;
  const hasReview = rating !== null || notes.trim().length > 0;

  return (
    <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
      <h2 className="text-xl font-semibold">Your review</h2>

      <div className="space-y-2">
        <Label htmlFor="user-rating">Your rating</Label>
        <div className="flex flex-wrap gap-1">
          {RATING_STEPS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setRating(value);
                setDirty(true);
              }}
              className={cn(
                "flex items-center gap-0.5 px-2 py-1 rounded text-xs font-medium transition-colors",
                rating === value
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground",
              )}
            >
              <Star className={cn("w-3 h-3", rating === value && "fill-amber-400 text-amber-400")} />
              {value.toFixed(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="user-review-text">Review</Label>
        <Textarea
          id="user-review-text"
          placeholder="What did you think?"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setDirty(true);
          }}
          rows={4}
          className="resize-y min-h-[100px]"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleSave} disabled={!dirty || isPending} size="sm">
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save review
        </Button>
        {hasReview && (
          <Button variant="outline" onClick={handleClear} disabled={isPending} size="sm">
            Clear
          </Button>
        )}
      </div>
    </section>
  );
}
