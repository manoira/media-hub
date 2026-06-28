import { useParams, Link } from "wouter";
import {
  useGetCustomList,
  getGetCustomListQueryKey,
  useRefreshCustomList,
  useRemoveCustomListItem,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AddItemsToListPanel } from "@/components/media/add-items-to-list-panel";

export function ListDetailPage() {
  const { id } = useParams();
  const listId = Number(id);
  const queryClient = useQueryClient();

  const { data: list, isLoading } = useGetCustomList(listId, {
    query: { enabled: !Number.isNaN(listId), queryKey: getGetCustomListQueryKey(listId) },
  });

  const refreshList = useRefreshCustomList();
  const removeItem = useRemoveCustomListItem();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetCustomListQueryKey(listId) });
  };

  const listMembershipKeys = useMemo(
    () => new Set(list?.items.map(item => `${item.mediaType}:${item.tmdbId}`) ?? []),
    [list?.items],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-6 w-96" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!list) return <div>List not found</div>;

  const canRefresh = list.kind === "smart" && list.smartMode === "snapshot";
  const canRemove = list.kind === "manual" || list.smartMode === "snapshot";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Link href="/lists" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="w-4 h-4" />
          All lists
        </Link>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{list.name}</h1>
            {list.description && (
              <p className="text-muted-foreground mt-1">{list.description}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Badge variant="secondary">
                {list.kind === "manual" ? "Manual" : list.smartMode === "live" ? "Smart · Live" : "Smart · Snapshot"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {list.itemCount} item{list.itemCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {canRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={refreshList.isPending}
              onClick={() => refreshList.mutate({ id: listId }, { onSuccess: invalidate })}
            >
              <RefreshCw className={`w-4 h-4 ${refreshList.isPending ? "animate-spin" : ""}`} />
              Refresh from rules
            </Button>
          )}
        </div>
      </div>

      {list.kind === "manual" && (
        <AddItemsToListPanel listId={listId} listMembershipKeys={listMembershipKeys} />
      )}

      {list.items.length ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {list.items.map(item => (
            <div key={item.listItemId ?? `${item.mediaType}-${item.tmdbId}`} className="relative group/item">
              <MediaCard
                item={item}
                showProgress={item.tracked && item.mediaType === "tv"}
                showStatus={item.tracked}
              />
              {canRemove && item.listItemId != null && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 z-30 h-7 text-xs opacity-0 group-hover/item:opacity-100"
                  onClick={() =>
                    removeItem.mutate(
                      { id: listId, listItemId: item.listItemId! },
                      { onSuccess: invalidate },
                    )
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : list.kind !== "manual" ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border/50">
          <p className="text-muted-foreground text-lg">This list is empty.</p>
        </div>
      ) : null}
    </div>
  );
}
