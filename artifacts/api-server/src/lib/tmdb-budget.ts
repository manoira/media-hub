import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "@workspace/db";

export const MANUAL_TMDB_DAILY_LIMIT = 40;
const CACHE_ROW_LIMIT = 400;

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

export async function remainingManualTmdbBudget(now = new Date()): Promise<number> {
  const found = await pool.query<{ external: number }>(
    "SELECT external FROM tmdb_meter WHERE surface = $1",
    [manualBudgetSurface(now)],
  );
  const used = found.rows[0]?.external ?? 0;
  return Math.max(0, MANUAL_TMDB_DAILY_LIMIT - used);
}

export async function pruneTmdbCache(): Promise<void> {
  await pool.query("DELETE FROM tmdb_cache WHERE stale_until < now()");
  await pool.query(
    `DELETE FROM tmdb_cache
     WHERE cache_key IN (
       SELECT cache_key FROM tmdb_cache ORDER BY fetched_at DESC OFFSET $1
     )`,
    [CACHE_ROW_LIMIT],
  );
}
