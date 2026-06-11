import { Router, type IRouter } from "express";
import { getMovieDetails, getTvDetails, getCredits, getVideos, getSimilar, getWatchProviders } from "../lib/tmdb";
import { db, watchlistTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  GetMediaDetailsParams,
  GetMediaDetailsResponse,
  GetMediaCreditsParams,
  GetMediaCreditsResponse,
  GetMediaVideosParams,
  GetMediaVideosResponse,
  GetSimilarMediaParams,
  GetSimilarMediaResponse,
  GetWatchProvidersParams,
  GetWatchProvidersResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/media/:mediaType/:tmdbId", async (req, res): Promise<void> => {
  const params = GetMediaDetailsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { mediaType, tmdbId } = params.data;
  try {
    const details = mediaType === "tv"
      ? await getTvDetails(tmdbId)
      : await getMovieDetails(tmdbId);

    const [watchlistEntry] = await db
      .select()
      .from(watchlistTable)
      .where(and(eq(watchlistTable.tmdbId, tmdbId), eq(watchlistTable.mediaType, mediaType)));

    const response = {
      ...details,
      watchlistEntry: watchlistEntry
        ? {
            id: watchlistEntry.id,
            tmdbId: watchlistEntry.tmdbId,
            mediaType: watchlistEntry.mediaType as "movie" | "tv",
            status: watchlistEntry.status as "watching" | "watched" | "want_to_watch",
            userRating: watchlistEntry.userRating ?? null,
            notes: watchlistEntry.notes ?? null,
            addedAt: watchlistEntry.addedAt.toISOString(),
            updatedAt: watchlistEntry.updatedAt.toISOString(),
            title: watchlistEntry.title,
            posterPath: watchlistEntry.posterPath ?? null,
            backdropPath: watchlistEntry.backdropPath ?? null,
            releaseDate: watchlistEntry.releaseDate ?? null,
            voteAverage: watchlistEntry.voteAverage ?? null,
            genreIds: (watchlistEntry.genreIds ?? []).map(Number),
            overview: watchlistEntry.overview ?? null,
          }
        : null,
    };
    res.json(GetMediaDetailsResponse.parse(response));
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 404) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    req.log.error({ err }, "Media details error");
    res.status(500).json({ error: "Failed to get media details" });
  }
});

router.get("/media/:mediaType/:tmdbId/credits", async (req, res): Promise<void> => {
  const params = GetMediaCreditsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { mediaType, tmdbId } = params.data;
  try {
    const credits = await getCredits(mediaType, tmdbId);
    res.json(GetMediaCreditsResponse.parse(credits));
  } catch (err: unknown) {
    req.log.error({ err }, "Credits error");
    res.status(500).json({ error: "Failed to get credits" });
  }
});

router.get("/media/:mediaType/:tmdbId/videos", async (req, res): Promise<void> => {
  const params = GetMediaVideosParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { mediaType, tmdbId } = params.data;
  try {
    const videos = await getVideos(mediaType, tmdbId);
    res.json(GetMediaVideosResponse.parse(videos));
  } catch (err: unknown) {
    req.log.error({ err }, "Videos error");
    res.status(500).json({ error: "Failed to get videos" });
  }
});

router.get("/media/:mediaType/:tmdbId/similar", async (req, res): Promise<void> => {
  const params = GetSimilarMediaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { mediaType, tmdbId } = params.data;
  try {
    const similar = await getSimilar(mediaType, tmdbId);
    res.json(GetSimilarMediaResponse.parse(similar));
  } catch (err: unknown) {
    req.log.error({ err }, "Similar error");
    res.status(500).json({ error: "Failed to get similar" });
  }
});

router.get("/media/:mediaType/:tmdbId/watch-providers", async (req, res): Promise<void> => {
  const params = GetWatchProvidersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { mediaType, tmdbId } = params.data;
  try {
    const providers = await getWatchProviders(mediaType, tmdbId, "SE");
    res.json(GetWatchProvidersResponse.parse(providers));
  } catch (err: unknown) {
    req.log.error({ err }, "Watch providers error");
    res.status(500).json({ error: "Failed to get watch providers" });
  }
});

export default router;
