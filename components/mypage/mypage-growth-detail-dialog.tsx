"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import { fetchUserGamificationArchive } from "@/lib/api/user-gamification";
import {
  compactGrowthNotificationsForDisplay,
  isVisibleGrowthNotification,
} from "@/lib/gamification-notifications";
import { createTutorialGuideNotification } from "@/lib/gamification-tutorial-guide";
import { USER_PROGRESS_XP_GUIDE_ITEMS } from "@/lib/user-progress-xp-policy";
import achievementIconManifest from "@/public/assets/growth/achievement-icons-v3-4/manifest.json";
import type {
  UserGamificationBadgeCategory,
  UserGamificationAchievementMilestoneData,
  UserGamificationData,
  UserGamificationGradeData,
  UserGamificationNotificationData,
} from "@/types/user-gamification";

export type MypageGrowthPanel =
  | "grade"
  | "achievement"
  | "tutorial"
  | "notifications"
  | "xpGuide";

type AchievementGroupKey = "tutorial" | "recipe" | "routine" | "storage";
type NotificationFilter = "all" | "growth" | "achievement" | "system";
type NotificationTone = "grade-up" | "level-up" | "achievement" | "badge" | "xp";

interface MypageGrowthDetailDialogProps {
  data: UserGamificationData | null;
  onClose: () => void;
  panel: MypageGrowthPanel;
}

const GRADE_BANDS: UserGamificationGradeData[] = [
  {
    grade_key: "clay",
    label: "흙",
    level_min: 1,
    level_max: 3,
    icon_url: "/assets/growth/grades/clay-spoon-badge.png",
    character_url: "/assets/growth/grades/clay-spoon.png",
  },
  {
    grade_key: "wood",
    label: "나무",
    level_min: 4,
    level_max: 7,
    icon_url: "/assets/growth/grades/wood-spoon-badge.png",
    character_url: "/assets/growth/grades/wood-spoon.png",
  },
  {
    grade_key: "steel",
    label: "강철",
    level_min: 8,
    level_max: 12,
    icon_url: "/assets/growth/grades/steel-spoon-badge.png",
    character_url: "/assets/growth/grades/steel-spoon.png",
  },
  {
    grade_key: "silver",
    label: "은",
    level_min: 13,
    level_max: 20,
    icon_url: "/assets/growth/grades/silver-spoon-badge.png",
    character_url: "/assets/growth/grades/silver-spoon.png",
  },
  {
    grade_key: "gold",
    label: "금",
    level_min: 21,
    level_max: 34,
    icon_url: "/assets/growth/grades/gold-spoon-badge.png",
    character_url: "/assets/growth/grades/gold-spoon.png",
  },
  {
    grade_key: "diamond",
    label: "다이아",
    level_min: 35,
    level_max: 49,
    icon_url: "/assets/growth/grades/diamond-spoon-badge.png",
    character_url: "/assets/growth/grades/diamond-spoon.png",
  },
  {
    grade_key: "titanium",
    label: "티타늄",
    level_min: 50,
    level_max: null,
    icon_url: "/assets/growth/grades/titanium-spoon-badge.png",
    character_url: "/assets/growth/grades/titanium-spoon.png",
  },
];

const LEGACY_GRADE_KEY_ALIASES: Record<string, string> = {
  homecook_artisan: "gold",
  homecook_master: "titanium",
  homecook_runner: "wood",
  kitchen_explorer: "steel",
  sprout_homecook: "clay",
  table_curator: "diamond",
  table_maker: "silver",
};

const GRADE_KEYS = new Set(GRADE_BANDS.map((grade) => grade.grade_key));

const CATEGORY_ORDER = [
  "tutorial",
  "recipe",
  "planner",
  "shopping",
  "cooking",
  "pantry",
  "leftovers",
  "recipebook",
] as const;

const FILTERS: Array<{ key: NotificationFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "growth", label: "성장" },
  { key: "achievement", label: "업적" },
  { key: "system", label: "시스템" },
];

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
  leftover_eaten: "/assets/growth/achievement-icons-v3-4/leftover_eaten_3.png",
  planner_registered: "/assets/growth/achievement-icons-v3-4/planner_registered_3.png",
  recipe_saved: "/assets/growth/achievement-icons-v3-4/recipe_saved_5.png",
  shopping_completed: "/assets/growth/achievement-icons-v3-4/shopping_completed_3.png",
};

const ICON_BY_CATEGORY: Record<UserGamificationBadgeCategory, string> = {
  cooking: "/assets/growth/achievement-icons-v3-4/cooking_completed_3.png",
  leftovers: "/assets/growth/achievement-icons-v3-4/leftover_eaten_3.png",
  pantry: "/assets/growth/achievement-icons-v3-4/pantry_distinct_10.png",
  planner: "/assets/growth/achievement-icons-v3-4/planner_registered_3.png",
  recipe: "/assets/growth/achievement-icons-v3-4/recipe_saved_5.png",
  recipebook: "/assets/growth/achievement-icons-v3-4/tutorial_recipebook_created.png",
  shopping: "/assets/growth/achievement-icons-v3-4/shopping_completed_3.png",
  tutorial: "/assets/growth/achievement-icons-v3-4/tutorial_complete.png",
};

const ACHIEVEMENT_GROUPS: Array<{
  categoryKeys: UserGamificationBadgeCategory[];
  key: AchievementGroupKey;
  label: string;
}> = [
  { key: "tutorial", label: "튜토리얼", categoryKeys: ["tutorial"] },
  { key: "recipe", label: "레시피", categoryKeys: ["recipe", "recipebook"] },
  { key: "routine", label: "식단·장보기·요리", categoryKeys: ["planner", "shopping", "cooking"] },
  { key: "storage", label: "보관·정리", categoryKeys: ["pantry", "leftovers"] },
];

const TRACK_LABELS: Record<string, string> = {
  cooking: "요리",
  cooking_completed: "요리",
  leftover_eaten: "남은요리 정리",
  leftovers: "남은요리 정리",
  pantry: "팬트리 재료",
  pantry_distinct: "팬트리 재료",
  planner: "플래너",
  planner_registered: "플래너",
  recipe: "레시피",
  recipe_registered: "레시피 등록",
  recipe_saved: "레시피 보관",
  recipebook: "레시피북",
  shopping: "장보기",
  shopping_completed: "장보기",
  tutorial: "튜토리얼",
  tutorial_complete: "튜토리얼",
};

const TRACK_TEST_ID_ALIASES: Record<string, string> = {
  cooking_completed: "cooking",
  leftover_eaten: "leftovers",
  pantry_distinct: "pantry",
  planner_registered: "planner",
  recipe_registered: "recipe-registered",
  recipe_saved: "recipe-saved",
  shopping_completed: "shopping",
  tutorial_complete: "tutorial",
};

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");

function normalizeGradeKey(gradeKey: string | null | undefined) {
  if (!gradeKey) return "clay";
  const normalized = LEGACY_GRADE_KEY_ALIASES[gradeKey] ?? gradeKey;
  return GRADE_KEYS.has(normalized) ? normalized : "clay";
}

function formatGradeRange(grade: UserGamificationGradeData) {
  return grade.level_max === null
    ? `Lv.${grade.level_min}+`
    : `Lv.${grade.level_min}-${grade.level_max}`;
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  const date = value.slice(0, 10);
  const time = value.length >= 16 ? value.slice(11, 16) : "";
  return time ? `${date} ${time}` : date;
}

function formatXpValue(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function progressPercent(current: number, target: number, status: string) {
  if (status === "earned") return 100;
  if (target <= 0) return 0;
  return clampPercent((Math.max(0, current) / target) * 100);
}

function statusLabel(status: UserGamificationAchievementMilestoneData["status"]) {
  if (status === "earned") return "획득";
  if (status === "active") return "진행 중";
  return "잠김";
}

function isTutorialGuideNotification(item: UserGamificationNotificationData) {
  return item.payload.tutorial_guide === true;
}

function isTutorialSystemNotification(item: UserGamificationNotificationData) {
  if (isTutorialGuideNotification(item)) return true;

  const achievementKey = typeof item.payload.achievement_key === "string"
    ? item.payload.achievement_key
    : "";
  const questKey = typeof item.payload.quest_key === "string"
    ? item.payload.quest_key
    : "";

  return achievementKey.startsWith("tutorial_") || questKey.startsWith("first_");
}

function isGrowthOrAchievementNotification(item: UserGamificationNotificationData) {
  return item.notification_type === "level_up" ||
    item.notification_type === "xp_awarded" ||
    item.notification_type === "achievement_unlocked" ||
    item.notification_type === "badge_unlocked";
}

function notificationToneLabel(item: UserGamificationNotificationData) {
  if (isTutorialSystemNotification(item)) return "시스템";
  if (item.notification_type === "level_up") return "레벨업";
  if (item.notification_type === "achievement_unlocked") return "업적";
  if (item.notification_type === "badge_unlocked") return "배지";
  return "XP";
}

function matchesNotificationFilter(
  item: UserGamificationNotificationData,
  filter: NotificationFilter,
) {
  if (filter === "all") return true;
  if (filter === "system") {
    return isTutorialSystemNotification(item) ||
      !isGrowthOrAchievementNotification(item);
  }
  if (filter === "achievement") {
    return item.notification_type === "achievement_unlocked" ||
      item.notification_type === "badge_unlocked";
  }
  if (filter === "growth") {
    return item.notification_type === "level_up" ||
      item.notification_type === "xp_awarded";
  }
  return false;
}

function buildNotificationPanelItems(
  data: UserGamificationData | null,
  archiveItems: UserGamificationNotificationData[],
) {
  const tutorialGuide = createTutorialGuideNotification(data);
  const visibleItems = archiveItems.filter(isVisibleGrowthNotification);
  const items = tutorialGuide
    ? [tutorialGuide, ...visibleItems.filter((item) => item.id !== tutorialGuide.id)]
    : visibleItems;

  return compactGrowthNotificationsForDisplay(items);
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isGradeUpgrade(payload: Record<string, unknown>) {
  return payload.grade_upgrade === true;
}

function notificationGradeIconSrc(payload: Record<string, unknown>) {
  const grade = toRecord(payload.grade);
  const explicitIcon = toText(grade.icon_url);
  if (explicitIcon) return explicitIcon;

  const gradeKey = normalizeGradeKey(toText(grade.grade_key));
  return `/assets/growth/grades/${gradeKey}-spoon-badge.png`;
}

function notificationTone(item: UserGamificationNotificationData): NotificationTone {
  if (item.notification_type === "level_up") {
    return isGradeUpgrade(item.payload) ? "grade-up" : "level-up";
  }
  if (item.notification_type === "achievement_unlocked") return "achievement";
  if (item.notification_type === "badge_unlocked") return "badge";
  return "xp";
}

function notificationToneClass(tone: NotificationTone) {
  if (tone === "grade-up") {
    return "border-[var(--growth-toast-grade-border)] [background:var(--growth-toast-grade-bg)] shadow-[var(--growth-toast-grade-shadow)]";
  }
  if (tone === "level-up") {
    return "border-[var(--growth-toast-level-border)] [background:var(--growth-toast-level-bg)] shadow-[var(--growth-toast-level-shadow)]";
  }
  if (tone === "achievement") {
    return "border-[var(--growth-toast-achievement-border)] [background:var(--growth-toast-achievement-bg)] shadow-[var(--growth-toast-achievement-shadow)]";
  }
  if (tone === "badge") {
    return "border-[var(--growth-toast-badge-border)] [background:var(--growth-toast-badge-bg)] shadow-[var(--growth-toast-badge-shadow)]";
  }
  return "border-[var(--growth-toast-xp-border)] [background:var(--growth-toast-xp-bg)] shadow-[var(--growth-toast-xp-shadow)]";
}

function notificationVisualClass(tone: NotificationTone) {
  if (tone === "grade-up") {
    return "border-[var(--growth-toast-grade-icon-border)] bg-[var(--growth-toast-grade-icon-bg)]";
  }
  if (tone === "level-up") {
    return "border-[var(--growth-toast-level-icon-border)] bg-[var(--growth-toast-level-icon-bg)]";
  }
  if (tone === "achievement") {
    return "border-[var(--growth-toast-achievement-icon-border)] bg-[var(--growth-toast-achievement-icon-bg)]";
  }
  if (tone === "badge") {
    return "border-[var(--growth-toast-badge-icon-border)] bg-[var(--growth-toast-badge-icon-bg)]";
  }
  return "border-[var(--growth-toast-xp-icon-border)] bg-[var(--growth-toast-xp-icon-bg)]";
}

function notificationIconSrc(item: UserGamificationNotificationData) {
  const payload = item.payload;
  if (item.notification_type === "level_up" && isGradeUpgrade(payload)) {
    return notificationGradeIconSrc(payload);
  }

  const achievementSrc =
    ACHIEVEMENT_ICON_SRC_BY_KEY.get(toText(payload.achievement_key)) ||
    ACHIEVEMENT_ICON_SRC_BY_KEY.get(toText(payload.badge_key));

  if (achievementSrc) return achievementSrc;
  if (item.notification_type === "xp_awarded") {
    return XP_ICON_BY_EVENT_TYPE[toText(payload.event_type)] || ICON_BY_CATEGORY[item.category];
  }
  return ICON_BY_CATEGORY[item.category];
}

function NotificationVisual({ item }: { item: UserGamificationNotificationData }) {
  const tone = notificationTone(item);
  const src = notificationIconSrc(item);

  return (
    <span
      aria-hidden="true"
      className={[
        "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] border shadow-[var(--growth-toast-icon-shadow)]",
        notificationVisualClass(tone),
      ].join(" ")}
      data-testid={`mypage-notification-visual-${item.id}`}
      data-visual-kind={tone === "grade-up" ? "grade" : tone}
    >
      <Image
        alt=""
        className="h-full w-full object-contain drop-shadow-[var(--growth-toast-visual-drop-shadow)]"
        height={40}
        src={src}
        unoptimized
        width={40}
      />
    </span>
  );
}

function sortedCategories(data: UserGamificationData | null) {
  const categories = data?.achievement_album?.categories ?? [];
  return [...categories].sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a.category_key);
    const bIndex = CATEGORY_ORDER.indexOf(b.category_key);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

function GradeAsset({
  grade,
  size = "md",
}: {
  grade: UserGamificationGradeData;
  size?: "sm" | "md" | "lg";
}) {
  const pixelSize = size === "lg" ? 124 : size === "md" ? 82 : 60;
  const imageClassName = [
    "h-full w-full object-contain",
    size === "lg" ? "scale-[1.24]" : "scale-[1.14]",
  ]
    .filter(Boolean)
    .join(" ");
  const iconUrl = grade.icon_url ?? `/assets/growth/grades/${grade.grade_key}-spoon-badge.png`;

  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--line)]"
      data-testid={`grade-panel-grade-asset-${grade.grade_key}`}
      style={{ height: pixelSize, width: pixelSize }}
    >
      <Image
        alt=""
        className={imageClassName}
        data-testid={`grade-panel-grade-image-${grade.grade_key}`}
        height={pixelSize}
        loading="eager"
        sizes={`${pixelSize}px`}
        src={iconUrl}
        unoptimized
        width={pixelSize}
      />
    </span>
  );
}

function PanelShell({
  children,
  onClose,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const titleId = `growth-detail-${title.replace(/\s+/g, "-")}`;

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Tab") {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => element.offsetParent !== null);

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[420] flex items-end justify-center overflow-y-auto overscroll-contain bg-[var(--overlay-40)] px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-8 md:items-center md:py-8"
      data-testid="mypage-growth-detail-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className={[
          "flex max-h-[min(760px,calc(100dvh-40px))] w-full flex-col overflow-hidden overflow-x-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[0_20px_60px_var(--overlay-30)]",
          wide ? "max-w-[860px]" : "max-w-[520px]",
        ].join(" ")}
        data-testid="mypage-growth-detail-panel"
        ref={dialogRef}
        role="dialog"
      >
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-4 md:px-5 md:py-5"
          data-testid="mypage-growth-detail-header"
        >
          <h2
            className="text-[17px] font-extrabold leading-[1.3] text-[var(--foreground)]"
            id={titleId}
          >
            {title}
          </h2>
          <button
            aria-label="닫기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[18px] font-extrabold text-[var(--text-2)]"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-4 md:px-5 md:pb-5"
          data-testid="mypage-growth-detail-content"
        >
          {children}
        </div>
      </section>
    </div>
  );
}

function GradePanel({ data }: { data: UserGamificationData | null }) {
  const currentGradeKey = normalizeGradeKey(data?.grade.grade_key);

  return (
    <div className="mt-4 grid gap-2">
      {GRADE_BANDS.map((grade) => {
        const isCurrent = grade.grade_key === currentGradeKey;

        return (
          <div
            className={[
              "flex min-h-[112px] items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2",
              isCurrent
                ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--line)] bg-[var(--surface-fill)]",
            ].join(" ")}
            data-testid="mypage-grade-row"
            key={grade.grade_key}
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-4"
              data-testid={`mypage-grade-row-${grade.grade_key}`}
            >
              <GradeAsset grade={grade} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold leading-[1.25] text-[var(--foreground)]">
                  {grade.label}
                </p>
                <p className="mt-1 text-[11px] font-semibold leading-[1.3] text-[var(--text-2)]">
                  {formatGradeRange(grade)}
                </p>
              </div>
            </div>
            {isCurrent ? (
              <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-extrabold text-[var(--brand)]">
                현재 등급
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function CategoryTabs({
  groups,
  selected,
  setSelected,
}: {
  groups: AchievementGroupData[];
  selected: AchievementGroupKey;
  setSelected: (value: AchievementGroupKey) => void;
}) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
      {groups.map((group) => (
        <button
          aria-selected={selected === group.key}
          className={[
            "h-8 shrink-0 rounded-full px-3 text-[12px] font-extrabold",
            selected === group.key
              ? "bg-[var(--brand)] text-[var(--text-inverse)]"
              : "bg-[var(--surface-fill)] text-[var(--text-2)]",
          ].join(" ")}
          key={group.key}
          onClick={() => setSelected(group.key)}
          role="tab"
          type="button"
        >
          {group.label}
        </button>
      ))}
    </div>
  );
}

interface AchievementGroupData {
  earnedCount: number;
  key: AchievementGroupKey;
  label: string;
  milestones: UserGamificationAchievementMilestoneData[];
  totalCount: number;
}

interface AchievementTrackData {
  milestones: UserGamificationAchievementMilestoneData[];
  trackKey: string;
}

function buildAchievementGroups(data: UserGamificationData | null): AchievementGroupData[] {
  const categories = sortedCategories(data);

  return ACHIEVEMENT_GROUPS.map((group) => {
    const groupCategories = categories.filter((category) =>
      group.categoryKeys.includes(category.category_key),
    );
    const milestones = groupCategories.flatMap((category) => category.milestones);

    return {
      earnedCount: milestones.filter((milestone) => milestone.status === "earned").length,
      key: group.key,
      label: group.label,
      milestones,
      totalCount: milestones.length,
    };
  }).filter((group) => group.totalCount > 0);
}

function buildAchievementTracks(
  milestones: UserGamificationAchievementMilestoneData[],
): AchievementTrackData[] {
  const tracks = new Map<string, UserGamificationAchievementMilestoneData[]>();

  milestones.forEach((milestone) => {
    const trackKey = milestone.badge.category === "tutorial"
      ? "tutorial"
      : milestone.track_key ?? milestone.badge.category;
    const trackMilestones = tracks.get(trackKey) ?? [];
    trackMilestones.push(milestone);
    tracks.set(trackKey, trackMilestones);
  });

  return Array.from(tracks.entries()).map(([trackKey, trackMilestones]) => ({
    trackKey,
    milestones: trackKey === "tutorial"
      ? trackMilestones
      : [...trackMilestones].sort((a, b) => a.target - b.target),
  }));
}

function getTrackLabel(trackKey: string) {
  return TRACK_LABELS[trackKey] ?? trackKey;
}

function getTrackTestId(trackKey: string) {
  return (TRACK_TEST_ID_ALIASES[trackKey] ?? trackKey)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .toLowerCase();
}

function formatCount(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatMilestoneLabel(
  milestone: UserGamificationAchievementMilestoneData,
  trackKey: string,
) {
  if (milestone.achievement_key === "tutorial_complete") {
    return milestone.title;
  }

  if (trackKey === "tutorial" || trackKey === "tutorial_complete") {
    return milestone.title.replace(/^튜토리얼\s*/, "");
  }

  return `${formatCount(milestone.target)}회`;
}

function AchievementTrackCard({ track }: { track: AchievementTrackData }) {
  const earnedCount = track.milestones.filter((milestone) => milestone.status === "earned").length;
  const latestEarnedKey = track.milestones.reduce<string | null>((latestKey, milestone) => {
    if (milestone.status !== "earned" || !milestone.earned_at) {
      return latestKey;
    }
    if (!latestKey) {
      return milestone.achievement_key;
    }
    const latest = track.milestones.find((item) => item.achievement_key === latestKey);
    const latestTime = latest?.earned_at ? Date.parse(latest.earned_at) : Number.NEGATIVE_INFINITY;
    const currentTime = Date.parse(milestone.earned_at);
    return currentTime >= latestTime ? milestone.achievement_key : latestKey;
  }, null);
  const nextMilestone =
    track.milestones.find((milestone) => milestone.status === "active") ??
    track.milestones.find((milestone) => milestone.status === "locked") ??
    track.milestones[track.milestones.length - 1];
  const lockedHint = track.milestones.find(
    (milestone) => milestone.status === "locked" && milestone.locked_hint,
  )?.locked_hint;
  const isTutorialTrack = track.trackKey === "tutorial";
  const percent = isTutorialTrack
    ? progressPercent(earnedCount, track.milestones.length, earnedCount >= track.milestones.length ? "earned" : "active")
    : nextMilestone
      ? progressPercent(nextMilestone.current, nextMilestone.target, nextMilestone.status)
      : 0;
  const hint = nextMilestone
    ? nextMilestone.status === "locked" && nextMilestone.locked_hint
      ? nextMilestone.locked_hint
      : nextMilestone.description
    : "";

  return (
    <article
      className="min-w-0 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-3"
      data-testid={`achievement-track-${getTrackTestId(track.trackKey)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold leading-[1.25] text-[var(--foreground)]">
            {getTrackLabel(track.trackKey)}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]">
            {lockedHint && lockedHint !== hint ? `${hint} ${lockedHint}` : hint}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2 py-1 text-[11px] font-extrabold text-[var(--text-2)]">
          획득 {earnedCount} / {track.milestones.length}
        </span>
      </div>

      <ul
        className="mt-4 flex max-w-full gap-3 overflow-x-auto overscroll-x-contain pb-1 pt-2"
        data-testid={`achievement-badge-row-${getTrackTestId(track.trackKey)}`}
      >
        {track.milestones.map((milestone, index) => {
          const earned = milestone.status === "earned";

          return (
            <li
              className="grid w-[86px] shrink-0 justify-items-center gap-1.5 text-center"
              key={milestone.achievement_key}
            >
              <span className="relative inline-flex">
                <GrowthBadgeIcon
                  badgeKey={milestone.badge.badge_key}
                  earned={earned}
                  isNew={earned && milestone.achievement_key === latestEarnedKey}
                  shapeKey={milestone.badge.shape_key}
                  size="lg"
                  tier={index}
                />
                {!earned ? (
                  <span
                    className="absolute inset-0 z-[2] flex items-center justify-center rounded-full bg-[var(--surface-alpha-46)] text-[var(--text-2)]"
                    data-testid="growth-badge-lock"
                  >
                    <svg
                      aria-hidden="true"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <rect
                        height="9"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="2"
                        width="12"
                        x="6"
                        y="11"
                      />
                      <path
                        d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="2"
                      />
                    </svg>
                  </span>
                ) : null}
              </span>
              <span className="w-full truncate text-[10px] font-extrabold leading-[1.2] text-[var(--text-2)]">
                {formatMilestoneLabel(milestone, track.trackKey)}
              </span>
              <span className="text-[10px] font-bold leading-[1.2] text-[var(--text-3)]">
                {statusLabel(milestone.status)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <div
          aria-label={`${getTrackLabel(track.trackKey)} 진행률 ${percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[var(--brand)]"
            data-testid={`achievement-track-progress-fill-${getTrackTestId(track.trackKey)}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {isTutorialTrack ? (
          <span className="shrink-0 text-[11px] font-extrabold text-[var(--text-2)]">
            {formatCount(earnedCount)} / {formatCount(track.milestones.length)}
          </span>
        ) : nextMilestone ? (
          <span className="shrink-0 text-[11px] font-extrabold text-[var(--text-2)]">
            {formatCount(nextMilestone.current)} / {formatCount(nextMilestone.target)}
          </span>
        ) : null}
      </div>
    </article>
  );
}

function AchievementTrackGrid({ tracks }: { tracks: AchievementTrackData[] }) {
  if (tracks.length === 0) {
    return (
      <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-4 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]">
        아직 표시할 업적이 없어요. 첫 저장, 첫 장보기, 첫 요리부터 시작해 보세요.
      </p>
    );
  }

  return (
    <div className="mt-4 grid gap-3" data-testid="achievement-track-grid">
      {tracks.map((track) => (
        <AchievementTrackCard
          key={track.trackKey}
          track={track}
        />
      ))}
    </div>
  );
}

function AchievementPanel({ data }: { data: UserGamificationData | null }) {
  const groups = useMemo(() => buildAchievementGroups(data), [data]);
  const [selected, setSelected] = useState<AchievementGroupKey>("tutorial");
  const summary = data?.achievement_album?.summary;
  const selectedGroup = groups.find((group) => group.key === selected) ?? groups[0];
  const tracks = selectedGroup ? buildAchievementTracks(selectedGroup.milestones) : [];

  return (
    <>
      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-2">
        <p className="text-[12px] font-semibold text-[var(--text-2)]">획득한 스탬프</p>
        <p className="mt-1 text-[20px] font-extrabold leading-[1.2] text-[var(--foreground)]">
          {summary ? `${summary.earned_count} / ${summary.total_count}` : "0 / 0"}
        </p>
      </div>
      <CategoryTabs groups={groups} selected={selectedGroup?.key ?? selected} setSelected={setSelected} />
      <AchievementTrackGrid tracks={tracks} />
    </>
  );
}

function TutorialPanel({ data }: { data: UserGamificationData | null }) {
  const tutorialCategory = data?.achievement_album?.categories.find(
    (category) => category.category_key === "tutorial",
  );
  const milestones = tutorialCategory?.milestones ?? [];
  const completed = tutorialCategory?.earned_count ?? data?.tutorial.completed_count ?? 0;
  const total = tutorialCategory?.total_count ?? data?.tutorial.total_count ?? 0;

  return (
    <>
      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-2">
        <p className="text-[12px] font-semibold text-[var(--text-2)]">튜토리얼 진행</p>
        <p className="mt-1 text-[20px] font-extrabold leading-[1.2] text-[var(--foreground)]">
          {completed} / {total}
        </p>
      </div>
      <AchievementTrackGrid tracks={buildAchievementTracks(milestones)} />
    </>
  );
}

function XpGuidePanel() {
  return (
    <>
      <div
        className="mt-3 rounded-[var(--radius-md)] bg-[var(--brand-soft)] px-3 py-3"
        data-testid="mypage-xp-guide-panel"
      >
        <p className="text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)]">
          경험치는 이렇게 쌓여요
        </p>
        <p className="mt-1 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]">
          레시피를 저장하고, 식단을 계획하고, 장보기와 요리를 마치면 자연스럽게 성장해요.
        </p>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {USER_PROGRESS_XP_GUIDE_ITEMS.map((item) => (
          <li
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] p-3"
            data-testid={`mypage-xp-guide-item-${item.eventType}`}
            key={item.eventType}
          >
            <p className="text-[13px] font-extrabold leading-[1.3] text-[var(--foreground)]">
              {item.label}
            </p>
            <p className="mt-1 min-h-[34px] text-[11px] font-semibold leading-[1.45] text-[var(--text-2)]">
              {item.description}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <span className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-2 py-1.5">
                <span className="block text-[10px] font-bold leading-none text-[var(--text-3)]">
                  처음
                </span>
                <strong className="mt-1 block text-[13px] font-extrabold leading-none text-[var(--brand)]">
                  +{formatXpValue(item.first)} XP
                </strong>
              </span>
              <span className="rounded-[var(--radius-sm)] bg-[var(--surface)] px-2 py-1.5">
                <span className="block text-[10px] font-bold leading-none text-[var(--text-3)]">
                  반복
                </span>
                <strong className="mt-1 block text-[13px] font-extrabold leading-none text-[var(--brand)]">
                  +{formatXpValue(item.repeat)} XP
                </strong>
              </span>
            </div>
            <p className="mt-2 text-[10px] font-bold leading-[1.4] text-[var(--text-3)]">
              {item.note}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-2 text-[11px] font-semibold leading-[1.45] text-[var(--text-2)]">
        업적과 튜토리얼은 성장 기록으로 보여주지만, 별도 경험치를 추가로 주지는 않아요.
      </p>
    </>
  );
}

function NotificationPanel({ data }: { data: UserGamificationData | null }) {
  const realPreviewItems = useMemo(
    () => data?.notifications.archive_preview ?? [],
    [data?.notifications.archive_preview],
  );
  const previewItems = useMemo(
    () => buildNotificationPanelItems(data, realPreviewItems),
    [data, realPreviewItems],
  );
  const hasRealPreviewItems = realPreviewItems.length > 0;
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<UserGamificationNotificationData[]>(previewItems);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    hasRealPreviewItems ? "ready" : "loading",
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const itemsRef = useRef<UserGamificationNotificationData[]>(previewItems);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadArchivePage = useCallback(
    async (nextCursor: string | null) => {
      if (loadingRef.current) return;
      loadingRef.current = true;

      if (nextCursor) {
        setLoadingMore(true);
      } else {
        setState(hasRealPreviewItems ? "ready" : "loading");
      }

      try {
        const archive = await fetchUserGamificationArchive({ limit: 20, cursor: nextCursor });
        const visibleItems = compactGrowthNotificationsForDisplay(
          archive.items.filter(isVisibleGrowthNotification),
        );

        if (!mountedRef.current) return;

        const nextItems = nextCursor
          ? compactGrowthNotificationsForDisplay([...itemsRef.current, ...visibleItems])
          : buildNotificationPanelItems(data, visibleItems);
        setItems(nextItems);
        setState(nextItems.length > 0 ? "ready" : "empty");
        setCursor(archive.next_cursor);
        setHasNext(archive.has_next);
      } catch {
        if (!nextCursor && mountedRef.current) {
          setState(hasRealPreviewItems ? "ready" : "error");
        }
      } finally {
        loadingRef.current = false;
        if (mountedRef.current) {
          setLoadingMore(false);
        }
      }
    },
    [data, hasRealPreviewItems],
  );

  useEffect(() => {
    void loadArchivePage(null);
  }, [loadArchivePage]);

  const filteredItems = items.filter((item) => matchesNotificationFilter(item, filter));

  return (
    <>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {FILTERS.map((item) => (
          <button
            aria-selected={filter === item.key}
            className={[
              "h-8 shrink-0 rounded-full px-3 text-[12px] font-extrabold",
              filter === item.key
                ? "bg-[var(--brand)] text-[var(--text-inverse)]"
                : "bg-[var(--surface-fill)] text-[var(--text-2)]",
            ].join(" ")}
            key={item.key}
            onClick={() => setFilter(item.key)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      {state === "loading" ? (
        <div className="mt-4 grid gap-2">
          {[0, 1, 2].map((index) => (
            <div
              className="h-14 rounded-[var(--radius-md)] bg-[var(--surface-fill)]"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {state === "error" ? (
        <p
          className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-4 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]"
          data-testid="mypage-notification-archive-error"
        >
          알림 기록을 잠시 불러오지 못했어요. 마이페이지는 그대로 사용할 수 있어요.
        </p>
      ) : null}

      {state === "empty" || (state === "ready" && filteredItems.length === 0) ? (
        <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-4 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]">
          아직 표시할 알림 기록이 없어요.
        </p>
      ) : null}

      {state === "ready" && filteredItems.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {filteredItems.map((item) => {
            const tone = notificationTone(item);
            return (
            <li
              className={[
                "flex gap-3 rounded-[var(--radius-md)] border px-3.5 py-3.5 text-[var(--foreground)]",
                notificationToneClass(tone),
              ].join(" ")}
              data-testid={`mypage-notification-item-${item.id}`}
              data-tone={tone}
              key={item.id}
            >
              <NotificationVisual item={item} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="rounded-full bg-[var(--surface-alpha-70)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--text-2)]"
                    data-testid={`mypage-notification-label-${item.id}`}
                  >
                    {notificationToneLabel(item)}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold text-[var(--text-3)]"
                    data-testid={`mypage-notification-time-${item.id}`}
                  >
                    {formatDateTime(item.created_at)}
                  </span>
                </div>
                <p
                  className="mt-1.5 text-[14px] font-extrabold leading-[1.35] text-[var(--foreground)]"
                  data-testid={`mypage-notification-title-${item.id}`}
                >
                  {item.title}
                </p>
                <p
                  className="mt-1 text-[13px] font-semibold leading-[1.45] text-[var(--text-2)]"
                  data-testid={`mypage-notification-body-${item.id}`}
                >
                  {item.body}
                </p>
              </div>
            </li>
            );
          })}
        </ul>
      ) : null}

      {state === "ready" && hasNext ? (
        <button
          className="mt-3 w-full rounded-[var(--radius-control)] bg-[var(--surface-fill)] py-2 text-[12px] font-extrabold text-[var(--text-2)] disabled:opacity-60"
          disabled={loadingMore}
          onClick={() => void loadArchivePage(cursor)}
          type="button"
        >
          {loadingMore ? "불러오는 중..." : "더 보기"}
        </button>
      ) : null}
    </>
  );
}

export function MypageGrowthDetailDialog({
  data,
  onClose,
  panel,
}: MypageGrowthDetailDialogProps) {
  const title =
    panel === "grade"
      ? "전체 등급"
      : panel === "achievement"
        ? "업적 앨범"
        : panel === "tutorial"
          ? "튜토리얼 퀘스트"
          : panel === "xpGuide"
            ? "경험치 안내"
            : "알림 기록";

  const dialog = (
    <PanelShell
      onClose={onClose}
      title={title}
      wide={panel === "achievement"}
    >
      {panel === "grade" ? <GradePanel data={data} /> : null}
      {panel === "achievement" ? <AchievementPanel data={data} /> : null}
      {panel === "tutorial" ? <TutorialPanel data={data} /> : null}
      {panel === "xpGuide" ? <XpGuidePanel /> : null}
      {panel === "notifications" ? <NotificationPanel data={data} /> : null}
    </PanelShell>
  );

  if (typeof document === "undefined") {
    return dialog;
  }

  return createPortal(dialog, document.body);
}
