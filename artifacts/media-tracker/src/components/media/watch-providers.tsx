import { useGetWatchProviders, getGetWatchProvidersQueryKey } from "@workspace/api-client-react";
import { ExternalLink } from "lucide-react";

interface WatchProvidersProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
}

const TMDB_LOGO = "https://image.tmdb.org/t/p/original";

interface ProviderItem {
  providerId: number;
  providerName: string;
  logoPath: string;
  displayPriority: number;
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
        {providers.map(p => (
          <div key={p.providerId} className="flex flex-col items-center gap-1 w-14" title={p.providerName}>
            <img
              src={`${TMDB_LOGO}${p.logoPath}`}
              alt={p.providerName}
              className="w-12 h-12 rounded-xl object-cover shadow-md"
              loading="lazy"
            />
            <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2">
              {p.providerName}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WatchProviders({ mediaType, tmdbId }: WatchProvidersProps) {
  const { data, isLoading } = useGetWatchProviders(mediaType, tmdbId, {
    query: {
      enabled: !!tmdbId,
      queryKey: getGetWatchProvidersQueryKey(mediaType, tmdbId),
    },
  });

  if (isLoading) return null;

  const hasAny =
    (data?.flatrate?.length ?? 0) > 0 ||
    (data?.free?.length ?? 0) > 0 ||
    (data?.ads?.length ?? 0) > 0 ||
    (data?.rent?.length ?? 0) > 0 ||
    (data?.buy?.length ?? 0) > 0;

  if (!hasAny) return null;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base">Where to Watch</h3>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>🇸🇪 Sweden</span>
          {data?.link && (
            <a
              href={data.link}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 flex items-center gap-0.5 text-primary hover:underline"
            >
              All options <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

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

      <p className="text-[10px] text-muted-foreground">
        Powered by JustWatch data via TMDB
      </p>
    </div>
  );
}
