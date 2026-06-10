import { Router, type IRouter } from "express";
import healthRouter from "./health";
import searchRouter from "./search";
import mediaRouter from "./media";
import watchlistRouter from "./watchlist";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchRouter);
router.use(mediaRouter);
router.use(statsRouter);
router.use(watchlistRouter);

export default router;
