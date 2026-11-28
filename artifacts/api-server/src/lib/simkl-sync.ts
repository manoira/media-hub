export type WatchSnapshot = {
  tmdbId: number;
  mediaType: string;
  status: string;
  notes: string | null;
  tags: string[] | null;
  occurredAt: string | null;
};

export type RemoteWatch = {
  tmdbId: number;
  mediaType: string;
  watched: boolean | null;
  occurredAt: string | null;
};

export type WatchChange = {
  tmdbId: number;
  mediaType: string;
  from: string;
  to: string;
  occurredAt: string | null;
  reason: string;
};

const LOCAL_ONLY = new Set(["unsure", "waiting"]);

export function mergeWatchState(local: WatchSnapshot, remote: RemoteWatch | null): WatchChange | null {
  if (!remote || remote.watched == null) return null;
  if (LOCAL_ONLY.has(local.status)) return null;
  if (local.mediaType === "tv" && local.status === "watching" && remote.watched) return null;
  const remoteStatus = remote.watched ? "watched" : "want_to_watch";
  if (local.status === remoteStatus) return null;
  if (local.occurredAt && remote.occurredAt && local.occurredAt > remote.occurredAt) return null;
  if (local.occurredAt && !remote.occurredAt && local.status === "watched" && !remote.watched) return null;
  return {
    tmdbId: local.tmdbId,
    mediaType: local.mediaType,
    from: local.status,
    to: remoteStatus,
    occurredAt: remote.occurredAt,
    reason: remote.occurredAt
      ? "The remote change is newer than the local one."
      : "The remote change has no watch date, so none is invented.",
  };
}

export function practiceMergeSamples(): { ok: boolean; steps: string[] } {
  const notes = "keep me";
  const unsure = mergeWatchState(
    { tmdbId: 1, mediaType: "movie", status: "unsure", notes, tags: ["later"], occurredAt: null },
    { tmdbId: 1, mediaType: "movie", watched: true, occurredAt: null },
  );
  const watching = mergeWatchState(
    { tmdbId: 2, mediaType: "tv", status: "watching", notes, tags: null, occurredAt: null },
    { tmdbId: 2, mediaType: "tv", watched: true, occurredAt: null },
  );
  const remoteNewer = mergeWatchState(
    { tmdbId: 3, mediaType: "movie", status: "want_to_watch", notes, tags: ["mine"], occurredAt: null },
    { tmdbId: 3, mediaType: "movie", watched: true, occurredAt: null },
  );
  const localNewer = mergeWatchState(
    { tmdbId: 4, mediaType: "movie", status: "watched", notes, tags: null, occurredAt: "2026-10-18T12:00:00.000Z" },
    { tmdbId: 4, mediaType: "movie", watched: false, occurredAt: "2026-10-17T12:00:00.000Z" },
  );
  const steps = [
    unsure === null ? "Unsure stays local when SIMKL has no matching state." : "Unsure was overwritten.",
    watching === null ? "A series in progress is not treated as completed." : "A series in progress was marked completed.",
    remoteNewer?.to === "watched" && remoteNewer.occurredAt === null && notes === "keep me"
      ? "A remote watched mark updates status and does not invent a watch date."
      : "The remote watched mark was not handled.",
    localNewer === null ? "A newer local watched mark wins over an older remote unwatch." : "An older remote change overwrote a newer local one.",
  ];
  const ok = unsure === null && watching === null && remoteNewer?.to === "watched" && remoteNewer.occurredAt === null && localNewer === null;
  return { ok, steps };
}
