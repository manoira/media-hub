-- Sync production schema for custom lists and watchlist keyword filters.
-- Safe to run multiple times.

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS keyword_ids integer[];

CREATE TABLE IF NOT EXISTS custom_lists (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  kind text NOT NULL,
  smart_mode text,
  rules jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_list_items (
  id serial PRIMARY KEY,
  list_id integer NOT NULL REFERENCES custom_lists(id) ON DELETE CASCADE,
  watchlist_id integer REFERENCES watchlist(id) ON DELETE SET NULL,
  tmdb_id integer,
  media_type text,
  title text,
  poster_path text,
  release_date text,
  vote_average real,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, tmdb_id, media_type)
);
