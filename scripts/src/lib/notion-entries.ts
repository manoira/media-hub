import { readFile } from "node:fs/promises";
import path from "node:path";
import { cell, parseCsvTable, type CsvTable } from "./parse-csv.js";

export type MediaType = "movie" | "tv";
export type WatchlistStatus = "watching" | "watched" | "want_to_watch" | "unsure";

export type NotionImportEntry = {
  name: string;
  tmdbId: number;
  mediaType: MediaType;
  status: WatchlistStatus;
  notionSett: string;
  matchMethod: "tmdb_url" | "imdb_url" | "title_search";
  tmdbUrl?: string;
  year?: number;
};

export type SkippedRow = {
  name: string;
  reason: string;
  tmdbField?: string;
  notionSett?: string;
};

const TMDB_PATH_RE = /themoviedb\.org\/(movie|tv)\/(\d+)/i;
const IMDB_RE = /imdb\.com\/title\/(tt\d+)/i;
const COLLECTION_RE = /themoviedb\.org\/collection\//i;

function mediaKey(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

function parseYear(raw: string): number | undefined {
  const match = raw.match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : undefined;
}

function parseFormatHint(raw: string): MediaType | undefined {
  if (/serie/i.test(raw)) return "tv";
  if (/film/i.test(raw)) return "movie";
  return undefined;
}

function parseTmdbUrl(url: string): { tmdbId: number; mediaType: MediaType } | null {
  const match = url.match(TMDB_PATH_RE);
  if (!match) return null;
  return {
    mediaType: match[1].toLowerCase() as MediaType,
    tmdbId: Number(match[2]),
  };
}

function parseImdbId(url: string): string | null {
  return url.match(IMDB_RE)?.[1] ?? null;
}

export function mapNotionSettStatus(sett: string): WatchlistStatus | null {
  const value = sett.trim().toLowerCase();
  if (!value) return null;
  if (value === "har sett") return "watched";
  if (value === "håller på att se") return "watching";
  if (value === "har inte sett" || value === "ej lanserat" || value === "ej lanserad") {
    return "want_to_watch";
  }
  if (value === "osäker") return "unsure";
  return null;
}

function mergeEnrichment(existing: Enrichment | undefined, next: Enrichment): Enrichment {
  if (!existing) return next;
  const sett = next.sett || existing.sett || "";
  const mapped = sett ? mapNotionSettStatus(sett) : null;
  return {
    year: next.year ?? existing.year,
    format: next.format ?? existing.format,
    sett: sett || undefined,
    status: mapped ?? undefined,
  };
}

function setEnrichment(map: Map<string, Enrichment>, key: string, next: Enrichment) {
  map.set(key, mergeEnrichment(map.get(key), next));
}

type Enrichment = {
  year?: number;
  format?: MediaType;
  sett?: string;
  status?: WatchlistStatus;
};

function buildEnrichment(table: CsvTable): Map<string, Enrichment> {
  const map = new Map<string, Enrichment>();
  for (const row of table.rows) {
    const name = cell(row, table.index, "Name");
    const url = cell(row, table.index, "TMDB");
    const sett = cell(row, table.index, "Sett");
    const enrichment: Enrichment = {
      year: parseYear(cell(row, table.index, "Lanserad")),
      format: parseFormatHint(cell(row, table.index, "Format")),
      sett: sett || undefined,
      status: mapNotionSettStatus(sett) ?? undefined,
    };
    if (name) setEnrichment(map, name.toLowerCase(), enrichment);
    const parsed = parseTmdbUrl(url);
    if (parsed) setEnrichment(map, mediaKey(parsed.mediaType, parsed.tmdbId), enrichment);
  }
  return map;
}

export async function loadNotionCsvTables(dataDir: string): Promise<{
  simple: CsvTable;
  full?: CsvTable;
  enrichment: Map<string, Enrichment>;
}> {
  const simpleText = (await readFile(path.join(dataDir, "notion-export2.csv"), "utf8")).replace(/^\uFEFF/, "");
  const simple = parseCsvTable(simpleText);

  let full: CsvTable | undefined;
  let enrichment = new Map<string, Enrichment>();
  try {
    const fullText = (await readFile(path.join(dataDir, "notion-export.csv"), "utf8")).replace(/^\uFEFF/, "");
    full = parseCsvTable(fullText);
    enrichment = buildEnrichment(full);
  } catch {
    enrichment = buildEnrichment(simple);
  }

  return { simple, full, enrichment };
}

export type ResolveContext = {
  findByImdb: (imdbId: string) => Promise<{ tmdbId: number; mediaType: MediaType } | null>;
  searchByTitle: (
    title: string,
    options: { year?: number; mediaType?: MediaType },
  ) => Promise<{ tmdbId: number; mediaType: MediaType } | null>;
};

export async function resolveNotionRows(
  simple: CsvTable,
  enrichment: Map<string, Enrichment>,
  ctx: ResolveContext,
): Promise<{ entries: NotionImportEntry[]; skipped: SkippedRow[] }> {
  const entries: NotionImportEntry[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();

  const addResolved = (
    name: string,
    tmdbId: number,
    mediaType: MediaType,
    matchMethod: NotionImportEntry["matchMethod"],
    tmdbUrl: string | undefined,
    year: number | undefined,
  ) => {
    const key = mediaKey(mediaType, tmdbId);
    if (seen.has(key)) return;
    const statusResult = resolveEntryStatus(mediaType, tmdbId, name, enrichment);
    if ("skip" in statusResult) {
      skipped.push({
        name,
        reason: statusResult.reason,
        tmdbField: tmdbUrl,
        notionSett: statusResult.notionSett,
      });
      return;
    }
    seen.add(key);
    entries.push({
      name,
      tmdbId,
      mediaType,
      status: statusResult.status,
      notionSett: statusResult.notionSett,
      matchMethod,
      tmdbUrl,
      year,
    });
  };

  for (const row of simple.rows) {
    const name = cell(row, simple.index, "Name");
    const tmdbField = cell(row, simple.index, "TMDB");
    const enrich = enrichment.get(name.toLowerCase());

    if (!name) {
      skipped.push({ name: "(tom titel)", reason: "missing_name", tmdbField });
      continue;
    }

    if (COLLECTION_RE.test(tmdbField)) {
      skipped.push({ name, reason: "collection_link", tmdbField });
      continue;
    }

    const direct = parseTmdbUrl(tmdbField);
    if (direct) {
      addResolved(name, direct.tmdbId, direct.mediaType, "tmdb_url", tmdbField, enrich?.year);
      continue;
    }

    const imdbId = parseImdbId(tmdbField);
    if (imdbId) {
      const resolved = await ctx.findByImdb(imdbId);
      if (!resolved) {
        skipped.push({ name, reason: "imdb_lookup_failed", tmdbField });
        continue;
      }
      addResolved(name, resolved.tmdbId, resolved.mediaType, "imdb_url", tmdbField, enrich?.year);
      continue;
    }

    if (!tmdbField || /notion\.(so|com)/i.test(tmdbField)) {
      const resolved = await ctx.searchByTitle(name, {
        year: enrich?.year,
        mediaType: enrich?.format,
      });
      if (!resolved) {
        skipped.push({
          name,
          reason: tmdbField ? "notion_link_title_search_failed" : "missing_tmdb_title_search_failed",
          tmdbField,
        });
        continue;
      }
      addResolved(
        name,
        resolved.tmdbId,
        resolved.mediaType,
        "title_search",
        tmdbField || undefined,
        enrich?.year,
      );
      continue;
    }

    skipped.push({ name, reason: "unsupported_tmdb_field", tmdbField });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name, "sv"));
  return { entries, skipped };
}

function resolveEntryStatus(
  mediaType: MediaType,
  tmdbId: number,
  name: string,
  enrichment: Map<string, Enrichment>,
):
  | { status: WatchlistStatus; notionSett: string }
  | { skip: true; reason: string; notionSett?: string } {
  const source = enrichment.get(mediaKey(mediaType, tmdbId)) ?? enrichment.get(name.toLowerCase());
  const sett = source?.sett ?? "";
  const mapped = source?.status ?? mapNotionSettStatus(sett);

  if (!mapped) {
    if (!sett) return { skip: true, reason: "missing_sett" };
    return { skip: true, reason: "unknown_sett", notionSett: sett };
  }
  return { status: mapped, notionSett: sett };
}
