import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Film } from "lucide-react";
import {
  getGetMediaDetailsQueryKey,
  getGetSeasonProgressQueryKey,
  getGetTvProgressBatchQueryKey,
  getGetTvProgressQueryKey,
  getGetWatchlistQueryKey,
  useGetMediaDetails,
  useGetSeasonProgress,
  useGetWatchlist,
  useMarkEpisodeWatched,
} from "@workspace/api-client-react";
import { cn, getTmdbImageUrl } from "@/lib/utils";

const tabs = [
  { status: "watching", label: "Watching" },
  { status: "waiting", label: "Waiting" },
  { status: "want_to_watch", label: "Want to Watch" },
];

const control = "rounded-xl border border-white/15 bg-white/5 text-left transition-colors hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-violet-400 focus:bg-violet-950";

function arrowFocus(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const active = document.activeElement;
  const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-tv-focus]:not(:disabled)"));
  if (!(active instanceof HTMLElement) || !targets.includes(active)) {
    targets[0]?.focus();
    return;
  }
  const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
  const sign = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const start = active.getBoundingClientRect();
  let closest: HTMLElement | undefined;
  let best = Infinity;
  for (const target of targets) {
    const end = target.getBoundingClientRect();
    const x = end.left + end.width / 2 - start.left - start.width / 2;
    const y = end.top + end.height / 2 - start.top - start.height / 2;
    const forward = (horizontal ? x : y) * sign;
    if (forward < 8) continue;
    if (horizontal && Math.abs(y) > Math.min(start.height, end.height) / 2) continue;
    const score = forward + Math.abs(horizontal ? y : x) * 2;
    if (score < best) {
      closest = target;
      best = score;
    }
  }
  closest?.focus();
}

export function TvPage() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(useSearch());
  const kind = params.get("kind") === "movie" ? "movie" : "tv";
  const titleId = Number(params.get("id")) || 0;
  const season = Number(params.get("season")) || 0;
  const tab = tabs.find(entry => entry.status === params.get("status")) ?? tabs[0];
  const root = useRef<HTMLElement>(null);
  const firstFocus = useRef<HTMLElement | null>(null);
  const lastTitle = useRef(0);
  const lastSeason = useRef(0);
  const [episodeError, setEpisodeError] = useState(false);
  const queryClient = useQueryClient();

  const watchlist = useGetWatchlist();
  const title = useGetMediaDetails(kind, titleId, { query: { enabled: titleId > 0 } });
  const episodes = useGetSeasonProgress(titleId, season, { query: { enabled: kind === "tv" && titleId > 0 && season > 0 } });
  const mark = useMarkEpisodeWatched();
  const [savingEpisode, setSavingEpisode] = useState<number | null>(null);

  const listUrl = `/tv?status=${tab.status}`;
  const titleUrl = (id: number, type: string) => `${listUrl}&kind=${type}&id=${id}`;
  const currentTitleUrl = titleUrl(titleId, kind);
  const backUrl = season ? currentTitleUrl : listUrl;

  const ready = season ? !!episodes.data : titleId ? !!title.data : !!watchlist.data;
  useEffect(() => {
    if (!root.current) return;
    const returning = season ? undefined : titleId
      ? root.current.querySelector<HTMLElement>(`[data-season="${lastSeason.current}"]`)
      : root.current.querySelector<HTMLElement>(`[data-title="${lastTitle.current}"]`);
    (returning ?? firstFocus.current ?? root.current.querySelector<HTMLElement>("[data-tv-focus]"))?.focus();
  }, [tab.status, titleId, season, ready]);

  function handleKey(event: KeyboardEvent<HTMLElement>) {
    if (titleId && (["Escape", "Backspace", "BrowserBack", "GoBack"].includes(event.key) ||
        [461, 10009].includes(event.keyCode))) {
      event.preventDefault();
      navigate(backUrl, { replace: true });
      return;
    }
    arrowFocus(event);
  }

  function toggleEpisode(episodeNumber: number, watched: boolean) {
    if (mark.isPending) return;
    setEpisodeError(false);
    setSavingEpisode(episodeNumber);
    mark.mutate({ tmdbId: titleId, data: { seasonNumber: season, episodeNumber, watched: !watched } }, {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getGetSeasonProgressQueryKey(titleId, season) }),
          queryClient.invalidateQueries({ queryKey: getGetTvProgressQueryKey(titleId) }),
          queryClient.invalidateQueries({ queryKey: getGetTvProgressBatchQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getGetMediaDetailsQueryKey(kind, titleId) }),
        ]);
      },
      onError: () => setEpisodeError(true),
      onSettled: () => setSavingEpisode(null),
    });
  }

  const items = watchlist.data?.filter(item => item.status === tab.status) ?? [];
  const poster = getTmdbImageUrl(title.data?.posterPath);
  return (
    <section ref={root} onKeyDown={handleKey} className="min-h-screen space-y-8 bg-[#12101a] px-[5vw] py-[4vh] text-white">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-3 text-3xl font-bold tracking-tight">
          <Film aria-hidden="true" className="size-8 text-violet-400" /> MediaHub
        </div>
        {titleId > 0 ? (
          <Link href={backUrl} data-tv-focus tabIndex={0} className={cn(control, "inline-flex items-center gap-2 px-5 py-3 text-lg")}>
            <ArrowLeft aria-hidden="true" className="size-5" /> Back
          </Link>
        ) : (
          <Link href="/" data-tv-focus className={cn(control, "px-5 py-3 text-lg")}>Standard view</Link>
        )}
      </header>

      {!titleId ? (
        <>
          <nav aria-label="Watch status" className="flex flex-wrap gap-4">
            {tabs.map(entry => (
              <Link
                key={entry.status}
                ref={entry === tab ? node => { firstFocus.current = node; } : undefined}
                href={`/tv?status=${entry.status}`}
                aria-current={tab === entry ? "page" : undefined}
                data-tv-focus
                onClick={() => { lastTitle.current = 0; lastSeason.current = 0; }}
                className={cn(control, "px-6 py-3 text-xl font-semibold", tab === entry && "border-violet-500 bg-violet-900")}
              >{entry.label}</Link>
            ))}
          </nav>
          {watchlist.isError && <button data-tv-focus className={cn(control, "p-4")} onClick={() => void watchlist.refetch()}>Retry loading your list</button>}
          {watchlist.isPending && <p role="status" className="text-xl">Loading your list…</p>}
          {watchlist.isSuccess && !items.length && <p className="text-xl text-slate-300">No titles in {tab.label}.</p>}
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-6">
            {items.map(item => {
              const image = getTmdbImageUrl(item.posterPath) ?? getTmdbImageUrl(item.backdropPath, "backdrop");
              return (
                <Link
                  key={item.id}
                  href={titleUrl(item.tmdbId, item.mediaType)}
                  data-tv-focus
                  data-title={item.tmdbId}
                  onClick={() => { lastTitle.current = item.tmdbId; lastSeason.current = 0; }}
                  className={cn(control, "overflow-hidden")}
                >
                  <div className="flex aspect-[2/3] items-center justify-center bg-violet-950">
                    {image ? <img src={image} alt="" loading="lazy" className="size-full object-cover" /> : <Film aria-hidden="true" className="size-10 text-violet-300" />}
                  </div>
                  <h2 className="line-clamp-2 p-3 text-lg font-semibold">{item.title}</h2>
                </Link>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {title.isPending && <p role="status" className="text-xl">Loading title…</p>}
          {title.isError && <button data-tv-focus className={cn(control, "p-4")} onClick={() => void title.refetch()}>Retry loading title</button>}
          {title.data && (
            <div className="flex gap-6">
              {poster && <img src={poster} alt="" className="hidden w-32 self-start rounded-xl sm:block" />}
              <div className="space-y-3">
                <h1 className="text-4xl font-bold">{title.data.title}</h1>
                {season > 0 ? <h2 className="text-2xl text-violet-300">Season {season}</h2> : <p className="max-w-3xl text-lg text-slate-200">{title.data.overview}</p>}
              </div>
            </div>
          )}
          {!season && title.data && (
            <nav aria-label="Seasons" className="flex flex-wrap gap-4">
              {title.data.seasons?.filter(entry => entry.seasonNumber > 0).map((entry, index) => (
                <Link
                  key={entry.id}
                  ref={index === 0 ? node => { firstFocus.current = node; } : undefined}
                  href={`${currentTitleUrl}&season=${entry.seasonNumber}`}
                  data-tv-focus
                  data-season={entry.seasonNumber}
                  onClick={() => { lastSeason.current = entry.seasonNumber; setEpisodeError(false); }}
                  className={cn(control, "px-6 py-4 text-xl font-semibold")}
                >{entry.name}</Link>
              ))}
            </nav>
          )}
          {season > 0 && (
            <div className="max-w-4xl space-y-3">
              {episodes.isPending && <p role="status" className="text-xl">Loading episodes…</p>}
              {episodes.isError && <button data-tv-focus className={cn(control, "p-4")} onClick={() => void episodes.refetch()}>Retry loading episodes</button>}
              {episodeError && <p role="alert" className="text-rose-300">The episode could not be updated. Try again.</p>}
              {episodes.data?.episodes?.map((episode, index) => (
                <button
                  type="button"
                  key={episode.id}
                  ref={index === 0 ? node => { firstFocus.current = node; } : undefined}
                  data-tv-focus
                  aria-pressed={episode.watched}
                  aria-busy={savingEpisode === episode.episodeNumber}
                  onClick={() => toggleEpisode(episode.episodeNumber, episode.watched)}
                  className={cn(control, "flex w-full items-center gap-4 px-5 py-4 text-lg")}
                >
                  <span className="text-violet-300">{episode.episodeNumber}</span>
                  <span className="flex-1 font-medium">{episode.name}</span>
                  {episode.watched && <Check aria-hidden="true" className="size-6 text-green-400" />}
                  <span className="text-sm">{savingEpisode === episode.episodeNumber ? "Saving…" : episode.watched ? "Watched" : "Mark watched"}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
