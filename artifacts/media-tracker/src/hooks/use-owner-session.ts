import { useQuery } from "@tanstack/react-query";

export type OwnerSession = { authenticated: boolean };

export function useOwnerSession() {
  return useQuery({
    queryKey: ["owner-session"],
    queryFn: async (): Promise<OwnerSession> => {
      const response = await fetch("/api/session", { credentials: "include" });
      if (!response.ok) return { authenticated: false };
      return response.json() as Promise<OwnerSession>;
    },
  });
}
