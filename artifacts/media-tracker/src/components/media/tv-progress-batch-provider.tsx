import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  useGetTvProgressBatch,
  getGetTvProgressBatchQueryKey,
  type TvProgress,
} from "@workspace/api-client-react";

const TvProgressMapContext = createContext<Map<number, TvProgress> | null>(null);

interface TvProgressBatchProviderProps {
  tmdbIds: number[];
  children: ReactNode;
}

export function TvProgressBatchProvider({ tmdbIds, children }: TvProgressBatchProviderProps) {
  const ids = useMemo(
    () => [...new Set(tmdbIds)].sort((a, b) => a - b),
    [tmdbIds],
  );
  const idsParam = ids.join(",");

  const { data } = useGetTvProgressBatch(
    { ids: idsParam },
    {
      query: {
        enabled: ids.length > 0,
        queryKey: getGetTvProgressBatchQueryKey({ ids: idsParam }),
      },
    },
  );

  const progressMap = useMemo(() => {
    const map = new Map<number, TvProgress>();
    if (!data?.items) return map;
    for (const [key, progress] of Object.entries(data.items)) {
      map.set(Number(key), progress);
    }
    return map;
  }, [data]);

  return (
    <TvProgressMapContext.Provider value={progressMap}>
      {children}
    </TvProgressMapContext.Provider>
  );
}

export function useBatchTvProgress(tmdbId: number): TvProgress | undefined {
  const map = useContext(TvProgressMapContext);
  return map?.get(tmdbId);
}

export function useTvProgressBatchMode(): boolean {
  return useContext(TvProgressMapContext) !== null;
}
