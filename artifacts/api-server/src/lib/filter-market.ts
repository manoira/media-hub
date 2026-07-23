import { filterWesternMarketContent } from "@workspace/content-filter";

type MarketItem = { originalLanguage?: string | null };
type MarketSearchResult = { results: MarketItem[] };

export function applyMarketFilter<T extends MarketSearchResult>(result: T): T {
  return {
    ...result,
    results: filterWesternMarketContent(result.results),
  };
}
