import { Router, type IRouter } from "express";
import healthRouter from "./health";
import searchRouter from "./search";
import mediaRouter from "./media";
import watchlistRouter from "./watchlist";
import listsRouter from "./lists";
import statsRouter from "./stats";
import progressRouter from "./progress";
import peopleRouter from "./people";
import notificationsRouter from "./notifications";
import wakoProbeRouter from "./wako-probe";
import sessionRouter from "./session";
import integrationsRouter from "./integrations";
import backupRouter from "./backup";
import v2Router from "./v2";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(peopleRouter);
router.use(mediaRouter);
router.use(statsRouter);
router.use(watchlistRouter);
router.use(listsRouter);
router.use(progressRouter);
router.use(notificationsRouter);
router.use(wakoProbeRouter);
router.use(sessionRouter);
router.use(integrationsRouter);
router.use(backupRouter);
router.use(v2Router);

export default router;
