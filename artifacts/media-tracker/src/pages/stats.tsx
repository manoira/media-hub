import { useGetStatsSummary, useGetGenreStats, getGetStatsSummaryQueryKey, getGetGenreStatsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Link } from "wouter";

export function Stats() {
  const { data: stats, isLoading: isLoadingStats } = useGetStatsSummary({
    query: { queryKey: getGetStatsSummaryQueryKey() }
  });

  const { data: genreStats, isLoading: isLoadingGenres } = useGetGenreStats({
    query: { queryKey: getGetGenreStatsQueryKey() }
  });

  if (isLoadingStats || isLoadingGenres) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
        <Skeleton className="h-[400px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Your Stats</h1>
      
      {stats && (
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link href="/watchlist" className="bg-card border rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-primary/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-4xl font-bold text-primary mb-2">{stats.totalItems}</span>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Tracked</span>
          </Link>
          <Link href="/watchlist?status=watched" className="bg-card border rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-green-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-4xl font-bold text-green-500 mb-2">{stats.totalWatched}</span>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Watched</span>
          </Link>
          <Link href="/watchlist?status=watching" className="bg-card border rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-blue-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-4xl font-bold text-blue-500 mb-2">{stats.totalWatching}</span>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Watching</span>
          </Link>
          <Link href="/watchlist?status=want_to_watch" className="bg-card border rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-amber-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-4xl font-bold text-amber-500 mb-2">{stats.totalWantToWatch}</span>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Want to Watch</span>
          </Link>
          <Link href="/watchlist?status=unsure" className="bg-card border rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-purple-500/50 hover:bg-card/80 transition-colors cursor-pointer">
            <span className="text-4xl font-bold text-purple-500 mb-2">{stats.totalUnsure}</span>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Unsure</span>
          </Link>
        </section>
      )}

      {genreStats && genreStats.length > 0 && (
        <section className="bg-card border rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-6">Top Genres</h2>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={genreStats.slice(0, 10)} layout="vertical" margin={{ top: 0, right: 0, left: 40, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="genreName" type="category" axisLine={false} tickLine={false} tick={{ fill: 'currentColor' }} />
                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
