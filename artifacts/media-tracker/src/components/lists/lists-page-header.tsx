import { ListSwitcher } from "./list-switcher";

interface ListsPageHeaderProps {
  activeListId?: number;
  title?: string;
  description?: string;
}

export function ListsPageHeader({
  activeListId,
  title = "Lists",
  description = "Your watchlist and curated collections.",
}: ListsPageHeaderProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="text-muted-foreground mt-1">{description}</p>}
      </div>
      <ListSwitcher activeListId={activeListId} />
    </div>
  );
}
