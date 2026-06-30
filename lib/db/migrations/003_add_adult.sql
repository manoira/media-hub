-- Store TMDB adult flag on watchlist rows. Safe to run multiple times.

ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS adult boolean;
