-- v2 identity, metadata timestamps, list sync, and watch events.
-- Additive. Does not invent historical watch dates.
-- Safe to run once. Unique indexes fail if duplicate identities already exist.

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS imdb_id text;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS simkl_id text;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS production_countries text[];
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS runtime_minutes integer;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS metadata_fetched_at timestamptz;
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS my_lists_slug text;
ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS external_version text;
ALTER TABLE custom_lists ADD COLUMN IF NOT EXISTS sync_status text;

CREATE TABLE IF NOT EXISTS watch_events (
  id serial PRIMARY KEY,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL,
  action text NOT NULL,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_events_action_check CHECK (action IN ('watched', 'unwatched'))
);

CREATE TABLE IF NOT EXISTS simkl_markers (
  id serial PRIMARY KEY,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL,
  simkl_id text,
  watched boolean,
  synced_at timestamptz,
  CONSTRAINT simkl_markers_media_tmdb_uidx UNIQUE (media_type, tmdb_id)
);

CREATE TABLE IF NOT EXISTS list_sync_queue (
  id serial PRIMARY KEY,
  list_id integer NOT NULL REFERENCES custom_lists(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT list_sync_queue_idempotency_uidx UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS watchlist_media_tmdb_uidx ON watchlist (media_type, tmdb_id);
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_imdb_id_uidx ON watchlist (imdb_id) WHERE imdb_id IS NOT NULL;
