import { Link, useLocation } from "wouter";
import { Search, Film, Compass, BarChart2, Bookmark, Menu, List, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useGetUnreadNotificationCount, getGetUnreadNotificationCountQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const mainNavLinks = [
  { href: "/", label: "Home", icon: Film },
  { href: "/browse", label: "Browse", icon: Compass },
  { href: "/watchlist", label: "My List", icon: Bookmark },
  { href: "/lists", label: "Lists", icon: List },
  { href: "/stats", label: "Stats", icon: BarChart2 },
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

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { data: unreadData } = useGetUnreadNotificationCount({
    query: { queryKey: getGetUnreadNotificationCountQueryKey(), refetchInterval: 60_000 },
  });
  const unreadCount = unreadData?.count ?? 0;

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const query = formData.get("q") as string;
    if (query) {
      setLocation(`/search?q=${encodeURIComponent(query)}`);
      setIsMobileMenuOpen(false);
    }
  };

  const navLinkClass = (href: string) =>
    cn(
      "flex items-center text-sm font-medium transition-colors hover:text-foreground/80",
      location === href ? "text-foreground" : "text-foreground/60",
    );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <div className="flex gap-6 md:gap-10">
          <Link href="/" className="flex items-center space-x-2">
            <Film className="h-6 w-6 text-primary" />
            <span className="inline-block font-bold text-lg tracking-tight">CineTrack</span>
          </Link>
          <nav className="hidden md:flex gap-6">
            {mainNavLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href} className={navLinkClass(link.href)}>
                  <Icon className="h-4 w-4 mr-2" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end md:gap-4">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <form onSubmit={handleSearch} className="relative hidden md:flex items-center max-w-sm ml-auto">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                placeholder="Search movies, TV, people & tags..."
                className="pl-8 bg-muted/50 border-none focus-visible:ring-1 md:w-[300px]"
              />
            </form>
          </div>

          <Link href={updatesLink.href} className={cn("hidden md:flex items-center gap-2", navLinkClass(updatesLink.href))}>
            <updatesLink.icon className="h-4 w-4" />
            {updatesLink.label}
            <UnreadBadge count={unreadCount} />
          </Link>

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden relative">
                <Menu className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
                )}
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="pr-0 flex flex-col">
              <Link href="/" className="flex items-center space-x-2 mb-8" onClick={() => setIsMobileMenuOpen(false)}>
                <Film className="h-6 w-6 text-primary" />
                <span className="font-bold">CineTrack</span>
              </Link>
              <form onSubmit={handleSearch} className="relative mb-8 pr-6">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  name="q"
                  placeholder="Search..."
                  className="pl-8 bg-muted"
                />
              </form>
              <div className="flex flex-col space-y-3 flex-1">
                {mainNavLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="flex items-center py-2 text-sm font-medium"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-auto border-t pt-4 pr-6 pb-2">
                <Link
                  href={updatesLink.href}
                  className="flex items-center py-2 text-sm font-medium"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <updatesLink.icon className="h-4 w-4 mr-2" />
                  {updatesLink.label}
                  <UnreadBadge count={unreadCount} className="ml-2" />
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
