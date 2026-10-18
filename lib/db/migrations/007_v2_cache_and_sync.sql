-- Persistent TMDB cache, list export flags, and a notification cursor.
-- Additive. Does not change existing watch rows.

CREATE TABLE IF NOT EXISTS tmdb_cache (
  cache_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  stale_until timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS tmdb_meter (
  surface text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  misses integer NOT NULL DEFAULT 0,
  stale integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  external integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0
);

ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS export_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS sync_error text;

ALTER TABLE notification_sync_state ADD COLUMN IF NOT EXISTS cursor_offset integer NOT NULL DEFAULT 0;
