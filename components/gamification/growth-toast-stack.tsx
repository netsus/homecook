"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchUserGamification,
  markUserGamificationNotificationsSeen,
} from "@/lib/api/user-gamification";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";
import achievementIconManifest from "@/public/assets/growth/achievement-icons-v3-4/manifest.json";
import type {
  UserGamificationBadgeCategory,
  UserGamificationNotificationData,
  UserGamificationNotificationType,
} from "@/types/user-gamification";

// Screen spec v1.5.16 section 19.1-b: mobile 2 visible toasts, desktop 3.
const MOBILE_VISIBLE_MAX = 2;
const DESKTOP_VISIBLE_MAX = 3;
const DESKTOP_MEDIA_QUERY = "(min-width: 768px)";
const TOAST_DURATION_MS = 3600;

type ToastTone = "grade-up" | "level-up" | "achievement" | "badge" | "quest" | "xp";
type ToastVisual =
  | {
      kind: "grade" | "achievement" | "badge" | "quest" | "xp";
      src: string;
    }
  | {
      kind: "level";
      label: string;
    };

interface ToastView {
  id: string;
  type: UserGamificationNotificationType;
  tone: ToastTone;
  visual: ToastVisual;
  title: string;
  body: string;
  groupKey: string | null;
}

const TONE_BY_TYPE: Omit<Record<UserGamificationNotificationType, ToastTone>, "level_up"> = {
  achievement_unlocked: "achievement",
  badge_unlocked: "badge",
  quest_completed: "quest",
  xp_awarded: "xp",
};

const LEGACY_GRADE_KEY_ALIASES: Record<string, string> = {
  homecook_artisan: "gold",
  homecook_master: "titanium",
  homecook_runner: "wood",
  kitchen_explorer: "steel",
  sprout_homecook: "clay",
  table_curator: "diamond",
  table_maker: "silver",
};

const GRADE_KEYS = new Set([
  "clay",
  "wood",
  "steel",
  "silver",
  "gold",
  "diamond",
  "titanium",
]);

const ACHIEVEMENT_ICON_SRC_BY_KEY = new Map(
  (
    achievementIconManifest as Array<{
      achievement_key: string;
      src: string;
    }>
  ).map((icon) => [icon.achievement_key, icon.src]),
);

const XP_ICON_BY_EVENT_TYPE: Record<string, string> = {
  cooking_completed: "/assets/growth/achievement-icons-v3-4/cooking_completed_3.png",
  custom_book_created: "/assets/growth/achievement-icons-v3-4/tutorial_recipebook_created.png",
  planner_registered: "/assets/growth/achievement-icons-v3-4/planner_registered_3.png",
  recipe_saved: "/assets/growth/achievement-icons-v3-4/recipe_saved_5.png",
  shopping_completed: "/assets/growth/achievement-icons-v3-4/shopping_completed_3.png",
};

const XP_ICON_BY_CATEGORY: Record<UserGamificationBadgeCategory, string> = {
  cooking: "/assets/growth/achievement-icons-v3-4/cooking_completed_3.png",
  leftovers: "/assets/growth/achievement-icons-v3-4/leftover_eaten_3.png",
  pantry: "/assets/growth/achievement-icons-v3-4/pantry_distinct_10.png",
  planner: "/assets/growth/achievement-icons-v3-4/planner_registered_3.png",
  recipe: "/assets/growth/achievement-icons-v3-4/recipe_saved_5.png",
  recipebook: "/assets/growth/achievement-icons-v3-4/tutorial_recipebook_created.png",
  shopping: "/assets/growth/achievement-icons-v3-4/shopping_completed_3.png",
  tutorial: "/assets/growth/achievement-icons-v3-4/tutorial_complete.png",
};

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeGradeKey(gradeKey: string) {
  const normalized = LEGACY_GRADE_KEY_ALIASES[gradeKey] ?? gradeKey;
  return GRADE_KEYS.has(normalized) ? normalized : "clay";
}

function isGradeUpgrade(payload: Record<string, unknown>) {
  const grade = toRecord(payload.grade);
  const previousGrade = toRecord(payload.previous_grade);
  const gradeKey = toText(grade.grade_key);
  const previousGradeKey = toText(previousGrade.grade_key);

  return Boolean(gradeKey && (!previousGradeKey || gradeKey !== previousGradeKey));
}

function gradeIconSrc(payload: Record<string, unknown>) {
  const grade = toRecord(payload.grade);
  const explicitIcon = toText(grade.icon_url);
  if (explicitIcon) return explicitIcon;

  const gradeKey = normalizeGradeKey(toText(grade.grade_key));
  return `/assets/growth/grades/${gradeKey}-spoon-badge.png`;
}

function getLevelLabel(payload: Record<string, unknown>) {
  const level = toNumber(payload.current_level) || toNumber(payload.level);
  return level ? `Lv.${level}` : "Lv";
}

function achievementIconSrc(...keys: string[]) {
  for (const key of keys) {
    if (!key) continue;
    const src = ACHIEVEMENT_ICON_SRC_BY_KEY.get(key);
    if (src) return src;
  }
  return "";
}

function getToastTone(
  notificationType: UserGamificationNotificationType,
  payload: Record<string, unknown>,
): ToastTone {
  if (notificationType === "level_up") {
    return isGradeUpgrade(payload) ? "grade-up" : "level-up";
  }
  return TONE_BY_TYPE[notificationType] ?? "xp";
}

function getToastVisual(
  notification: UserGamificationNotificationData,
  payload: Record<string, unknown>,
  tone: ToastTone,
): ToastVisual {
  if (tone === "grade-up") {
    return { kind: "grade", src: gradeIconSrc(payload) };
  }
  if (tone === "level-up") {
    return { kind: "level", label: getLevelLabel(payload) };
  }
  if (tone === "achievement") {
    const src =
      achievementIconSrc(
        toText(payload.achievement_key),
        toText(payload.badge_key),
      ) || XP_ICON_BY_CATEGORY[notification.category];
    return { kind: "achievement", src };
  }
  if (tone === "badge") {
    const src =
      achievementIconSrc(toText(payload.badge_key), toText(payload.achievement_key)) ||
      XP_ICON_BY_CATEGORY[notification.category];
    return { kind: "badge", src };
  }
  if (tone === "quest") {
    const src =
      achievementIconSrc(toText(payload.quest_key), toText(payload.achievement_key)) ||
      XP_ICON_BY_CATEGORY.tutorial;
    return { kind: "quest", src };
  }

  const src =
    XP_ICON_BY_EVENT_TYPE[toText(payload.event_type)] ||
    XP_ICON_BY_CATEGORY[notification.category];
  return { kind: "xp", src };
}

// Prefer server title/body. Fallback text is only for incomplete fixture rows.
// The client does not recalculate priority, so input order is preserved.
function toToastView(
  notification: UserGamificationNotificationData,
): ToastView {
  const payload = notification.payload ?? {};
  const tone = getToastTone(notification.notification_type, payload);
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
    } else if (
      notification.notification_type === "badge_unlocked" ||
      notification.notification_type === "achievement_unlocked"
    ) {
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
    visual: getToastVisual(notification, payload, tone),
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
  if (tone === "grade-up") {
    return "growth-toast-card-grade-up border-[var(--growth-toast-grade-border)] [background:var(--growth-toast-grade-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-grade-shadow)]";
  }
  if (tone === "level-up") {
    return "growth-toast-card-level-up border-[var(--growth-toast-level-border)] [background:var(--growth-toast-level-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-level-shadow)]";
  }
  if (tone === "achievement") {
    return "growth-toast-card-achievement border-[var(--growth-toast-achievement-border)] [background:var(--growth-toast-achievement-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-achievement-shadow)]";
  }
  if (tone === "badge") {
    return "growth-toast-card-badge border-[var(--growth-toast-badge-border)] [background:var(--growth-toast-badge-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-badge-shadow)]";
  }
  if (tone === "quest") {
    return "growth-toast-card-quest border-[var(--growth-toast-quest-border)] [background:var(--growth-toast-quest-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-quest-shadow)]";
  }
  return "growth-toast-card-xp border-[var(--growth-toast-xp-border)] [background:var(--growth-toast-xp-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-xp-shadow)]";
}

function visualClass(tone: ToastTone) {
  if (tone === "grade-up") {
    return "border-[var(--growth-toast-grade-icon-border)] bg-[var(--growth-toast-grade-icon-bg)] text-[var(--growth-toast-grade-icon-text)]";
  }
  if (tone === "level-up") {
    return "border-[var(--growth-toast-level-icon-border)] bg-[var(--growth-toast-level-icon-bg)] text-[var(--growth-toast-level-icon-text)]";
  }
  if (tone === "achievement") {
    return "border-[var(--growth-toast-achievement-icon-border)] bg-[var(--growth-toast-achievement-icon-bg)] text-[var(--growth-toast-achievement-icon-text)]";
  }
  if (tone === "badge") {
    return "border-[var(--growth-toast-badge-icon-border)] bg-[var(--growth-toast-badge-icon-bg)] text-[var(--growth-toast-badge-icon-text)]";
  }
  if (tone === "quest") {
    return "border-[var(--growth-toast-quest-icon-border)] bg-[var(--growth-toast-quest-icon-bg)] text-[var(--growth-toast-quest-icon-text)]";
  }
  return "border-[var(--growth-toast-xp-icon-border)] bg-[var(--growth-toast-xp-icon-bg)] text-[var(--growth-toast-xp-icon-text)]";
}

function visualImageClass(tone: ToastTone) {
  if (tone === "grade-up") return "scale-[1.18]";
  if (tone === "achievement" || tone === "badge") return "scale-[1.08]";
  if (tone === "quest") return "scale-[1.02]";
  return "scale-[0.96]";
}

function rankClass(index: number) {
  if (index === 0) return "bg-[var(--growth-toast-rank-1-bg)] text-[var(--text-inverse)]";
  if (index === 1) return "bg-[var(--growth-toast-rank-2-bg)] text-[var(--text-inverse)]";
  if (index === 2) return "bg-[var(--brand)] text-[var(--text-inverse)]";
  return "bg-[var(--growth-toast-rank-muted-bg)] text-[var(--text-inverse)]";
}

function GrowthToastVisual({ tone, visual }: { tone: ToastTone; visual: ToastVisual }) {
  return (
    <span
      aria-hidden="true"
      className={[
        "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border shadow-[var(--growth-toast-icon-shadow)]",
        visualClass(tone),
      ].join(" ")}
      data-testid="growth-toast-visual"
      data-visual-kind={visual.kind}
    >
      {visual.kind === "level" ? (
        <>
          <span className="absolute inset-[5px] rounded-full border border-[var(--surface-alpha-70)] bg-[var(--surface-alpha-55)]" />
          <span
            className="relative text-[12px] font-black leading-none"
            data-testid="growth-toast-level-medal"
          >
            {visual.label}
          </span>
        </>
      ) : (
        <Image
          alt=""
          className={[
            "h-full w-full object-contain drop-shadow-[var(--growth-toast-visual-drop-shadow)]",
            visualImageClass(tone),
          ].join(" ")}
          data-testid="growth-toast-visual-icon"
          height={44}
          src={visual.src}
          unoptimized
          width={44}
        />
      )}
    </span>
  );
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
      {visible.map((view, index) => (
        <div
          key={view.id}
          className={[
            "pointer-events-auto relative rounded-[var(--radius-card)] border px-3 py-3 pl-4",
            toneClass(view.tone),
          ].join(" ")}
          data-testid="growth-toast"
          data-group-key={view.groupKey ?? ""}
          data-notification-id={view.id}
          data-notification-type={view.type}
          data-tone={view.tone}
          role={view.tone === "level-up" || view.tone === "grade-up" ? "alert" : "status"}
        >
          <span
            aria-hidden="true"
            className={[
              "absolute -left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-extrabold leading-none shadow-[var(--growth-toast-rank-shadow)]",
              rankClass(index),
            ].join(" ")}
            data-testid="growth-toast-priority-rank"
          >
            {index + 1}
          </span>
          <div className="flex items-center gap-3">
            <GrowthToastVisual tone={view.tone} visual={view.visual} />
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
              className="self-start shrink-0 rounded-full px-1.5 text-[14px] font-extrabold text-[var(--text-2)] opacity-70"
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
