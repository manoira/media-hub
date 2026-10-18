import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Integration = {
  provider: "creator-key" | "simkl";
  label: string;
  connected: boolean;
  masked: string | null;
  updatedAt: string | null;
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

function request(path: string, method: string, secret?: string) {
  return fetch(path, {
    method,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-media-hub-request": "1",
    },
    body: secret === undefined ? undefined : JSON.stringify({ secret }),
  });
}

export function AccessPage() {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const connections = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => readJson<IntegrationResponse>(await fetch("/api/integrations", { credentials: "include" })),
  });

  const change = useMutation({
    mutationFn: async (input: { provider: string; action: "save" | "rotate" | "revoke"; secret?: string }) => {
      const path = input.action === "rotate"
        ? `/api/integrations/${input.provider}/rotate`
        : `/api/integrations/${input.provider}`;
      const method = input.action === "revoke" ? "DELETE" : input.action === "rotate" ? "POST" : "PUT";
      return readJson<IntegrationResponse>(await request(path, method, input.secret));
    },
    onSuccess: async (result, input) => {
      setDrafts((current) => ({ ...current, [input.provider]: "" }));
      setNotice(`Catalog still has ${result.catalogCount} titles.`);
      await queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });

  function submit(event: FormEvent, provider: string, action: "save" | "rotate") {
    event.preventDefault();
    const secret = drafts[provider]?.trim() ?? "";
    change.mutate({ provider, action, secret });
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Connections</h1>
        <p className="max-w-2xl text-muted-foreground">
          Creator keys and the SIMKL token stay on this server. Rotating or revoking one leaves the catalog in place. Watch sync stays on the local preview until a token is saved. <Link href="/watch-sync" className="underline">Open watch sync</Link>.
        </p>
      </div>

      {connections.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {connections.isError ? <p className="text-sm text-destructive">The connections could not be loaded.</p> : null}
      {change.isError ? <p className="text-sm text-destructive">{change.error instanceof Error ? change.error.message : "That change was rejected."}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(connections.data?.integrations ?? []).map((integration) => (
          <form
            key={integration.provider}
            onSubmit={(event) => submit(event, integration.provider, integration.connected ? "rotate" : "save")}
            className="space-y-4 rounded-lg border border-border/60 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{integration.label}</h2>
              <Badge variant={integration.connected ? "secondary" : "outline"}>
                {integration.connected ? integration.masked : "Not connected"}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label htmlFor={integration.provider}>{integration.connected ? "New secret" : "Secret"}</Label>
              <Input
                id={integration.provider}
                type="password"
                autoComplete="off"
                value={drafts[integration.provider] ?? ""}
                onChange={(event) => setDrafts((current) => ({ ...current, [integration.provider]: event.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={change.isPending}>
                {integration.connected ? "Rotate" : "Save"}
              </Button>
              {integration.connected ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ provider: integration.provider, action: "revoke" })}
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
