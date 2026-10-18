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

type IntegrationResponse = {
  integrations: Integration[];
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
          Keys stay in server environment variables. A configured key has not been checked with My Lists or SIMKL, and this page cannot save or revoke one. Watch sync stays a local preview. <Link href="/watch-sync" className="underline">Open watch sync</Link>.
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
      {connections.data ? (
        <p className="text-sm text-muted-foreground">Catalog still has {connections.data.catalogCount} titles.</p>
      ) : null}
    </div>
  );
}
