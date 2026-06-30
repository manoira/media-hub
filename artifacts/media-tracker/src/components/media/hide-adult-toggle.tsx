import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface HideAdultToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}

export function HideAdultToggle({
  checked,
  onCheckedChange,
  id = "hide-adult",
  className,
}: HideAdultToggleProps) {
  return (
    <div className={className ?? "flex items-center justify-end gap-2"}>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id} className="text-sm text-muted-foreground cursor-pointer">
        Hide adult titles
      </Label>
    </div>
  );
}
