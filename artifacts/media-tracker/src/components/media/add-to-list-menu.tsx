import { useGetCustomLists, useAddCustomListItem, getGetCustomListsQueryKey } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ListPlus, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

interface AddToListMenuProps {
  watchlistId: number;
  className?: string;
}

export function AddToListMenu({ watchlistId, className }: AddToListMenuProps) {
  const queryClient = useQueryClient();
  const { data: lists, isLoading } = useGetCustomLists({
    query: { queryKey: getGetCustomListsQueryKey() },
  });
  const addItem = useAddCustomListItem();

  const manualLists = lists?.filter(l => l.kind === "manual") ?? [];

  if (isLoading) return null;
  if (manualLists.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", className)}>
          {addItem.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ListPlus className="w-4 h-4" />
          )}
          Add to list
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {manualLists.map(list => (
          <DropdownMenuItem
            key={list.id}
            onClick={() =>
              addItem.mutate(
                { id: list.id, data: { watchlistId } },
                {
                  onSuccess: () =>
                    queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() }),
                },
              )
            }
          >
            {list.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
