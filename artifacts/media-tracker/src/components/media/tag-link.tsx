import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagLinkProps {
  name: string;
  className?: string;
  variant?: "default" | "secondary" | "outline";
}

export function TagLink({ name, className, variant = "outline" }: TagLinkProps) {
  return (
    <Link href={`/search?mode=tags&q=${encodeURIComponent(name)}`}>
      <Badge
        variant={variant}
        className={cn(
          "cursor-pointer transition-colors hover:bg-primary/20 hover:border-primary/40",
          className,
        )}
      >
        {name}
      </Badge>
    </Link>
  );
}
