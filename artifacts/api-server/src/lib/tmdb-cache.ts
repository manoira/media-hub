import { AsyncLocalStorage } from "node:async_hooks";
import { db, pool, tmdbCacheTable, tmdbMeterTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isTmdbBudgetError, pruneTmdbCache } from "./tmdb-budget";

const surfaceStore = new AsyncLocalStorage<string>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function withTmdbSurface<T>(surface: string, run: () => Promise<T>): Promise<T> {
  return surfaceStore.run(surface, run);
}

function ttlMs(): number {
  const parsed = Number(process.env.TMDB_CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

function staleMs(): number {
  const parsed = Number(process.env.TMDB_CACHE_STALE_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STALE_MS;
}

export function tmdbCacheKey(path: string, params: Record<string, string>): string {
  const entries = Object.entries(params)
    .filter(([key]) => key !== "api_key")
    .sort(([left], [right]) => left.localeCompare(right));
  return `${path}?${entries.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

function surfaceFor(path: string): string {
  const current = surfaceStore.getStore();
  if (current) return current;
  if (path.startsWith("/discover") || path.startsWith("/trending") || path.startsWith("/search")) return "discover";
  if (/^\/(movie|tv)\/\d+$/.test(path) || path.includes("/credits") || path.includes("/videos") || path.includes("/similar")) {
    return "detail";
  }
  return "other";
}

type MeterPatch = {
  hits?: number;
  misses?: number;
  stale?: number;
  errors?: number;
  external?: number;
  durationMs?: number;
};

async function meter(surface: string, patch: MeterPatch): Promise<void> {
  await pool.query(
    `INSERT INTO tmdb_meter (surface, hits, misses, stale, errors, external, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (surface) DO UPDATE SET
       hits = tmdb_meter.hits + EXCLUDED.hits,
       misses = tmdb_meter.misses + EXCLUDED.misses,
       stale = tmdb_meter.stale + EXCLUDED.stale,
       errors = tmdb_meter.errors + EXCLUDED.errors,
       external = tmdb_meter.external + EXCLUDED.external,
       duration_ms = tmdb_meter.duration_ms + EXCLUDED.duration_ms`,
    [
      surface,
      patch.hits ?? 0,
      patch.misses ?? 0,
      patch.stale ?? 0,
      patch.errors ?? 0,
      patch.external ?? 0,
      patch.durationMs ?? 0,
    ],
  );
}

export async function recordLocalRead(surface: string, durationMs: number): Promise<void> {
  await meter(surface, { durationMs });
}

async function readCache(key: string): Promise<{ payload: unknown; fresh: boolean; stale: boolean } | null> {
  const [row] = await db.select().from(tmdbCacheTable).where(eq(tmdbCacheTable.cacheKey, key));
  if (!row) return null;
  const now = Date.now();
  return {
    payload: row.payload,
    fresh: row.expiresAt.getTime() > now,
    stale: row.staleUntil.getTime() > now,
  };
}

async function writeCache(key: string, payload: unknown): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs());
  const staleUntil = new Date(now.getTime() + staleMs());
  await db.insert(tmdbCacheTable).values({
    cacheKey: key,
    payload,
    fetchedAt: now,
    expiresAt,
    staleUntil,
  }).onConflictDoUpdate({
    target: tmdbCacheTable.cacheKey,
    set: { payload, fetchedAt: now, expiresAt, staleUntil },
  });
  await pruneTmdbCache().catch(() => undefined);
}

export async function cachedTmdb<T>(path: string, params: Record<string, string>, load: () => Promise<T>): Promise<T> {
  const key = tmdbCacheKey(path, params);
  const surface = surfaceFor(path);
  const cached = await readCache(key).catch(() => null);
  if (cached?.fresh) {
    await meter(surface, { hits: 1 }).catch(() => undefined);
    return cached.payload as T;
  }

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    const started = Date.now();
    try {
      const payload = await load();
      await writeCache(key, payload).catch(() => undefined);
      await meter(surface, { misses: 1, external: 1, durationMs: Date.now() - started }).catch(() => undefined);
      return payload;
    } catch (err) {
      if (isTmdbBudgetError(err)) throw err;
      if (cached?.stale) {
        await meter(surface, { stale: 1, errors: 1, durationMs: Date.now() - started }).catch(() => undefined);
        return cached.payload as T;
      }
      await meter(surface, { errors: 1, durationMs: Date.now() - started }).catch(() => undefined);
      throw err;
    }
  })().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

export async function readTmdbUsage(): Promise<{
  ttlMs: number;
  staleMs: number;
  cachedResponses: number;
  surfaces: Array<{
    surface: string;
    hits: number;
    misses: number;
    stale: number;
    errors: number;
    external: number;
    durationMs: number;
  }>;
}> {
  const surfaces = await db.select().from(tmdbMeterTable);
  const cached = await db.select({ key: tmdbCacheTable.cacheKey }).from(tmdbCacheTable);
  return {
    ttlMs: ttlMs(),
    staleMs: staleMs(),
    cachedResponses: cached.length,
    surfaces: surfaces.map((row) => ({
      surface: row.surface,
      hits: row.hits,
      misses: row.misses,
      stale: row.stale,
      errors: row.errors,
      external: row.external,
      durationMs: row.durationMs,
    })),
  };
}
