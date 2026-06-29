-- Notification center tables. Safe to run multiple times.

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
