import { Router, type IRouter } from "express";
import { searchMulti, searchMovies, searchTv, discoverMovies, discoverTv, getTrendingAll, getTrendingType, getGenres } from "../lib/tmdb";
import {
  SearchMediaQueryParams,
  SearchMediaResponse,
  DiscoverMediaQueryParams,
  DiscoverMediaResponse,
  GetTrendingQueryParams,
  GetTrendingResponse,
  GetGenresResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/search", async (req, res): Promise<void> => {
  const parsed = SearchMediaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { query, type = "all", page = 1 } = parsed.data;
  try {
    let result;
    if (type === "movie") result = await searchMovies(query, page);
    else if (type === "tv") result = await searchTv(query, page);
    else result = await searchMulti(query, page);
    res.json(SearchMediaResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Search error");
    res.status(500).json({ error: "Failed to search" });
  }
});

router.get("/discover", async (req, res): Promise<void> => {
  const parsed = DiscoverMediaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type = "movie", genre, sort_by = "popularity.desc", page = 1 } = parsed.data;
  try {
    let result;
    const params = { genre: genre ?? undefined, sort_by, page };
    if (type === "tv") result = await discoverTv(params);
    else result = await discoverMovies(params);
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
  try {
    let result;
    if (type === "all") result = await getTrendingAll(time_window);
    else result = await getTrendingType(type, time_window);
    res.json(GetTrendingResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Trending error");
    res.status(500).json({ error: "Failed to get trending" });
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
