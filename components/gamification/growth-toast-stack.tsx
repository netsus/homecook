"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchUserGamification,
  markUserGamificationNotificationsSeen,
} from "@/lib/api/user-gamification";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";
import type {
  UserGamificationNotificationData,
  UserGamificationNotificationType,
} from "@/types/user-gamification";

// Screen spec v1.5.16 section 19.1-b: mobile 2 visible toasts, desktop 3.
const MOBILE_VISIBLE_MAX = 2;
const DESKTOP_VISIBLE_MAX = 3;
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const TOAST_DURATION_MS = 3600;

type ToastTone = "level-up" | "badge" | "quest" | "xp";

interface ToastView {
  id: string;
  type: UserGamificationNotificationType;
  tone: ToastTone;
  title: string;
  body: string;
  groupKey: string | null;
}

const TONE_BY_TYPE: Record<UserGamificationNotificationType, ToastTone> = {
  level_up: "level-up",
  badge_unlocked: "badge",
  quest_completed: "quest",
  xp_awarded: "xp",
};

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// Prefer server title/body. Fallback text is only for incomplete fixture rows.
// The client does not recalculate priority, so input order is preserved.
function toToastView(
  notification: UserGamificationNotificationData,
): ToastView {
  const payload = notification.payload ?? {};
  const tone = TONE_BY_TYPE[notification.notification_type] ?? "xp";
  const serverTitle = toText(notification.title);
  const serverBody = toText(notification.body);

  let title = serverTitle;
  let body = serverBody;

  if (!title || !body) {
    if (notification.notification_type === "level_up") {
      const level =
        toNumber(payload.current_level) || toNumber(payload.level);
      title = title || (level ? `레벨 ${level} 달성` : "레벨업");
      body = body || "새로운 레벨에 도달했어요.";
    } else if (notification.notification_type === "badge_unlocked") {
      title = title || `새 배지: ${toText(payload.label) || "집밥 배지"}`;
      body = body || "마이페이지에서 확인할 수 있어요.";
    } else if (notification.notification_type === "quest_completed") {
      title = title || `퀘스트 달성: ${toText(payload.title) || "집밥 루틴"}`;
      body = body || "다음 루틴도 이어가 보세요.";
    } else {
      const label = toText(payload.label) || "집밥 활동";
      const xpDelta = toNumber(payload.xp_delta);
      title = title || (xpDelta ? `${label} +${xpDelta} XP` : label);
      body = body || "성장 기록에 반영됐어요.";
    }
  }

  return {
    id: notification.id,
    type: notification.notification_type,
    tone,
    title,
    body,
    groupKey: notification.group_key ?? null,
  };
}

function dedupeById(views: ToastView[]): ToastView[] {
  const seen = new Set<string>();
  const result: ToastView[] = [];
  for (const view of views) {
    if (seen.has(view.id)) continue;
    seen.add(view.id);
    result.push(view);
  }
  return result;
}

// Use priority_unseen first, then degrade to legacy unseen. Filter silent rows
// defensively even though the server should already exclude them.
function selectToastSource(data: {
  notifications: {
    unseen?: UserGamificationNotificationData[];
    priority_unseen?: UserGamificationNotificationData[];
  };
}): UserGamificationNotificationData[] {
  const priority = data.notifications.priority_unseen;
  const source =
    Array.isArray(priority) && priority.length > 0
      ? priority
      : (data.notifications.unseen ?? []);

  return source.filter(
    (item) =>
      item.delivery_channel !== "silent" &&
      item.toast_eligible !== false &&
      !item.seen_at,
  );
}

function toneClass(tone: ToastTone) {
  if (tone === "level-up") {
    return "border-transparent bg-[var(--brand)] text-[var(--text-inverse)] shadow-[0_20px_56px_var(--overlay-30)]";
  }
  if (tone === "badge") {
    return "border-[var(--warning)] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_16px_44px_var(--overlay-20)]";
  }
  if (tone === "quest") {
    return "border-[var(--success)] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_16px_40px_var(--overlay-20)]";
  }
  return "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_16px_40px_var(--overlay-20)]";
}

function toneIcon(tone: ToastTone) {
  if (tone === "level-up") return "LV";
  if (tone === "badge") return "BD";
  if (tone === "quest") return "Q";
  return "XP";
}

export function GrowthToastStack() {
  const [views, setViews] = useState<ToastView[]>([]);
  const [visibleMax, setVisibleMax] = useState(MOBILE_VISIBLE_MAX);
  const loadingRef = useRef(false);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const apply = () =>
      setVisibleMax(mql.matches ? DESKTOP_VISIBLE_MAX : MOBILE_VISIBLE_MAX);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  const markSeen = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    // Seen failure is a soft-fail; the source action must stay successful.
    void markUserGamificationNotificationsSeen(ids).catch(() => undefined);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      setViews((current) => current.filter((view) => view.id !== id));
      // Only rendered toasts are marked seen on dismiss.
      markSeen([id]);
    },
    [markSeen],
  );

  const refresh = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const gamification = await fetchUserGamification();
      const source = selectToastSource(gamification);
      if (source.length === 0) {
        return;
      }
      // priority_unseen is already server ordered.
      const incoming = source.map(toToastView);
      setViews((current) => dedupeById([...current, ...incoming]));
    } catch {
      // Growth notifications are auxiliary to the source action.
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, refresh);
    return () => {
      window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, refresh);
    };
  }, [refresh]);

  // Only visible toasts get auto-dismiss timers; queued rows stay unseen.
  const visible = views.slice(0, visibleMax);
  const queued = views.slice(visibleMax);
  const groupedKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of views) {
      if (!view.groupKey) continue;
      counts.set(view.groupKey, (counts.get(view.groupKey) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key]) => key),
    );
  }, [views]);

  useEffect(() => {
    const timers = timersRef.current;
    const visibleIds = new Set(visible.map((view) => view.id));

    for (const [id, timer] of timers) {
      if (!visibleIds.has(id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }

    for (const view of visible) {
      if (!timers.has(view.id)) {
        const timer = setTimeout(() => dismiss(view.id), TOAST_DURATION_MS);
        timers.set(view.id, timer);
      }
    }
    return undefined;
  }, [visible, dismiss]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const dismissCollapsed = useCallback(() => {
    const queuedIds = queued.map((view) => view.id);
    if (queuedIds.length === 0) return;
    // Queued notifications become seen only when the collapsed summary is used.
    setViews((current) => current.filter((view) => !queuedIds.includes(view.id)));
    markSeen(queuedIds);
  }, [markSeen, queued]);

  if (views.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-[calc(90px+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-[360px] flex-col gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:w-[340px]"
      data-testid="growth-toast-stack"
    >
      {visible.map((view) => (
        <div
          key={view.id}
          className={[
            "pointer-events-auto rounded-[var(--radius-card)] border px-4 py-3",
            toneClass(view.tone),
          ].join(" ")}
          data-testid="growth-toast"
          data-group-key={view.groupKey ?? ""}
          data-notification-id={view.id}
          data-notification-type={view.type}
          data-tone={view.tone}
          role={view.tone === "level-up" ? "alert" : "status"}
        >
          <div className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-current/10 text-[10px] font-extrabold leading-none"
            >
              {toneIcon(view.tone)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold leading-[1.35]">
                {view.title}
              </p>
              <p className="mt-0.5 text-[12px] font-semibold leading-[1.35] opacity-90">
                {view.body}
              </p>
              {view.groupKey && groupedKeys.has(view.groupKey) ? (
                <span
                  className="mt-2 inline-flex rounded-full bg-current/10 px-2 py-0.5 text-[10px] font-extrabold"
                  data-testid="growth-toast-group-chip"
                >
                  같은 활동
                </span>
              ) : null}
            </div>
            <button
              aria-label="알림 닫기"
              className="shrink-0 rounded-full px-1.5 text-[14px] font-extrabold opacity-70"
              onClick={() => dismiss(view.id)}
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {queued.length > 0 ? (
        <button
          className="pointer-events-auto rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[12px] font-extrabold text-[var(--text-2)] shadow-[0_10px_28px_var(--overlay-20)]"
          aria-label={`${queued.length}개의 성장 알림 확인`}
          data-testid="growth-toast-collapsed"
          onClick={dismissCollapsed}
          type="button"
        >
          +{queued.length}개의 새 소식 확인
        </button>
      ) : null}
    </div>
  );
}
