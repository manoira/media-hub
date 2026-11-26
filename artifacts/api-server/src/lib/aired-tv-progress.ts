type EpisodePosition = { season_number: number; episode_number: number; air_date?: string };
type TvSchedule = {
  last_episode_to_air?: EpisodePosition | null;
  seasons?: { season_number: number; episode_count?: number; air_date?: string | null }[];
};

export function countAiredTvProgress(
  schedule: TvSchedule,
  watched: { seasonNumber: number; episodeNumber: number }[],
  today = new Date().toISOString().slice(0, 10),
) {
  const last = schedule.last_episode_to_air;
  const seasons = (schedule.seasons ?? []).filter(season => season.season_number > 0);
  if (seasons.length < 2 || !last || last.season_number < 1 || last.episode_number < 1 ||
      !last.air_date || last.air_date > today) return null;

  const airedBySeason = new Map<number, number>();
  for (const season of seasons) {
    if (season.season_number >= last.season_number || (season.air_date && season.air_date > today)) continue;
    if (season.episode_count == null) return null;
    airedBySeason.set(season.season_number, season.episode_count);
  }
  airedBySeason.set(last.season_number, last.episode_number);
  const total = [...airedBySeason.values()].reduce((sum, count) => sum + count, 0);
  const seen = watched.filter(episode => episode.episodeNumber > 0 &&
    episode.episodeNumber <= (airedBySeason.get(episode.seasonNumber) ?? 0)).length;
  return { seen, total };
}
