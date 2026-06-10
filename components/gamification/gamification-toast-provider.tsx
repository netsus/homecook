"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchUserGamification,
  markUserGamificationNotificationsSeen,
} from "@/lib/api/user-gamification";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";
import type { UserGamificationNotificationData } from "@/types/user-gamification";

interface ToastMessage {
  id: string;
  title: string;
  detail: string;
}

const TOAST_DURATION_MS = 3600;

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatNotification(
  notification: UserGamificationNotificationData,
): ToastMessage | null {
  const payload = notification.payload ?? {};

  if (notification.notification_type === "xp_awarded") {
    const label = toText(payload.label) || "집밥 활동";
    const xpDelta = toNumber(payload.xp_delta);

    return {
      id: notification.id,
      title: `${label} +${xpDelta} XP`,
      detail: "성장 기록에 반영됐어요.",
    };
  }

  if (notification.notification_type === "badge_unlocked") {
    return {
      id: notification.id,
      title: `새 배지: ${toText(payload.label) || "집밥 배지"}`,
      detail: "마이페이지에서 확인할 수 있어요.",
    };
  }

  if (notification.notification_type === "quest_completed") {
    return {
      id: notification.id,
      title: `퀘스트 달성: ${toText(payload.title) || "집밥 루틴"}`,
      detail: "다음 루틴도 이어가 보세요.",
    };
  }

  return null;
}

export function GamificationToastProvider() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(false);

  const clearToastTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (message: ToastMessage) => {
      clearToastTimer();
      setToast(message);
      timerRef.current = setTimeout(() => {
        setToast(null);
        timerRef.current = null;
      }, TOAST_DURATION_MS);
    },
    [clearToastTimer],
  );

  const refreshNotifications = useCallback(async () => {
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;

    try {
      const gamification = await fetchUserGamification();
      const unseen = gamification.notifications.unseen.slice(0, 2);
      const formatted = unseen
        .map(formatNotification)
        .find((message): message is ToastMessage => Boolean(message));

      if (formatted) {
        showToast(formatted);
      }

      if (unseen.length > 0) {
        void markUserGamificationNotificationsSeen(unseen.map((item) => item.id)).catch(
          () => undefined,
        );
      }
    } catch {
      // XP feedback is secondary to the source action success.
    } finally {
      loadingRef.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    window.addEventListener(
      HOMECOOK_GAMIFICATION_REFRESH_EVENT,
      refreshNotifications,
    );

    return () => {
      window.removeEventListener(
        HOMECOOK_GAMIFICATION_REFRESH_EVENT,
        refreshNotifications,
      );
      clearToastTimer();
    };
  }, [clearToastTimer, refreshNotifications]);

  if (!toast) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(90px+env(safe-area-inset-bottom))] z-[80] mx-auto max-w-[360px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] shadow-[0_16px_40px_var(--overlay-20)] md:inset-x-auto md:right-6 md:bottom-6 md:w-[320px]"
      data-testid="gamification-xp-toast"
      role="status"
    >
      <p className="text-[13px] font-extrabold leading-[1.35]">{toast.title}</p>
      <p className="mt-0.5 text-[12px] font-semibold leading-[1.35] text-[var(--text-2)]">
        {toast.detail}
      </p>
    </div>
  );
}
