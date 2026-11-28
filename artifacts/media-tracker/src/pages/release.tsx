import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Usage = {
  ttlMs: number;
  staleMs: number;
  cachedResponses: number;
  surfaces: Array<{ surface: string; hits: number; misses: number; stale: number; errors: number; external: number; durationMs: number }>;
  notes?: string[];
};

type ReleaseReport = {
  rules: { swedishWatched: number; swedishUnseenCrime: number; shortUnseen: number; missingRuntime: number };
  myLists: { ok: boolean; steps: string[] };
  simkl: { ok: boolean; steps: string[] };
  blocked: string[];
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("The request failed.");
  return response.json() as Promise<T>;
}

export function ReleasePage() {
  const usage = useQuery({
    queryKey: ["tmdb-usage"],
    queryFn: async () => readJson<Usage>(await fetch("/api/v2/usage", { credentials: "include" })),
  });
  const hosting = useQuery({
    queryKey: ["hosting"],
    queryFn: async () => readJson<{ decision: string; summary: string; reasons: string[]; notDoing: string }>(await fetch("/api/v2/hosting", { credentials: "include" })),
  });
  const measure = useMutation({
    mutationFn: async () => readJson<unknown>(await fetch("/api/v2/usage/measure", {
      method: "POST",
      credentials: "include",
      headers: { "x-media-hub-request": "1" },
    })),
    onSuccess: () => void usage.refetch(),
  });
  const fill = useMutation({
    mutationFn: async () => readJson<{ filled: number }>(await fetch("/api/v2/metadata/fill", {
      method: "POST",
      credentials: "include",
      headers: { "x-media-hub-request": "1" },
    })),
  });
  const check = useMutation({
    mutationFn: async () => readJson<ReleaseReport>(await fetch("/api/v2/release-check", {
      method: "POST",
      credentials: "include",
      headers: { "x-media-hub-request": "1" },
    })),
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Release check</h1>
        <p className="max-w-2xl text-muted-foreground">
          Local checks for cache use, list rules, the My Lists stand-in, and the watch-sync policy. Nothing here is published.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => measure.mutate()} disabled={measure.isPending}>Measure TMDB use</Button>
          <Button variant="outline" onClick={() => fill.mutate()} disabled={fill.isPending}>Fill 10 missing details</Button>
          <Button variant="outline" onClick={() => check.mutate()} disabled={check.isPending}>Run local chain</Button>
        </div>
        {measure.isPending || fill.isPending || check.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {fill.data ? <p className="text-sm text-muted-foreground">Filled details for {fill.data.filled} titles.</p> : null}
        {usage.data ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Cache holds {usage.data.cachedResponses} responses for {Math.round(usage.data.ttlMs / 3600000)} hours, with a stale reserve of {Math.round(usage.data.staleMs / 86400000)} days.
            </p>
            <ul className="space-y-1">
              {usage.data.surfaces.map((row) => (
                <li key={row.surface}>
                  {row.surface}: {row.external} external, {row.hits} hits, {row.misses} misses, {row.stale} stale, {row.errors} errors
                </li>
              ))}
            </ul>
            {(usage.data.notes ?? []).map((note) => <p key={note} className="text-muted-foreground">{note}</p>)}
          </div>
        ) : null}
      </section>

      {hosting.data ? (
        <section className="max-w-2xl space-y-2">
          <h2 className="font-semibold">Hosting</h2>
          <p className="text-sm">{hosting.data.summary}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {hosting.data.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <p className="text-sm text-muted-foreground">{hosting.data.notDoing}</p>
        </section>
      ) : null}

      {check.data ? (
        <section className="max-w-2xl space-y-3 text-sm">
          <h2 className="font-semibold">Local chain</h2>
          <p>Swedish watched movies: {check.data.rules.swedishWatched}. Swedish unseen crime: {check.data.rules.swedishUnseenCrime}. Unseen movies under 100 minutes: {check.data.rules.shortUnseen}. Missing runtime: {check.data.rules.missingRuntime}.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {check.data.myLists.steps.map((step) => <li key={step}>{step}</li>)}
            {check.data.simkl.steps.map((step) => <li key={step}>{step}</li>)}
            {check.data.blocked.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
