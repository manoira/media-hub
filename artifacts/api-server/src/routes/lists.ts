import { Router, type IRouter } from "express";
import {
  db,
  watchlistTable,
  customListsTable,
  customListItemsTable,
  listRulesSchema,
  type ListRules,
} from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { evaluateListRules } from "../lib/list-rules";
import { serializeWatchlistItem } from "../lib/watchlist-item";
import {
  serializeCustomListDisplayItem,
  watchlistRowToListItemValues,
} from "../lib/list-item-serialize";
import {
  GetCustomListsResponse,
  CreateCustomListBody,
  GetCustomListParams,
  GetCustomListResponse,
  UpdateCustomListParams,
  UpdateCustomListBody,
  UpdateCustomListResponse,
  DeleteCustomListParams,
  AddCustomListItemParams,
  AddCustomListItemBody,
  RemoveCustomListItemParams,
  RefreshCustomListParams,
  RefreshCustomListResponse,
} from "@workspace/api-zod";

const TMDB_BASE = "https://api.themoviedb.org/3";

async function fetchTmdbSnapshot(tmdbId: number, mediaType: string) {
  const apiKey = process.env.TMDB_API_KEY;
  const endpoint = mediaType === "tv" ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
  const url = `${TMDB_BASE}${endpoint}?api_key=${apiKey}`;
  const res = await globalThis.fetch(url);
  if (!res.ok) return null;
  const data = await res.json() as Record<string, unknown>;
  if (mediaType === "tv") {
    return {
      title: (data.name as string) || "Unknown",
      posterPath: (data.poster_path as string | null) ?? null,
      releaseDate: (data.first_air_date as string | null) ?? null,
      voteAverage: (data.vote_average as number | null) ?? null,
    };
  }
  return {
    title: (data.title as string) || "Unknown",
    posterPath: (data.poster_path as string | null) ?? null,
    releaseDate: (data.release_date as string | null) ?? null,
    voteAverage: (data.vote_average as number | null) ?? null,
  };
}

const router: IRouter = Router();

function serializeListSummary(
  list: typeof customListsTable.$inferSelect,
  itemCount: number,
) {
  return {
    id: list.id,
    name: list.name,
    description: list.description ?? null,
    kind: list.kind as "manual" | "smart",
    smartMode: (list.smartMode as "live" | "snapshot" | null) ?? null,
    itemCount,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

function parseRules(rules: unknown): ListRules | null {
  if (!rules) return null;
  const parsed = listRulesSchema.safeParse(rules);
  return parsed.success ? parsed.data : null;
}

async function getListItemCount(list: typeof customListsTable.$inferSelect): Promise<number> {
  if (list.kind === "smart" && list.smartMode === "live") {
    const allItems = await db.select().from(watchlistTable);
    const rules = parseRules(list.rules);
    return evaluateListRules(allItems, rules).length;
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customListItemsTable)
    .where(eq(customListItemsTable.listId, list.id));
  return row?.count ?? 0;
}

async function resolveListItems(list: typeof customListsTable.$inferSelect) {
  if (list.kind === "smart" && list.smartMode === "live") {
    const allItems = await db.select().from(watchlistTable);
    const rules = parseRules(list.rules);
    return evaluateListRules(allItems, rules).map((item) => ({
      listItemId: null,
      tracked: true,
      ...serializeWatchlistItem(item),
    }));
  }

  const rows = await db
    .select({
      listItem: customListItemsTable,
      watchlist: watchlistTable,
    })
    .from(customListItemsTable)
    .leftJoin(watchlistTable, eq(customListItemsTable.watchlistId, watchlistTable.id))
    .where(eq(customListItemsTable.listId, list.id));

  const watchlistByKey = new Map(
    (await db.select().from(watchlistTable)).map(w => [`${w.mediaType}:${w.tmdbId}`, w]),
  );

  return rows.map(({ listItem, watchlist }) => {
    const linked = watchlist
      ?? (listItem.tmdbId && listItem.mediaType
        ? watchlistByKey.get(`${listItem.mediaType}:${listItem.tmdbId}`) ?? null
        : null);
    return serializeCustomListDisplayItem(listItem, linked);
  });
}

async function buildListDetail(list: typeof customListsTable.$inferSelect) {
  const items = await resolveListItems(list);
  return {
    ...serializeListSummary(list, items.length),
    rules: parseRules(list.rules),
    items,
  };
}

async function replaceSnapshotItems(listId: number, rules: ListRules | null) {
  const allItems = await db.select().from(watchlistTable);
  const matched = evaluateListRules(allItems, rules);

  await db.delete(customListItemsTable).where(eq(customListItemsTable.listId, listId));

  if (matched.length > 0) {
    await db.insert(customListItemsTable).values(
      matched.map(item => watchlistRowToListItemValues(listId, item)),
    );
  }
}

router.get("/lists", async (req, res): Promise<void> => {
  try {
    const lists = await db.select().from(customListsTable).orderBy(asc(customListsTable.name));
    const summaries = await Promise.all(
      lists.map(async (list) => serializeListSummary(list, await getListItemCount(list))),
    );
    res.json(GetCustomListsResponse.parse(summaries));
  } catch (err: unknown) {
    req.log.error({ err }, "GET /lists failed");
    res.status(500).json({ error: "Failed to load lists" });
  }
});

router.post("/lists", async (req, res): Promise<void> => {
  const parsed = CreateCustomListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, description, kind, smartMode, rules } = parsed.data;

  if (kind === "smart" && !smartMode) {
    res.status(400).json({ error: "smartMode is required for smart lists" });
    return;
  }
  if (kind === "manual" && smartMode) {
    res.status(400).json({ error: "smartMode must not be set for manual lists" });
    return;
  }

  const rulesParsed = rules ? listRulesSchema.safeParse(rules) : { success: true as const, data: null };
  if (!rulesParsed.success) {
    res.status(400).json({ error: rulesParsed.error.message });
    return;
  }

  try {
    const [inserted] = await db.insert(customListsTable).values({
      name,
      description: description ?? null,
      kind,
      smartMode: kind === "smart" ? smartMode! : null,
      rules: rulesParsed.data,
    }).returning();

    if (kind === "smart" && smartMode === "snapshot") {
      await replaceSnapshotItems(inserted.id, rulesParsed.data);
    }

    const detail = await buildListDetail(inserted);
    res.status(201).json(GetCustomListResponse.parse(detail));
  } catch (err: unknown) {
    req.log.error({ err }, "POST /lists failed");
    res.status(500).json({ error: "Failed to create list" });
  }
});

router.get("/lists/:id", async (req, res): Promise<void> => {
  const params = GetCustomListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [list] = await db
      .select()
      .from(customListsTable)
      .where(eq(customListsTable.id, params.data.id));

    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const detail = await buildListDetail(list);
    res.json(GetCustomListResponse.parse(detail));
  } catch (err: unknown) {
    req.log.error({ err }, "GET /lists/:id failed");
    res.status(500).json({ error: "Failed to load list" });
  }
});

router.patch("/lists/:id", async (req, res): Promise<void> => {
  const params = UpdateCustomListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCustomListBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(customListsTable)
      .where(eq(customListsTable.id, params.data.id));

    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const update: Partial<typeof customListsTable.$inferInsert> = {};
    if (body.data.name !== undefined) update.name = body.data.name;
    if (body.data.description !== undefined) update.description = body.data.description ?? null;
    if (body.data.rules !== undefined) {
      const rulesParsed = listRulesSchema.safeParse(body.data.rules);
      if (!rulesParsed.success) {
        res.status(400).json({ error: rulesParsed.error.message });
        return;
      }
      update.rules = rulesParsed.data;
    }

    const [updated] = await db
      .update(customListsTable)
      .set(update)
      .where(eq(customListsTable.id, params.data.id))
      .returning();

    const detail = await buildListDetail(updated);
    res.json(UpdateCustomListResponse.parse(detail));
  } catch (err: unknown) {
    req.log.error({ err }, "PATCH /lists/:id failed");
    res.status(500).json({ error: "Failed to update list" });
  }
});

router.delete("/lists/:id", async (req, res): Promise<void> => {
  const params = DeleteCustomListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(customListsTable)
    .where(eq(customListsTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/lists/:id/items", async (req, res): Promise<void> => {
  const params = AddCustomListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddCustomListItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const hasWatchlistId = body.data.watchlistId !== undefined;
  const hasMediaRef = body.data.tmdbId !== undefined && body.data.mediaType !== undefined;
  if (hasWatchlistId === hasMediaRef) {
    res.status(400).json({ error: "Provide watchlistId or tmdbId+mediaType" });
    return;
  }

  try {
    const [list] = await db
      .select()
      .from(customListsTable)
      .where(eq(customListsTable.id, params.data.id));

    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (list.kind !== "manual") {
      res.status(400).json({ error: "Items can only be added to manual lists" });
      return;
    }

    if (body.data.watchlistId !== undefined) {
      const [watchlistItem] = await db
        .select()
        .from(watchlistTable)
        .where(eq(watchlistTable.id, body.data.watchlistId));

      if (!watchlistItem) {
        res.status(404).json({ error: "Watchlist item not found" });
        return;
      }

      await db
        .insert(customListItemsTable)
        .values(watchlistRowToListItemValues(list.id, watchlistItem))
        .onConflictDoNothing({
          target: [
            customListItemsTable.listId,
            customListItemsTable.tmdbId,
            customListItemsTable.mediaType,
          ],
        });
    } else {
      const { tmdbId, mediaType } = body.data;
      const [onWatchlist] = await db
        .select()
        .from(watchlistTable)
        .where(and(
          eq(watchlistTable.tmdbId, tmdbId!),
          eq(watchlistTable.mediaType, mediaType!),
        ));

      let title = body.data.title;
      let posterPath = body.data.posterPath ?? null;
      let releaseDate = body.data.releaseDate ?? null;
      let voteAverage = body.data.voteAverage ?? null;

      if (!title) {
        const snapshot = await fetchTmdbSnapshot(tmdbId!, mediaType!);
        if (!snapshot) {
          res.status(404).json({ error: "Title not found on TMDB" });
          return;
        }
        title = snapshot.title;
        posterPath = posterPath ?? snapshot.posterPath;
        releaseDate = releaseDate ?? snapshot.releaseDate;
        voteAverage = voteAverage ?? snapshot.voteAverage;
      }

      await db
        .insert(customListItemsTable)
        .values({
          listId: list.id,
          watchlistId: onWatchlist?.id ?? null,
          tmdbId: tmdbId!,
          mediaType: mediaType!,
          title: title!,
          posterPath,
          releaseDate,
          voteAverage,
        })
        .onConflictDoNothing({
          target: [
            customListItemsTable.listId,
            customListItemsTable.tmdbId,
            customListItemsTable.mediaType,
          ],
        });
    }

    const detail = await buildListDetail(list);
    res.status(201).json(GetCustomListResponse.parse(detail));
  } catch (err: unknown) {
    req.log.error({ err }, "POST /lists/:id/items failed");
    res.status(500).json({ error: "Failed to add item" });
  }
});

router.delete("/lists/:id/items/:listItemId", async (req, res): Promise<void> => {
  const params = RemoveCustomListItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [list] = await db
    .select()
    .from(customListsTable)
    .where(eq(customListsTable.id, params.data.id));

  if (!list) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (list.kind === "smart" && list.smartMode === "live") {
    res.status(400).json({ error: "Cannot remove items from a live smart list" });
    return;
  }

  const [deleted] = await db
    .delete(customListItemsTable)
    .where(and(
      eq(customListItemsTable.listId, params.data.id),
      eq(customListItemsTable.id, params.data.listItemId),
    ))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Item not in list" });
    return;
  }
  res.sendStatus(204);
});

router.post("/lists/:id/refresh", async (req, res): Promise<void> => {
  const params = RefreshCustomListParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const [list] = await db
      .select()
      .from(customListsTable)
      .where(eq(customListsTable.id, params.data.id));

    if (!list) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (list.kind !== "smart" || list.smartMode !== "snapshot") {
      res.status(400).json({ error: "Only snapshot smart lists can be refreshed" });
      return;
    }

    await replaceSnapshotItems(list.id, parseRules(list.rules));

    const [updated] = await db
      .select()
      .from(customListsTable)
      .where(eq(customListsTable.id, list.id));

    const detail = await buildListDetail(updated!);
    res.json(RefreshCustomListResponse.parse(detail));
  } catch (err: unknown) {
    req.log.error({ err }, "POST /lists/:id/refresh failed");
    res.status(500).json({ error: "Failed to refresh list" });
  }
});

export default router;
