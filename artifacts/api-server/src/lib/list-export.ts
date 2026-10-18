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
export const LOCAL_EXPORT_TARGET = "local-simulator";
export const LOCAL_EXPORT_PROFILE = "mediahub-local-test";
const LOCAL_VISIBILITY = "private";

type ExportItem = ProbeItem & { standIn: boolean };

export function exportFingerprint(input: {
  target: string;
  profile: string;
  name: string;
  visibility: string;
  items: Array<{ imdbId: string; title: string; year: number; type: string }>;
}): string {
  return createHash("sha256").update(JSON.stringify({
    target: input.target,
    profile: input.profile,
    name: input.name,
    visibility: input.visibility,
    items: input.items.map((item) => ({
      imdbId: item.imdbId,
      title: item.title,
      year: item.year,
      type: item.type,
    })),
  })).digest("hex");
}

export function exportStillMatches(input: {
  storedHash: string | null;
  storedTarget: string | null;
  slug: string | null;
  nextHash: string;
  target: string;
  remotePresent: boolean;
}): boolean {
  return input.storedHash === input.nextHash
    && input.storedTarget === input.target
    && Boolean(input.slug)
    && input.remotePresent;
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
    .orderBy(asc(customListItemsTable.addedAt), asc(customListItemsTable.id));
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
    target: LOCAL_EXPORT_TARGET,
    profile: LOCAL_EXPORT_PROFILE,
    visibility: LOCAL_VISIBILITY,
    simulated: true,
    verifiedExternal: false,
    statusLabel: statusLabel(list.syncStatus ?? (list.exportEnabled ? "pending" : "off")),
    install: [
      "This is a local test simulator. It is not a verified sync to My Lists.",
      "The same list keeps its slug after a rename. A missing simulated copy is written again on the next run.",
      "Pausing leaves this list here and does not delete the simulated copy.",
    ],
  };
}

function statusLabel(status: string): string {
  if (status === "synced" || status === "simulated") return "Simulated locally";
  if (status === "pending") return "Waiting";
  if (status === "syncing") return "Updating local test";
  if (status === "paused") return "Paused";
  if (status === "error") return "Error";
  if (status === "conflict") return "Conflict";
  if (status === "removed") return "Simulated copy removed";
  return "Off";
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
    return { ok: true, status: "paused", detail: "Export is paused. The simulated list was left in place." };
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

  const hash = exportFingerprint({
    target: LOCAL_EXPORT_TARGET,
    profile: LOCAL_EXPORT_PROFILE,
    name: list.name,
    visibility: LOCAL_VISIBILITY,
    items,
  });
  const slug = stableSlug(list.id, list.myListsSlug);
  const remote = readLocalMyList(slug);
  if (exportStillMatches({
    storedHash: list.contentHash,
    storedTarget: list.syncTarget,
    slug: list.myListsSlug,
    nextHash: hash,
    target: LOCAL_EXPORT_TARGET,
    remotePresent: remote.ok,
  })) {
    if (list.syncStatus !== "simulated") {
      await db.update(customListsTable).set({ syncStatus: "simulated", syncError: null }).where(eq(customListsTable.id, list.id));
    }
    return {
      ok: true,
      status: "simulated",
      detail: "The local test simulator already has this list. This is not a verified sync to My Lists.",
      slug,
      count: items.length,
    };
  }

  const idempotencyKey = `${list.id}:${hash}`;
  await db.insert(listSyncQueueTable).values({
    listId: list.id,
    idempotencyKey,
    contentHash: hash,
    status: "pending",
  }).onConflictDoNothing();
  await db.update(customListsTable).set({ syncStatus: "syncing", syncError: null }).where(eq(customListsTable.id, list.id));

  const expectedUpdatedAt = remote.ok && list.externalVersion ? Number(list.externalVersion) : undefined;
  const saved = saveLocalMyList({
    slug,
    name: list.name,
    items,
    expectedUpdatedAt: expectedUpdatedAt !== undefined && Number.isFinite(expectedUpdatedAt) ? expectedUpdatedAt : undefined,
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
    syncStatus: "simulated",
    syncTarget: LOCAL_EXPORT_TARGET,
    syncError: null,
    lastSyncedAt: new Date(),
  }).where(eq(customListsTable.id, list.id));
  await db.update(listSyncQueueTable).set({ status: "done" }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
  const standIns = items.filter((item) => item.standIn).length;
  return {
    ok: true,
    status: "simulated",
    detail: standIns > 0
      ? `Wrote ${items.length} titles to the local test simulator as ${slug}. ${standIns} still use a TMDB stand-in. This is not a verified sync to My Lists.`
      : `Wrote ${items.length} titles to the local test simulator as ${slug}. This is not a verified sync to My Lists.`,
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
    return { ok: true, status: "paused", detail: "Export is paused. The Media Hub list and the simulated copy are both still there." };
  }
  if (action === "delete-external") {
    const slug = list.myListsSlug;
    if (slug) deleteLocalMyList(slug);
    await db.update(customListsTable).set({
      exportEnabled: false,
      syncStatus: "removed",
      syncError: null,
    }).where(eq(customListsTable.id, listId));
    return { ok: true, status: "removed", detail: slug ? `Removed the simulated list ${slug}. The Media Hub list is unchanged.` : "There was no simulated list to remove." };
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
