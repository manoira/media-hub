import { ReactNode } from "react";
import { MultiFilterMenu } from "@/components/media/multi-filter-menu";
import { HideAdultToggle } from "@/components/media/hide-adult-toggle";
import { Separator } from "@/components/ui/separator";
import type { GetWatchlistStatusItem } from "@workspace/api-client-react";

interface FilterOption<T extends string | number> {
  label: string;
  value: T;
}

interface WatchlistFilterPanelProps {
  hideAdult: boolean;
  onHideAdultChange: (checked: boolean) => void;
  statusOptions: FilterOption<GetWatchlistStatusItem>[];
  selectedStatuses: GetWatchlistStatusItem[];
  onStatusesChange: (statuses: GetWatchlistStatusItem[]) => void;
  yearOptions: FilterOption<string>[];
  selectedYearKeys: string[];
  onYearKeysChange: (keys: string[]) => void;
  ratingOptions: FilterOption<number>[];
  selectedRatings: number[];
  onRatingsChange: (ratings: number[]) => void;
  languageOptions: FilterOption<string>[];
  selectedLanguages: string[];
  onLanguagesChange: (languages: string[]) => void;
  genreOptions: FilterOption<number>[];
  selectedGenres: number[];
  onGenresChange: (genres: number[]) => void;
  footer?: ReactNode;
}

export function WatchlistFilterPanel({
  hideAdult,
  onHideAdultChange,
  statusOptions,
  selectedStatuses,
  onStatusesChange,
  yearOptions,
  selectedYearKeys,
  onYearKeysChange,
  ratingOptions,
  selectedRatings,
  onRatingsChange,
  languageOptions,
  selectedLanguages,
  onLanguagesChange,
  genreOptions,
  selectedGenres,
  onGenresChange,
  footer,
}: WatchlistFilterPanelProps) {
  return (
    <div className="space-y-4">
      <HideAdultToggle
        checked={hideAdult}
        onCheckedChange={onHideAdultChange}
        id="hide-adult-filter-panel"
        className="justify-start"
      />
      <Separator />
      <div className="flex flex-wrap gap-2">
        <MultiFilterMenu
          label="Status"
          options={statusOptions}
          selected={selectedStatuses}
          onChange={onStatusesChange}
        />
        <MultiFilterMenu
          label="Year"
          options={yearOptions}
          selected={selectedYearKeys}
          onChange={onYearKeysChange}
        />
        <MultiFilterMenu
          label="Rating"
          options={ratingOptions}
          selected={selectedRatings}
          onChange={onRatingsChange}
        />
        <MultiFilterMenu
          label="Language"
          options={languageOptions}
          selected={selectedLanguages}
          onChange={onLanguagesChange}
        />
        <MultiFilterMenu
          label="Genre"
          options={genreOptions}
          selected={selectedGenres}
          onChange={onGenresChange}
        />
      </div>
      {footer}
    </div>
  );
}
