import { ReactNode } from "react";
import { Navbar } from "./navbar";
import { OwnerLogin } from "@/components/auth/owner-login";
import { useOwnerSession } from "@/hooks/use-owner-session";

export function AppLayout({ children }: { children: ReactNode }) {
  const session = useOwnerSession();

  if (session.isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!session.data?.authenticated) {
    return <OwnerLogin />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
