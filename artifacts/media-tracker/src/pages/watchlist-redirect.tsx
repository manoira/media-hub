import { useEffect } from "react";
import { useLocation } from "wouter";

/** Keeps /watchlist links working after merging into /lists. */
export function WatchlistRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const search = window.location.search;
    setLocation(`/lists${search}`, { replace: true });
  }, [setLocation]);

  return null;
}
