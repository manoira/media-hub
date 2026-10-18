import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Integration = {
  provider: "creator-key" | "simkl";
  label: string;
  configured: boolean;
  verified: false;
  storage: "environment";
  envVar: string;
  masked: string | null;
};

type MyListsStatus = {
  connection: "simulated" | "configured" | "unconfigured";
  originHost: string | null;
  creatorName: string | null;
  detail: string;
};

type IntegrationResponse = {
  integrations: Integration[];
  myLists?: MyListsStatus;
  catalogCount: number;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body ? String(body.error) : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export function AccessPage() {
  const connections = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => readJson<IntegrationResponse>(await fetch("/api/integrations", { credentials: "include" })),
  });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
        <p className="max-w-2xl text-muted-foreground">
          Keys stay in server environment variables. Configured, verified, and simulated are different states. This page cannot save or revoke a secret. Watch sync stays a local preview. <Link href="/watch-sync" className="underline">Open watch sync</Link>.
        </p>
      </div>

      {connections.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {connections.isError ? <p className="text-sm text-destructive">The connections could not be loaded.</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(connections.data?.integrations ?? []).map((integration) => (
          <section key={integration.provider} className="space-y-3 rounded-lg border border-border/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{integration.label}</h2>
              <Badge variant={integration.configured ? "secondary" : "outline"}>
                {integration.configured ? "Configured, not verified" : "Not configured"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {integration.configured
                ? `The server has ${integration.envVar}. The last four characters are ${integration.masked}. Media Hub has not signed in with it.`
                : `Set ${integration.envVar} on the server and restart. Nothing is stored from this page.`}
            </p>
          </section>
        ))}
      </div>
      {connections.data?.myLists ? (
        <section className="space-y-2 rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">My Lists</h2>
            <Badge variant={connections.data.myLists.connection === "unconfigured" ? "outline" : "secondary"}>
              {connections.data.myLists.connection === "simulated"
                ? "Simulated"
                : connections.data.myLists.connection === "configured"
                  ? "Configured, not verified"
                  : "Not configured"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{connections.data.myLists.detail}</p>
          {connections.data.myLists.originHost ? (
            <p className="text-sm text-muted-foreground">Origin host {connections.data.myLists.originHost}. Creator {connections.data.myLists.creatorName}. The install URL is not shown.</p>
          ) : null}
        </section>
      ) : null}
      {connections.data ? (
        <p className="text-sm text-muted-foreground">Catalog still has {connections.data.catalogCount} titles.</p>
      ) : null}
    </div>
  );
}
