import { useGetMediaMetadata, getGetMediaMetadataQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { TagLink } from "@/components/media/tag-link";
import { Skeleton } from "@/components/ui/skeleton";
import { getTmdbImageUrl } from "@/lib/utils";

interface MediaMetadataPanelProps {
  mediaType: "movie" | "tv";
  tmdbId: number;
}

export function MediaMetadataPanel({ mediaType, tmdbId }: MediaMetadataPanelProps) {
  const { data, isLoading } = useGetMediaMetadata(mediaType, tmdbId, {
    query: {
      enabled: !!tmdbId,
      queryKey: getGetMediaMetadataQueryKey(mediaType, tmdbId),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasContent =
    data.sourceMaterial.length > 0 ||
    data.keywords.length > 0 ||
    data.writers.length > 0 ||
    data.alternativeTitles.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-6 rounded-xl border bg-card p-5">
      {data.sourceMaterial.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Source material</h3>
          <div className="flex flex-wrap gap-2">
            {data.sourceMaterial.map(tag => (
              <TagLink key={tag.id} name={tag.name} variant="secondary" />
            ))}
          </div>
        </div>
      )}

      {data.writers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Writers & authors</h3>
          <div className="flex flex-wrap gap-3">
            {data.writers.map(writer => (
              <Link
                key={writer.id}
                href={`/person/${writer.id}`}
                className="flex items-center gap-2 rounded-lg border px-2 py-1.5 hover:bg-muted/50 transition-colors"
              >
                <img
                  src={getTmdbImageUrl(writer.profilePath, "profile") || "/favicon.svg"}
                  alt={writer.name}
                  className="h-8 w-8 rounded-full object-cover bg-muted"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{writer.name}</p>
                  {writer.job && <p className="text-[11px] text-muted-foreground">{writer.job}</p>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.keywords.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Tags & themes</h3>
          <div className="flex flex-wrap gap-2">
            {data.keywords.map(tag => (
              <TagLink key={tag.id} name={tag.name} />
            ))}
          </div>
        </div>
      )}

      {data.alternativeTitles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Also known as</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {data.alternativeTitles.slice(0, 8).map((alt, index) => (
              <li key={`${alt.title}-${alt.country ?? index}`}>
                {alt.title}
                {alt.country && <span className="text-xs ml-1 opacity-70">({alt.country})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
