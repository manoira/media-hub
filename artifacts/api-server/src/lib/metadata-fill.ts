import { acceptImdbId, pool } from "@workspace/db";

export const METADATA_ATTEMPT_LIMIT = 3;
export const METADATA_FILL_LIMIT = 10;

export type MetadataSource = {
  tmdbId: number;
  imdbId: string | null;
  productionCountryCodes: string[];
  runtime: number | null;
};

type Candidate = { id: number; tmdb_id: number; media_type: string };

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Metadata request failed";
  if (/api_key|https?:|secret|token/i.test(message)) return "Metadata request failed";
  return message.slice(0, 200);
}

export async function fillMissingMetadata(options: {
  limit?: number;
  ids?: number[];
  load: (row: { id: number; tmdbId: number; mediaType: string }) => Promise<MetadataSource>;
}): Promise<{ filled: number; failed: number; lookedAt: number }> {
  const limit = options.limit ?? METADATA_FILL_LIMIT;
  const scoped = options.ids ?? [];
  const selected = await pool.query<Candidate>(
    scoped.length > 0
      ? `SELECT id, tmdb_id, media_type
         FROM watchlist
         WHERE metadata_fetched_at IS NULL
           AND metadata_attempt_count < $1
           AND id = ANY($3::int[])
         ORDER BY metadata_attempted_at NULLS FIRST, id
         LIMIT $2`
      : `SELECT id, tmdb_id, media_type
         FROM watchlist
         WHERE metadata_fetched_at IS NULL
           AND metadata_attempt_count < $1
         ORDER BY metadata_attempted_at NULLS FIRST, id
         LIMIT $2`,
    scoped.length > 0 ? [METADATA_ATTEMPT_LIMIT, limit, scoped] : [METADATA_ATTEMPT_LIMIT, limit],
  );

  let filled = 0;
  let failed = 0;
  for (const row of selected.rows) {
    try {
      const details = await options.load({
        id: row.id,
        tmdbId: row.tmdb_id,
        mediaType: row.media_type,
      });
      const imdbId = acceptImdbId({
        requestedTmdbId: row.tmdb_id,
        returnedTmdbId: details.tmdbId,
        imdbId: details.imdbId,
      });
      const countries = details.productionCountryCodes.length > 0 ? details.productionCountryCodes : null;
      await pool.query(
        `UPDATE watchlist
         SET production_countries = COALESCE($1::text[], production_countries),
             runtime_minutes = COALESCE($2, runtime_minutes),
             imdb_id = COALESCE($3, imdb_id),
             metadata_fetched_at = now(),
             metadata_last_error = NULL
         WHERE id = $4`,
        [countries, details.runtime, imdbId, row.id],
      );
      filled += 1;
    } catch (error) {
      try {
        await pool.query(
          `UPDATE watchlist
           SET metadata_attempt_count = metadata_attempt_count + 1,
               metadata_attempted_at = now(),
               metadata_last_error = $2
           WHERE id = $1
             AND metadata_fetched_at IS NULL`,
          [row.id, safeError(error)],
        );
      } catch {
        // The title stays unfetched, so a later batch can retry it.
      }
      failed += 1;
    }
  }

  return { filled, failed, lookedAt: selected.rows.length };
}
