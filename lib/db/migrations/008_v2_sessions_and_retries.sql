-- Additive review fixes. Does not change existing watch rows.
-- Owner sessions store a hash of the cookie, never the cookie itself.
-- Metadata attempts stay separate from a successful fetch.
-- List export records which target produced the last hash.

CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS metadata_attempted_at timestamptz;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS metadata_attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS metadata_last_error text;

ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS sync_target text;
