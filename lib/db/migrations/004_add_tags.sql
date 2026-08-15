-- User-defined tags on watchlist rows. Safe to run multiple times.

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS tags text[];
