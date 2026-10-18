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
  "Install the private catalog row from your own My Lists test install. That row is the addon manifest, not Wako's built-in My Lists.",
  "Change the same list, then empty it, and keep the same slug. Write down how long the TV takes to show each change.",
  "Open one movie and one series with the remote. A row on screen is not verified playback.",
  "Keep the install URL private. This page does not publish it.",
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
      "Media Hub stays on Vercel and Neon. The My Lists test catalog is a separate install you control, pinned to the reviewed version. It is not deployed from this step, and mylistsaddon.com is not called.",
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
