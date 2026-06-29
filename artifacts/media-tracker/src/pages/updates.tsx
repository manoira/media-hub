import { useEffect } from "react";
import { Link } from "wouter";
import {
  useGetNotifications,
  useMarkNotificationsRead,
  getGetNotificationsQueryKey,
  getGetUnreadNotificationCountQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getTmdbImageUrl } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell } from "lucide-react";

export function Updates() {
  const queryClient = useQueryClient();
  const { data: notifications, isLoading } = useGetNotifications({ refresh: true });
  const markRead = useMarkNotificationsRead();

  useEffect(() => {
    markRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUnreadNotificationCountQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() });
      },
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mark read once on page entry

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <Bell className="h-7 w-7 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Updates</h1>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : !notifications?.length ? (
        <p className="text-muted-foreground">No updates yet. We will notify you when something changes on your list.</p>
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
