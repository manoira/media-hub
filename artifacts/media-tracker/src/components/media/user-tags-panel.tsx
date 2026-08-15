import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUpdateWatchlistItem,
  getGetMediaDetailsQueryKey,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import type { WatchlistItem } from "@workspace/api-client-react";

interface UserTagsPanelProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  entry: WatchlistItem | null | undefined;
}

const MAX_TAG_LENGTH = 50;
const MAX_TAGS = 32;

function normalizeTag(raw: string): string | null {
  const tag = raw.trim().replace(/\s+/g, " ");
  if (!tag || tag.length > MAX_TAG_LENGTH) return null;
  return tag;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((tag, index) => tag === b[index]);
}

export function UserTagsPanel({ mediaType, tmdbId, entry }: UserTagsPanelProps) {
  const queryClient = useQueryClient();
  const updateWatchlistItem = useUpdateWatchlistItem();
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [input, setInput] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTags(entry?.tags ?? []);
    setInput("");
    setDirty(false);
  }, [entry?.id, entry?.tags]);

  if (!entry) {
    return (
      <section className="rounded-xl border border-border/50 bg-card/30 p-6">
        <h2 className="text-xl font-semibold mb-2">Your tags</h2>
        <p className="text-muted-foreground text-sm">
          Add this title to your list to create your own tags.
        </p>
      </section>
    );
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetMediaDetailsQueryKey(mediaType, tmdbId) });
    queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
  };

  const commitTags = (nextTags: string[]) => {
    const normalized = normalizeTags(nextTags);
    updateWatchlistItem.mutate(
      { id: entry.id, data: { tags: normalized } },
      {
        onSuccess: () => {
          setTags(normalized);
          setDirty(false);
          invalidate();
        },
      },
    );
  };

  const handleAddTag = () => {
    const tag = normalizeTag(input);
    if (!tag) return;
    const next = normalizeTags([...tags, tag]);
    if (tagsEqual(next, tags)) {
      setInput("");
      return;
    }
    setTags(next);
    setInput("");
    setDirty(true);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const next = tags.filter(tag => tag !== tagToRemove);
    setTags(next);
    setDirty(true);
  };

  const handleSave = () => {
    commitTags(tags);
  };

  const handleClear = () => {
    commitTags([]);
    setInput("");
  };

  const isPending = updateWatchlistItem.isPending;

  return (
    <section className="rounded-xl border border-border/50 bg-card/30 p-6 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Your tags</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add personal labels like themes, mood, or where you heard about it.
        </p>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="rounded-full p-0.5 hover:bg-background/60"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="user-tag-input">Add tag</Label>
        <div className="flex gap-2">
          <Input
            id="user-tag-input"
            placeholder="e.g. Stephen King, comfort watch"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag();
              }
            }}
            disabled={isPending || tags.length >= MAX_TAGS}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAddTag}
            disabled={isPending || !normalizeTag(input) || tags.length >= MAX_TAGS}
            aria-label="Add tag"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleSave} disabled={!dirty || isPending} size="sm">
          {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save tags
        </Button>
        {tags.length > 0 && (
          <Button variant="outline" onClick={handleClear} disabled={isPending} size="sm">
            Clear all
          </Button>
        )}
      </div>
    </section>
  );
}
