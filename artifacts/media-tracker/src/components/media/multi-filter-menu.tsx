import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FilterOption<T extends string | number> = {
  label: string;
  value: T;
};

type MultiFilterMenuProps<T extends string | number> = {
  label: string;
  options: FilterOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
};

function buildLabel<T extends string | number>(
  label: string,
  options: FilterOption<T>[],
  selected: T[],
): string {
  if (selected.length === 0) return label;
  if (selected.length === 1) {
    return options.find(opt => opt.value === selected[0])?.label ?? label;
  }
  return `${label} (${selected.length})`;
}

export function MultiFilterMenu<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: MultiFilterMenuProps<T>) {
  const active = selected.length > 0;
  const displayLabel = buildLabel(label, options, selected);

  const toggle = (value: T, checked: boolean) => {
    if (checked) {
      if (!selected.includes(value)) {
        onChange([...selected, value]);
      }
      return;
    }
    onChange(selected.filter(v => v !== value));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", active && "border-primary text-foreground")}
        >
          {displayLabel}
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {options.map(opt => (
          <DropdownMenuCheckboxItem
            key={String(opt.value)}
            checked={selected.includes(opt.value)}
            onCheckedChange={(checked) => toggle(opt.value, checked === true)}
            onSelect={(e) => e.preventDefault()}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
