import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type Difference = {
  tmdbId: number;
  mediaType: string;
  title: string;
  status: string | null;
  simklStatus: string | null;
};

const statusLabels: Record<string, string> = {
  want_to_watch: "Want to Watch",
  watching: "Watching",
  watched: "Watched",
};

export function WatchSyncPage() {
  const status = useQuery({
    queryKey: ["simkl-status"],
    queryFn: async () => {
      const response = await fetch("/api/v2/simkl", { credentials: "include" });
      if (!response.ok) throw new Error("Could not load SIMKL settings.");
      return response.json() as Promise<{ canPreview: boolean }>;
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/v2/simkl/compare", { credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not compare statuses.");
      return result as { differences: Difference[]; skipped: number };
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Watch sync</h1>
        <p className="max-w-2xl text-muted-foreground">
          Compare title statuses in MediaHub and SIMKL. Custom lists stay in MediaHub.
        </p>
      </div>
      {status.isError && <p role="alert">{status.error.message}</p>}
      {status.data && !status.data.canPreview && (
        <p className="text-sm text-muted-foreground">Set SIMKL_CLIENT_ID and SIMKL_TOKEN on the server to get started.</p>
      )}
      <Button onClick={() => preview.mutate()} disabled={!status.data?.canPreview || preview.isPending}>
        {preview.isPending ? "Comparing…" : "Compare statuses"}
      </Button>
      {preview.isError && <p role="alert">{preview.error.message}</p>}
      {preview.data && (
        <section aria-label="Status differences" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {preview.data.differences.length} status differences. {preview.data.skipped} SIMKL items skipped.
          </p>
          <ul className="space-y-2">
            {preview.data.differences.map((row) => (
              <li key={`${row.mediaType}:${row.tmdbId}`} className="rounded-lg border bg-card p-3">
                <Link className="font-medium hover:underline" href={`/media/${row.mediaType}/${row.tmdbId}`}>{row.title}</Link>
                <p className="text-sm text-muted-foreground">
                  MediaHub: {statusLabels[row.status ?? ""] ?? "No matching status"} · SIMKL: {statusLabels[row.simklStatus ?? ""] ?? "No matching status"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
