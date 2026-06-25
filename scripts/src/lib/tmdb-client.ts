import type { MediaType } from "./notion-entries.js";

const TMDB_BASE = "https://api.themoviedb.org/3";

function getApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error("TMDB_API_KEY is not set (artifacts/api-server/.env)");
  return key;
}

async function tmdbGet<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T | null> {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set("api_key", getApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

type FindResponse = {
  movie_results?: Array<{ id: number }>;
  tv_results?: Array<{ id: number }>;
};

type SearchResponse = {
  results?: Array<{ id: number }>;
};

export function createTmdbClient() {
  return {
    async findByImdb(imdbId: string): Promise<{ tmdbId: number; mediaType: MediaType } | null> {
      const data = await tmdbGet<FindResponse>(`/find/${imdbId}`, { external_source: "imdb_id" });
      if (!data) return null;
      if (data.movie_results?.[0]) {
        return { tmdbId: data.movie_results[0].id, mediaType: "movie" };
      }
      if (data.tv_results?.[0]) {
        return { tmdbId: data.tv_results[0].id, mediaType: "tv" };
      }
      return null;
    },

    async searchByTitle(
      title: string,
      options: { year?: number; mediaType?: MediaType },
    ): Promise<{ tmdbId: number; mediaType: MediaType } | null> {
      const types: MediaType[] = options.mediaType ? [options.mediaType] : ["movie", "tv"];

      for (const mediaType of types) {
        const endpoint = mediaType === "tv" ? "/search/tv" : "/search/movie";
        const data = await tmdbGet<SearchResponse>(endpoint, {
          query: title,
          include_adult: "false",
          language: "sv-SE",
          ...(options.year && mediaType === "movie" ? { year: options.year } : {}),
          ...(options.year && mediaType === "tv" ? { first_air_date_year: options.year } : {}),
        });
        const hit = data?.results?.[0];
        if (hit) return { tmdbId: hit.id, mediaType };
      }

      return null;
    },
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
