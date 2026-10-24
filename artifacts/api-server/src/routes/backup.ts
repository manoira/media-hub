import { Router, type IRouter } from "express";
import { catalogCounts, db } from "@workspace/db";
import { readCatalogBackup } from "@workspace/db";

const router: IRouter = Router();

const restoreSteps = [
  "Export from this page, or run the export script. That writes data/local-backup.json and leaves the older data/watchlist.json file alone.",
  "Restore only onto a copy of the database. The import script replaces the catalog in whatever DATABASE_URL it is given.",
  "A local check restores into a transaction and rolls it back, so the database you are using is not replaced.",
];

router.get("/backup", async (_req, res) => {
  const counts = await catalogCounts(db);
  res.json({
    counts,
    accessKeys: "later",
    restoreSteps,
  });
});

router.get("/backup/export", async (_req, res) => {
  const backup = await readCatalogBackup(db);
  res.setHeader("content-disposition", "attachment; filename=\"media-hub-backup.json\"");
  res.json(backup);
});

export default router;
