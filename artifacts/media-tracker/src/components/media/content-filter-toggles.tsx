import { HideAdultToggle } from "./hide-adult-toggle";
import { HideTrackedToggle } from "./hide-tracked-toggle";

interface ContentFilterTogglesProps {
  hideAdult: boolean;
  onHideAdultChange: (checked: boolean) => void;
  hideTracked: boolean;
  onHideTrackedChange: (checked: boolean) => void;
  idPrefix?: string;
  className?: string;
}

export function ContentFilterToggles({
  hideAdult,
  onHideAdultChange,
  hideTracked,
  onHideTrackedChange,
  idPrefix = "content-filters",
  className,
}: ContentFilterTogglesProps) {
  return (
    <div className={className ?? "flex flex-col items-end gap-2 sm:flex-row sm:gap-6"}>
      <HideAdultToggle
        checked={hideAdult}
        onCheckedChange={onHideAdultChange}
        id={`${idPrefix}-hide-adult`}
      />
      <HideTrackedToggle
        checked={hideTracked}
        onCheckedChange={onHideTrackedChange}
        id={`${idPrefix}-hide-tracked`}
        className="flex items-center gap-2"
      />
    </div>
  );
}
