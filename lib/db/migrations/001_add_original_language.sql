-- Required after the My List filters update (originalLanguage on watchlist).
-- Safe to run multiple times.
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS original_language text;
