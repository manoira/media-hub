/** ISO 639-1 codes that get stricter adult-content heuristics when hiding adult titles. */
export const STRICT_ASIAN_LANGUAGES = new Set(["ko", "ja", "zh", "hi", "th", "vi"]);

const ROMANCE_DRAMA_GENRES = new Set([18, 10749]);

export type AdultFilterItem = {
  adult?: boolean | null;
  originalLanguage?: string | null;
  title?: string | null;
  originalTitle?: string | null;
  overview?: string | null;
  genreIds?: number[] | null;
  voteCount?: number | null;
};

const EXPLICIT_TEXT_PATTERNS: RegExp[] = [
  /\bmasturbat/i,
  /\bprostitut/i,
  /\bcall girl/i,
  /\bsexy adult/i,
  /\badult fantasy/i,
  /\bintercourse\b/i,
  /\bhigh-class prostitute/i,
  /\bgive (?:her|his|their) body\b/i,
  /\bphysical self\b/i,
  /\bshort skirt.*\bprofessor\b/i,
  /\bprofessor.*\bshort skirt\b/i,
  /\bvirginity\b/i,
  /\bse(?:xual )?scene/i,
  /\bsoft\s*porn/i,
  /\bpornograph/i,
  /情色/,
  /伦理片?/,
  /三级/,
  /成人/,
  /官能/,
  /エロ/,
  /アダルト/,
  /에로/,
  /관능/,
  /19금/,
  /포르노/,
];

const SUSPICIOUS_TITLE_PATTERNS: RegExp[] = [
  /nice sister-in-law/i,
  /sister-in-law\s*\d+/i,
  /young sister-in-law/i,
  /mother-in-law\s*\d+/i,
  /dangerous relationship/i,
  /(?:female )?college student.*professor/i,
  /professor.*(?:female )?college student/i,
  /\bfresh girl\b/i,
  /oligosaccharide/i,
  /nice aunt/i,
  /forbidden relationship/i,
  /secret affair/i,
  /temptation of/i,
  /housemaid\s*\d+/i,
  /nice neighbor/i,
  /young wife\s*\d+/i,
];

function searchableText(item: AdultFilterItem): string {
  return [item.title, item.originalTitle, item.overview]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");
}

function isStrictAsianLanguage(language: string | null | undefined): boolean {
  if (!language) return false;
  return STRICT_ASIAN_LANGUAGES.has(language.toLowerCase());
}

function isRomanceDramaOnly(genreIds: number[] | null | undefined): boolean {
  if (!genreIds?.length) return false;
  return genreIds.every(id => ROMANCE_DRAMA_GENRES.has(id));
}

function hasExplicitText(text: string): boolean {
  return EXPLICIT_TEXT_PATTERNS.some(pattern => pattern.test(text));
}

function hasSuspiciousTitle(item: AdultFilterItem): boolean {
  const titleText = [item.title, item.originalTitle]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join("\n");
  if (!titleText) return false;
  return SUSPICIOUS_TITLE_PATTERNS.some(pattern => pattern.test(titleText));
}

function isLowVoteRomanceSpam(item: AdultFilterItem): boolean {
  if (item.voteCount == null) return false;
  if (item.voteCount > 15) return false;
  if (!isRomanceDramaOnly(item.genreIds)) return false;

  const overview = item.overview?.trim() ?? "";
  if (overview.length === 0) return true;

  return item.voteCount <= 5 && overview.length < 120;
}

/** True when an item should be hidden while exclude_adult / hide adult is enabled. */
export function isBlockedAdultContent(item: AdultFilterItem, excludeAdult: boolean): boolean {
  if (!excludeAdult) return false;
  if (item.adult === true) return true;
  if (!isStrictAsianLanguage(item.originalLanguage)) return false;

  const text = searchableText(item);
  if (text && hasExplicitText(text)) return true;
  if (hasSuspiciousTitle(item)) return true;
  if (isLowVoteRomanceSpam(item)) return true;

  return false;
}

export function filterBlockedAdultContent<T extends AdultFilterItem>(
  items: T[],
  excludeAdult: boolean,
): T[] {
  if (!excludeAdult) return items;
  return items.filter(item => !isBlockedAdultContent(item, true));
}
