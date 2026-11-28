export const PRIVATE_REVALIDATE = "private, no-cache";
export const PRIVATE_NO_STORE = "private, no-store";

export function catalogEtag(count: number, latest: Date | null, sort: string): string {
  const stamp = latest ? latest.toISOString() : "none";
  return `W/"catalog-${count}-${stamp}-${sort}"`;
}

type HeaderSource = { headers: Record<string, string | string[] | undefined> };
type HeaderSink = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => void;
  end: () => void;
};

function headerMatches(header: string | string[] | undefined, etag: string): boolean {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  return values.some((value) => value.split(",").some((part) => part.trim() === etag));
}

/** Private revalidation. Returns true when the body must not be sent. */
export function notModified(req: HeaderSource, res: HeaderSink, etag: string): boolean {
  res.setHeader("Cache-Control", PRIVATE_REVALIDATE);
  res.setHeader("ETag", etag);
  if (!headerMatches(req.headers["if-none-match"], etag)) return false;
  res.status(304);
  res.end();
  return true;
}
