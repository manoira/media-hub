import { useEffect } from "react";
import { useLocation } from "wouter";

/** Keeps /watchlist links working after making the tracking list the home page. */
export function WatchlistRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const search = window.location.search;
    setLocation(`/${search}`, { replace: true });
  }, [setLocation]);

  return null;
}
