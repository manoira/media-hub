import { useGetMediaDetails, useGetMediaCredits, useGetMediaVideos, useGetSimilarMedia, getGetMediaDetailsQueryKey, getGetMediaCreditsQueryKey, getGetMediaVideosQueryKey, getGetSimilarMediaQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { useMemo } from "react";
import { getTmdbImageUrl, getYoutubeEmbedUrl, formatRuntime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/media/watchlist-button";
import { ContentFilterToggles } from "@/components/media/content-filter-toggles";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaCard } from "@/components/media/media-card";
import { SeasonsPanel } from "@/components/media/seasons-panel";
import { WatchProviders } from "@/components/media/watch-providers";
import { MediaMetadataPanel } from "@/components/media/media-metadata-panel";
import { useHideTrackedPreference } from "@/hooks/use-hide-tracked";
import { useHideAdultPreference } from "@/hooks/use-hide-adult";
import { withExcludeAdult } from "@/lib/exclude-adult";
import { filterUntracked, useWatchlistIndex } from "@/hooks/use-watchlist-index";
import { UserReviewPanel } from "@/components/media/user-review-panel";
import { UserTagsPanel } from "@/components/media/user-tags-panel";
import { AddToListMenu } from "@/components/media/add-to-list-menu";

export function MediaDetail() {
  const { mediaType, tmdbId } = useParams();
  const id = Number(tmdbId);
  const type = mediaType as "movie" | "tv";

  const { data: details, isLoading: isLoadingDetails, isError: detailsError } = useGetMediaDetails(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetMediaDetailsQueryKey(type, id) }
  });

  const { data: credits } = useGetMediaCredits(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetMediaCreditsQueryKey(type, id) }
  });

  const { data: videos } = useGetMediaVideos(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetMediaVideosQueryKey(type, id) }
  });

  const { hideTracked, setHideTracked } = useHideTrackedPreference();
  const { hideAdult, setHideAdult } = useHideAdultPreference();
  const similarParams = withExcludeAdult({}, hideAdult);
  const { data: similar } = useGetSimilarMedia(type, id, similarParams, {
    query: { enabled: !!id && !!type, queryKey: getGetSimilarMediaQueryKey(type, id, similarParams) }
  });

  const { index } = useWatchlistIndex();
  const similarItems = useMemo(
    () => filterUntracked(similar?.results ?? [], index, hideTracked).slice(0, 10),
    [similar?.results, index, hideTracked],
  );

  if (isLoadingDetails) {
    return <div className="space-y-4">
      <Skeleton className="w-full h-[50vh] rounded-xl" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-20 w-full" />
    </div>;
  }

  if (detailsError) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-lg font-medium">Could not load this title.</p>
        <p className="text-sm text-muted-foreground">The server had a temporary problem. Try refreshing the page.</p>
      </div>
    );
  }

  if (!details) return <div className="py-20 text-center text-muted-foreground">Not found</div>;

  const backdropUrl = getTmdbImageUrl(details.backdropPath, "backdrop");
  const posterUrl = getTmdbImageUrl(details.posterPath, "poster");
  const trailer = videos?.results?.find(v => v.type === "Trailer" && v.site === "YouTube");

  return (
    <div className="space-y-10 pb-20">
      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 -mt-8 h-[60vh] min-h-[400px] overflow-hidden">
        {backdropUrl && (
          <>
            <img src={backdropUrl} alt={details.title} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
          </>
        )}
        
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pb-8 flex flex-col md:flex-row gap-8 items-end">
            {posterUrl && (
              <img src={posterUrl} alt={details.title} className="w-48 md:w-64 rounded-xl shadow-2xl hidden md:block" />
            )}
            
            <div className="flex-1 space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold drop-shadow-lg">{details.title}</h1>
              {details.tagline && <p className="text-xl text-muted-foreground italic drop-shadow-md">{details.tagline}</p>}
              
              <div className="flex flex-wrap items-center gap-3 text-sm font-medium">
                {details.voteAverage != null && (
                  <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 gap-1">
                    <span className="text-[10px] uppercase tracking-wide opacity-80">TMDB</span>
                    ★ {details.voteAverage.toFixed(1)}
                  </Badge>
                )}
                {details.watchlistEntry?.userRating != null && (
                  <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                    <span className="text-[10px] uppercase tracking-wide opacity-80">You</span>
                    ★ {details.watchlistEntry.userRating.toFixed(1)}
                  </Badge>
                )}
                <span>{details.releaseDate?.substring(0, 4)}</span>
                {details.runtime && <span>{formatRuntime(details.runtime)}</span>}
                {details.numberOfSeasons && <span>{details.numberOfSeasons} Seasons</span>}
                <div className="flex gap-2">
                  {details.genres?.map(g => (
                    <Badge key={g.id} variant="outline" className="bg-background/50 backdrop-blur-sm">{g.name}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4 flex-wrap items-center">
                <WatchlistButton mediaType={type} tmdbId={id} />
                {details.watchlistEntry && (
                  <AddToListMenu watchlistId={details.watchlistEntry.id} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8">
        <div className="md:col-span-2 space-y-8">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Overview</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">{details.overview}</p>
          </section>

          <UserReviewPanel
            mediaType={type}
            tmdbId={id}
            entry={details.watchlistEntry ?? null}
          />

          <UserTagsPanel
            mediaType={type}
            tmdbId={id}
            entry={details.watchlistEntry ?? null}
          />

          {credits?.cast && credits.cast.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold mb-4">Cast</h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {credits.cast.slice(0, 10).map(person => (
                  <Link
                    key={person.id}
                    href={`/person/${person.id}`}
                    className="min-w-[120px] max-w-[120px] flex flex-col gap-2 group/person"
                  >
                    <img 
                      src={getTmdbImageUrl(person.profilePath, "profile") || "/favicon.svg"} 
                      alt={person.name} 
                      className="w-full aspect-[2/3] object-cover rounded-lg bg-muted transition-transform group-hover/person:scale-[1.02]"
                    />
                    <div>
                      <p className="font-semibold text-sm leading-tight group-hover/person:text-primary transition-colors">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.character}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {trailer && (
            <section>
              <h2 className="text-2xl font-semibold mb-4">Trailer</h2>
              <div className="aspect-video rounded-xl overflow-hidden">
                <iframe
                  src={getYoutubeEmbedUrl(trailer.key) || ""}
                  className="w-full h-full"
                  allowFullScreen
                />
              </div>
            </section>
          )}

          <MediaMetadataPanel mediaType={type} tmdbId={id} />
        </div>

        <div className="space-y-6">
          <WatchProviders mediaType={type} tmdbId={id} />

          <div className="space-y-6 border border-border/50 rounded-xl p-6 bg-card/30 backdrop-blur-sm h-fit">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Status</h3>
              <p>{details.status}</p>
            </div>
            {details.originalLanguage && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Original Language</h3>
                <p className="uppercase">{details.originalLanguage}</p>
              </div>
            )}
            {details.spokenLanguages && details.spokenLanguages.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Languages</h3>
                <p>{details.spokenLanguages.join(", ")}</p>
              </div>
            )}
            {details.productionCountries && details.productionCountries.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Countries</h3>
                <p>{details.productionCountries.join(", ")}</p>
              </div>
            )}
            {details.imdbId && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">IMDb</h3>
                <a
                  href={`https://www.imdb.com/title/${details.imdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {details.imdbId}
                </a>
              </div>
            )}
            {details.productionCompanies && details.productionCompanies.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Production</h3>
                <div className="flex flex-wrap gap-2">
                  {details.productionCompanies.map(c => c.name).join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {type === "tv" && details.seasons && details.seasons.length > 0 && (
        <SeasonsPanel tmdbId={id} seasons={details.seasons} />
      )}

      {similar?.results && similar.results.length > 0 && (
        <section className="pt-8">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-semibold">Similar {type === 'movie' ? 'Movies' : 'Shows'}</h2>
            <ContentFilterToggles
              hideAdult={hideAdult}
              onHideAdultChange={setHideAdult}
              hideTracked={hideTracked}
              onHideTrackedChange={setHideTracked}
              idPrefix="similar"
            />
          </div>
          {similarItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {similarItems.map(item => (
                <MediaCard key={item.tmdbId} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              No untracked similar titles. Turn off &quot;Hide items already on my watchlist&quot; to see them.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
