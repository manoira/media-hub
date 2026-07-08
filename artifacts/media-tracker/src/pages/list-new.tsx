import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import {
  useCreateCustomList,
  useGetGenres,
  getGetGenresQueryKey,
  getGetCustomListsQueryKey,
  type CustomListInput,
  type ListRules,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MultiFilterMenu } from "@/components/media/multi-filter-menu";
import {
  STATUS_OPTIONS,
  LANGUAGE_OPTIONS,
  YEAR_OPTIONS,
  RATING_OPTIONS,
  encodeYearRange,
  decodeYearRange,
  isYearRangeActive,
} from "@/lib/browse-filters";
import { Loader2, ChevronLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ListsSectionLayout } from "@/components/lists/lists-section-layout";

const YEAR_FILTER_OPTIONS = YEAR_OPTIONS.filter(isYearRangeActive).map(opt => ({
  label: opt.label,
  value: encodeYearRange(opt)!,
}));

const RATING_FILTER_OPTIONS = RATING_OPTIONS.filter(
  (opt): opt is { label: string; value: number } => opt.value !== undefined,
);

const LANGUAGE_FILTER_OPTIONS = LANGUAGE_OPTIONS.filter(
  (opt): opt is { label: string; value: string } => opt.value !== undefined,
);

function parseInitialRules(): ListRules {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("rules");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ListRules;
  } catch {
    return {};
  }
}

export function ListNewPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const initialRules = useMemo(() => parseInitialRules(), []);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"manual" | "smart">(
    Object.keys(initialRules).length > 0 ? "smart" : "manual",
  );
  const [smartMode, setSmartMode] = useState<"live" | "snapshot">("live");
  const [mediaType, setMediaType] = useState<"movie" | "tv" | undefined>(initialRules.mediaType);
  const [statuses, setStatuses] = useState<string[]>(initialRules.statuses ?? []);
  const [genres, setGenres] = useState<number[]>(initialRules.genreIds ?? []);
  const [languages, setLanguages] = useState<string[]>(initialRules.languages ?? []);
  const [minRatings, setMinRatings] = useState<number[]>(initialRules.minRatings ?? []);
  const [yearRangeKeys, setYearRangeKeys] = useState<string[]>(
    (initialRules.yearRanges ?? [])
      .map(encodeYearRange)
      .filter((v): v is string => v !== null),
  );
  const [tagQuery, setTagQuery] = useState("");
  const [keywordIds, setKeywordIds] = useState<number[]>(initialRules.keywordIds ?? []);

  const createList = useCreateCustomList();
  const { data: genreData } = useGetGenres({ query: { queryKey: getGetGenresQueryKey() } });

  const activeGenres = useMemo(() => {
    if (mediaType === "movie") return genreData?.movieGenres ?? [];
    if (mediaType === "tv") return genreData?.tvGenres ?? [];
    const merged = new Map<number, { id: number; name: string }>();
    for (const g of genreData?.movieGenres ?? []) merged.set(g.id, g);
    for (const g of genreData?.tvGenres ?? []) merged.set(g.id, g);
    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mediaType, genreData]);

  const buildRules = (): ListRules | undefined => {
    if (kind !== "smart") return undefined;
    const yearRanges = yearRangeKeys
      .map(key => decodeYearRange(key))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const rules: ListRules = {};
    if (mediaType) rules.mediaType = mediaType;
    if (statuses.length) rules.statuses = statuses as ListRules["statuses"];
    if (genres.length) rules.genreIds = genres;
    if (languages.length) rules.languages = languages;
    if (minRatings.length) rules.minRatings = minRatings;
    if (yearRanges.length) rules.yearRanges = yearRanges;
    if (keywordIds.length) rules.keywordIds = keywordIds;
    return Object.keys(rules).length > 0 ? rules : {};
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const payload: CustomListInput = {
      name: name.trim(),
      description: description.trim() || null,
      kind,
      ...(kind === "smart" ? { smartMode, rules: buildRules() } : {}),
    };

    createList.mutate(
      { data: payload },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getGetCustomListsQueryKey() });
          setLocation(`/lists/${created.id}`);
        },
      },
    );
  };

  const addTag = () => {
    const trimmed = tagQuery.trim();
    if (!trimmed) return;
    const id = parseInt(trimmed, 10);
    if (!Number.isNaN(id) && !keywordIds.includes(id)) {
      setKeywordIds(prev => [...prev, id]);
      setTagQuery("");
    }
  };

  return (
    <ListsSectionLayout
      activeSection="collections"
      contextTabs={
        <Link href="/lists/collections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to My Lists
        </Link>
      }
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New list</h1>
          <p className="mt-1 text-muted-foreground">
            Create a manual list or save watchlist filters as a smart list.
          </p>
        </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="list-name">Name</Label>
          <Input
            id="list-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Swedish films, Time travel, ..."
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="list-desc">Description (optional)</Label>
          <Textarea
            id="list-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>List type</Label>
          <div className="flex bg-muted rounded-lg p-1 w-fit">
            <Button
              type="button"
              variant={kind === "manual" ? "default" : "ghost"}
              size="sm"
              onClick={() => setKind("manual")}
            >
              Manual
            </Button>
            <Button
              type="button"
              variant={kind === "smart" ? "default" : "ghost"}
              size="sm"
              onClick={() => setKind("smart")}
            >
              Smart (rules)
            </Button>
          </div>
        </div>

        {kind === "smart" && (
          <>
            <div className="space-y-2">
              <Label>Update mode</Label>
              <div className="flex bg-muted rounded-lg p-1 w-fit">
                <Button
                  type="button"
                  variant={smartMode === "live" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSmartMode("live")}
                >
                  Live
                </Button>
                <Button
                  type="button"
                  variant={smartMode === "snapshot" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSmartMode("snapshot")}
                >
                  Snapshot
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Live lists update automatically. Snapshot lists freeze until you refresh.
              </p>
            </div>

            <div className="space-y-3">
              <Label>Rules</Label>
              <div className="flex bg-muted rounded-lg p-1 w-fit">
                <Button
                  type="button"
                  variant={mediaType === "movie" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMediaType(mediaType === "movie" ? undefined : "movie")}
                >
                  Movies
                </Button>
                <Button
                  type="button"
                  variant={mediaType === "tv" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMediaType(mediaType === "tv" ? undefined : "tv")}
                >
                  TV
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <MultiFilterMenu
                  label="Status"
                  options={STATUS_OPTIONS}
                  selected={statuses}
                  onChange={setStatuses}
                />
                <MultiFilterMenu
                  label="Genre"
                  options={activeGenres.map(g => ({ label: g.name, value: g.id }))}
                  selected={genres}
                  onChange={setGenres}
                />
                <MultiFilterMenu
                  label="Language"
                  options={LANGUAGE_FILTER_OPTIONS}
                  selected={languages}
                  onChange={setLanguages}
                />
                <MultiFilterMenu
                  label="Year"
                  options={YEAR_FILTER_OPTIONS}
                  selected={yearRangeKeys}
                  onChange={setYearRangeKeys}
                />
                <MultiFilterMenu
                  label="Min rating"
                  options={RATING_FILTER_OPTIONS}
                  selected={minRatings}
                  onChange={setMinRatings}
                />
              </div>

              <div className="space-y-2">
                <Label>TMDB keyword IDs (for tags)</Label>
                <div className="flex gap-2">
                  <Input
                    value={tagQuery}
                    onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Keyword ID from tag search"
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    Add
                  </Button>
                </div>
                {keywordIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {keywordIds.map(id => (
                      <Button
                        key={id}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setKeywordIds(prev => prev.filter(k => k !== id))}
                      >
                        {id} ×
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <Button type="submit" disabled={createList.isPending || !name.trim()}>
          {createList.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Create list
        </Button>
      </form>
      </div>
    </ListsSectionLayout>
  );
}
