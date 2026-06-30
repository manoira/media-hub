export function filterAdultItems<T extends { adult?: boolean | null }>(
  items: T[],
  hideAdult: boolean,
): T[] {
  if (!hideAdult) return items;
  return items.filter((item) => item.adult !== true);
}
