import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";

export const EXPORT_ATTEMPT_LIMIT = 3;
const DEFAULT_LEASE_SECONDS = 120;

export type ExportClaim = "claimed" | "busy" | "exhausted";

function safeDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : "The local test export failed.";
  if (/api_key|https?:|secret|token|password/i.test(message)) return "The local test export failed.";
  return message.slice(0, 200);
}

export async function claimExport(listId: number, owner: string, leaseSeconds = DEFAULT_LEASE_SECONDS): Promise<ExportClaim> {
  const claimed = await pool.query<{ owner: string }>(
    `INSERT INTO list_export_locks (list_id, owner, status, attempt_count, expires_at, updated_at)
     VALUES ($1, $2, 'running', 1, now() + make_interval(secs => $3), now())
     ON CONFLICT (list_id) DO UPDATE SET
       owner = EXCLUDED.owner,
       status = 'running',
       expires_at = EXCLUDED.expires_at,
       updated_at = now(),
       attempt_count = CASE
         WHEN list_export_locks.status = 'done' THEN 1
         WHEN list_export_locks.status = 'pending' THEN list_export_locks.attempt_count + 1
         ELSE list_export_locks.attempt_count + 1
       END
     WHERE list_export_locks.expires_at <= now()
       AND list_export_locks.status <> 'error'
       AND (
         list_export_locks.status = 'done'
         OR list_export_locks.attempt_count < $4
       )
     RETURNING owner`,
    [listId, owner, leaseSeconds, EXPORT_ATTEMPT_LIMIT],
  );
  if (claimed.rows[0]?.owner === owner) return "claimed";
  const current = await pool.query<{ status: string; attempt_count: number; held: boolean }>(
    `SELECT status, attempt_count, expires_at > now() AS held
     FROM list_export_locks WHERE list_id = $1`,
    [listId],
  );
  const row = current.rows[0];
  if (!row) return "busy";
  if (row.status === "error" || (row.status === "running" && !row.held && row.attempt_count >= EXPORT_ATTEMPT_LIMIT)) {
    return "exhausted";
  }
  return "busy";
}

export async function finishExport(listId: number, owner: string): Promise<void> {
  await pool.query(
    `UPDATE list_export_locks
     SET status = 'done', owner = NULL, attempt_count = 0, expires_at = now(), last_error = NULL, updated_at = now()
     WHERE list_id = $1 AND owner = $2`,
    [listId, owner],
  );
}

export async function failExport(listId: number, owner: string, error: unknown): Promise<void> {
  await pool.query(
    `UPDATE list_export_locks
     SET status = CASE WHEN attempt_count >= $3 THEN 'error' ELSE 'pending' END,
         owner = NULL,
         expires_at = now(),
         last_error = $4,
         updated_at = now()
     WHERE list_id = $1 AND owner = $2`,
    [listId, owner, EXPORT_ATTEMPT_LIMIT, safeDetail(error)],
  );
}

export async function runExclusiveListJob<T extends { ok: boolean; status: string; detail: string }>(
  listId: number,
  work: () => Promise<T>,
): Promise<T> {
  const owner = randomBytes(16).toString("hex");
  const deadline = Date.now() + 8000;
  let claim: ExportClaim = "busy";
  while (Date.now() < deadline) {
    claim = await claimExport(listId, owner);
    if (claim !== "busy") break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (claim === "exhausted") {
    return {
      ok: false,
      status: "error",
      detail: "This local test stopped after repeated interruptions. This is not a verified sync to My Lists.",
    } as T;
  }
  if (claim === "busy") {
    return {
      ok: false,
      status: "error",
      detail: "Another instance is updating this local test. This is not a verified sync to My Lists.",
    } as T;
  }
  try {
    const result = await work();
    if (!result.ok && result.status === "error") await failExport(listId, owner, result.detail);
    else await finishExport(listId, owner);
    return result;
  } catch (error) {
    await failExport(listId, owner, error);
    throw error;
  }
}
