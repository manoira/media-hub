import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

async function simklRequest<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/v2/simkl${path}`, body ? {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-media-hub-request": "1" },
    credentials: "include",
    body: JSON.stringify(body),
  } : { credentials: "include" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "SIMKL request failed.");
  return result as T;
}

export function WatchSyncPage() {
  const [clientId, setClientId] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [notice, setNotice] = useState("");

  const status = useQuery({
    queryKey: ["simkl-status"],
    queryFn: () => simklRequest<{ canPreview: boolean; connected: boolean }>(""),
  });
  const preview = useMutation({
    mutationFn: () => simklRequest<{ differences: Difference[]; skipped: number }>("/compare"),
  });
  const connect = useMutation({
    mutationFn: () => simklRequest<{ userCode: string }>("/connect", { clientId }),
    onSuccess: () => setNotice(""),
  });
  const check = useMutation({
    mutationFn: () => simklRequest<{ state: string }>("/connect/check", {}),
    onSuccess: ({ state }) => {
      if (state === "connected") {
        connect.reset();
        preview.reset();
        setShowConnect(false);
        setNotice("SIMKL connected. You can now compare statuses.");
        void status.refetch();
      } else {
        setNotice(state === "read-only" ? "SIMKL granted read-only access. Request a new code and approve write access." : state === "expired" ? "Code expired. Request a new code." : "Waiting for SIMKL approval. Try again in a few seconds.");
      }
    },
  });
  const transfer = useMutation({
    mutationFn: ({ row, direction }: { row: Difference; direction: string }) =>
      simklRequest("/transfer-status", { ...row, direction }),
    onSuccess: () => {
      setNotice("Status copied.");
      preview.mutate();
    },
  });


  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Watch sync</h1>
        <p className="max-w-2xl text-muted-foreground">
          Compare title statuses in MediaHub and <a className="underline" href="https://simkl.com/" target="_blank" rel="noreferrer">SIMKL</a>. Custom lists stay in MediaHub.
        </p>
      </div>
      {status.isError && <p role="alert">{status.error.message}</p>}
      {status.data && (!status.data.connected || showConnect) && (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); connect.mutate(); }}>
          <Input className="max-w-sm" aria-label="SIMKL Client ID" placeholder="SIMKL Client ID" value={clientId} onChange={event => setClientId(event.target.value)} required />
          <Button type="submit" disabled={connect.isPending}>Get SIMKL code</Button>
        </form>
      )}
      {status.data?.connected && !showConnect && (
        <Button variant="outline" onClick={() => setShowConnect(true)}>Reconnect SIMKL</Button>
      )}
      {connect.data && (
        <div className="space-y-2">
          <p>Enter <strong>{connect.data.userCode}</strong> on <a className="underline" href="https://simkl.com/pin" target="_blank" rel="noreferrer">SIMKL’s PIN page</a>.</p>
          <Button variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>I approved access</Button>
        </div>
      )}
      {connect.isError && <p role="alert">{connect.error.message}</p>}
      {check.isError && <p role="alert">{check.error.message}</p>}
      {transfer.isError && <p role="alert">{transfer.error.message}</p>}
      {notice && <p role="status">{notice}</p>}
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
                {status.data?.connected && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.simklStatus && (
                      <Button size="sm" variant="outline" disabled={transfer.isPending || preview.isPending} onClick={() => transfer.mutate({ row, direction: "to-mediahub" })}>Copy to MediaHub</Button>
                    )}
                    {row.status && !(row.mediaType === "movie" && row.status === "watching") && (
                      <Button size="sm" variant="outline" disabled={transfer.isPending || preview.isPending} onClick={() => transfer.mutate({ row, direction: "to-simkl" })}>Copy to SIMKL</Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
