/** Send exclude_adult explicitly so server defaults and opt-out both work reliably. */
export function withExcludeAdult<T extends Record<string, unknown>>(
  params: T,
  hideAdult: boolean,
): T & { exclude_adult: boolean } {
  return { ...params, exclude_adult: hideAdult };
}
