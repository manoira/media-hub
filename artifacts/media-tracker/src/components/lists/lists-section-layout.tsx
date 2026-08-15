import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type ListsSection = "tracking" | "collections";

interface ListsSectionLayoutProps {
  activeSection: ListsSection;
  children: React.ReactNode;
  /** Optional row below the main tabs (status pills, create CTA, back link, etc.) */
  contextTabs?: React.ReactNode;
}

const SECTIONS: { id: ListsSection; label: string; href: string }[] = [
  { id: "tracking", label: "Tracking", href: "/" },
  { id: "collections", label: "My lists", href: "/lists/collections" },
];

export function ListsSectionLayout({
  activeSection,
  children,
  contextTabs,
}: ListsSectionLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex items-center gap-8 border-b border-border/40">
          {SECTIONS.map((section) => {
            const active = section.id === activeSection;
            return (
              <Link
                key={section.id}
                href={section.href}
                className={cn(
                  "pb-4 text-2xl tracking-tight transition-colors",
                  active
                    ? "border-b-2 border-primary font-bold text-foreground"
                    : "font-semibold text-muted-foreground hover:text-foreground/80",
                )}
                role="tab"
                aria-selected={active}
              >
                {section.label}
              </Link>
            );
          })}
        </div>

        {contextTabs ? (
          <div className="flex flex-wrap items-center gap-3">{contextTabs}</div>
        ) : null}
      </div>

      {children}
    </div>
  );
}
