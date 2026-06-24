import { Link } from "wouter";
import { cn, getTmdbImageUrl } from "@/lib/utils";
import { PersonSummary } from "@workspace/api-client-react";

interface PersonResultCardProps {
  person: PersonSummary;
  className?: string;
}

export function PersonResultCard({ person, className }: PersonResultCardProps) {
  const imageUrl = getTmdbImageUrl(person.profilePath, "profile");
  const knownFor = person.knownFor?.map(item => item.title).join(", ");

  return (
    <Link
      href={`/person/${person.id}`}
      className={cn(
        "flex gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40",
        className,
      )}
    >
      <img
        src={imageUrl || "/favicon.svg"}
        alt={person.name}
        className="h-24 w-24 shrink-0 rounded-lg object-cover bg-muted"
        loading="lazy"
      />
      <div className="min-w-0 space-y-1">
        <h3 className="font-semibold text-lg leading-tight">{person.name}</h3>
        {person.knownForDepartment && (
          <p className="text-sm text-muted-foreground">{person.knownForDepartment}</p>
        )}
        {knownFor && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            Known for: {knownFor}
          </p>
        )}
      </div>
    </Link>
  );
}
