import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateCustomList,
  getGetCustomListsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateListDialog({ open, onOpenChange }: CreateListDialogProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const createList = useCreateCustomList();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const reset = () => {
    setName("");
    setDescription("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createList.mutate(
      {
        data: {
          name: name.trim(),
          description: description.trim() || null,
          kind: "manual",
        },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() });
          reset();
          onOpenChange(false);
          setLocation(`/lists/${created.id}`);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new list</DialogTitle>
          <DialogDescription>
            Quick manual list. For smart lists with filter rules, use advanced setup.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-list-name">List name</Label>
            <Input
              id="quick-list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Summer watchlist"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-list-desc">Description (optional)</Label>
            <Textarea
              id="quick-list-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add description..."
            />
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button type="submit" disabled={createList.isPending || !name.trim()} className="w-full">
              {createList.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create list
            </Button>
            <Button type="button" variant="outline" className="w-full" asChild>
              <Link href="/lists/new">Advanced setup (smart lists & rules)</Link>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
