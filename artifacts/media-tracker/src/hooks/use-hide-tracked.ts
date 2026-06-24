import { useEffect, useState } from "react";

const HIDE_TRACKED_KEY = "media-hub:hide-tracked";
const LEGACY_HIDE_TRACKED_KEY = "media-hub:search-hide-tracked";

function readHideTrackedPreference(): boolean {
  try {
    const stored =
      localStorage.getItem(HIDE_TRACKED_KEY) ??
      localStorage.getItem(LEGACY_HIDE_TRACKED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function useHideTrackedPreference() {
  const [hideTracked, setHideTracked] = useState(readHideTrackedPreference);

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_TRACKED_KEY, String(hideTracked));
    } catch {
      // ignore storage errors
    }
  }, [hideTracked]);

  return { hideTracked, setHideTracked };
}
