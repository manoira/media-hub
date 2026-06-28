import { Router, type IRouter } from "express";
import healthRouter from "./health";
import searchRouter from "./search";
import mediaRouter from "./media";
import watchlistRouter from "./watchlist";
import listsRouter from "./lists";
import statsRouter from "./stats";
import progressRouter from "./progress";
import peopleRouter from "./people";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(peopleRouter);
router.use(mediaRouter);
router.use(statsRouter);
router.use(watchlistRouter);
router.use(listsRouter);
router.use(progressRouter);

export default router;
