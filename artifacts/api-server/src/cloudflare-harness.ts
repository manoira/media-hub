import { httpServerHandler } from "cloudflare:node";
import app from "./app";
import { claimExport } from "./lib/export-lock";
import { createFixtureLockDb } from "./lib/fixture-lock-db";
import { catalogEtag, notModified } from "./lib/private-cache";
import { sessionCookieAttributes, sessionTokenHash } from "./lib/owner-session";
import { serializeCustomListDisplayItem } from "./lib/list-item-serialize";

const port = 3000;
const catalogStamp = new Date("2026-10-24T00:00:00.000Z");

app.get("/__worker/hash", (_req, res) => {
  res.json({ hash: sessionTokenHash("fixture-token") });
});

app.get("/__worker/cookie", (_req, res) => {
  res.json({ attributes: sessionCookieAttributes("production") });
});

app.get("/__worker/catalog", (req, res) => {
  const etag = catalogEtag(2, catalogStamp, "added_at");
  if (notModified(req, res, etag)) return;
  res.json({ items: [{ id: 1, title: "Fixture" }] });
});

app.get("/__worker/list", (_req, res) => {
  const now = catalogStamp;
  const item = serializeCustomListDisplayItem(null, {
    id: 1,
    tmdbId: 603,
    mediaType: "movie",
    status: "watched",
    userRating: 8,
    notes: "Fixture note",
    addedAt: now,
    updatedAt: now,
    title: "Fixture title",
    posterPath: "/poster.jpg",
    backdropPath: "/backdrop.jpg",
    releaseDate: "1999-03-31",
    originalLanguage: "en",
    adult: false,
    voteAverage: 8.2,
    genreIds: ["28"],
    keywordIds: [1, 2, 3],
    tags: ["fixture"],
    overview: "A ".repeat(300),
  } as never);
  res.json(item);
});

app.post("/__worker/locks", async (_req, res) => {
  const db = createFixtureLockDb();
  const first = await claimExport(7, "owner-a", 120, db);
  const second = await claimExport(7, "owner-b", 120, db);
  await db.begin();
  const inside = await claimExport(9, "owner-a", 120, db);
  await db.rollback();
  const afterRollback = await claimExport(9, "owner-c", 120, db);
  res.json({ first, second, inside, afterRollback });
});

app.listen(port);

export default httpServerHandler({ port });
