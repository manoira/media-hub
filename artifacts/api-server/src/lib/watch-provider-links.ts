type MonetizationType = "flatrate" | "free" | "ads" | "rent" | "buy";

interface ClickoutContext {
  provider?: string;
  providerId?: number;
  monetizationType?: string;
}

interface SnowplowContext {
  schema?: string;
  data?: ClickoutContext;
}

interface SnowplowPayload {
  data?: SnowplowContext[];
}

const cache = new Map<string, { expiresAt: number; links: Map<string, string> }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function buildTmdbProviderLink(countryLink: string | null | undefined, providerId: number): string | null {
  if (!countryLink) return null;
  const url = new URL(countryLink);
  url.searchParams.set("provider", String(providerId));
  return url.toString();
}

function normalizeProviderName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseClickoutLink(href: string): { providerId: number; providerName: string; monetizationType: string; destination: string } | null {
  const normalized = href.replace(/&amp;/g, "&");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  const cx = url.searchParams.get("cx");
  const destination = url.searchParams.get("r");
  if (!cx || !destination) return null;

  try {
    const payload = JSON.parse(Buffer.from(cx, "base64").toString("utf8")) as SnowplowPayload;
    const clickout = payload.data?.find(item => item.schema?.includes("clickout_context"))?.data;
    if (!clickout?.providerId || !clickout.monetizationType || !clickout.provider) return null;
    return {
      providerId: clickout.providerId,
      providerName: clickout.provider,
      monetizationType: clickout.monetizationType,
      destination,
    };
  } catch {
    return null;
  }
}

function extractProviderLinks(html: string): Map<string, string> {
  const links = new Map<string, string>();
  const regex = /href="(https:\/\/click\.justwatch\.com\/a\?[^"]+)"/g;

  for (const match of html.matchAll(regex)) {
    const parsed = parseClickoutLink(match[1]);
    if (!parsed) continue;

    const specificKey = `${parsed.providerId}:${parsed.monetizationType}`;
    if (!links.has(specificKey)) {
      links.set(specificKey, parsed.destination);
    }

    const genericKey = String(parsed.providerId);
    if (!links.has(genericKey)) {
      links.set(genericKey, parsed.destination);
    }

    const nameKey = `name:${normalizeProviderName(parsed.providerName)}:${parsed.monetizationType}`;
    if (!links.has(nameKey)) {
      links.set(nameKey, parsed.destination);
    }

    const genericNameKey = `name:${normalizeProviderName(parsed.providerName)}`;
    if (!links.has(genericNameKey)) {
      links.set(genericNameKey, parsed.destination);
    }
  }

  return links;
}

function resolveLinkForProvider(
  linkMap: Map<string, string>,
  providerId: number,
  providerName: string,
  category: MonetizationType,
  countryLink: string | null | undefined,
): string | null {
  const normalizedName = normalizeProviderName(providerName);
  return (
    linkMap.get(`${providerId}:${category}`)
    ?? linkMap.get(`name:${normalizedName}:${category}`)
    ?? linkMap.get(String(providerId))
    ?? linkMap.get(`name:${normalizedName}`)
    ?? buildTmdbProviderLink(countryLink, providerId)
  );
}

export async function resolveWatchProviderLinks(
  watchPageUrl: string | null | undefined,
): Promise<Map<string, string>> {
  if (!watchPageUrl) return new Map();

  const cached = cache.get(watchPageUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.links;
  }

  try {
    const res = await fetch(watchPageUrl, {
      headers: {
        "User-Agent": "Media-Hub/1.0 (+https://github.com/manoira/media-hub)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return new Map();

    const html = await res.text();
    const links = extractProviderLinks(html);
    cache.set(watchPageUrl, { links, expiresAt: Date.now() + CACHE_TTL_MS });
    return links;
  } catch {
    return new Map();
  }
}

export function getProviderLink(
  linkMap: Map<string, string>,
  providerId: number,
  providerName: string,
  category: MonetizationType,
  countryLink: string | null | undefined,
): string | null {
  return resolveLinkForProvider(linkMap, providerId, providerName, category, countryLink);
}
