import { useEffect, useState } from "react";

const HIDE_ADULT_KEY = "media-hub:hide-adult-v2";

function readHideAdultPreference(): boolean {
  try {
    const stored = localStorage.getItem(HIDE_ADULT_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function useHideAdultPreference() {
  const [hideAdult, setHideAdult] = useState(readHideAdultPreference);

  useEffect(() => {
    try {
      localStorage.setItem(HIDE_ADULT_KEY, String(hideAdult));
    } catch {
      // ignore storage errors
    }
  }, [hideAdult]);

  return { hideAdult, setHideAdult };
}
