type SyncStatus = "want_to_watch" | "watching" | "watched";
type MediaType = "movie" | "tv";

type SimklItem = {
  status?: string;
  movie?: { title?: string; ids?: { tmdb?: string | number } };
  show?: { title?: string; ids?: { tmdb?: string | number } };
};

export function normalizeSimklPreview(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid SIMKL response.");
  }

  const { movies = [], shows = [] } = payload as { movies?: SimklItem[]; shows?: SimklItem[] };
  if (!Array.isArray(movies) || !Array.isArray(shows)) {
    throw new Error("Invalid SIMKL items.");
  }

  const matches = new Map<string, { tmdbId: number; mediaType: MediaType; title: string; status: SyncStatus }>();
  let skipped = 0;
  for (const [mediaType, entries] of [["movie", movies], ["tv", shows]] as const) {
    for (const entry of entries) {
      const title = mediaType === "movie" ? entry?.movie : entry?.show;
      const tmdbId = Number(title?.ids?.tmdb);
      const status = entry?.status === "plantowatch" ? "want_to_watch"
        : entry?.status === "completed" ? "watched"
        : entry?.status === "watching" && mediaType === "tv" ? "watching" : null;
      if (!status || !Number.isSafeInteger(tmdbId) || tmdbId <= 0 || typeof title?.title !== "string") {
        skipped += 1;
        continue;
      }
      matches.set(`${mediaType}:${tmdbId}`, { tmdbId, mediaType, title: title.title, status });
    }
  }
  return { matches, skipped };
}

export async function readSimklPreview(clientId: string, token: string) {
  const response = await fetch("https://api.simkl.com/sync/all-items", {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "simkl-api-key": clientId },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`SIMKL HTTP ${response.status}.`);
  return normalizeSimklPreview(await response.json());
}
