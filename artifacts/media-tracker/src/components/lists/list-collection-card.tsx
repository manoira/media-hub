import { Link } from "wouter";
import type { CustomListSummary } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTmdbImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

function listKindLabel(kind: string, smartMode?: string | null) {
  if (kind === "manual") return "Manual";
  if (smartMode === "live") return "Smart · Live";
  return "Smart · Snapshot";
}

interface ListCollectionCardProps {
  list: CustomListSummary;
  onDelete: () => void;
  className?: string;
}

export function ListCollectionCard({ list, onDelete, className }: ListCollectionCardProps) {
  const posters = list.previewPosters ?? [];
  const slots = Array.from({ length: 4 }, (_, i) => posters[i] ?? null);

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 transition-colors hover:border-primary/40",
        className,
      )}
    >
      <Link href={`/lists/${list.id}`} className="relative block">
        <div className="grid aspect-video grid-cols-2 gap-0.5 bg-black">
          {slots.map((poster, i) => (
            <div key={i} className="relative overflow-hidden bg-muted">
              {poster ? (
                <img
                  src={getTmdbImageUrl(poster, "poster") ?? undefined}
                  alt=""
                  className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-60"
                  loading="lazy"
                />
              ) : (
                <div className="h-full w-full bg-muted/80" />
              )}
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="secondary" className="text-[9px]">
              {listKindLabel(list.kind, list.smartMode)}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              Updated {new Date(list.updatedAt).toLocaleDateString()}
            </span>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-white group-hover:text-primary transition-colors">
            {list.name}
          </h3>
          <p className="text-sm text-gray-300">
            {list.itemCount} title{list.itemCount === 1 ? "" : "s"}
          </p>
        </div>
      </Link>

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-2 opacity-0 transition-all group-hover:opacity-100">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md hover:bg-destructive"
          aria-label={`Delete ${list.name}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-9 w-9 rounded-full bg-white/10 backdrop-blur-md hover:bg-primary"
          asChild
        >
          <Link href={`/lists/${list.id}`} aria-label={`Open ${list.name}`}>
            <Plus className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
