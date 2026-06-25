import {
  BookmarkCheck,
  BookmarkPlus,
  CircleHelp,
  Eye,
  type LucideIcon,
} from "lucide-react";
import type { WatchlistInputStatus } from "@workspace/api-client-react";

export type WatchlistStatusConfig = {
  value: WatchlistInputStatus;
  label: string;
  color: string;
  badgeClass: string;
  cardBorderClass: string;
  cardTextClass: string;
  buttonBg: string;
  icon: LucideIcon;
};

export const WATCHLIST_STATUS_OPTIONS: WatchlistStatusConfig[] = [
  {
    value: "want_to_watch",
    label: "Want to Watch",
    color: "text-amber-500",
    badgeClass: "bg-amber-500 text-white border-0 shadow-md",
    cardBorderClass: "hover:border-amber-500/50",
    cardTextClass: "text-amber-500",
    buttonBg: "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30",
    icon: BookmarkPlus,
  },
  {
    value: "watching",
    label: "Watching",
    color: "text-blue-500",
    badgeClass: "bg-blue-500 text-white border-0 shadow-md",
    cardBorderClass: "hover:border-blue-500/50",
    cardTextClass: "text-blue-500",
    buttonBg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30",
    icon: Eye,
  },
  {
    value: "watched",
    label: "Watched",
    color: "text-green-500",
    badgeClass: "bg-green-500 text-white border-0 shadow-md",
    cardBorderClass: "hover:border-green-500/50",
    cardTextClass: "text-green-500",
    buttonBg: "bg-green-500/10 hover:bg-green-500/20 border-green-500/30",
    icon: BookmarkCheck,
  },
  {
    value: "unsure",
    label: "Unsure",
    color: "text-purple-500",
    badgeClass: "bg-purple-500 text-white border-0 shadow-md",
    cardBorderClass: "hover:border-purple-500/50",
    cardTextClass: "text-purple-500",
    buttonBg: "bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30",
    icon: CircleHelp,
  },
];

export const WATCHLIST_STATUS_BY_VALUE = Object.fromEntries(
  WATCHLIST_STATUS_OPTIONS.map((option) => [option.value, option]),
) as Record<WatchlistInputStatus, WatchlistStatusConfig>;

export const WATCHLIST_STATUS_VALUES = WATCHLIST_STATUS_OPTIONS.map((option) => option.value);

export const WATCHLIST_FILTER_STATUS_OPTIONS = WATCHLIST_STATUS_OPTIONS.map(({ label, value }) => ({
  label,
  value,
}));
