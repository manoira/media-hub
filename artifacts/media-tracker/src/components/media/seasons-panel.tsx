import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTvProgress,
  useGetSeasonProgress,
  useMarkEpisodeWatched,
  useMarkSeasonWatched,
  useMarkSeriesWatched,
  getGetTvProgressQueryKey,
  getGetSeasonProgressQueryKey,
} from "@workspace/api-client-react";
import { getTmdbImageUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Season } from "@workspace/api-client-react";

interface SeasonsPanelProps {
  tmdbId: number;
  seasons: Season[];
}

function EpisodeRow({
  tmdbId,
  episode,
  onToggle,
}: {
  tmdbId: number;
  episode: { id: number; episodeNumber: number; seasonNumber: number; name: string; overview?: string | null; airDate?: string | null; runtime?: number | null; stillPath?: string | null; watched: boolean };
  onToggle: () => void;
}) {
  const stillUrl = episode.stillPath ? `https://image.tmdb.org/t/p/w300${episode.stillPath}` : null;

  return (
    <div
      className={`flex gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-muted/60 ${episode.watched ? "bg-primary/5 border border-primary/20" : "bg-muted/20"}`}
      onClick={onToggle}
    >
      <div className="relative flex-shrink-0">
        {stillUrl ? (
          <img src={stillUrl} alt={episode.name} className="w-24 h-14 object-cover rounded-md" />
        ) : (
          <div className="w-24 h-14 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-xs">No image</div>
        )}
        {episode.watched && (
          <div className="absolute inset-0 bg-primary/30 rounded-md flex items-center justify-center">
            <span className="text-white text-lg">✓</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">E{String(episode.episodeNumber).padStart(2, "0")}</span>
          <p className={`text-sm font-medium truncate ${episode.watched ? "text-primary" : ""}`}>{episode.name}</p>
          {episode.runtime && <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{episode.runtime}m</span>}
        </div>
        {episode.overview && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{episode.overview}</p>
        )}
      </div>
    </div>
  );
}

function SeasonAccordion({
  tmdbId,
  season,
  progress,
}: {
  tmdbId: number;
  season: Season;
  progress: Record<number, number[]>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const watchedEps = progress[season.seasonNumber] ?? [];
  const totalEps = season.episodeCount ?? 0;
  const pct = totalEps > 0 ? Math.round((watchedEps.length / totalEps) * 100) : 0;
  const allWatched = totalEps > 0 && watchedEps.length >= totalEps;

  const { data: seasonData, isLoading } = useGetSeasonProgress(tmdbId, season.seasonNumber, {
    query: {
      enabled: isOpen,
      queryKey: getGetSeasonProgressQueryKey(tmdbId, season.seasonNumber),
    },
  });

  const markSeason = useMarkSeasonWatched();
  const markEpisode = useMarkEpisodeWatched();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTvProgressQueryKey(tmdbId) });
    queryClient.invalidateQueries({ queryKey: getGetSeasonProgressQueryKey(tmdbId, season.seasonNumber) });
  };

  const handleToggleSeason = (e: React.MouseEvent) => {
    e.stopPropagation();
    markSeason.mutate(
      { tmdbId, seasonNumber: season.seasonNumber, data: { watched: !allWatched } },
      { onSuccess: invalidate }
    );
  };

  const handleToggleEpisode = (ep: { episodeNumber: number; seasonNumber: number; watched: boolean }) => {
    markEpisode.mutate(
      { tmdbId, data: { seasonNumber: ep.seasonNumber, episodeNumber: ep.episodeNumber, watched: !ep.watched } },
      { onSuccess: invalidate }
    );
  };

  const posterUrl = getTmdbImageUrl(season.posterPath, "poster");

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => setIsOpen(o => !o)}
      >
        {posterUrl && (
          <img src={posterUrl} alt={season.name} className="w-10 h-14 object-cover rounded flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-semibold">{season.name}</p>
            {allWatched && <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">Watched</Badge>}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {watchedEps.length}/{totalEps} eps
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant={allWatched ? "outline" : "secondary"}
            size="sm"
            className="text-xs h-7"
            onClick={handleToggleSeason}
            disabled={markSeason.isPending}
          >
            {allWatched ? "Unmark" : "Mark watched"}
          </Button>
          <span className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-border/50 p-3 space-y-2 bg-background/50">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
          ) : (
            seasonData?.episodes?.map(ep => (
              <EpisodeRow
                key={ep.id}
                tmdbId={tmdbId}
                episode={ep}
                onToggle={() => handleToggleEpisode(ep)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SeasonsPanel({ tmdbId, seasons }: SeasonsPanelProps) {
  const queryClient = useQueryClient();
  const mainSeasons = seasons.filter(s => s.seasonNumber > 0);

  const { data: progress } = useGetTvProgress(tmdbId, {
    query: { queryKey: getGetTvProgressQueryKey(tmdbId) },
  });

  const markSeries = useMarkSeriesWatched();

  const totalEps = mainSeasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const watchedEps = progress?.totalWatched ?? 0;
  const overallPct = totalEps > 0 ? Math.round((watchedEps / totalEps) * 100) : 0;
  const allWatched = totalEps > 0 && watchedEps >= totalEps;

  const watched = progress?.watchedBySeasonNumber ?? {};

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getGetTvProgressQueryKey(tmdbId) });
    mainSeasons.forEach(s => {
      queryClient.invalidateQueries({ queryKey: getGetSeasonProgressQueryKey(tmdbId, s.seasonNumber) });
    });
  };

  const handleMarkAll = () => {
    markSeries.mutate(
      { tmdbId, data: { watched: !allWatched } },
      { onSuccess: invalidateAll }
    );
  };

  if (mainSeasons.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">Seasons & Episodes</h2>
          <div className="flex items-center gap-3">
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${overallPct}%` }} />
            </div>
            <span className="text-sm text-muted-foreground">
              {watchedEps} / {totalEps} episodes watched ({overallPct}%)
            </span>
          </div>
        </div>
        <Button
          variant={allWatched ? "outline" : "default"}
          size="sm"
          onClick={handleMarkAll}
          disabled={markSeries.isPending}
        >
          {markSeries.isPending ? "Updating…" : allWatched ? "Unmark all watched" : "Mark all watched"}
        </Button>
      </div>

      <div className="space-y-3">
        {mainSeasons.map(season => (
          <SeasonAccordion
            key={season.id}
            tmdbId={tmdbId}
            season={season}
            progress={watched}
          />
        ))}
      </div>
    </section>
  );
}
