/**
 * ISO 639-1 codes for Asian entertainment markets. Suggestion feeds (trending,
 * popular, etc.) exclude these so results skew toward Nordic, European, and
 * American titles.
 */
export const ASIAN_MARKET_LANGUAGES = new Set([
  // East Asia
  "ja",
  "ko",
  "zh",
  // South Asia
  "hi",
  "bn",
  "ta",
  "te",
  "ml",
  "kn",
  "mr",
  "pa",
  "ur",
  "ne",
  "si",
  "gu",
  "or",
  "as",
  "mai",
  // Southeast Asia
  "th",
  "vi",
  "id",
  "ms",
  "tl",
  "my",
  "km",
  "lo",
  // Central Asia
  "kk",
  "uz",
  "ky",
  "tg",
  "mn",
]);

export type MarketFilterItem = {
  originalLanguage?: string | null;
};

function normalizeLanguageCode(language: string): string {
  return language.trim().toLowerCase().split("-")[0] ?? language;
}

export function isAsianMarketContent(item: MarketFilterItem): boolean {
  const language = item.originalLanguage;
  if (!language) return false;
  return ASIAN_MARKET_LANGUAGES.has(normalizeLanguageCode(language));
}

export function filterWesternMarketContent<T extends MarketFilterItem>(items: T[]): T[] {
  return items.filter((item) => !isAsianMarketContent(item));
}
