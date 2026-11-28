-- Additive. Shared export locks and shared login throttling.
-- Does not change existing watch rows.

CREATE TABLE IF NOT EXISTS list_export_locks (
  list_id integer PRIMARY KEY REFERENCES custom_lists (id) ON DELETE CASCADE,
  owner text,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_failures (
  subject_hash text PRIMARY KEY,
  failure_count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
