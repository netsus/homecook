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
