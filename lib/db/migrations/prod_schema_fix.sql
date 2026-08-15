-- Production schema fix for media.emmyzettergren.se
-- Run in Neon Console on the PRODUCTION project (ep-wandering-morning-apbbwjdd).
-- Safe to run multiple times.

-- 001
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS original_language text;

-- 002
CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  tmdb_id integer NOT NULL,
  media_type text NOT NULL,
  poster_path text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_meta (
  watchlist_id integer PRIMARY KEY,
  last_notified_season integer,
  had_streaming boolean,
  launch_notified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_sync_state (
  id integer PRIMARY KEY DEFAULT 1,
  last_sync_at timestamptz
);

-- 003
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS adult boolean;

-- 005
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
