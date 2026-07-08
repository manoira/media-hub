import { useCallback, useSyncExternalStore } from "react";

export type ListViewMode = "grid" | "list";

const STORAGE_KEY = "media-hub:list-view-mode";
const listeners = new Set<() => void>();

function getSnapshot(): ListViewMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "list" ? "list" : "grid";
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", storageHandler);
  };
}

function emitChange() {
  for (const listener of listeners) listener();
}

export function useListViewMode() {
  const viewMode = useSyncExternalStore(subscribe, getSnapshot, () => "grid" as ListViewMode);

  const setViewMode = useCallback((mode: ListViewMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    emitChange();
  }, []);

  return { viewMode, setViewMode };
}
