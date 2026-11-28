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
  const aired = data?.airedProgress;
  if (!aired || aired.seen === 0 || aired.total === 0) return null;

  const { seen, total } = aired;
  const pct = Math.min(100, Math.round((seen / total) * 100));

  return (
    <div className="mt-1 flex items-center gap-1.5">
      <div
        role="progressbar"
        aria-label="Aired episodes watched"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={seen}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className={`h-full rounded-full ${aired.ended ? "bg-green-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{seen}/{total}</span>
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
