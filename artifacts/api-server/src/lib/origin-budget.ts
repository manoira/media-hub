import { serializeWatchlistItem } from "./watchlist-item";
import { CARD_OVERVIEW_CHARS } from "./card-overview";

/** Documented catalog size. Synthetic rows, not a database read. */
export const CATALOG_TITLES = 1250;
export const TV_TITLES = 438;
const OVERVIEW_CHARS = 420;
const KEYWORD_COUNT = 12;
const NOTES_EVERY = 12;
const HOME_RAILS = 9;
const HOME_PAGE = 20;
const LIST_COUNT = 8;
const OPENED_LIST_TITLES = 40;
const NOTIFICATIONS = 40;
const EPISODES_PER_SHOW = 12;
const SEASON_EPISODES = 10;

const overview = "A ".repeat(OVERVIEW_CHARS / 2).trim();

function watchlistRow(index: number) {
  const updated = new Date(Date.UTC(2026, 7, 1, 0, 0, index % 60));
  return {
    id: index + 1,
    tmdbId: 1000 + index,
    mediaType: index < TV_TITLES ? "tv" : "movie",
    status: "want_to_watch",
    userRating: null,
    notes: index % NOTES_EVERY === 0 ? "Short personal note kept for the review panel." : null,
    addedAt: updated,
    updatedAt: updated,
    title: `Title ${index}`,
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    releaseDate: "2020-01-01",
    originalLanguage: "en",
    adult: false,
    voteAverage: 7.2,
    genreIds: ["18", "35"],
    keywordIds: Array.from({ length: KEYWORD_COUNT }, (_, keyword) => keyword + 1),
    tags: index % 20 === 0 ? ["favorite"] : [],
    overview,
  };
}

type Serialized = ReturnType<typeof serializeWatchlistItem>;

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function fullItem(item: Serialized) {
  return {
    ...item,
    backdropPath: "/backdrop.jpg",
    keywordIds: Array.from({ length: KEYWORD_COUNT }, (_, keyword) => keyword + 1),
    overview,
  };
}

export function measureCatalogPayloads() {
  const narrow = Array.from({ length: CATALOG_TITLES }, (_, index) => serializeWatchlistItem(watchlistRow(index) as never));
  const wide = narrow.map(fullItem);
  const narrowBytes = bytes(narrow);
  const wideBytes = bytes(wide);
  const homeCard = {
    tmdbId: 1,
    mediaType: "movie",
    title: "Title",
    originalTitle: "Title",
    overview: narrow[0]?.overview ?? "",
    posterPath: "/poster.jpg",
    backdropPath: null,
    releaseDate: "2020-01-01",
    voteAverage: 7.2,
    voteCount: 1000,
    popularity: 20,
    genreIds: [18],
    adult: false,
    originalLanguage: "en",
  };
  const wideHomeCard = { ...homeCard, overview, backdropPath: "/backdrop.jpg" };
  const homeNarrow = bytes({ rails: HOME_RAILS, sample: Array.from({ length: HOME_RAILS * HOME_PAGE }, () => homeCard) });
  const homeWide = bytes({ rails: HOME_RAILS, sample: Array.from({ length: HOME_RAILS * HOME_PAGE }, () => wideHomeCard) });
  const progress = bytes({
    items: Object.fromEntries(Array.from({ length: TV_TITLES }, (_, index) => [
      String(1000 + index),
      { tmdbId: 1000 + index, totalWatched: EPISODES_PER_SHOW, watchedBySeasonNumber: { 1: Array.from({ length: EPISODES_PER_SHOW }, (_, episode) => episode + 1) } },
    ])),
  });
  const season = bytes({
    episodes: Array.from({ length: SEASON_EPISODES }, (_, episode) => ({
      episodeNumber: episode + 1,
      name: `Episode ${episode + 1}`,
      overview,
      stillPath: "/still.jpg",
    })),
  });
  const notifications = bytes(Array.from({ length: NOTIFICATIONS }, (_, index) => ({
    id: index,
    title: `Title ${index}`,
    message: "A saved update.",
    read: false,
  })));
  const lists = bytes(Array.from({ length: LIST_COUNT }, (_, index) => ({
    id: index,
    name: `List ${index}`,
    itemCount: 10,
    previewPosters: ["/a.jpg"],
  })));
  const openedList = bytes(narrow.slice(0, OPENED_LIST_TITLES));
  const openedListWide = bytes(wide.slice(0, OPENED_LIST_TITLES));

  return {
    overviewCharsBefore: overview.length,
    overviewCharsAfter: narrow[0]?.overview?.length ?? 0,
    cardOverviewCap: CARD_OVERVIEW_CHARS,
    watchlistBytesBefore: wideBytes,
    watchlistBytesAfter: narrowBytes,
    homeBytesBefore: homeWide,
    homeBytesAfter: homeNarrow,
    progressBytes: progress,
    oneSeasonBytes: season,
    notificationBytes: notifications,
    listSummaryBytes: lists,
    openedListBytesBefore: openedListWide,
    openedListBytesAfter: openedList,
  };
}

export type PassCall = { name: string; bytes: number; times: number };

/** One signed-in pass: catalog, one filter change, lists, one list, Updates. No Discover and no TMDB. */
export function catalogPass(kind: "main" | "branch", payloads: ReturnType<typeof measureCatalogPayloads>): PassCall[] {
  const watchlist = kind === "branch" ? payloads.watchlistBytesAfter : payloads.watchlistBytesBefore;
  const opened = kind === "branch" ? payloads.openedListBytesAfter : payloads.openedListBytesBefore;
  const calls: PassCall[] = [
    { name: "GET /api/session", bytes: 24, times: 1 },
    { name: "GET /api/watchlist", bytes: watchlist, times: 1 },
    { name: "GET /api/genres", bytes: 1800, times: 1 },
    { name: "GET /api/notifications/unread-count", bytes: 12, times: 1 },
    { name: "GET /api/progress/tv/batch", bytes: payloads.progressBytes, times: 1 },
    { name: "GET /api/lists", bytes: payloads.listSummaryBytes, times: 1 },
    { name: "GET /api/lists/:id", bytes: opened, times: 1 },
  ];
  if (kind === "main") {
    calls.push(
      { name: "GET /api/notifications?refresh=true", bytes: payloads.notificationBytes, times: 2 },
    );
  } else {
    calls.push(
      { name: "GET /api/notifications", bytes: payloads.notificationBytes, times: 1 },
      { name: "GET /api/notifications/unread-count", bytes: 12, times: 1 },
    );
  }
  return calls;
}

export function passTotals(calls: PassCall[]) {
  const responses = calls.reduce((sum, call) => sum + call.times, 0);
  const bytes = calls.reduce((sum, call) => sum + call.bytes * call.times, 0);
  return { responses, bytes };
}
