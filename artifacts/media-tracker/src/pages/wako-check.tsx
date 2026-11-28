import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ProbeItem = {
  imdbId: string;
  title: string;
  year: number;
  type: "movie" | "series";
};

type ProbeStep = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  items: ProbeItem[];
};

type ProbePlan = {
  listName: string;
  slug: string;
  profile: string;
  items: ProbeItem[];
  reviewed: {
    addonVersion: string;
    commit: string;
    savePath: string;
    hostedOrigin: string;
  };
  television: string[];
  hostingNote: string;
};

type ProbeRun = {
  ok: boolean;
  profile: string;
  slug: string;
  listName: string;
  steps: ProbeStep[];
  hosted: { ok: boolean; detail: string };
  television: string[];
  reviewed: ProbePlan["reviewed"];
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`The check API returned ${response.status}.`);
  return response.json() as Promise<T>;
}

function TitleRow({ items, emptyLabel }: { items: ProbeItem[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {items.map((item, index) => (
        <li key={`${item.imdbId}-${index}`} className="rounded-lg border border-border/60 bg-card p-4">
          <p className="text-xs text-muted-foreground">{index + 1}</p>
          <p className="mt-1 font-semibold leading-snug">{item.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.year} · {item.type === "movie" ? "Movie" : "Series"}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function WakoCheckPage() {
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const plan = useQuery({
    queryKey: ["wako-probe"],
    queryFn: async () => readJson<ProbePlan>(await fetch("/api/wako-probe")),
  });
  const run = useMutation({
    mutationFn: async () => readJson<ProbeRun>(await fetch("/api/wako-probe/run", {
      method: "POST",
      credentials: "include",
      headers: { "x-media-hub-request": "1" },
    })),
    onSuccess: (result) => {
      const visible = [...result.steps].reverse().find((step) => step.items.length > 0);
      setSelectedStep(visible?.id ?? result.steps.at(-1)?.id ?? null);
    },
  });

  const result = run.data;
  const activeStep = result?.steps.find((step) => step.id === selectedStep) ?? null;
  const previewItems = activeStep?.items ?? plan.data?.items ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Tv className="h-4 w-4" />
            <span>MB-29 · local only</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Private list check</h1>
          <p className="max-w-2xl text-muted-foreground">
            Creates, reads, changes, sorts, and clears one private three-title list on a local test profile.
            Your watchlist is not used.
          </p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending || plan.isLoading}>
          {run.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Run check
        </Button>
      </div>

      {plan.isError ? (
        <p className="text-sm text-destructive">The local API is not responding. Start it, then run the check again.</p>
      ) : null}
      {run.isError ? (
        <p className="text-sm text-destructive">{run.error instanceof Error ? run.error.message : "The check failed."}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{activeStep ? activeStep.label : "Titles to send"}</h2>
          {plan.data ? <Badge variant="outline">{plan.data.profile}</Badge> : null}
          {result ? (
            <Badge variant={result.ok ? "secondary" : "destructive"}>
              {result.ok ? "Local contract passed" : "Local contract failed"}
            </Badge>
          ) : null}
        </div>
        <TitleRow
          items={previewItems}
          emptyLabel={activeStep?.id === "clear" ? "The list is empty. The slug is still the same." : "No titles yet."}
        />
      </section>

      {result ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What happened</h2>
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
            {result.steps.map((step) => {
              const selected = step.id === selectedStep;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setSelectedStep(step.id)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left ${selected ? "bg-muted/60" : "hover:bg-muted/30"}`}
                >
                  <Badge variant={step.ok ? "secondary" : "destructive"}>{step.ok ? "Pass" : "Fail"}</Badge>
                  <span>
                    <span className="block font-medium">{step.label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">{step.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className={`text-sm ${result.hosted.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {result.hosted.detail}
          </p>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <h2 className="font-semibold">Still needs the TV</h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {(result?.television ?? plan.data?.television ?? []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-3 rounded-lg border border-border/60 p-4">
          <h2 className="font-semibold">My Lists, as reviewed</h2>
          {plan.data ? (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Version</dt>
                <dd>{plan.data.reviewed.addonVersion}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Commit</dt>
                <dd className="break-all">{plan.data.reviewed.commit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Write path</dt>
                <dd>{plan.data.reviewed.savePath}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Loading the reviewed contract.</p>
          )}
          {plan.data ? <p className="text-sm text-muted-foreground">{plan.data.hostingNote}</p> : null}
        </div>
      </section>
    </div>
  );
}
