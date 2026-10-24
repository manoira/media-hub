/** Long enough for a three-line card and the adult-text check, short of a full synopsis. */
export const CARD_OVERVIEW_CHARS = 180;

export function clipCardOverview(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value.trim();
  if (text.length <= CARD_OVERVIEW_CHARS) return text;
  return text.slice(0, CARD_OVERVIEW_CHARS);
}
