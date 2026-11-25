import { Link, useLocation } from "wouter";
import { Search, Film, Compass, BarChart2, Bookmark, BookOpen, List, Menu, Bell, Sparkles, Tv, KeyRound, Archive, ClipboardCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const mainNavLinks = [
  { href: "/", label: "My list", icon: Bookmark, match: (path: string) => path === "/" || path === "/lists" || path === "/watchlist" },
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/discover", label: "Discover", icon: Sparkles },
  { href: "/stats", label: "Stats", icon: BarChart2 },
];

const bookNavLinks = [
  { href: "/books", label: "Tracking", icon: BookOpen },
  { href: "/books/lists", label: "My lists", icon: List },
];

const menuNavLinks = [
  { href: "/wako-check", label: "Wako check", icon: Tv },
  { href: "/access", label: "Access", icon: KeyRound },
  { href: "/backup", label: "Backup", icon: Archive },
  { href: "/release", label: "Release", icon: ClipboardCheck },
];

const updatesLink = { href: "/updates", label: "Updates", icon: Bell };

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Navbar({ isBooks }: { isBooks: boolean }) {
  const [location, setLocation] = useLocation();
  const activeNavLinks = isBooks ? bookNavLinks : mainNavLinks;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  async function signOut() {
    await fetch("/api/session/logout", {
      method: "POST",
      credentials: "include",
      headers: { "x-media-hub-request": "1" },
    });
    setIsMenuOpen(false);
    await queryClient.invalidateQueries();
  }
  const { data: unreadData } = useGetUnreadNotificationCount({
    query: { queryKey: getGetUnreadNotificationCountQueryKey(), enabled: !isBooks },
  });
  const unreadCount = unreadData?.count ?? 0;

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("q") as string;
    if (query) {
      setLocation(`/search?q=${encodeURIComponent(query)}`);
      setIsMenuOpen(false);
    }
  };

  const navLinkClass = (href: string, match?: (path: string) => boolean) =>
    cn(
      "flex items-center text-sm font-medium transition-colors hover:text-foreground/80",
      (match ? match(location) : location === href)
        ? "text-foreground"
        : "text-foreground/60",
    );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto grid grid-cols-[auto_1fr] items-center gap-x-4 px-4 sm:px-6 md:min-h-16 md:grid-cols-[auto_1fr_auto] lg:px-8">
        <div className="flex h-14 items-center gap-2 sm:gap-4 md:h-auto">
          <Link href={isBooks ? "/books" : "/"} className="flex items-center gap-2">
            <Film aria-hidden="true" className="hidden h-6 w-6 text-primary min-[420px]:block" />
            <span className="font-bold text-lg tracking-tight">MediaHub</span>
          </Link>
          <nav aria-label="Media type" className="flex rounded-lg bg-muted p-0.5 text-xs font-medium sm:text-sm">
            <Link href="/" aria-current={!isBooks ? "true" : undefined} className={cn("rounded-md px-2 py-1.5", !isBooks ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              Shows
            </Link>
            <Link href="/books" aria-current={isBooks ? "true" : undefined} className={cn("rounded-md px-2 py-1.5", isBooks ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              Books
            </Link>
          </nav>
        </div>
        <nav aria-label={isBooks ? "Book navigation" : "Main navigation"} className={cn(
          "col-span-2 row-start-2 grid gap-1 pb-2 md:col-span-1 md:col-start-2 md:row-start-1 md:flex md:gap-4 md:pb-0 lg:gap-6",
          isBooks ? "grid-cols-2" : "grid-cols-4",
        )}>
          {activeNavLinks.map((link) => {
            const Icon = link.icon;
            const match = "match" in link ? link.match : undefined;
            const active = match ? match(location) : location === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "justify-center whitespace-nowrap py-2 text-xs sm:text-sm md:justify-start",
                  navLinkClass(link.href, match),
                  isBooks && "border-b-2 border-transparent",
                  isBooks && active && "border-primary text-primary hover:text-primary",
                )}
              >
                <Icon className="mr-1 hidden h-4 w-4 shrink-0 min-[420px]:block md:mr-2" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 md:col-start-3 lg:gap-4">
          {!isBooks && <div className="w-full flex-1 md:w-auto md:flex-none">
            <form onSubmit={handleSearch} className="relative hidden xl:flex items-center max-w-sm ml-auto">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                placeholder="Search movies, TV, people & tags..."
                className="pl-8 bg-muted/50 border-none focus-visible:ring-1 xl:w-[240px]"
              />
            </form>
          </div>}

          <Button variant="ghost" className="hidden lg:inline-flex" onClick={() => void signOut()}>
            Sign out
          </Button>
          {!isBooks && <Link href={updatesLink.href} className={cn("gap-1 sm:gap-2", navLinkClass(updatesLink.href))}>
            <updatesLink.icon className="h-4 w-4" />
            <span className="sr-only min-[420px]:not-sr-only">{updatesLink.label}</span>
            <UnreadBadge count={unreadCount} />
          </Link>}

          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={cn("shrink-0", isBooks && "lg:hidden")}>
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="pr-0 flex flex-col">
              <SheetTitle className="mb-6">Menu</SheetTitle>
              {!isBooks && <form onSubmit={handleSearch} className="relative mb-4 pr-6 xl:hidden">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  name="q"
                  placeholder="Search..."
                  className="pl-8 bg-muted"
                />
              </form>}
              {!isBooks && <nav aria-label="More options" className="flex flex-1 flex-col space-y-3">
                {menuNavLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center py-2 text-sm font-medium"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Icon className="mr-1 h-4 w-4 shrink-0 md:mr-2" />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>}
              <div className="mt-auto border-t pt-4 pr-6 pb-2 lg:hidden">
                <button type="button" className="py-2 text-left text-sm font-medium" onClick={() => void signOut()}>
                  Sign out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
