import { Router, type IRouter } from "express";
import { searchMulti, searchMovies, searchTv, discoverMovies, discoverTv, getTrendingAll, getTrendingType, getGenres, getPopular, getTopRated, getNowPlaying, getUpcoming, getOnAir, searchByTag } from "../lib/tmdb";
import { applyExcludeTracked, parseExcludeTrackedFromQuery } from "../lib/exclude-tracked";
import {
  SearchMediaQueryParams,
  SearchMediaResponse,
  DiscoverMediaQueryParams,
  DiscoverMediaResponse,
  GetTrendingQueryParams,
  GetTrendingResponse,
  GetGenresResponse,
  GetBrowseCategoryQueryParams,
  GetBrowseCategoryResponse,
  SearchByTagQueryParams,
  SearchByTagResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/search", async (req, res): Promise<void> => {
  const parsed = SearchMediaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { query, type = "all", page = 1 } = parsed.data;
  const excludeTracked = parseExcludeTrackedFromQuery(req.query);
  try {
    let result;
    if (type === "movie") result = await searchMovies(query, page);
    else if (type === "tv") result = await searchTv(query, page);
    else result = await searchMulti(query, page);

    result = await applyExcludeTracked(result, excludeTracked);
    res.json(SearchMediaResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Search error");
    res.status(500).json({ error: "Failed to search" });
  }
});

router.get("/search/by-tag", async (req, res): Promise<void> => {
  const parsed = SearchByTagQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { query, type = "all", page = 1 } = parsed.data;
  const excludeTracked = parseExcludeTrackedFromQuery(req.query);
  try {
    let result = await searchByTag(query, type, page);
    result = await applyExcludeTracked(result, excludeTracked);
    res.json(SearchByTagResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Tag search error");
    res.status(500).json({ error: "Failed to search by tag" });
  }
});

router.get("/discover", async (req, res): Promise<void> => {
  const parsed = DiscoverMediaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type = "movie", genre, sort_by = "popularity.desc", min_rating, min_year, max_year, language, page = 1 } = parsed.data;
  const excludeTracked = parseExcludeTrackedFromQuery(req.query);
  try {
    let result;
    const params = {
      genre: genre ?? undefined,
      sort_by,
      page,
      min_rating: min_rating ?? undefined,
      min_year: min_year ?? undefined,
      max_year: max_year ?? undefined,
      language: language ?? undefined,
    };
    if (type === "tv") result = await discoverTv(params);
    else result = await discoverMovies(params);

    result = await applyExcludeTracked(result, excludeTracked);
    res.json(DiscoverMediaResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Discover error");
    res.status(500).json({ error: "Failed to discover" });
  }
});

router.get("/trending", async (req, res): Promise<void> => {
  const parsed = GetTrendingQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type = "all", time_window = "week" } = parsed.data;
  const excludeTracked = parseExcludeTrackedFromQuery(req.query);
  try {
    let result;
    if (type === "all") result = await getTrendingAll(time_window);
    else result = await getTrendingType(type, time_window);

    result = await applyExcludeTracked(result, excludeTracked);
    res.json(GetTrendingResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Trending error");
    res.status(500).json({ error: "Failed to get trending" });
  }
});

router.get("/browse", async (req, res): Promise<void> => {
  const parsed = GetBrowseCategoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { category, page = 1 } = parsed.data;
  const excludeTracked = parseExcludeTrackedFromQuery(req.query);
  try {
    let result;
    switch (category) {
      case "popular_movies":    result = await getPopular("movie", page); break;
      case "popular_tv":        result = await getPopular("tv", page); break;
      case "top_rated_movies":  result = await getTopRated("movie", page); break;
      case "top_rated_tv":      result = await getTopRated("tv", page); break;
      case "now_playing":       result = await getNowPlaying(page); break;
      case "upcoming":          result = await getUpcoming(page); break;
      case "on_air":            result = await getOnAir(page); break;
      default:                  res.status(400).json({ error: "Unknown category" }); return;
    }

    result = await applyExcludeTracked(result, excludeTracked);
    res.json(GetBrowseCategoryResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Browse error");
    res.status(500).json({ error: "Failed to browse category" });
  }
});

router.get("/genres", async (req, res): Promise<void> => {
  try {
    const genres = await getGenres();
    res.json(GetGenresResponse.parse(genres));
  } catch (err: unknown) {
    req.log.error({ err }, "Genres error");
    res.status(500).json({ error: "Failed to get genres" });
  }
});

export default router;
