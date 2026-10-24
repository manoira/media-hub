import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type SimklState = {
  configured: boolean;
  verified: boolean;
  pendingEvents: number;
  policy: string;
};

type PreviewChange = {
  tmdbId: number;
  mediaType: string;
  title: string;
  from: string;
  to: string;
  occurredAt: string | null;
  notes: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("The request failed.");
  return response.json() as Promise<T>;
}

export function WatchSyncPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [changes, setChanges] = useState<PreviewChange[]>([]);
  const status = useQuery({
    queryKey: ["simkl-status"],
    queryFn: async () => readJson<SimklState>(await fetch("/api/v2/simkl", { credentials: "include" })),
  });
  const preview = useMutation({
    mutationFn: async () => readJson<{ detail: string; changes: PreviewChange[] }>(await fetch("/api/v2/simkl/preview", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-media-hub-request": "1" },
      body: JSON.stringify({ remote: [] }),
    })),
    onSuccess: (result) => {
      setChanges(result.changes);
      setNotice(result.detail);
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Watch sync</h1>
        <p className="max-w-2xl text-muted-foreground">{status.data?.policy}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        {status.data?.configured
          ? "A SIMKL token is configured in the server environment. It has not been verified."
          : "No SIMKL token is configured."}{" "}
        {status.data ? `${status.data.pendingEvents} local watch events are recorded.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => preview.mutate()} disabled={preview.isPending}>Preview</Button>
        <Button variant="outline" asChild>
          <Link href="/access">See where the token is set</Link>
        </Button>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {changes.length === 0 ? <p className="text-sm text-muted-foreground">No remote changes are waiting. Notes, labels, and lists are left alone.</p> : null}
      <ul className="space-y-2 text-sm">
        {changes.map((change) => (
          <li key={`${change.mediaType}:${change.tmdbId}`}>
            {change.title}: {change.from} → {change.to}{change.occurredAt ? "" : " · no watch date"}
            {change.notes ? ` · note kept` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
