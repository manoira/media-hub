import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

type SyncState = {
  exportEnabled: boolean;
  syncStatus: string;
  slug: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  install: string[];
};

const LABELS: Record<string, string> = {
  off: "Off",
  pending: "Waiting",
  syncing: "Syncing",
  synced: "Synced",
  paused: "Paused",
  error: "Error",
  conflict: "Conflict",
  removed: "External copy removed",
};

async function readSync(listId: number): Promise<SyncState> {
  const response = await fetch(`/api/v2/lists/${listId}/sync`, { credentials: "include" });
  if (!response.ok) throw new Error("The sync status could not be loaded.");
  return response.json() as Promise<SyncState>;
}

async function postSync(listId: number, action: string, confirm?: string) {
  const response = await fetch(`/api/v2/lists/${listId}/sync`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-media-hub-request": "1" },
    body: JSON.stringify({ action, confirm }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "detail" in body ? String(body.detail) : "The export did not finish.";
    throw new Error(message);
  }
  return body as { detail?: string };
}

export function ListSyncPanel({ listId }: { listId: number }) {
  const queryClient = useQueryClient();
  const sync = useQuery({ queryKey: ["list-sync", listId], queryFn: () => readSync(listId) });
  const action = useMutation({
    mutationFn: (input: { action: string; confirm?: string }) => postSync(listId, input.action, input.confirm),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["list-sync", listId] });
    },
  });

  const status = sync.data?.syncStatus ?? "off";

  return (
    <section className="rounded-lg border border-border/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Wako export</h2>
          <p className="text-sm text-muted-foreground">
            {LABELS[status] ?? status}
            {sync.data?.lastSyncedAt ? ` · last confirmed ${new Date(sync.data.lastSyncedAt).toLocaleString()}` : ""}
            {sync.data?.slug ? ` · ${sync.data.slug}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => action.mutate({ action: "enable" })} disabled={action.isPending}>
            Show on TV
          </Button>
          <Button size="sm" variant="outline" onClick={() => action.mutate({ action: "sync" })} disabled={action.isPending || !sync.data?.exportEnabled}>
            Sync now
          </Button>
          <Button size="sm" variant="outline" onClick={() => action.mutate({ action: "pause" })} disabled={action.isPending}>
            Pause
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => action.mutate({ action: "delete-external", confirm: "delete-external" })}
            disabled={action.isPending}
          >
            Remove external copy
          </Button>
        </div>
      </div>
      {sync.data?.syncError ? <p className="text-sm text-destructive">{sync.data.syncError}</p> : null}
      {action.data?.detail ? <p className="text-sm text-muted-foreground">{action.data.detail}</p> : null}
      {action.error ? <p className="text-sm text-destructive">{action.error.message}</p> : null}
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {(sync.data?.install ?? []).map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
