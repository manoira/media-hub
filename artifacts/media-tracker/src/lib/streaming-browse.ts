export const TMDB_PROVIDER_LOGO = "https://image.tmdb.org/t/p/original";

export type ProviderCollection = "popular" | "trending" | "new";

export type DiscoverSortValue =
  | "popularity.desc"
  | "vote_average.desc"
  | "vote_count.desc"
  | "release_date.desc"
  | "release_date.asc"
  | "revenue.desc"
  | "title.asc";

export const PROVIDER_COLLECTION_OPTIONS: {
  value: ProviderCollection;
  label: string;
}[] = [
  { value: "popular", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
];

export function providerCollectionSort(collection: ProviderCollection): DiscoverSortValue {
  switch (collection) {
    case "trending":
      return "vote_count.desc";
    case "new":
      return "release_date.desc";
    default:
      return "popularity.desc";
  }
}

export function providerCollectionMinYear(
  collection: ProviderCollection,
  currentYear: number,
): number | undefined {
  return collection === "new" ? currentYear - 1 : undefined;
}
