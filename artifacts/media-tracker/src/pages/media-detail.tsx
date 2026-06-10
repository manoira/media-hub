import { useGetMediaDetails, useGetMediaCredits, useGetMediaVideos, useGetSimilarMedia, getGetMediaDetailsQueryKey, getGetMediaCreditsQueryKey, getGetMediaVideosQueryKey, getGetSimilarMediaQueryKey } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { getTmdbImageUrl, getYoutubeEmbedUrl, formatRuntime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { WatchlistButton } from "@/components/media/watchlist-button";
import { Skeleton } from "@/components/ui/skeleton";
import { MediaCard } from "@/components/media/media-card";
import { SeasonsPanel } from "@/components/media/seasons-panel";

export function MediaDetail() {
  const { mediaType, tmdbId } = useParams();
  const id = Number(tmdbId);
  const type = mediaType as "movie" | "tv";

  const { data: details, isLoading: isLoadingDetails } = useGetMediaDetails(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetMediaDetailsQueryKey(type, id) }
  });

  const { data: credits } = useGetMediaCredits(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetMediaCreditsQueryKey(type, id) }
  });

  const { data: videos } = useGetMediaVideos(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetMediaVideosQueryKey(type, id) }
  });

  const { data: similar } = useGetSimilarMedia(type, id, {
    query: { enabled: !!id && !!type, queryKey: getGetSimilarMediaQueryKey(type, id) }
  });

  if (isLoadingDetails) {
    return <div className="space-y-4">
      <Skeleton className="w-full h-[50vh] rounded-xl" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-20 w-full" />
    </div>;
  }

  if (!details) return <div>Not found</div>;

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
              
              <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
                <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                  ★ {details.voteAverage?.toFixed(1)}
                </Badge>
                <span>{details.releaseDate?.substring(0, 4)}</span>
                {details.runtime && <span>{formatRuntime(details.runtime)}</span>}
                {details.numberOfSeasons && <span>{details.numberOfSeasons} Seasons</span>}
                <div className="flex gap-2">
                  {details.genres?.map(g => (
                    <Badge key={g.id} variant="outline" className="bg-background/50 backdrop-blur-sm">{g.name}</Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <WatchlistButton mediaType={type} tmdbId={id} />
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

          {credits?.cast && credits.cast.length > 0 && (
            <section>
              <h2 className="text-2xl font-semibold mb-4">Cast</h2>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                {credits.cast.slice(0, 10).map(person => (
                  <div key={person.id} className="min-w-[120px] max-w-[120px] flex flex-col gap-2">
                    <img 
                      src={getTmdbImageUrl(person.profilePath, "profile") || "/favicon.svg"} 
                      alt={person.name} 
                      className="w-full aspect-[2/3] object-cover rounded-lg bg-muted"
                    />
                    <div>
                      <p className="font-semibold text-sm leading-tight">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.character}</p>
                    </div>
                  </div>
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
        </div>

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

      {type === "tv" && details.seasons && details.seasons.length > 0 && (
        <SeasonsPanel tmdbId={id} seasons={details.seasons} />
      )}

      {similar?.results && similar.results.length > 0 && (
        <section className="pt-8">
          <h2 className="text-2xl font-semibold mb-6">Similar {type === 'movie' ? 'Movies' : 'Shows'}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {similar.results.slice(0, 10).map(item => (
              <MediaCard key={item.tmdbId} item={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
