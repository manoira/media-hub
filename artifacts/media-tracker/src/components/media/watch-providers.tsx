import { useGetWatchProviders, getGetWatchProvidersQueryKey } from "@workspace/api-client-react";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface WatchProvidersProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
  className?: string;
}

const TMDB_LOGO = "https://image.tmdb.org/t/p/original";

interface ProviderItem {
  providerId: number;
  providerName: string;
  logoPath: string;
  displayPriority: number;
  link?: string | null;
}

interface ProviderGroupProps {
  label: string;
  badge: string;
  badgeClass: string;
  providers: ProviderItem[];
}

function ProviderGroup({ label, badge, badgeClass, providers }: ProviderGroupProps) {
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${badgeClass}`}>
          {badge}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        {providers.map(p => {
          const content = (
            <>
              <img
                src={`${TMDB_LOGO}${p.logoPath}`}
                alt={p.providerName}
                className="w-12 h-12 rounded-xl object-cover shadow-md transition-transform group-hover:scale-105"
                loading="lazy"
              />
              <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 group-hover:text-foreground transition-colors">
                {p.providerName}
              </span>
            </>
          );

          return p.link ? (
            <a
              key={p.providerId}
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center gap-1 w-14 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title={`Open on ${p.providerName}`}
            >
              {content}
            </a>
          ) : (
            <div key={p.providerId} className="flex flex-col items-center gap-1 w-14" title={p.providerName}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WatchProviders({ mediaType, tmdbId, className }: WatchProvidersProps) {
  const { data, isLoading } = useGetWatchProviders(mediaType, tmdbId, {
    query: {
      enabled: !!tmdbId,
      queryKey: getGetWatchProvidersQueryKey(mediaType, tmdbId),
    },
  });

  if (isLoading) {
    return (
      <div className={cn("rounded-xl border bg-card p-5 space-y-4", className)}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-24" />
        <div className="flex gap-3 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-12 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const hasAny =
    (data?.flatrate?.length ?? 0) > 0 ||
    (data?.free?.length ?? 0) > 0 ||
    (data?.ads?.length ?? 0) > 0 ||
    (data?.rent?.length ?? 0) > 0 ||
    (data?.buy?.length ?? 0) > 0;

  return (
    <div className={cn("rounded-xl border bg-card p-5 space-y-5", className)}>
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold text-base">Where to Watch</h3>
          {data?.link && (
            <a
              href={data.link}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-0.5 text-[11px] text-primary hover:underline"
            >
              All options <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Streaming, rental, and purchase in Sweden</p>
      </div>

      {!hasAny ? (
        <p className="text-sm text-muted-foreground">
          No services listed for Sweden right now.
        </p>
      ) : (
        <div className="space-y-5">
          <ProviderGroup
            label="Streaming"
            badge="Included"
            badgeClass="bg-green-500/20 text-green-400"
            providers={data?.flatrate ?? []}
          />
          <ProviderGroup
            label="Free"
            badge="Free"
            badgeClass="bg-blue-500/20 text-blue-400"
            providers={data?.free ?? []}
          />
          <ProviderGroup
            label="Free with Ads"
            badge="Free"
            badgeClass="bg-sky-500/20 text-sky-400"
            providers={data?.ads ?? []}
          />
          <ProviderGroup
            label="Rent"
            badge="Rental"
            badgeClass="bg-amber-500/20 text-amber-400"
            providers={data?.rent ?? []}
          />
          <ProviderGroup
            label="Buy"
            badge="Purchase"
            badgeClass="bg-purple-500/20 text-purple-400"
            providers={data?.buy ?? []}
          />
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Powered by JustWatch data via TMDB
      </p>
    </div>
  );
}
