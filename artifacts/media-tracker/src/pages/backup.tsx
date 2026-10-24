import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BackupSummary = {
  counts: Record<string, number>;
  accessKeys: string;
  restoreSteps: string[];
};

const LABELS: Record<string, string> = {
  watchlist: "Watchlist",
  episodeProgress: "Episode progress",
  customLists: "Lists",
  customListItems: "List items",
  watchEvents: "Watch events",
  simklMarkers: "SIMKL markers",
  listSyncQueue: "Sync queue",
};

async function readSummary(): Promise<BackupSummary> {
  const response = await fetch("/api/backup", { credentials: "include" });
  if (!response.ok) throw new Error("The backup summary could not be loaded.");
  return response.json() as Promise<BackupSummary>;
}

export function BackupPage() {
  const summary = useQuery({ queryKey: ["backup-summary"], queryFn: readSummary });

  async function download() {
    const response = await fetch("/api/backup/export", { credentials: "include" });
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "media-hub-backup.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Backup</h1>
          <p className="max-w-2xl text-muted-foreground">
            This export includes the watchlist, episode progress, lists, rules, ratings, notes, and labels.
            My Lists and SIMKL keys stay unset until you add them later.
          </p>
        </div>
        <Button onClick={() => void download()} disabled={summary.isLoading}>
          Download backup
        </Button>
      </div>

      {summary.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {summary.isError ? <p className="text-sm text-destructive">The backup summary could not be loaded.</p> : null}

      {summary.data ? (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(summary.data.counts).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border/60 p-4">
              <dt className="text-sm text-muted-foreground">{LABELS[key] ?? key}</dt>
              <dd className="mt-1 text-2xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <section className="max-w-2xl space-y-3">
        <h2 className="font-semibold">Restore onto a copy</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          {(summary.data?.restoreSteps ?? []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
