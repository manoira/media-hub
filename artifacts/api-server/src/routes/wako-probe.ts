import { Router, type IRouter } from "express";
import {
  INITIAL_ITEMS,
  LOCAL_TEST_PROFILE,
  PROBE_LIST_NAME,
  PROBE_SLUG,
  REVIEWED_MY_LISTS,
  checkHostedMyListsSave,
  runLocalWakoProbe,
} from "../lib/my-lists-sandbox";

const router: IRouter = Router();

const television = [
  "Install this private list as a catalog row in the owner's Wako.",
  "Confirm an unrelated catalog config cannot open it.",
  "Add and remove a title on the same installed row, and write down the delay.",
  "Open one movie and one series with the remote, including the fallback if a streaming app does not start.",
];

router.get("/wako-probe", (_req, res) => {
  res.json({
    listName: PROBE_LIST_NAME,
    slug: PROBE_SLUG,
    profile: LOCAL_TEST_PROFILE.creatorName,
    items: INITIAL_ITEMS,
    reviewed: REVIEWED_MY_LISTS,
    television,
    hostingNote:
      "A private list should stay on a My Lists install you control. The free Cloudflare Workers plan is enough for one personal catalog. The public site at mylistsaddon.com is simpler to try, and the list would then live on that deployment. This check does not make that choice.",
  });
});

router.post("/wako-probe/run", async (_req, res) => {
  const local = runLocalWakoProbe();
  const hosted = await checkHostedMyListsSave();
  res.json({
    ...local,
    slug: PROBE_SLUG,
    listName: PROBE_LIST_NAME,
    hosted,
    television,
    reviewed: REVIEWED_MY_LISTS,
  });
});

export default router;
