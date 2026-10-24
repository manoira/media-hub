import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  useGetNotifications,
  useMarkNotificationsRead,
  useRefreshNotifications,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
  type NotificationRefresh,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getTmdbImageUrl } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

function statusText(result: NotificationRefresh): string {
  if (result.skipped === "budget") {
    return `Daily limit of ${result.limit} TMDB requests is used. Saved updates are unchanged.`;
  }
  if (result.skipped === "interval") {
    return "A check already ran recently. These are the saved updates.";
  }
  if (result.skipped === "busy") {
    return "A check is already running.";
  }
  return `Checked ${result.checked} saved titles. ${result.remaining} manual TMDB requests remain today.`;
}

export function Updates() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useGetNotifications();
  const markRead = useMarkNotificationsRead();
  const refresh = useRefreshNotifications();
  const [status, setStatus] = useState("Showing saved updates. Opening this page does not contact TMDB.");
  const hasUnread = notifications?.some((item) => !item.read) ?? false;

  useEffect(() => {
    if (!hasUnread) return;
    markRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
      },
    });
  }, [hasUnread]); // eslint-disable-line react-hooks/exhaustive-deps -- mark read once when unread rows are present

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Updates</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={refresh.isPending}
          onClick={() => {
            refresh.mutate(undefined, {
              onSuccess: (result) => {
                setStatus(statusText(result));
                queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
              },
              onError: () => setStatus("The check did not finish. Saved updates are still shown."),
            });
          }}
        >
          {refresh.isPending ? "Checking saved titles" : "Check for updates"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{status}</p>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !notifications?.length ? (
        <p className="text-muted-foreground">No saved updates yet.</p>
      ) : (
        <ul className="space-y-3">
          {notifications.map((item) => (
            <li key={item.id}>
              <Link
                href={`/media/${item.mediaType}/${item.tmdbId}`}
                className="flex gap-4 rounded-xl border bg-card p-4 hover:border-primary/40 transition-colors"
              >
                <img
                  src={getTmdbImageUrl(item.posterPath, "poster") || "/favicon.svg"}
                  alt=""
                  className="w-12 h-[72px] object-cover rounded-md bg-muted shrink-0"
                />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{item.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{item.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    {new Date(item.createdAt).toLocaleString()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
