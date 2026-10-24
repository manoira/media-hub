import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OwnerLogin() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/session/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-media-hub-request": "1",
        },
        body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Sign-in was rejected.");
        return;
      }
      setPassword("");
      await queryClient.invalidateQueries();
    } catch {
      setError("The local API is not responding.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <Film className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Private catalog</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to open your lists, search, and title details.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="owner-password">Owner password</Label>
          <Input
            id="owner-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in
        </Button>
      </form>
    </div>
  );
}
