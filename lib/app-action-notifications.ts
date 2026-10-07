"use client";

export const HOMECOOK_APP_ACTION_NOTIFICATION_EVENT =
  "homecook:app-action-notification";

export interface AppActionNotificationEventDetail {
  id: string;
  message: string;
  title: string;
  createdAt: string;
}

export function emitAppActionNotification({
  message,
  title = "완료",
}: {
  message: string;
  title?: string;
}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AppActionNotificationEventDetail>(
      HOMECOOK_APP_ACTION_NOTIFICATION_EVENT,
      {
        detail: {
          createdAt: new Date().toISOString(),
          id: crypto.randomUUID(),
          message,
          title,
        },
      },
    ),
  );
}

/** Success invalidation only: the database, not browser message text, owns history. */
export function notifyActionNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HOMECOOK_APP_ACTION_NOTIFICATION_EVENT));
}
export const HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET = "homecook:action-notification-session-reset";
export function clearActionNotificationSession() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HOMECOOK_ACTION_NOTIFICATION_SESSION_RESET));
}
