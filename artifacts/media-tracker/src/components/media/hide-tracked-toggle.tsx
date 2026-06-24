import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface HideTrackedToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

export function HideTrackedToggle({
  checked,
  onCheckedChange,
  id = "hide-tracked",
  className,
}: HideTrackedToggleProps) {
  return (
    <div className={className ?? "flex items-center justify-end gap-2"}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm text-muted-foreground cursor-pointer">
        Hide items already on my watchlist
      </Label>
    </div>
  );
}
