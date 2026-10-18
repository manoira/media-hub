import { createHash } from "node:crypto";
import { pool } from "@workspace/db";

const WINDOW_MINUTES = 15;
const FAILURE_LIMIT = 8;

export function loginSubjectHash(ip: string): string {
  return createHash("sha256").update(`login:${ip}`).digest("hex");
}

export async function tooManyLoginAttempts(ip: string): Promise<boolean> {
  const found = await pool.query<{ failure_count: number }>(
    `SELECT failure_count
     FROM login_failures
     WHERE subject_hash = $1 AND reset_at > now() AND failure_count >= $2`,
    [loginSubjectHash(ip), FAILURE_LIMIT],
  );
  return found.rows.length > 0;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  await pool.query(
    `INSERT INTO login_failures (subject_hash, failure_count, reset_at)
     VALUES ($1, 1, now() + make_interval(mins => $2))
     ON CONFLICT (subject_hash) DO UPDATE SET
       failure_count = CASE
         WHEN login_failures.reset_at <= now() THEN 1
         ELSE login_failures.failure_count + 1
       END,
       reset_at = CASE
         WHEN login_failures.reset_at <= now() THEN now() + make_interval(mins => $2)
         ELSE login_failures.reset_at
       END`,
    [loginSubjectHash(ip), WINDOW_MINUTES],
  );
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await pool.query("DELETE FROM login_failures WHERE subject_hash = $1", [loginSubjectHash(ip)]);
}
