import { useMemo, useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  useGetCustomList,
  getGetCustomListQueryKey,
  getGetCustomListsQueryKey,
  useRefreshCustomList,
  useRemoveCustomListItem,
  useDeleteCustomList,
} from "@workspace/api-client-react";
import { MediaCard } from "@/components/media/media-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ChevronLeft, MoreHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ListsSectionLayout } from "@/components/lists/lists-section-layout";
import { AddItemsToListPanel } from "@/components/media/add-items-to-list-panel";
import { SharedFilterBar, type MediaTypeTab } from "@/components/lists/shared-filter-bar";
import { useListViewMode } from "@/hooks/use-list-view-mode";
import { WatchlistListRow } from "@/components/media/watchlist-list-row";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CustomListDisplayItem } from "@workspace/api-client-react";

const SORT_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "year", label: "Year" },
  { value: "rating", label: "Rating" },
];

function filterItems(
  items: CustomListDisplayItem[],
  query: string,
  mediaType: MediaTypeTab,
): CustomListDisplayItem[] {
  let result = items;
  if (mediaType !== "all") {
    result = result.filter(item => item.mediaType === mediaType);
  }
  const q = query.trim().toLowerCase();
  if (!q) return result;
  return result.filter(item => item.title.toLowerCase().includes(q));
}

function sortItems(items: CustomListDisplayItem[], sortBy: string): CustomListDisplayItem[] {
  const copy = [...items];
  switch (sortBy) {
    case "year":
      return copy.sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
    case "rating":
      return copy.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
    default:
      return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export function ListDetailPage() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const listId = Number(id);
  const queryClient = useQueryClient();
  const { viewMode, setViewMode } = useListViewMode();

  const [searchQuery, setSearchQuery] = useState("");
  const [mediaType, setMediaType] = useState<MediaTypeTab>("all");
  const [sortBy, setSortBy] = useState("title");

  const { data: list, isLoading } = useGetCustomList(listId, {
    query: { enabled: !Number.isNaN(listId), queryKey: getGetCustomListQueryKey(listId) },
  });

  const refreshList = useRefreshCustomList();
  const removeItem = useRemoveCustomListItem();
  const deleteList = useDeleteCustomList();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetCustomListQueryKey(listId) });
  };

  const displayItems = useMemo(() => {
    if (!list?.items) return [];
    return sortItems(filterItems(list.items, searchQuery, mediaType), sortBy);
  }, [list?.items, searchQuery, mediaType, sortBy]);

  const listMembershipKeys = useMemo(
    () => new Set(list?.items.map(item => `${item.mediaType}:${item.tmdbId}`) ?? []),
    [list?.items],
  );

  const backLink = (
    <Link href="/lists/collections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" />
      Back to My Lists
    </Link>
  );

  if (isLoading) {
    return (
      <ListsSectionLayout activeSection="collections" contextTabs={backLink}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-2xl" />
            ))}
          </div>
        </div>
      </ListsSectionLayout>
    );
  }

  if (!list) return <div>List not found</div>;

  const canRefresh = list.kind === "smart" && list.smartMode === "snapshot";
  const canRemove = list.kind === "manual" || list.smartMode === "snapshot";
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? "Title";

  const handleDeleteList = () => {
    if (!confirm(`Delete list "${list.name}"? This cannot be undone.`)) return;
    deleteList.mutate(
      { id: listId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() });
          setLocation("/lists/collections");
        },
      },
    );
  };

  return (
    <ListsSectionLayout activeSection="collections" contextTabs={backLink}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{list.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {list.kind === "manual" ? "Manual" : list.smartMode === "live" ? "Smart · Live" : "Smart · Snapshot"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {list.itemCount} title{list.itemCount === 1 ? "" : "s"} · Updated{" "}
                {new Date(list.updatedAt).toLocaleString()}
              </span>
            </div>
            {list.description ? <p className="mt-2 text-muted-foreground">{list.description}</p> : null}
          </div>

          <div className="flex items-center gap-2">
            {canRefresh ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={refreshList.isPending}
                onClick={() => refreshList.mutate({ id: listId }, { onSuccess: invalidate })}
              >
                <RefreshCw className={`h-4 w-4 ${refreshList.isPending ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href="/lists/new">Create another list</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  disabled={deleteList.isPending}
                  onClick={handleDeleteList}
                >
                  Delete list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <SharedFilterBar
          mediaType={mediaType}
          onMediaTypeChange={setMediaType}
          itemCount={displayItems.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search this list..."
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortLabel={sortLabel}
          sortOptions={SORT_OPTIONS}
          currentSort={sortBy}
          onSortChange={setSortBy}
          filterPanel={<p className="text-sm text-muted-foreground">No extra filters for list view yet.</p>}
        />

        {list.kind === "manual" ? (
          <AddItemsToListPanel listId={listId} listMembershipKeys={listMembershipKeys} />
        ) : null}

        {displayItems.length ? (
          viewMode === "list" ? (
            <div className="flex flex-col gap-2">
              {displayItems.map(item => (
                <WatchlistListRow
                  key={item.listItemId ?? `${item.mediaType}-${item.tmdbId}`}
                  item={item as Parameters<typeof WatchlistListRow>[0]["item"]}
                  showProgress={item.tracked && item.mediaType === "tv"}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {displayItems.map(item => (
                <div key={item.listItemId ?? `${item.mediaType}-${item.tmdbId}`} className="group/item relative">
                  <MediaCard
                    item={item}
                    variant="tracking"
                    showProgress={item.tracked && item.mediaType === "tv"}
                    showStatus={item.tracked}
                  />
                  {canRemove && item.listItemId != null ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="absolute right-2 top-2 z-30 h-7 text-xs opacity-0 group-hover/item:opacity-100"
                      onClick={() =>
                        removeItem.mutate(
                          { id: listId, listItemId: item.listItemId! },
                          { onSuccess: invalidate },
                        )
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-border/50 bg-card py-20 text-center">
            <p className="text-lg text-muted-foreground">This list is empty.</p>
          </div>
        )}
      </div>
    </ListsSectionLayout>
  );
}
