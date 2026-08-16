import {
  useGetTvProgress,
  getGetTvProgressQueryKey,
  type TvProgress,
} from "@workspace/api-client-react";
import { useBatchTvProgress, useTvProgressBatchMode } from "./tv-progress-batch-provider";

interface TvProgressBarProps {
  tmdbId: number;
  progress?: TvProgress;
}

function renderProgress(data: TvProgress | undefined) {
  if (!data) return null;

  const watched = data.totalWatched;
  const total = data.totalEpisodes;

  if (watched === 0 && !total) return null;

  const pct = total && total > 0 ? Math.min(100, Math.round((watched / total) * 100)) : 0;
  const allDone = total != null && watched >= total;

  return (
    <div className="mt-1 space-y-0.5">
      {total != null ? (
        <div className="flex items-center justify-between gap-1">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allDone ? "bg-green-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
            {watched}/{total}
          </span>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">
          {watched} ep{watched !== 1 ? "s" : ""} watched
        </p>
      )}
    </div>
  );
}

export function TvProgressBar({ tmdbId, progress }: TvProgressBarProps) {
  const batchMode = useTvProgressBatchMode();
  const batchProgress = useBatchTvProgress(tmdbId);
  const { data: fetched } = useGetTvProgress(tmdbId, {
    query: {
      enabled: !batchMode && progress === undefined,
      queryKey: getGetTvProgressQueryKey(tmdbId),
    },
  });

  const data = progress ?? (batchMode ? batchProgress : fetched);
  return renderProgress(data);
}
