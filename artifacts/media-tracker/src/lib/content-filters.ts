import { withExcludeAdult } from "./exclude-adult";
import { withExcludeTracked } from "./exclude-tracked";

export function withContentFilters<T extends Record<string, unknown>>(
  params: T,
  options: { hideTracked: boolean; hideAdult: boolean },
): T & { exclude_tracked?: true; exclude_adult: boolean } {
  return withExcludeAdult(withExcludeTracked(params, options.hideTracked), options.hideAdult);
}
