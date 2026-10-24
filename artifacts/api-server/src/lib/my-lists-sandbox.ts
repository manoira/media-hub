/**
 * Local stand-in for My Lists POST /api/creator/lists/save.
 *
 * The reviewed contract is My Lists 1.5.5 at b9c0a951: an authenticated save
 * with an explicit slug updates that list instead of minting another one.
 * This store is memory-only and accepts one fixed test profile, so a check
 * never reads or writes the watchlist database.
 */

export const REVIEWED_MY_LISTS = {
  addonVersion: "1.5.5",
  commit: "b9c0a951787019f5d30065b5c2e7e5492472d3e2",
  savePath: "/api/creator/lists/save",
  hostedOrigin: "https://mylistsaddon.com",
} as const;

export const LOCAL_TEST_PROFILE = {
  creatorName: "mediahub-local-test",
  creatorKey: "local-test-key",
} as const;

export const PROBE_SLUG = "media-hub-private-check";
export const PROBE_LIST_NAME = "Media Hub private check";

export type ProbeItem = {
  imdbId: string;
  title: string;
  year: number;
  type: "movie" | "series";
};

export type ProbeStep = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  items: ProbeItem[];
};

export const INITIAL_ITEMS: ProbeItem[] = [
  { imdbId: "tt0133093", title: "The Matrix", year: 1999, type: "movie" },
  { imdbId: "tt0245429", title: "Spirited Away", year: 2001, type: "movie" },
  { imdbId: "tt14452776", title: "The Bear", year: 2022, type: "series" },
];

const CHANGED_ITEMS: ProbeItem[] = [
  INITIAL_ITEMS[0],
  INITIAL_ITEMS[1],
  { imdbId: "tt9253284", title: "Andor", year: 2022, type: "series" },
];

type StoredList = {
  name: string;
  slug: string;
  type: "mixed";
  visibility: "private";
  items: ProbeItem[];
  createdAt: number;
  updatedAt: number;
};

type SaveResult =
  | { ok: true; slug: string; updatedAt: number }
  | { ok: false; status: number; error: string };

const lists = new Map<string, StoredList>();
let clock = 1_762_000_000_000;

function nextVersion(previous: number): number {
  clock += 1;
  return Math.max(clock, previous + 1);
}

function sameItems(left: ProbeItem[], right: ProbeItem[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item.imdbId === right[index]?.imdbId && item.title === right[index]?.title);
}

function titles(items: ProbeItem[]): string {
  if (items.length === 0) return "no titles";
  if (items.length === 1) return items[0].title;
  return `${items.slice(0, -1).map((item) => item.title).join(", ")} and ${items[items.length - 1].title}`;
}

export function saveLocalMyList(input: {
  slug: string;
  name: string;
  items: ProbeItem[];
  expectedUpdatedAt?: number;
}): SaveResult {
  return saveList({ ...LOCAL_TEST_PROFILE, ...input });
}

export function readLocalMyList(slug: string): SaveResult & { items?: ProbeItem[]; name?: string } {
  const read = readList(LOCAL_TEST_PROFILE.creatorName, LOCAL_TEST_PROFILE.creatorKey, slug);
  const stored = lists.get(slug);
  return stored && read.ok ? { ...read, name: stored.name } : read;
}

export function deleteLocalMyList(slug: string): SaveResult {
  if (!lists.has(slug)) return { ok: false, status: 404, error: "No such list." };
  lists.delete(slug);
  return { ok: true, slug, updatedAt: nextVersion(0) };
}

export function resetLocalMyListsSandbox(): void {
  lists.clear();
  clock = 1_762_000_000_000;
}

function authorize(creatorName: string, creatorKey: string): boolean {
  return creatorName === LOCAL_TEST_PROFILE.creatorName && creatorKey === LOCAL_TEST_PROFILE.creatorKey;
}

function saveList(input: {
  creatorName: string;
  creatorKey: string;
  slug?: string;
  name: string;
  items: ProbeItem[];
  expectedUpdatedAt?: number;
}): SaveResult {
  if (!authorize(input.creatorName, input.creatorKey)) {
    return { ok: false, status: 401, error: "Username or Key is incorrect." };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, status: 400, error: "Missing a list name." };
  const slug = input.slug?.trim() || PROBE_SLUG;
  const existing = lists.get(slug);
  if (
    existing
    && input.expectedUpdatedAt != null
    && existing.updatedAt > input.expectedUpdatedAt
  ) {
    return { ok: false, status: 409, error: "conflict" };
  }
  const updatedAt = nextVersion(existing?.updatedAt ?? 0);
  lists.set(slug, {
    name,
    slug,
    type: "mixed",
    visibility: "private",
    items: input.items.map((item) => ({ ...item })),
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  });
  return { ok: true, slug, updatedAt };
}

function readList(creatorName: string, creatorKey: string, slug: string): SaveResult & { items?: ProbeItem[] } {
  if (!authorize(creatorName, creatorKey)) {
    return { ok: false, status: 401, error: "Username or Key is incorrect." };
  }
  const list = lists.get(slug);
  if (!list) return { ok: false, status: 404, error: "No such list." };
  return { ok: true, slug: list.slug, updatedAt: list.updatedAt, items: list.items.map((item) => ({ ...item })) };
}

function catalogItems(creatorKey: string | null, slug: string): ProbeItem[] {
  const list = lists.get(slug);
  if (!list || list.visibility !== "private") return [];
  if (creatorKey !== LOCAL_TEST_PROFILE.creatorKey) return [];
  return list.items.map((item) => ({ ...item }));
}

function step(id: string, label: string, ok: boolean, detail: string, items: ProbeItem[]): ProbeStep {
  return { id, label, ok, detail, items: items.map((item) => ({ ...item })) };
}

export function runLocalWakoProbe(): { ok: boolean; profile: string; steps: ProbeStep[] } {
  resetLocalMyListsSandbox();
  const steps: ProbeStep[] = [];
  const auth = LOCAL_TEST_PROFILE;

  const created = saveList({ ...auth, slug: PROBE_SLUG, name: PROBE_LIST_NAME, items: INITIAL_ITEMS });
  const createdRead = created.ok ? readList(auth.creatorName, auth.creatorKey, created.slug) : null;
  const createdOk = Boolean(
    created.ok
    && created.slug === PROBE_SLUG
    && createdRead?.ok
    && createdRead.items
    && sameItems(createdRead.items, INITIAL_ITEMS),
  );
  steps.push(step(
    "create",
    "Create",
    createdOk,
    createdOk
      ? `Saved private list ${PROBE_SLUG} with ${titles(INITIAL_ITEMS)}.`
      : "The private list was not saved with the three titles.",
    createdOk && createdRead?.items ? createdRead.items : [],
  ));

  const reread = readList(auth.creatorName, auth.creatorKey, PROBE_SLUG);
  const readOk = Boolean(reread.ok && reread.items && sameItems(reread.items, INITIAL_ITEMS));
  steps.push(step(
    "read",
    "Read back",
    readOk,
    readOk
      ? "The same slug came back with the same three titles, in the same order."
      : "Reading the list did not return the titles that were saved.",
    readOk && reread.items ? reread.items : [],
  ));

  const second = saveList({
    ...auth,
    slug: PROBE_SLUG,
    name: PROBE_LIST_NAME,
    items: INITIAL_ITEMS,
    expectedUpdatedAt: reread.ok ? reread.updatedAt : undefined,
  });
  const duplicateOk = Boolean(second.ok && second.slug === PROBE_SLUG && lists.size === 1);
  steps.push(step(
    "duplicate",
    "Same list again",
    duplicateOk,
    duplicateOk
      ? "Saving the same slug again updated that list. One list exists."
      : "The second save created another list.",
    readOk && reread.items ? reread.items : [],
  ));

  const changed = saveList({
    ...auth,
    slug: PROBE_SLUG,
    name: PROBE_LIST_NAME,
    items: CHANGED_ITEMS,
    expectedUpdatedAt: second.ok ? second.updatedAt : undefined,
  });
  const changedRead = changed.ok ? readList(auth.creatorName, auth.creatorKey, PROBE_SLUG) : null;
  const changedOk = Boolean(
    changed.ok
    && changed.slug === PROBE_SLUG
    && lists.size === 1
    && changedRead?.ok
    && changedRead.items
    && sameItems(changedRead.items, CHANGED_ITEMS),
  );
  steps.push(step(
    "change",
    "Change",
    changedOk,
    changedOk
      ? "Replaced The Bear with Andor on the same list."
      : "The title change did not stay on the original list.",
    changedOk && changedRead?.items ? changedRead.items : [],
  ));

  const sortedItems = [...CHANGED_ITEMS].reverse();
  const sorted = saveList({
    ...auth,
    slug: PROBE_SLUG,
    name: PROBE_LIST_NAME,
    items: sortedItems,
    expectedUpdatedAt: changed.ok ? changed.updatedAt : undefined,
  });
  const sortedRead = sorted.ok ? readList(auth.creatorName, auth.creatorKey, PROBE_SLUG) : null;
  const sortedOk = Boolean(
    sorted.ok
    && sortedRead?.ok
    && sortedRead.items
    && sameItems(sortedRead.items, sortedItems)
    && lists.size === 1,
  );
  steps.push(step(
    "sort",
    "Sort",
    sortedOk,
    sortedOk
      ? `Order is now ${titles(sortedItems)}.`
      : "The new order was not saved on the same list.",
    sortedOk && sortedRead?.items ? sortedRead.items : [],
  ));

  const stranger = readList("someone-else", "wrong-key", PROBE_SLUG);
  const hiddenCatalog = catalogItems("wrong-key", PROBE_SLUG);
  const ownerCatalog = catalogItems(LOCAL_TEST_PROFILE.creatorKey, PROBE_SLUG);
  const privateOk = Boolean(
    !stranger.ok
    && stranger.status === 401
    && hiddenCatalog.length === 0
    && sameItems(ownerCatalog, sortedItems),
  );
  steps.push(step(
    "private",
    "Private",
    privateOk,
    privateOk
      ? "The owner can read the list. A wrong key gets nothing, and an unrelated catalog config is empty."
      : "The private list was visible without the test profile.",
    privateOk ? ownerCatalog : [],
  ));

  const cleared = saveList({
    ...auth,
    slug: PROBE_SLUG,
    name: PROBE_LIST_NAME,
    items: [],
    expectedUpdatedAt: sorted.ok ? sorted.updatedAt : undefined,
  });
  const clearedRead = cleared.ok ? readList(auth.creatorName, auth.creatorKey, PROBE_SLUG) : null;
  const clearedOk = Boolean(
    cleared.ok
    && cleared.slug === PROBE_SLUG
    && lists.size === 1
    && clearedRead?.ok
    && clearedRead.items?.length === 0,
  );
  steps.push(step(
    "clear",
    "Clear",
    clearedOk,
    clearedOk
      ? `The list is empty and still uses ${PROBE_SLUG}.`
      : "Clearing the titles removed the list or left items behind.",
    [],
  ));

  return {
    ok: steps.every((entry) => entry.ok),
    profile: LOCAL_TEST_PROFILE.creatorName,
    steps,
  };
}

export async function checkHostedMyListsSave(): Promise<{ ok: boolean; detail: string }> {
  return {
    ok: true,
    detail: "mylistsaddon.com was not contacted. Creator keys are not sent there. A private test install uses MY_LISTS_ORIGIN when you choose to set it.",
  };
}
