import { Router, type IRouter } from "express";
import {
  syncNotifications,
  listNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  serializeNotification,
} from "../lib/notification-sync";
import {
  GetNotificationsResponse,
  GetUnreadNotificationCountResponse,
  RefreshNotificationsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  try {
    const rows = await listNotifications();
    res.set("Cache-Control", "private, no-cache");
    res.json(GetNotificationsResponse.parse(rows.map(serializeNotification)));
  } catch (err: unknown) {
    req.log.error({ err }, "Notifications list error");
    res.status(500).json({ error: "Failed to list notifications" });
  }
});

router.post("/notifications/refresh", async (req, res): Promise<void> => {
  try {
    const result = await syncNotifications(true);
    res.json(RefreshNotificationsResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Notifications refresh error");
    res.status(500).json({ error: "Failed to check for updates" });
  }
});

router.get("/notifications/unread-count", async (_req, res): Promise<void> => {
  try {
    const count = await getUnreadCount();
    res.set("Cache-Control", "private, no-cache");
    res.json(GetUnreadNotificationCountResponse.parse({ count }));
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

router.post("/notifications/mark-read", async (_req, res): Promise<void> => {
  try {
    await markAllNotificationsRead();
    res.status(204).send();
  } catch (err: unknown) {
    res.status(500).json({ error: "Failed to mark notifications read" });
  }
});

export default router;
