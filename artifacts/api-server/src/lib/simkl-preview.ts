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
  const unsupported = new Set<string>();
  let skipped = 0;
  for (const [mediaType, entries] of [["movie", movies], ["tv", shows]] as const) {
    for (const entry of entries) {
      const title = mediaType === "movie" ? entry?.movie : entry?.show;
      const tmdbId = Number(title?.ids?.tmdb);
      const status = entry?.status === "plantowatch" ? "want_to_watch"
        : entry?.status === "completed" ? "watched"
        : entry?.status === "watching" && mediaType === "tv" ? "watching" : null;
      if (!status || !Number.isSafeInteger(tmdbId) || tmdbId <= 0 || typeof title?.title !== "string") {
        if (Number.isSafeInteger(tmdbId) && tmdbId > 0) unsupported.add(`${mediaType}:${tmdbId}`);
        skipped += 1;
        continue;
      }
      matches.set(`${mediaType}:${tmdbId}`, { tmdbId, mediaType, title: title.title, status });
    }
  }
  return { matches, skipped, unsupported };
}

export async function readSimklPreview(clientId: string, token: string) {
  const response = await fetch("https://api.simkl.com/sync/all-items", {
    headers: { "User-Agent": "MediaHub/1.0", Accept: "application/json", Authorization: `Bearer ${token}`, "simkl-api-key": clientId },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`SIMKL HTTP ${response.status}.`);
  return normalizeSimklPreview(await response.json());
}

export async function writeSimklStatus(
  connection: { clientId: string; token: string },
  mediaType: MediaType,
  tmdbId: number,
  status: SyncStatus,
) {
  const to = { want_to_watch: "plantowatch", watching: "watching", watched: "completed" }[status];
  const bucket = mediaType === "movie" ? "movies" : "shows";
  const response = await fetch("https://api.simkl.com/sync/add-to-list", {
    method: "POST",
    headers: {
      "User-Agent": "MediaHub/1.0",
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.token}`,
      "simkl-api-key": connection.clientId,
    },
    body: JSON.stringify({ [bucket]: [{ to, ids: { tmdb: String(tmdbId) } }] }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("SIMKL rejected the status update.");
  const payload = await response.json();
  return payload.added?.[bucket]?.[0]?.to === to;
}
