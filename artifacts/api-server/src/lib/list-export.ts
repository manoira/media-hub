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
import { runExclusiveListJob } from "./export-lock";
import { resolveMyListsTransport, type MyListsConnection, type MyListsTransport } from "./my-lists-config";
import { deleteMyListsHttp, readMyListsHttp, sameMyListPayload, saveMyListsHttp, type MyListsWireItem } from "./my-lists-http";
import { deleteLocalMyList, readLocalMyList, saveLocalMyList, type ProbeItem } from "./my-lists-sandbox";

const MAX_ITEMS = 500;
const MAX_BYTES = 800_000;
export const LOCAL_EXPORT_TARGET = "local-simulator";
export const LOCAL_EXPORT_PROFILE = "mediahub-local-test";
const LOCAL_VISIBILITY = "private";

type ExportItem = ProbeItem & { standIn: boolean };
type ReadyTransport = Exclude<MyListsTransport, { kind: "unconfigured" }>;

const IMDB_ID = /^tt\d{7,8}$/;

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

function toProbeItem(row: { tmdbId: number; mediaType: string; title: string; releaseDate: string | null; imdbId: string | null }, transport: ReadyTransport): ExportItem | null {
  const year = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : 0;
  const type = row.mediaType === "tv" ? "series" : "movie";
  const valid = Boolean(row.imdbId && IMDB_ID.test(row.imdbId));
  if (transport.kind === "http" && !valid) return null;
  return {
    imdbId: valid && row.imdbId ? row.imdbId : `tmdb-${row.mediaType}-${row.tmdbId}`,
    title: row.title,
    year: Number.isFinite(year) ? year : 0,
    type,
    standIn: !valid,
  };
}

function connectionFor(transport: MyListsTransport, status: string, storedTarget: string | null): MyListsConnection {
  if (transport.kind === "simulator") return "simulated";
  if (transport.kind !== "http") return "unconfigured";
  if (status === "verified" && storedTarget === transport.target) return "verified";
  return "configured";
}

export async function readListSync(listId: number) {
  const [list] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
  if (!list) return null;
  const transport = resolveMyListsTransport();
  const status = list.syncStatus ?? (list.exportEnabled ? "pending" : "off");
  const connection = connectionFor(transport, status, list.syncTarget);
  return {
    listId: list.id,
    name: list.name,
    exportEnabled: list.exportEnabled,
    syncStatus: status,
    slug: list.myListsSlug,
    contentHash: list.contentHash,
    externalVersion: list.externalVersion,
    lastSyncedAt: list.lastSyncedAt?.toISOString() ?? null,
    syncError: list.syncError,
    target: transport.kind === "unconfigured" ? null : transport.target,
    profile: transport.kind === "unconfigured" ? null : transport.profile,
    visibility: LOCAL_VISIBILITY,
    transport: transport.kind,
    connection,
    simulated: connection === "simulated",
    configured: transport.kind === "http",
    verifiedExternal: connection === "verified",
    statusLabel: statusLabel(status, connection),
    install: installLines(transport),
  };
}

function statusLabel(status: string, connection: MyListsConnection): string {
  if (connection === "unconfigured") return "Not configured";
  if (connection === "verified") return "Verified";
  if (connection === "configured") {
    if (status === "error") return "Configured, not verified";
    if (status === "conflict") return "Conflict";
    if (status === "paused") return "Paused";
    if (status === "syncing") return "Updating My Lists";
    return "Configured, not verified";
  }
  if (status === "synced" || status === "simulated") return "Simulated locally";
  if (status === "pending") return "Waiting";
  if (status === "syncing") return "Updating local test";
  if (status === "paused") return "Paused";
  if (status === "error") return "Error";
  if (status === "conflict") return "Conflict";
  if (status === "removed") return "Simulated copy removed";
  return "Off";
}

function installLines(transport: MyListsTransport): string[] {
  if (transport.kind === "http") {
    return [
      "Configured means the HTTPS origin, creator name, and server secret are set. Verified means this list was read back with the same identities, order, count, and name.",
      "The list stays private and keeps its slug. A title without an IMDb id is named and left out. Media Hub does not invent one.",
      "A Wako catalog row is this install's addon manifest. It is not Wako's built-in My Lists, and seeing the row is not verified playback.",
    ];
  }
  if (transport.kind === "simulator") {
    return [
      "This is a local test simulator. It is not a verified sync to My Lists.",
      "The same list keeps its slug after a rename. A missing simulated copy is written again on the next run.",
      "Pausing leaves this list here and does not delete the simulated copy.",
    ];
  }
  return [
    "Set MY_LISTS_ORIGIN, MY_LISTS_CREATOR_NAME, and MY_LISTS_CREATOR_KEY. Media Hub does not fall back to the local simulator.",
    "MY_LISTS_MODE=simulator is the only local test path, and it is never reported as verified.",
  ];
}

function payloadMatches(
  remote: { ok: boolean; name?: string; items?: Array<{ imdbId: string; title: string; type: string }> },
  name: string,
  items: ExportItem[],
): boolean {
  return Boolean(
    remote.ok
    && remote.name === name
    && remote.items
    && remote.items.length === items.length
    && remote.items.every((item, index) => {
      const expected = items[index];
      return item.imdbId === expected?.imdbId && item.title === expected?.title && item.type === expected?.type;
    }),
  );
}

export function enqueueListExport(listId: number): Promise<ExportResult> {
  return runExclusiveListJob(listId, () => exportList(listId));
}

type ExportResult = {
  ok: boolean;
  status: string;
  detail: string;
  slug?: string;
  count?: number;
  standIns?: number;
};

async function readRemote(transport: ReadyTransport, slug: string): Promise<{
  ok: boolean;
  name?: string;
  items?: MyListsWireItem[];
  updatedAt?: number;
  visibility?: string;
}> {
  if (transport.kind === "simulator") {
    const remote = readLocalMyList(slug);
    return remote.ok ? { ok: true, name: remote.name, items: remote.items, updatedAt: remote.updatedAt, visibility: "private" } : { ok: false };
  }
  const remote = await readMyListsHttp(transport, slug);
  return remote.ok ? remote : { ok: false };
}

function omittedNote(titles: string[]): string {
  if (titles.length === 0) return "";
  const shown = titles.slice(0, 8).join(", ");
  return ` ${titles.length} title${titles.length === 1 ? "" : "s"} had no IMDb id and ${titles.length === 1 ? "was" : "were"} not sent: ${shown}.`;
}

export async function exportList(listId: number): Promise<ExportResult> {
  const [list] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
  if (!list) return { ok: false, status: "error", detail: "That list is not in the catalog." };
  const transport = resolveMyListsTransport();
  if (!list.exportEnabled) {
    const detail = transport.kind === "http"
      ? "Export is paused. The My Lists copy was left in place."
      : "Export is paused. The simulated list was left in place.";
    return { ok: true, status: "paused", detail };
  }
  if (transport.kind === "unconfigured") {
    await mark(list.id, "error", transport.reason);
    return { ok: false, status: "error", detail: transport.reason };
  }

  const rows = await listRows(list.id, list.kind, list.smartMode, list.rules);
  if (rows.length > MAX_ITEMS) {
    const detail = `This list has ${rows.length} titles. The limit is ${MAX_ITEMS}, so nothing was written.`;
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail };
  }
  const omitted = transport.kind === "http"
    ? rows.filter((row) => !row.imdbId || !IMDB_ID.test(row.imdbId)).map((row) => row.title)
    : [];
  const items = rows.flatMap((row) => {
    const item = toProbeItem(row, transport);
    return item ? [item] : [];
  });
  if (transport.kind === "http" && rows.length > 0 && items.length === 0) {
    const detail = `No title on this list has an IMDb id, so nothing was written.${omittedNote(omitted)}`;
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail };
  }
  const bytes = Buffer.byteLength(JSON.stringify(items));
  if (bytes > MAX_BYTES) {
    const detail = `This list is ${bytes} bytes. The limit is ${MAX_BYTES}, so nothing was written.`;
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail };
  }

  const successStatus = transport.kind === "http" ? "verified" : "simulated";
  const hash = exportFingerprint({
    target: transport.target,
    profile: transport.profile,
    name: list.name,
    visibility: LOCAL_VISIBILITY,
    items,
  });
  const slug = stableSlug(list.id, list.myListsSlug);
  const wireItems: MyListsWireItem[] = items.map(({ imdbId, title, year, type }) => ({ imdbId, title, year, type }));
  const remote = await readRemote(transport, slug);
  const remoteMatches = transport.kind === "http"
    ? remote.ok && sameMyListPayload(remote, list.name, wireItems)
    : remote.ok && payloadMatches(remote, list.name, items);
  if (exportStillMatches({
    storedHash: list.contentHash,
    storedTarget: list.syncTarget,
    slug: list.myListsSlug,
    nextHash: hash,
    target: transport.target,
    remotePresent: remoteMatches,
  })) {
    if (list.syncStatus !== successStatus) {
      await db.update(customListsTable).set({ syncStatus: successStatus, syncError: null }).where(eq(customListsTable.id, list.id));
    }
    const detail = transport.kind === "http"
      ? `My Lists already has this list, and the read-back matches. This list is verified.${omittedNote(omitted)}`
      : "The local test simulator already has this list. This is not a verified sync to My Lists.";
    return { ok: true, status: successStatus, detail, slug, count: items.length };
  }
  if (!list.contentHash && remoteMatches && remote.updatedAt != null) {
    await db.update(customListsTable).set({
      myListsSlug: slug,
      contentHash: hash,
      externalVersion: String(remote.updatedAt),
      syncStatus: successStatus,
      syncTarget: transport.target,
      syncError: null,
      lastSyncedAt: new Date(),
    }).where(eq(customListsTable.id, list.id));
    const detail = transport.kind === "http"
      ? `My Lists already had this list, so the saved version was recorded. This list is verified.${omittedNote(omitted)}`
      : "The local test simulator already had this list, so the saved version was recorded again. This is not a verified sync to My Lists.";
    return { ok: true, status: successStatus, detail, slug, count: items.length };
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
  const version = expectedUpdatedAt !== undefined && Number.isFinite(expectedUpdatedAt) ? expectedUpdatedAt : undefined;
  const saved = transport.kind === "simulator"
    ? saveLocalMyList({ slug, name: list.name, items: wireItems, expectedUpdatedAt: version })
    : await saveMyListsHttp(transport, { slug, name: list.name, items: wireItems, expectedUpdatedAt: version });
  if (!saved.ok) {
    const status = saved.status === 409 ? "conflict" : "error";
    const detail = saved.status === 409 && transport.kind === "simulator"
      ? "The simulated list changed. Media Hub did not overwrite it."
      : saved.error;
    await db.update(listSyncQueueTable).set({ status }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
    await mark(list.id, status, detail);
    return { ok: false, status, detail, slug };
  }
  if (saved.slug !== slug) {
    const detail = "My Lists stored a different slug. Media Hub did not adopt it.";
    await db.update(listSyncQueueTable).set({ status: "error" }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail, slug };
  }

  const read = await readRemote(transport, slug);
  const sameOrder = transport.kind === "http"
    ? sameMyListPayload(read, list.name, wireItems)
    : payloadMatches(read, list.name, items);
  if (!read.ok || !sameOrder) {
    const detail = "The list was written, but reading it back did not match the identities, order, count, or name.";
    await db.update(listSyncQueueTable).set({ status: "error" }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
    await mark(list.id, "error", detail);
    return { ok: false, status: "error", detail, slug };
  }

  await db.update(customListsTable).set({
    myListsSlug: slug,
    contentHash: hash,
    externalVersion: String(saved.updatedAt),
    syncStatus: successStatus,
    syncTarget: transport.target,
    syncError: null,
    lastSyncedAt: new Date(),
  }).where(eq(customListsTable.id, list.id));
  await db.update(listSyncQueueTable).set({ status: "done" }).where(eq(listSyncQueueTable.idempotencyKey, idempotencyKey));
  const standIns = items.filter((item) => item.standIn).length;
  const detail = transport.kind === "http"
    ? `Wrote ${items.length} titles to My Lists as ${slug} and read them back. This list is verified.${omittedNote(omitted)}`
    : standIns > 0
      ? `Wrote ${items.length} titles to the local test simulator as ${slug}. ${standIns} still use a TMDB stand-in. This is not a verified sync to My Lists.`
      : `Wrote ${items.length} titles to the local test simulator as ${slug}. This is not a verified sync to My Lists.`;
  return { ok: true, status: successStatus, detail, slug, count: items.length, standIns };
}

async function mark(listId: number, status: string, detail: string) {
  await db.update(customListsTable).set({ syncStatus: status, syncError: detail }).where(eq(customListsTable.id, listId));
}

export async function setListExport(listId: number, action: "enable" | "pause" | "sync" | "delete-external"): Promise<ExportResult> {
  const [list] = await db.select().from(customListsTable).where(eq(customListsTable.id, listId));
  if (!list) return { ok: false, status: "error", detail: "That list is not in the catalog." };
  const transport = resolveMyListsTransport();
  if (action === "pause") {
    await db.update(customListsTable).set({ exportEnabled: false, syncStatus: "paused", syncError: null }).where(eq(customListsTable.id, listId));
    const detail = transport.kind === "http"
      ? "Export is paused. The Media Hub list and the My Lists copy are both still there."
      : "Export is paused. The Media Hub list and the simulated copy are both still there.";
    return { ok: true, status: "paused", detail };
  }
  if (action === "delete-external") {
    const slug = list.myListsSlug;
    if (transport.kind === "unconfigured") {
      return { ok: false, status: "error", detail: transport.reason };
    }
    if (transport.kind === "http") {
      if (list.syncTarget && list.syncTarget !== transport.target) {
        return { ok: false, status: "error", detail: "This list points at a different My Lists origin. Media Hub did not send the key there." };
      }
      if (slug) {
        const removed = await deleteMyListsHttp(transport, slug);
        if (!removed.ok) return { ok: false, status: "error", detail: removed.error };
      }
    } else if (slug) {
      deleteLocalMyList(slug);
    }
    await db.update(customListsTable).set({
      exportEnabled: false,
      syncStatus: "removed",
      syncError: null,
    }).where(eq(customListsTable.id, listId));
    const label = transport.kind === "http" ? "My Lists copy" : "simulated list";
    return { ok: true, status: "removed", detail: slug ? `Removed the ${label} ${slug}. The Media Hub list is unchanged.` : `There was no ${label} to remove.` };
  }
  if (transport.kind === "unconfigured") {
    return { ok: false, status: "error", detail: transport.reason };
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
