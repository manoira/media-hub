export type YearRange = { label: string; min?: number; max?: number };

export const CURRENT_YEAR = new Date().getFullYear();

export const YEAR_OPTIONS: YearRange[] = [
  { label: "Any year" },
  ...Array.from({ length: 8 }, (_, i) => {
    const y = CURRENT_YEAR - i;
    return { label: String(y), min: y, max: y };
  }),
  { label: "2020s", min: 2020, max: 2029 },
  { label: "2010s", min: 2010, max: 2019 },
  { label: "2000s", min: 2000, max: 2009 },
  { label: "1990s", min: 1990, max: 1999 },
  { label: "1980s", min: 1980, max: 1989 },
  { label: "Before 1980", max: 1979 },
];

export const RATING_OPTIONS: { label: string; value?: number }[] = [
  { label: "Any rating" },
  { label: "9+", value: 9 },
  { label: "8+", value: 8 },
  { label: "7+", value: 7 },
  { label: "6+", value: 6 },
  { label: "5+", value: 5 },
];

export const LANGUAGE_OPTIONS: { label: string; value?: string }[] = [
  { label: "Any language" },
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Italian", value: "it" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "Chinese", value: "zh" },
  { label: "Hindi", value: "hi" },
  { label: "Portuguese", value: "pt" },
  { label: "Swedish", value: "sv" },
];

export const STATUS_OPTIONS = [
  { label: "Watching", value: "watching" as const },
  { label: "Want to Watch", value: "want_to_watch" as const },
  { label: "Watched", value: "watched" as const },
];

export type WatchlistSortBy = "added_at" | "release_date" | "rating" | "title";

export const WATCHLIST_SORT_OPTIONS: { value: WatchlistSortBy; label: string }[] = [
  { value: "added_at", label: "Date added" },
  { value: "release_date", label: "Year" },
  { value: "rating", label: "Rating" },
  { value: "title", label: "Name" },
];

export function encodeYearRange(range: YearRange): string | null {
  if (range.min === undefined && range.max === undefined) return null;
  if (range.min !== undefined && range.max !== undefined) {
    if (range.min === range.max) return String(range.min);
    return `${range.min}-${range.max}`;
  }
  if (range.max !== undefined) return `-${range.max}`;
  if (range.min !== undefined) return `${range.min}-`;
  return null;
}

export function decodeYearRange(encoded: string): YearRange | null {
  if (encoded.includes("-")) {
    const [minStr, maxStr] = encoded.split("-");
    const min = minStr ? parseInt(minStr, 10) : undefined;
    const max = maxStr ? parseInt(maxStr, 10) : undefined;
    const match = YEAR_OPTIONS.find(opt => {
      if (opt.min !== min || opt.max !== max) return false;
      return encodeYearRange(opt) === encoded;
    });
    if (match) return match;
    return {
      label: encoded,
      min: min !== undefined && !Number.isNaN(min) ? min : undefined,
      max: max !== undefined && !Number.isNaN(max) ? max : undefined,
    };
  }
  const year = parseInt(encoded, 10);
  if (Number.isNaN(year)) return null;
  return YEAR_OPTIONS.find(opt => opt.min === year && opt.max === year) ?? {
    label: String(year),
    min: year,
    max: year,
  };
}

export function isYearRangeActive(range: YearRange): boolean {
  return range.min !== undefined || range.max !== undefined;
}
