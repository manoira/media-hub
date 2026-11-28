import {
  MY_LISTS_CONTRACT,
  myListsRetryDelayMs,
  myListsTimeoutMs,
  type MyListsTransport,
} from "./my-lists-config";

export type MyListsWireItem = {
  imdbId: string;
  title: string;
  year: number;
  type: "movie" | "series";
};

export type MyListsRemote = {
  ok: true;
  slug: string;
  name: string;
  items: MyListsWireItem[];
  updatedAt: number;
  visibility: string;
  type: string;
};

type HttpTransport = Extract<MyListsTransport, { kind: "http" }>;

type SaveOutcome =
  | { ok: true; slug: string; updatedAt: number }
  | { ok: false; status: number | "timeout" | "redirect"; error: string };

const WRITE_ATTEMPTS = 2;
const RATE_LIMIT_ATTEMPTS = 3;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scrub(message: string, secret: string): string {
  const cleaned = secret ? message.split(secret).join("[redacted]") : message;
  return cleaned.slice(0, 240);
}

function listType(items: MyListsWireItem[]): "movie" | "series" | "mixed" {
  const kinds = new Set(items.map((item) => item.type));
  if (kinds.size === 1 && items[0]) return items[0].type;
  return "mixed";
}

export function sameMyListPayload(
  remote: { name?: string; items?: MyListsWireItem[]; visibility?: string },
  name: string,
  items: MyListsWireItem[],
): boolean {
  return Boolean(
    remote.name === name
    && remote.visibility === "private"
    && remote.items
    && remote.items.length === items.length
    && remote.items.every((item, index) => {
      const expected = items[index];
      return item.imdbId === expected?.imdbId && item.title === expected?.title && item.type === expected?.type;
    }),
  );
}

export function myListsRequestUrl(origin: string, path: string): URL {
  const url = new URL(path, `${origin}/`);
  if (url.origin !== origin) {
    throw new Error("Refused to send the creator key to a different origin.");
  }
  const host = url.hostname.toLowerCase();
  if (host === "mylistsaddon.com" || host.endsWith(".mylistsaddon.com")) {
    throw new Error("Refused to send the creator key to mylistsaddon.com.");
  }
  return url;
}

async function postJson(
  transport: HttpTransport,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; redirected: boolean; json: Record<string, unknown> | null }> {
  const url = myListsRequestUrl(transport.origin, path);
  const response = await fetch(url, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(myListsTimeoutMs()),
  });
  if (response.status === 0 || (response.status >= 300 && response.status < 400)) {
    return { status: response.status || 302, redirected: true, json: null };
  }
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { status: response.status, redirected: false, json };
}

function authBody(transport: HttpTransport): { creatorName: string; creatorKey: string } {
  return { creatorName: transport.creatorName, creatorKey: transport.creatorKey };
}

export async function readMyListsHttp(transport: HttpTransport, slug: string): Promise<MyListsRemote | { ok: false; status: number; error: string }> {
  const listed = await postJson(transport, MY_LISTS_CONTRACT.listsPath, { ...authBody(transport), limit: 100, offset: 0 });
  if (listed.redirected) return { ok: false, status: 302, error: "My Lists redirected the request. The creator key was not sent to the new address." };
  if (listed.status === 401 || listed.status === 403) {
    return { ok: false, status: listed.status, error: "My Lists refused the creator name or key." };
  }
  if (listed.status === 429) return { ok: false, status: 429, error: "My Lists asked Media Hub to wait." };
  const lists = Array.isArray(listed.json?.lists) ? listed.json.lists as Array<Record<string, unknown>> : [];
  const summary = lists.find((list) => list.slug === slug);
  const itemsResponse = await postJson(transport, MY_LISTS_CONTRACT.itemsPath, { ...authBody(transport), slugs: [slug] });
  if (itemsResponse.redirected) {
    return { ok: false, status: 302, error: "My Lists redirected the request. The creator key was not sent to the new address." };
  }
  if (itemsResponse.status === 401 || itemsResponse.status === 403) {
    return { ok: false, status: itemsResponse.status, error: "My Lists refused the creator name or key." };
  }
  const rows = Array.isArray(itemsResponse.json?.lists) ? itemsResponse.json.lists as Array<Record<string, unknown>> : [];
  const row = rows.find((item) => item.slug === slug);
  if (!summary || !row || !Array.isArray(row.items)) return { ok: false, status: 404, error: "That slug is not on this My Lists install." };
  return {
    ok: true,
    slug,
    name: String(summary.name ?? ""),
    items: row.items as MyListsWireItem[],
    updatedAt: Number(row.updatedAt ?? summary.updatedAt ?? 0),
    visibility: String(summary.visibility ?? ""),
    type: String(summary.type ?? ""),
  };
}

export async function deleteMyListsHttp(transport: HttpTransport, slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await postJson(transport, MY_LISTS_CONTRACT.deletePath, { ...authBody(transport), slug });
  if (response.redirected) return { ok: false, error: "My Lists redirected the request. The creator key was not sent to the new address." };
  if (response.status === 401 || response.status === 403) return { ok: false, error: "My Lists refused the creator name or key." };
  if (response.json?.ok === true) return { ok: true };
  return { ok: false, error: "My Lists did not delete that list." };
}

export async function saveMyListsHttp(
  transport: HttpTransport,
  input: { slug: string; name: string; items: MyListsWireItem[]; expectedUpdatedAt?: number },
): Promise<SaveOutcome> {
  const body: Record<string, unknown> = {
    ...authBody(transport),
    slug: input.slug,
    name: input.name,
    type: listType(input.items),
    items: input.items,
    visibility: "private",
  };
  if (input.expectedUpdatedAt != null && Number.isFinite(input.expectedUpdatedAt)) {
    body.expectedUpdatedAt = input.expectedUpdatedAt;
  }
  let rateLimits = 0;
  for (let attempt = 1; attempt <= WRITE_ATTEMPTS; attempt += 1) {
    try {
      const response = await postJson(transport, MY_LISTS_CONTRACT.savePath, body);
      if (response.redirected) {
        return { ok: false, status: "redirect", error: "My Lists redirected the request. The creator key was not sent to the new address." };
      }
      if (response.status === 429) {
        rateLimits += 1;
        if (rateLimits < RATE_LIMIT_ATTEMPTS) {
          attempt -= 1;
          await wait(myListsRetryDelayMs());
          continue;
        }
        return { ok: false, status: 429, error: "My Lists asked Media Hub to wait. The limited retries were used up, so nothing new was written." };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, status: response.status, error: "My Lists refused the creator name or key. Nothing was written." };
      }
      if (response.status === 409) {
        if (attempt > 1) {
          const read = await readMyListsHttp(transport, input.slug).catch(() => null);
          if (read?.ok && sameMyListPayload(read, input.name, input.items)) {
            return { ok: true, slug: input.slug, updatedAt: read.updatedAt };
          }
        }
        return { ok: false, status: 409, error: "My Lists has a newer version of this list. Media Hub did not overwrite it." };
      }
      if (response.json?.ok === true && typeof response.json.slug === "string") {
        return { ok: true, slug: response.json.slug, updatedAt: Number(response.json.updatedAt) };
      }
      const error = typeof response.json?.error === "string" ? response.json.error : "My Lists did not accept the list.";
      return { ok: false, status: response.status, error: scrub(error, transport.creatorKey) };
    } catch (error) {
      const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      if (!aborted) {
        return { ok: false, status: "timeout", error: "The My Lists request failed before a response arrived. Media Hub did not write again." };
      }
      const read = await readMyListsHttp(transport, input.slug).catch(() => null);
      if (read?.ok && sameMyListPayload(read, input.name, input.items)) {
        return { ok: true, slug: input.slug, updatedAt: read.updatedAt };
      }
      if (attempt >= WRITE_ATTEMPTS) {
        return { ok: false, status: "timeout", error: "The request timed out after it may have been saved. Media Hub did not write again." };
      }
    }
  }
  return { ok: false, status: "timeout", error: "The request timed out after it may have been saved. Media Hub did not write again." };
}
