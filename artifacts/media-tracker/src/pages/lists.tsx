import { Link } from "wouter";
import {
  useGetCustomLists,
  getGetCustomListsQueryKey,
  useDeleteCustomList,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, List } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function kindLabel(kind: string, smartMode?: string | null) {
  if (kind === "manual") return "Manual";
  if (smartMode === "live") return "Smart · Live";
  if (smartMode === "snapshot") return "Smart · Snapshot";
  return "Smart";
}

export function ListsPage() {
  const queryClient = useQueryClient();
  const { data: lists, isLoading } = useGetCustomLists({
    query: { queryKey: getGetCustomListsQueryKey() },
  });
  const deleteList = useDeleteCustomList();

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete list "${name}"?`)) return;
    deleteList.mutate(
      { id },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() }) },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Lists</h1>
          <p className="text-muted-foreground mt-1">
            Curated subsets of your watchlist — manual or rule-based.
          </p>
        </div>
        <Link href="/lists/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New list
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : lists?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map(list => (
            <Link
              key={list.id}
              href={`/lists/${list.id}`}
              className="group block rounded-xl border border-border/50 bg-card p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <List className="w-5 h-5 text-primary shrink-0" />
                  <h2 className="font-semibold truncate group-hover:text-primary transition-colors">
                    {list.name}
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDelete(list.id, list.name);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              {list.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{list.description}</p>
              )}
              <div className="flex items-center gap-2 mt-4">
                <Badge variant="secondary">{kindLabel(list.kind, list.smartMode)}</Badge>
                <span className="text-sm text-muted-foreground">
                  {list.itemCount} item{list.itemCount === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-xl border border-border/50">
          <p className="text-muted-foreground text-lg mb-4">No custom lists yet.</p>
          <Link href="/lists/new">
            <Button>Create your first list</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
