import { useState } from "react";
import {
  useGetCustomLists,
  getGetCustomListsQueryKey,
  useDeleteCustomList,
} from "@workspace/api-client-react";
import { ListsSectionLayout } from "@/components/lists/lists-section-layout";
import { ListCollectionCard } from "@/components/lists/list-collection-card";
import { CreateListDialog } from "@/components/lists/create-list-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function ListsCollectionsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const { data: lists, isLoading } = useGetCustomLists({
    query: { queryKey: getGetCustomListsQueryKey() },
  });
  const deleteList = useDeleteCustomList();

  const createListButton = (
    <Button size="sm" className="gap-2 rounded-full shadow-md" onClick={() => setCreateOpen(true)}>
      <PlusCircle className="h-4 w-4" />
      Create new list
    </Button>
  );

  return (
    <>
      <ListsSectionLayout activeSection="collections" contextTabs={createListButton}>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-video rounded-2xl" />
            ))}
          </div>
        ) : lists?.length ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <ListCollectionCard
                key={list.id}
                list={list}
                onDelete={() => {
                  if (!confirm(`Delete list "${list.name}"?`)) return;
                  deleteList.mutate(
                    { id: list.id },
                    {
                      onSuccess: () =>
                        queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() }),
                    },
                  );
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-6 py-16 text-center">
            <p className="text-lg text-muted-foreground">No custom lists yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a manual or smart list to organize titles beyond your main watchlist.
            </p>
            <div className="mt-6 flex justify-center">{createListButton}</div>
          </div>
        )}
      </ListsSectionLayout>

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}
