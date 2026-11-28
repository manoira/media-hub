type SqlClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type LockRow = {
  listId: number;
  owner: string | null;
  status: string;
  attemptCount: number;
  expiresAt: number;
};

/**
 * In-memory stand-in for the export-lock statements.
 * It is not Postgres and it never opens a network connection.
 */
export function createFixtureLockDb(): SqlClient & {
  begin: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
} {
  let rows = new Map<number, LockRow>();
  let snapshot: Map<number, LockRow> | null = null;

  function clone(source: Map<number, LockRow>): Map<number, LockRow> {
    return new Map([...source].map(([id, row]) => [id, { ...row }]));
  }

  return {
    async begin() {
      snapshot = clone(rows);
    },
    async commit() {
      snapshot = null;
    },
    async rollback() {
      if (snapshot) rows = snapshot;
      snapshot = null;
    },
    async query(text: string, values?: unknown[]) {
      const sql = text.replace(/\s+/g, " ").trim();
      const now = Date.now();
      if (sql.startsWith("INSERT INTO list_export_locks")) {
        const listId = Number(values?.[0]);
        const owner = String(values?.[1]);
        const leaseSeconds = Number(values?.[2]);
        const attemptLimit = Number(values?.[3]);
        const current = rows.get(listId);
        if (!current) {
          rows.set(listId, {
            listId,
            owner,
            status: "running",
            attemptCount: 1,
            expiresAt: now + leaseSeconds * 1000,
          });
          return { rows: [{ owner }], rowCount: 1 } as never;
        }
        const canTake = current.expiresAt <= now
          && current.status !== "error"
          && (current.status === "done" || current.attemptCount < attemptLimit);
        if (!canTake) return { rows: [], rowCount: 0 } as never;
        const next = {
          ...current,
          owner,
          status: "running",
          expiresAt: now + leaseSeconds * 1000,
          attemptCount: current.status === "done" ? 1 : current.attemptCount + 1,
        };
        rows.set(listId, next);
        return { rows: [{ owner }], rowCount: 1 } as never;
      }
      if (sql.startsWith("SELECT status, attempt_count")) {
        const row = rows.get(Number(values?.[0]));
        if (!row) return { rows: [], rowCount: 0 } as never;
        return {
          rows: [{
            status: row.status,
            attempt_count: row.attemptCount,
            held: row.expiresAt > now,
          }],
          rowCount: 1,
        } as never;
      }
      if (sql.startsWith("UPDATE list_export_locks") && sql.includes("status = 'done'")) {
        const listId = Number(values?.[0]);
        const owner = String(values?.[1]);
        const row = rows.get(listId);
        if (row?.owner === owner) {
          rows.set(listId, { ...row, status: "done", owner: null, attemptCount: 0, expiresAt: now });
        }
        return { rows: [], rowCount: row?.owner === owner ? 1 : 0 } as never;
      }
      if (sql.startsWith("UPDATE list_export_locks")) {
        const listId = Number(values?.[0]);
        const owner = String(values?.[1]);
        const attemptLimit = Number(values?.[2]);
        const row = rows.get(listId);
        if (row?.owner === owner) {
          rows.set(listId, {
            ...row,
            status: row.attemptCount >= attemptLimit ? "error" : "pending",
            owner: null,
            expiresAt: now,
          });
        }
        return { rows: [], rowCount: row?.owner === owner ? 1 : 0 } as never;
      }
      throw new Error("Fixture lock database rejected an unexpected statement.");
    },
  };
}
