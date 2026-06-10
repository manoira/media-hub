import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getTmdbImageUrl(path: string | null | undefined, size: "poster" | "backdrop" | "profile" = "poster") {
  if (!path) return null;
  const sizePath = size === "poster" ? "w500" : size === "backdrop" ? "w1280" : "w185";
  return `https://image.tmdb.org/t/p/${sizePath}${path}`;
}

export function getYoutubeEmbedUrl(key: string | null | undefined) {
  if (!key) return null;
  return `https://www.youtube.com/embed/${key}`;
}

export function formatRuntime(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}
