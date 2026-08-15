import { Link } from "wouter";
import {
  useGetCustomLists,
  getGetCustomListsQueryKey,
  useDeleteCustomList,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface ListSwitcherProps {
  activeListId?: number;
  className?: string;
}

export function ListSwitcher({ activeListId, className }: ListSwitcherProps) {
  const queryClient = useQueryClient();
  const { data: lists, isLoading } = useGetCustomLists({
    query: { queryKey: getGetCustomListsQueryKey() },
  });
  const deleteList = useDeleteCustomList();

  if (isLoading) {
    return (
      <div className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide",
        className,
      )}
      role="tablist"
      aria-label="List views"
    >
      <Link href="/">
        <Button
          variant={activeListId === undefined ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          role="tab"
          aria-selected={activeListId === undefined}
        >
          All titles
        </Button>
      </Link>

      {lists?.map(list => (
        <div key={list.id} className="flex shrink-0 items-center group/pill">
          <Link href={`/lists/${list.id}`}>
            <Button
              variant={activeListId === list.id ? "default" : "outline"}
              size="sm"
              className="gap-1.5 rounded-r-none"
              role="tab"
              aria-selected={activeListId === list.id}
            >
              <span className="max-w-[10rem] truncate">{list.name}</span>
              <span className="text-[10px] opacity-70 tabular-nums">{list.itemCount}</span>
            </Button>
          </Link>
          <Button
            variant={activeListId === list.id ? "default" : "outline"}
            size="sm"
            className="rounded-l-none border-l-0 px-1.5 h-9 opacity-0 group-hover/pill:opacity-100 focus:opacity-100"
            aria-label={`Delete ${list.name}`}
            onClick={() => {
              if (!confirm(`Delete list "${list.name}"?`)) return;
              deleteList.mutate(
                { id: list.id },
                { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() }) },
              );
            }}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}

      <Link href="/lists/new" className="shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Plus className="w-4 h-4" />
          New list
        </Button>
      </Link>
    </div>
  );
}
