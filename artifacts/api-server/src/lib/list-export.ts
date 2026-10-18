import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  customListItemsTable,
  customListsTable,
  db,
  listSyncQueueTable,
  watchlistTable,
  type ListRules,
} from "@workspace/db";
import { evaluateListRules } from "./list-rules";
import { deleteLocalMyList, readLocalMyList, saveLocalMyList, type ProbeItem } from "./my-lists-sandbox";

const MAX_ITEMS = 500;
const MAX_BYTES = 800_000;

type ExportItem = ProbeItem & { standIn: boolean };

function orderedHash(items: Array<{ mediaType: string; tmdbId: number }>): string {
  return createHash("sha256").update(items.map((item) => `${item.mediaType}:${item.tmdbId}`).join("\n")).digest("hex");
}

function stableSlug(listId: number, stored: string | null): string {
  return stored?.trim() || `mh-${listId}`;
}

async function listRows(listId: number, kind: string, smartMode: string | null, rules: ListRules | null) {
  if (kind === "smart" && smartMode === "live") {
    const allItems = await db.select().from(watchlistTable);
    return evaluateListRules(allItems, rules).map((item) => ({
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      releaseDate: item.releaseDate,
      imdbId: item.imdbId,
    })).sort((left, right) => left.title.localeCompare(right.title) || left.tmdbId - right.tmdbId);
  }
  const rows = await db
    .select({
      tmdbId: customListItemsTable.tmdbId,
      mediaType: customListItemsTable.mediaType,
      title: customListItemsTable.title,
      releaseDate: customListItemsTable.releaseDate,
      imdbId: watchlistTable.imdbId,
    })
    .from(customListItemsTable)
    .leftJoin(
      watchlistTable,
      and(eq(customListItemsTable.tmdbId, watchlistTable.tmdbId), eq(customListItemsTable.mediaType, watchlistTable.mediaType)),
    )
    .where(eq(customListItemsTable.listId, listId))
    .orderBy(asc(customListItemsTable.title), asc(customListItemsTable.tmdbId));
  return rows.flatMap((row) => {
    if (row.tmdbId == null || !row.mediaType) return [];
    return [{
      tmdbId: row.tmdbId,
      mediaType: row.mediaType,
      title: row.title ?? "Untitled",
      releaseDate: row.releaseDate,
      imdbId: row.imdbId,
    }];
  });
}

function toProbeItem(row: { tmdbId: number; mediaType: string; title: string; releaseDate: string | null; imdbId: string | null }): ExportItem {
  const year = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : 0;
  const standIn = !row.imdbId;
  return {
    imdbId: row.imdbId || `tmdb-${row.mediaType}-${row.tmdbId}`,
    title: row.title,
    year: Number.isFinite(year) ? year : 0,
    type: row.mediaType === "tv" ? "series" : "movie",
    standIn,
  };
}

export async function readListSync(listId: number) {
  const [list] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
  if (!list) return null;
  return {
    listId: list.id,
    name: list.name,
    exportEnabled: list.exportEnabled,
    syncStatus: list.syncStatus ?? (list.exportEnabled ? "pending" : "off"),
    slug: list.myListsSlug,
    contentHash: list.contentHash,
    externalVersion: list.externalVersion,
    lastSyncedAt: list.lastSyncedAt?.toISOString() ?? null,
    syncError: list.syncError,
    target: "local-stand-in",
    visibility: "private",
    install: [
      "In Wako, add the My Lists catalog with the local test profile until a creator key is saved.",
      "The same list keeps its slug after a rename. A new catalog row is only needed when the addon URL changes.",
      "Pausing export leaves this list here and does not delete the external copy.",
    ],
  };
}

let chain: Promise<unknown> = Promise.resolve();

export function enqueueListExport(listId: number): Promise<ExportResult> {
  const run = chain.then(() => exportList(listId));
  chain = run.then(() => undefined, () => undefined);
  return run;
}

type ExportResult = {
  ok: boolean;
  status: string;
  detail: string;
  slug?: string;
  count?: number;
  standIns?: number;
};

export async function exportList(listId: number): Promise<ExportResult> {
  const [list] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
  if (!list) return { ok: false, status: "error", detail: "That list is not in the catalog." };
  if (!list.exportEnabled) {
    return { ok: true, status: "paused", detail: "Export is paused. The external list was left in place." };
  }

  const rows = await listRows(list.id, list.kind, list.smartMode, list.rules);
  if (rows.length > MAX_ITEMS) {
    const detail = `This list has ${rows.length} titles. The limit is ${MAX_ITEMS}, so nothing was written.`;
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail };
  }
  const items = rows.map(toProbeItem);
  const bytes = Buffer.byteLength(JSON.stringify(items));
  if (bytes > MAX_BYTES) {
    const detail = `This list is ${bytes} bytes. The limit is ${MAX_BYTES}, so nothing was written.`;
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail };
  }

  const hash = orderedHash(rows.map((row) => ({ mediaType: row.mediaType, tmdbId: row.tmdbId })));
  if (list.contentHash === hash && list.myListsSlug) {
    if (list.syncStatus !== "synced") {
      await db.update(customListsTable).set({ syncStatus: "synced", syncError: null }).where(eq(customListsTable.id, list.id));
    }
    return { ok: true, status: "synced", detail: "The saved list already matches this content.", slug: list.myListsSlug, count: items.length };
  }

  const slug = stableSlug(list.id, list.myListsSlug);
  const idempotencyKey = `${list.id}:${hash}`;
  await db.insert(listSyncQueueTable).values({
    listId: list.id,
    idempotencyKey,
    contentHash: hash,
    status: "pending",
  }).onConflictDoNothing();
  await db.update(customListsTable).set({ syncStatus: "syncing", syncError: null }).where(eq(customListsTable.id, list.id));

  const expectedUpdatedAt = list.externalVersion ? Number(list.externalVersion) : undefined;
  const saved = saveLocalMyList({
    slug,
    name: list.name,
    items,
    expectedUpdatedAt: Number.isFinite(expectedUpdatedAt) ? expectedUpdatedAt : undefined,
  });
  if (!saved.ok) {
    const status = saved.status === 409 ? "conflict" : "error";
    const detail = saved.status === 409
      ? "The external list changed. Media Hub did not overwrite it."
      : saved.error;
    await db.update(listSyncQueueTable).set({ status }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
    await mark(list.id, status, detail);
    return { ok: false, status, detail, slug };
  }

  const read = readLocalMyList(slug);
  const sameOrder = Boolean(read.ok && read.items && read.items.every((item, index) => item.imdbId === items[index]?.imdbId));
  if (!read.ok || !read.items || read.items.length !== items.length || !sameOrder) {
    const detail = "The list was written, but reading it back did not match the order or count.";
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail, slug };
  }

  await db.update(customListsTable).set({
    myListsSlug: slug,
    contentHash: hash,
    externalVersion: String(saved.updatedAt),
    syncStatus: "synced",
    syncError: null,
    lastSyncedAt: new Date(),
  }).where(eq(customListsTable.id, list.id));
  await db.update(listSyncQueueTable).set({ status: "done" }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
  const standIns = items.filter((item) => item.standIn).length;
  return {
    ok: true,
    status: "synced",
    detail: standIns > 0
      ? `Synced ${items.length} titles to ${slug}. ${standIns} still need an IMDb id, so the local stand-in used a TMDB id.`
      : `Synced ${items.length} titles to ${slug}.`,
    slug,
    count: items.length,
    standIns,
  };
}

async function mark(listId: number, status: string, detail: string) {
  await db.update(customListsTable).set({ syncStatus: status, syncError: detail }).where(eq(customListsTable.id, listId));
}

export async function setListExport(listId: number, action: "enable" | "pause" | "sync" | "delete-external"): Promise<ExportResult> {
  const [list] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
  if (!list) return { ok: false, status: "error", detail: "That list is not in the catalog." };
  if (action === "pause") {
    await db.update(customListsTable).set({ exportEnabled: false, syncStatus: "paused", syncError: null }).where(eq(customListsTable.id, listId));
    return { ok: true, status: "paused", detail: "Export is paused. The local list and the external copy are both still there." };
  }
  if (action === "delete-external") {
    const slug = list.myListsSlug;
    if (slug) deleteLocalMyList(slug);
    await db.update(customListsTable).set({
      exportEnabled: false,
      syncStatus: "removed",
      syncError: null,
    }).where(eq(customListsTable.id, listId));
    return { ok: true, status: "removed", detail: slug ? `Removed the external list ${slug}. The Media Hub list is unchanged.` : "There was no external list to remove." };
  }
  await db.update(customListsTable).set({ exportEnabled: true, syncStatus: "pending", syncError: null }).where(eq(customListsTable.id, listId));
  return enqueueListExport(listId);
}

export async function checkLocalListRoundTrip(): Promise<{ ok: boolean; steps: string[] }> {
  const slug = "mh-release-check";
  deleteLocalMyList(slug);
  const steps: string[] = [];
  const first = saveLocalMyList({ slug, name: "Release check", items: [{ imdbId: "tt0133093", title: "The Matrix", year: 1999, type: "movie" }] });
  const renamed = first.ok
    ? saveLocalMyList({ slug, name: "Release check renamed", items: [{ imdbId: "tt0133093", title: "The Matrix", year: 1999, type: "movie" }], expectedUpdatedAt: first.updatedAt })
    : null;
  const read = readLocalMyList(slug);
  const sameSlug = Boolean(renamed?.ok && renamed.slug === slug && read.ok && read.name === "Release check renamed" && read.items?.length === 1);
  steps.push(sameSlug ? "A rename kept the same slug and the same title." : "The rename did not keep the same slug.");
  const conflict = renamed?.ok
    ? saveLocalMyList({ slug, name: "Release check renamed", items: [], expectedUpdatedAt: first.ok ? first.updatedAt : 0 })
    : null;
  steps.push(conflict && !conflict.ok && conflict.status === 409
    ? "A stale version was refused and the list was not overwritten."
    : "A stale version was not refused.");
  const current = readLocalMyList(slug);
  const emptied = current.ok
    ? saveLocalMyList({ slug, name: "Release check renamed", items: [], expectedUpdatedAt: current.updatedAt })
    : null;
  const emptyRead = readLocalMyList(slug);
  steps.push(emptied?.ok && emptyRead.ok && emptyRead.items?.length === 0
    ? "An empty list stayed on the same slug."
    : "The empty list was not saved.");
  deleteLocalMyList(slug);
  const gone = readLocalMyList(slug);
  steps.push(!gone.ok ? "The check list was removed without touching the catalog." : "The check list is still present.");
  const ok = sameSlug
    && Boolean(conflict && !conflict.ok && conflict.status === 409)
    && Boolean(emptied?.ok && emptyRead.ok && emptyRead.items?.length === 0)
    && !gone.ok;
  return { ok, steps };
}
