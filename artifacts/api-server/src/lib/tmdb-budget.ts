import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "@workspace/db";
import { planCacheEvictions } from "./cache-eviction";

export const MANUAL_TMDB_DAILY_LIMIT = 40;

const budgetStore = new AsyncLocalStorage<true>();

export class TmdbBudgetError extends Error {
  readonly budget = true;

  constructor() {
    super("TMDB daily budget reached");
    this.name = "TmdbBudgetError";
  }
}

export function isTmdbBudgetError(error: unknown): boolean {
  return error instanceof TmdbBudgetError || Boolean(error && typeof error === "object" && "budget" in error && (error as { budget?: boolean }).budget);
}

export function withManualTmdbBudget<T>(run: () => Promise<T>): Promise<T> {
  return budgetStore.run(true, run);
}

export function manualBudgetActive(): boolean {
  return budgetStore.getStore() === true;
}

export function manualBudgetSurface(now = new Date()): string {
  return `manual:${now.toISOString().slice(0, 10)}`;
}

export async function takeBudget(surface: string, limit: number): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO tmdb_meter (surface, hits, misses, stale, errors, external, duration_ms)
     VALUES ($1, 0, 0, 0, 0, 1, 0)
     ON CONFLICT (surface) DO UPDATE
       SET external = tmdb_meter.external + 1
     WHERE tmdb_meter.external < $2
     RETURNING external`,
    [surface, limit],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function takeManualTmdbBudget(): Promise<boolean> {
  return takeBudget(manualBudgetSurface(), MANUAL_TMDB_DAILY_LIMIT);
}

/** Counts one HTTP attempt. Search and detail pages do not enter this context. */
export async function chargeManualHttpAttempt(): Promise<void> {
  if (!manualBudgetActive()) return;
  const allowed = await takeManualTmdbBudget();
  if (!allowed) throw new TmdbBudgetError();
}

export async function remainingManualTmdbBudget(now = new Date()): Promise<number> {
  const found = await pool.query<{ external: number }>(
    "SELECT external FROM tmdb_meter WHERE surface = $1",
    [manualBudgetSurface(now)],
  );
  const used = found.rows[0]?.external ?? 0;
  return Math.max(0, MANUAL_TMDB_DAILY_LIMIT - used);
}

export async function pruneTmdbCache(): Promise<void> {
  const found = await pool.query<{
    cache_key: string;
    bytes: number;
    fetched_at: Date;
    stale_until: Date;
  }>(
    `SELECT cache_key, pg_column_size(payload)::int AS bytes, fetched_at, stale_until
     FROM tmdb_cache`,
  );
  const drop = planCacheEvictions(
    found.rows.map((row) => ({
      key: row.cache_key,
      bytes: row.bytes,
      fetchedAt: row.fetched_at.getTime(),
      staleUntil: row.stale_until.getTime(),
    })),
    Date.now(),
  );
  if (drop.length === 0) return;
  await pool.query("DELETE FROM tmdb_cache WHERE cache_key = ANY($1::text[])", [drop]);
}
