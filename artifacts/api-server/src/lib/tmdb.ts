import { getProviderLink, resolveWatchProviderLinks } from "./watch-provider-links";

const TMDB_BASE = "https://api.themoviedb.org/3";

/** TMDB UI locale for titles, overviews, and genre names (e.g. sv-SE, en-US). */
export function getTmdbLanguage(): string {
  return process.env.TMDB_LANGUAGE?.trim() || "sv-SE";
}

/** ISO 3166-1 region for theatrical release filters (popular, now playing, etc.). */
export function getTmdbRegion(): string {
  return process.env.TMDB_REGION?.trim().toUpperCase() || "SE";
}

function isSwedishTmdbLocale(): boolean {
  const locale = getTmdbLanguage().toLowerCase();
  return locale === "sv" || locale.startsWith("sv-");
}

/** Prefer the original Swedish title when TMDB returns an English localized name. */
export function resolveLocalizedTitle(
  title: string | null | undefined,
  originalTitle: string | null | undefined,
  originalLanguage: string | null | undefined,
  alternateName?: string | null | undefined,
): string {
  const localized = (title ?? alternateName ?? "").trim();
  const original = (originalTitle ?? "").trim();
  const lang = originalLanguage?.toLowerCase() ?? "";

  if (isSwedishTmdbLocale() && lang === "sv" && original) {
    if (!localized || localized.toLowerCase() !== original.toLowerCase()) {
      return original;
    }
  }

  return localized || original || "Unknown";
}

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set");
  return key;
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey());
  url.searchParams.set("language", params.language !== undefined ? String(params.language) : getTmdbLanguage());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && k !== "language") url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(`TMDB ${res.status}: ${text}`), { status: res.status });
  }
  return res.json() as Promise<T>;
}

interface TmdbMovie {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  adult?: boolean;
  original_language?: string;
  media_type?: string;
}

interface TmdbGenre { id: number; name: string; }
interface TmdbCompany { id: number; name: string; logo_path?: string; origin_country: string; }
interface TmdbNetwork { id: number; name: string; logo_path?: string; origin_country: string; }
interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  overview?: string;
  poster_path?: string;
  air_date?: string;
  episode_count?: number;
}
interface TmdbCast {
  id: number;
  name: string;
  character?: string;
  profile_path?: string;
  order?: number;
  known_for_department?: string;
}
interface TmdbCrew {
  id: number;
  name: string;
  job?: string;
  department?: string;
  profile_path?: string;
}
interface TmdbVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at?: string;
}

export function normalizeMediaItem(item: TmdbMovie, mediaTypeOverride?: string) {
  const mediaType = mediaTypeOverride ?? item.media_type ?? "movie";
  const isTv = mediaType === "tv";
  return {
    tmdbId: item.id,
    mediaType,
    title: resolveLocalizedTitle(
      isTv ? item.name : item.title,
      isTv ? item.original_name : item.original_title,
      item.original_language,
      isTv ? item.name : item.title,
    ),
    originalTitle: item.original_title ?? item.original_name ?? null,
    overview: item.overview ?? null,
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    releaseDate: item.release_date ?? item.first_air_date ?? null,
    voteAverage: item.vote_average ?? null,
    voteCount: item.vote_count ?? null,
    popularity: item.popularity ?? null,
    genreIds: item.genre_ids ?? [],
    adult: item.adult ?? null,
    originalLanguage: item.original_language ?? null,
  };
}

export async function searchMulti(query: string, page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    "/search/multi",
    { query, page, include_adult: false }
  );
  const results = data.results
    .filter(r => r.media_type === "movie" || r.media_type === "tv")
    .map(r => normalizeMediaItem(r));
  return { results, totalResults: data.total_results, totalPages: data.total_pages, page: data.page };
}

export async function searchMovies(query: string, page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    "/search/movie",
    { query, page, include_adult: false }
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "movie")),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

export async function searchTv(query: string, page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    "/search/tv",
    { query, page, include_adult: false }
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "tv")),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

export interface DiscoverParams {
  genre?: number;
  sort_by?: string;
  page?: number;
  min_rating?: number;
  min_year?: number;
  max_year?: number;
  language?: string;
}

// Map our logical sort values to the field names TMDB's movie/tv discover
// endpoints actually accept (they differ between movie and tv).
const MOVIE_SORT_MAP: Record<string, string> = {
  "popularity.desc": "popularity.desc",
  "vote_average.desc": "vote_average.desc",
  "vote_count.desc": "vote_count.desc",
  "release_date.desc": "primary_release_date.desc",
  "release_date.asc": "primary_release_date.asc",
  "revenue.desc": "revenue.desc",
  "title.asc": "title.asc",
};

const TV_SORT_MAP: Record<string, string> = {
  "popularity.desc": "popularity.desc",
  "vote_average.desc": "vote_average.desc",
  "vote_count.desc": "vote_count.desc",
  "release_date.desc": "first_air_date.desc",
  "release_date.asc": "first_air_date.asc",
  "revenue.desc": "popularity.desc", // revenue isn't supported for tv
  "title.asc": "name.asc",
};

function buildDiscoverQuery(
  mediaType: "movie" | "tv",
  params: DiscoverParams,
): Record<string, string | number | boolean | undefined> {
  const sortKey = params.sort_by ?? "popularity.desc";
  const sortMap = mediaType === "movie" ? MOVIE_SORT_MAP : TV_SORT_MAP;
  const sort_by = sortMap[sortKey] ?? "popularity.desc";

  const dateField = mediaType === "movie" ? "primary_release_date" : "first_air_date";

  // When ranking by rating (or filtering by a minimum rating), require a
  // minimum vote count so well-known titles surface instead of obscure
  // perfect scores from a handful of votes.
  const needsVoteFloor = sortKey === "vote_average.desc" || params.min_rating !== undefined;
  const voteFloor = mediaType === "movie" ? 300 : 100;

  const query: Record<string, string | number | boolean | undefined> = {
    with_genres: params.genre,
    sort_by,
    page: params.page ?? 1,
    with_original_language: params.language,
    "vote_average.gte": params.min_rating,
    "vote_count.gte": needsVoteFloor ? voteFloor : undefined,
    [`${dateField}.gte`]: params.min_year ? `${params.min_year}-01-01` : undefined,
    [`${dateField}.lte`]: params.max_year ? `${params.max_year}-12-31` : undefined,
  };

  if (mediaType === "movie") query.include_adult = false;

  return query;
}

export async function discoverMovies(params: DiscoverParams) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    "/discover/movie",
    buildDiscoverQuery("movie", params),
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "movie")),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

export async function discoverTv(params: DiscoverParams) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    "/discover/tv",
    buildDiscoverQuery("tv", params),
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "tv")),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

export async function getTrendingAll(timeWindow: string, page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/trending/all/${timeWindow}`,
    { page }
  );
  const results = data.results
    .filter(r => r.media_type === "movie" || r.media_type === "tv")
    .map(r => normalizeMediaItem(r));
  return { results, totalResults: data.total_results, totalPages: data.total_pages, page: data.page };
}

export async function getTrendingType(type: string, timeWindow: string, page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/trending/${type}/${timeWindow}`,
    { page }
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, type)),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

export async function getGenres() {
  const [movieGenres, tvGenres] = await Promise.all([
    tmdbFetch<{ genres: TmdbGenre[] }>("/genre/movie/list"),
    tmdbFetch<{ genres: TmdbGenre[] }>("/genre/tv/list"),
  ]);
  return {
    movieGenres: movieGenres.genres,
    tvGenres: tvGenres.genres,
  };
}

export async function getMovieDetails(tmdbId: number) {
  const data = await tmdbFetch<{
    id: number; title: string; original_title?: string; overview?: string; tagline?: string;
    poster_path?: string; backdrop_path?: string; release_date?: string; status?: string;
    vote_average?: number; vote_count?: number; popularity?: number; runtime?: number;
    budget?: number; revenue?: number; homepage?: string; imdb_id?: string;
    original_language?: string; adult?: boolean;
    spoken_languages?: { english_name: string }[];
    production_countries?: { name: string }[];
    production_companies?: TmdbCompany[];
    genres?: TmdbGenre[];
  }>(`/movie/${tmdbId}`);

  return {
    tmdbId: data.id,
    mediaType: "movie",
    title: resolveLocalizedTitle(data.title, data.original_title, data.original_language),
    originalTitle: data.original_title ?? null,
    overview: data.overview ?? null,
    tagline: data.tagline ?? null,
    posterPath: data.poster_path ?? null,
    backdropPath: data.backdrop_path ?? null,
    releaseDate: data.release_date ?? null,
    status: data.status ?? null,
    voteAverage: data.vote_average ?? null,
    voteCount: data.vote_count ?? null,
    popularity: data.popularity ?? null,
    runtime: data.runtime ?? null,
    budget: data.budget ?? null,
    revenue: data.revenue ?? null,
    homepage: data.homepage ?? null,
    imdbId: data.imdb_id ?? null,
    originalLanguage: data.original_language ?? null,
    adult: data.adult ?? null,
    spokenLanguages: (data.spoken_languages ?? []).map(l => l.english_name),
    productionCountries: (data.production_countries ?? []).map(c => c.name),
    productionCompanies: (data.production_companies ?? []).map(c => ({
      id: c.id, name: c.name, logoPath: c.logo_path ?? null, originCountry: c.origin_country,
    })),
    genres: (data.genres ?? []),
    numberOfSeasons: null,
    numberOfEpisodes: null,
    episodeRunTime: [],
    networks: [],
    createdBy: [],
    seasons: [],
  };
}

export async function getTvDetails(tmdbId: number) {
  const data = await tmdbFetch<{
    id: number; name: string; original_name?: string; overview?: string; tagline?: string;
    poster_path?: string; backdrop_path?: string; first_air_date?: string; status?: string;
    vote_average?: number; vote_count?: number; popularity?: number;
    homepage?: string; original_language?: string; adult?: boolean;
    number_of_seasons?: number; number_of_episodes?: number;
    episode_run_time?: number[];
    spoken_languages?: { english_name: string }[];
    production_countries?: { name: string }[];
    production_companies?: TmdbCompany[];
    genres?: TmdbGenre[];
    networks?: TmdbNetwork[];
    created_by?: { name: string }[];
    seasons?: TmdbSeason[];
  }>(`/tv/${tmdbId}`);

  return {
    tmdbId: data.id,
    mediaType: "tv",
    title: resolveLocalizedTitle(data.name, data.original_name, data.original_language),
    originalTitle: data.original_name ?? null,
    overview: data.overview ?? null,
    tagline: data.tagline ?? null,
    posterPath: data.poster_path ?? null,
    backdropPath: data.backdrop_path ?? null,
    releaseDate: data.first_air_date ?? null,
    status: data.status ?? null,
    voteAverage: data.vote_average ?? null,
    voteCount: data.vote_count ?? null,
    popularity: data.popularity ?? null,
    runtime: null,
    budget: null,
    revenue: null,
    homepage: data.homepage ?? null,
    imdbId: null,
    originalLanguage: data.original_language ?? null,
    adult: data.adult ?? null,
    spokenLanguages: (data.spoken_languages ?? []).map(l => l.english_name),
    productionCountries: (data.production_countries ?? []).map(c => c.name),
    productionCompanies: (data.production_companies ?? []).map(c => ({
      id: c.id, name: c.name, logoPath: c.logo_path ?? null, originCountry: c.origin_country,
    })),
    genres: (data.genres ?? []),
    numberOfSeasons: data.number_of_seasons ?? null,
    numberOfEpisodes: data.number_of_episodes ?? null,
    episodeRunTime: data.episode_run_time ?? [],
    networks: (data.networks ?? []).map(n => ({
      id: n.id, name: n.name, logoPath: n.logo_path ?? null, originCountry: n.origin_country,
    })),
    createdBy: (data.created_by ?? []).map(c => c.name),
    seasons: (data.seasons ?? []).map(s => ({
      id: s.id,
      seasonNumber: s.season_number,
      name: s.name,
      overview: s.overview ?? null,
      posterPath: s.poster_path ?? null,
      airDate: s.air_date ?? null,
      episodeCount: s.episode_count ?? null,
    })),
  };
}

export async function getCredits(mediaType: string, tmdbId: number) {
  const endpoint = mediaType === "tv" ? `/tv/${tmdbId}/aggregate_credits` : `/movie/${tmdbId}/credits`;
  const data = await tmdbFetch<{ cast?: TmdbCast[]; crew?: TmdbCrew[] }>(endpoint);
  return {
    cast: (data.cast ?? []).slice(0, 30).map(c => ({
      id: c.id,
      name: c.name,
      character: c.character ?? null,
      profilePath: c.profile_path ?? null,
      order: c.order ?? null,
      knownForDepartment: c.known_for_department ?? null,
    })),
    crew: (data.crew ?? [])
      .filter(c => ["Director", "Producer", "Screenplay", "Writer", "Creator", "Executive Producer"].includes(c.job ?? ""))
      .slice(0, 20)
      .map(c => ({
        id: c.id,
        name: c.name,
        job: c.job ?? null,
        department: c.department ?? null,
        profilePath: c.profile_path ?? null,
      })),
  };
}

export async function getVideos(mediaType: string, tmdbId: number) {
  const data = await tmdbFetch<{ results: TmdbVideo[] }>(`/${mediaType}/${tmdbId}/videos`);
  return {
    results: (data.results ?? []).map(v => ({
      id: v.id,
      key: v.key,
      name: v.name,
      site: v.site,
      type: v.type,
      official: v.official,
      publishedAt: v.published_at ?? null,
    })),
  };
}

interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview?: string;
  air_date?: string;
  runtime?: number;
  vote_average?: number;
  still_path?: string;
}

export async function getSeasonDetails(tmdbId: number, seasonNumber: number) {
  const data = await tmdbFetch<{
    id: number;
    name: string;
    overview?: string;
    poster_path?: string;
    air_date?: string;
    season_number: number;
    episodes?: TmdbEpisode[];
  }>(`/tv/${tmdbId}/season/${seasonNumber}`);

  return {
    id: data.id,
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview ?? null,
    posterPath: data.poster_path ?? null,
    airDate: data.air_date ?? null,
    episodes: (data.episodes ?? []).map(e => ({
      id: e.id,
      episodeNumber: e.episode_number,
      seasonNumber: e.season_number,
      name: e.name,
      overview: e.overview ?? null,
      airDate: e.air_date ?? null,
      runtime: e.runtime ?? null,
      voteAverage: e.vote_average ?? null,
      stillPath: e.still_path ?? null,
    })),
  };
}

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
  display_priority: number;
}
interface TmdbWatchProvidersCountry {
  link?: string;
  flatrate?: TmdbProvider[];
  rent?: TmdbProvider[];
  buy?: TmdbProvider[];
  free?: TmdbProvider[];
  ads?: TmdbProvider[];
}

function normalizeProviders(
  list: TmdbProvider[] | undefined,
  linkMap: Map<string, string>,
  countryLink: string | null | undefined,
  category: "flatrate" | "free" | "ads" | "rent" | "buy",
) {
  return (list ?? []).map(p => ({
    providerId: p.provider_id,
    providerName: p.provider_name,
    logoPath: p.logo_path,
    displayPriority: p.display_priority,
    link: getProviderLink(linkMap, p.provider_id, p.provider_name, category, countryLink),
  }));
}

export async function getWatchProviders(mediaType: string, tmdbId: number, countryCode = "SE") {
  const data = await tmdbFetch<{ results: Record<string, TmdbWatchProvidersCountry> }>(
    `/${mediaType}/${tmdbId}/watch/providers`
  );
  const country: TmdbWatchProvidersCountry = data.results?.[countryCode] ?? {};
  const countryLink = country.link ?? null;
  const linkMap = await resolveWatchProviderLinks(countryLink);

  return {
    link: countryLink,
    flatrate: normalizeProviders(country.flatrate, linkMap, countryLink, "flatrate"),
    rent: normalizeProviders(country.rent, linkMap, countryLink, "rent"),
    buy: normalizeProviders(country.buy, linkMap, countryLink, "buy"),
    free: normalizeProviders(country.free, linkMap, countryLink, "free"),
    ads: normalizeProviders(country.ads, linkMap, countryLink, "ads"),
  };
}

export async function getPopular(mediaType: "movie" | "tv", page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/${mediaType}/popular`,
    mediaType === "movie" ? { page, region: getTmdbRegion() } : { page },
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, mediaType)),
    totalResults: data.total_results, totalPages: data.total_pages, page: data.page,
  };
}

export async function getTopRated(mediaType: "movie" | "tv", page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/${mediaType}/top_rated`, { page }
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, mediaType)),
    totalResults: data.total_results, totalPages: data.total_pages, page: data.page,
  };
}

export async function getNowPlaying(page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/movie/now_playing`,
    { page, region: getTmdbRegion() },
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "movie")),
    totalResults: data.total_results, totalPages: data.total_pages, page: data.page,
  };
}

export async function getUpcoming(page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/movie/upcoming`,
    { page, region: getTmdbRegion() },
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "movie")),
    totalResults: data.total_results, totalPages: data.total_pages, page: data.page,
  };
}

export async function getOnAir(page = 1) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/tv/on_the_air`, { page }
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, "tv")),
    totalResults: data.total_results, totalPages: data.total_pages, page: data.page,
  };
}

export async function getSimilar(mediaType: string, tmdbId: number) {
  const data = await tmdbFetch<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>(
    `/${mediaType}/${tmdbId}/similar`
  );
  return {
    results: data.results.map(r => normalizeMediaItem(r, mediaType)),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

interface TmdbPerson {
  id: number;
  name: string;
  profile_path?: string;
  known_for_department?: string;
  known_for?: TmdbMovie[];
}

interface TmdbPersonDetails {
  id: number;
  name: string;
  biography?: string;
  birthday?: string;
  place_of_birth?: string;
  profile_path?: string;
  known_for_department?: string;
}

interface TmdbCombinedCredit extends TmdbMovie {
  media_type: string;
  character?: string;
}

function normalizePersonSummary(person: TmdbPerson) {
  return {
    id: person.id,
    name: person.name,
    profilePath: person.profile_path ?? null,
    knownForDepartment: person.known_for_department ?? null,
    knownFor: (person.known_for ?? [])
      .filter(item => item.media_type === "movie" || item.media_type === "tv" || !item.media_type)
      .slice(0, 3)
      .map(item => normalizeMediaItem(item, item.media_type === "tv" ? "tv" : "movie")),
  };
}

function normalizePersonDetails(person: TmdbPersonDetails) {
  return {
    id: person.id,
    name: person.name,
    profilePath: person.profile_path ?? null,
    biography: person.biography ?? null,
    birthday: person.birthday ?? null,
    placeOfBirth: person.place_of_birth ?? null,
    knownForDepartment: person.known_for_department ?? null,
  };
}

function normalizePersonCredit(credit: TmdbCombinedCredit) {
  const mediaType = credit.media_type === "tv" ? "tv" : "movie";
  return {
    ...normalizeMediaItem(credit, mediaType),
    character: credit.character ?? null,
  };
}

export async function searchPeople(query: string, page = 1) {
  const data = await tmdbFetch<{ results: TmdbPerson[]; total_results: number; total_pages: number; page: number }>(
    "/search/person",
    { query, page, include_adult: false }
  );
  return {
    results: data.results.map(normalizePersonSummary),
    totalResults: data.total_results,
    totalPages: data.total_pages,
    page: data.page,
  };
}

export async function getPersonDetails(personId: number) {
  const data = await tmdbFetch<TmdbPersonDetails>(`/person/${personId}`);
  return normalizePersonDetails(data);
}

export async function getPersonCredits(
  personId: number,
  type: "all" | "movie" | "tv" = "all",
  page = 1,
  pageSize = 24,
) {
  const [person, creditsData] = await Promise.all([
    getPersonDetails(personId),
    tmdbFetch<{ cast: TmdbCombinedCredit[] }>(`/person/${personId}/combined_credits`),
  ]);

  let credits = (creditsData.cast ?? [])
    .filter(c => c.media_type === "movie" || c.media_type === "tv")
    .map(normalizePersonCredit);

  if (type === "movie") credits = credits.filter(c => c.mediaType === "movie");
  else if (type === "tv") credits = credits.filter(c => c.mediaType === "tv");

  credits.sort((a, b) => {
    const dateA = a.releaseDate ? Date.parse(a.releaseDate) : 0;
    const dateB = b.releaseDate ? Date.parse(b.releaseDate) : 0;
    return dateB - dateA;
  });

  const totalResults = credits.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const results = credits.slice(start, start + pageSize);

  return {
    person,
    results,
    totalResults,
    totalPages,
    page: safePage,
  };
}

interface TmdbKeyword {
  id: number;
  name: string;
}

interface TmdbAltTitle {
  iso_3166_1?: string;
  title: string;
  type?: string;
}

const WRITER_JOBS = new Set([
  "Writer",
  "Screenplay",
  "Novel",
  "Author",
  "Story",
  "Book",
  "Characters",
  "Teleplay",
  "Original Story",
  "Short Story",
]);

const SOURCE_MATERIAL_PATTERN = /based on|adaptation|remake of|spin off|spin-off/i;

function normalizeKeyword(keyword: TmdbKeyword) {
  return { id: keyword.id, name: keyword.name };
}

export async function fetchKeywords(mediaType: string, tmdbId: number) {
  if (mediaType === "tv") {
    const data = await tmdbFetch<{ results?: TmdbKeyword[] }>(`/tv/${tmdbId}/keywords`);
    return (data.results ?? []).map(normalizeKeyword);
  }
  const data = await tmdbFetch<{ keywords?: TmdbKeyword[] }>(`/movie/${tmdbId}/keywords`);
  return (data.keywords ?? []).map(normalizeKeyword);
}

async function fetchAlternativeTitles(mediaType: string, tmdbId: number) {
  if (mediaType === "tv") {
    const data = await tmdbFetch<{ results?: TmdbAltTitle[] }>(`/tv/${tmdbId}/alternative_titles`);
    return (data.results ?? []).map(t => ({
      title: t.title,
      country: t.iso_3166_1 ?? null,
    }));
  }
  const data = await tmdbFetch<{ titles?: TmdbAltTitle[] }>(`/movie/${tmdbId}/alternative_titles`);
  return (data.titles ?? []).map(t => ({
    title: t.title,
    country: t.iso_3166_1 ?? null,
  }));
}

async function fetchWriters(mediaType: string, tmdbId: number) {
  const endpoint = mediaType === "tv" ? `/tv/${tmdbId}/aggregate_credits` : `/movie/${tmdbId}/credits`;
  const data = await tmdbFetch<{ crew?: TmdbCrew[] }>(endpoint);
  const seen = new Set<number>();
  const writers: { id: number; name: string; job: string | null; profilePath: string | null }[] = [];

  for (const member of data.crew ?? []) {
    if (!member.job || !WRITER_JOBS.has(member.job) || seen.has(member.id)) continue;
    seen.add(member.id);
    writers.push({
      id: member.id,
      name: member.name,
      job: member.job,
      profilePath: member.profile_path ?? null,
    });
  }

  return writers;
}

export async function getMediaMetadata(mediaType: string, tmdbId: number) {
  const [keywords, alternativeTitles, writers] = await Promise.all([
    fetchKeywords(mediaType, tmdbId),
    fetchAlternativeTitles(mediaType, tmdbId),
    fetchWriters(mediaType, tmdbId),
  ]);

  const sourceMaterial = keywords.filter(k => SOURCE_MATERIAL_PATTERN.test(k.name));

  return {
    keywords,
    sourceMaterial,
    writers,
    alternativeTitles,
  };
}

export async function searchByTag(query: string, type: "all" | "movie" | "tv" = "all", page = 1) {
  const keywordData = await tmdbFetch<{ results: TmdbKeyword[]; total_results: number; total_pages: number }>(
    "/search/keyword",
    { query, page: 1 },
  );

  const matchedKeywords = keywordData.results.slice(0, 5).map(normalizeKeyword);
  if (matchedKeywords.length === 0) {
    return {
      results: [],
      matchedKeywords: [],
      totalResults: 0,
      totalPages: 0,
      page: 1,
    };
  }

  const keywordParam = matchedKeywords.map(k => k.id).join("|");
  const discoverCalls: Promise<{ results: TmdbMovie[]; total_results: number; total_pages: number; page: number }>[] = [];

  if (type === "movie" || type === "all") {
    discoverCalls.push(
      tmdbFetch("/discover/movie", { with_keywords: keywordParam, sort_by: "popularity.desc", page, include_adult: false }),
    );
  }
  if (type === "tv" || type === "all") {
    discoverCalls.push(
      tmdbFetch("/discover/tv", { with_keywords: keywordParam, sort_by: "popularity.desc", page }),
    );
  }

  const pages = await Promise.all(discoverCalls);
  const merged = pages.flatMap((data, index) => {
    const mediaTypeOverride = type === "all" ? (index === 0 ? "movie" : "tv") : type;
    return data.results.map(r => normalizeMediaItem(r, mediaTypeOverride));
  });

  const deduped = Array.from(
    new Map(merged.map(item => [`${item.mediaType}:${item.tmdbId}`, item])).values(),
  );
  deduped.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  const totalResults = pages.reduce((sum, p) => sum + p.total_results, 0);
  const totalPages = Math.max(...pages.map(p => p.total_pages), 1);

  return {
    results: deduped,
    matchedKeywords,
    totalResults,
    totalPages,
    page,
  };
}
