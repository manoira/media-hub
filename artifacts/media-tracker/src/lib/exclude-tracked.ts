/** Only send exclude_tracked when the hide toggle is on (avoids broken boolean query coercion). */
export function withExcludeTracked<T extends Record<string, unknown>>(
  params: T,
  hideTracked: boolean,
): T & { exclude_tracked?: true } {
  if (!hideTracked) return params;
  return { ...params, exclude_tracked: true };
}
