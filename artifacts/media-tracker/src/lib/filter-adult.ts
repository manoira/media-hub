import { filterBlockedAdultContent } from "@workspace/content-filter";

export function filterAdultItems<T extends { adult?: boolean | null; originalLanguage?: string | null; title?: string | null; originalTitle?: string | null; overview?: string | null; genreIds?: number[] | null; voteCount?: number | null }>(
  items: T[],
  hideAdult: boolean,
): T[] {
  return filterBlockedAdultContent(items, hideAdult);
}
