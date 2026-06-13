"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import { GrowthGradeMark } from "@/components/mypage/growth-grade-mark";
import { fetchUserGamificationArchive } from "@/lib/api/user-gamification";
import type {
  UserGamificationAchievementCategoryData,
  UserGamificationAchievementMilestoneData,
  UserGamificationData,
  UserGamificationGradeData,
  UserGamificationNotificationData,
} from "@/types/user-gamification";

export type MypageGrowthPanel = "grade" | "achievement" | "tutorial" | "notifications";

type NotificationFilter = "all" | "growth" | "achievement" | "system";

interface MypageGrowthDetailDialogProps {
  data: UserGamificationData | null;
  onClose: () => void;
  panel: MypageGrowthPanel;
}

const GRADE_BANDS: UserGamificationGradeData[] = [
  {
    grade_key: "clay",
    label: "Clay",
    level_min: 1,
    level_max: 3,
    icon_url: "/assets/growth/grades/clay-spoon-badge.png",
    character_url: "/assets/growth/grades/clay-spoon.png",
  },
  {
    grade_key: "wood",
    label: "Wood",
    level_min: 4,
    level_max: 7,
    icon_url: "/assets/growth/grades/wood-spoon-badge.png",
    character_url: "/assets/growth/grades/wood-spoon.png",
  },
  {
    grade_key: "steel",
    label: "Steel",
    level_min: 8,
    level_max: 12,
    icon_url: "/assets/growth/grades/steel-spoon-badge.png",
    character_url: "/assets/growth/grades/steel-spoon.png",
  },
  {
    grade_key: "silver",
    label: "Silver",
    level_min: 13,
    level_max: 20,
    icon_url: "/assets/growth/grades/silver-spoon-badge.png",
    character_url: "/assets/growth/grades/silver-spoon.png",
  },
  {
    grade_key: "gold",
    label: "Gold",
    level_min: 21,
    level_max: 34,
    icon_url: "/assets/growth/grades/gold-spoon-badge.png",
    character_url: "/assets/growth/grades/gold-spoon.png",
  },
  {
    grade_key: "diamond",
    label: "Diamond",
    level_min: 35,
    level_max: 49,
    icon_url: "/assets/growth/grades/diamond-spoon-badge.png",
    character_url: "/assets/growth/grades/diamond-spoon.png",
  },
  {
    grade_key: "titanium",
    label: "Titanium",
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

function normalizeGradeKey(gradeKey: string | null | undefined) {
  if (!gradeKey) return "clay";
  return LEGACY_GRADE_KEY_ALIASES[gradeKey] ?? gradeKey;
}

function formatGradeRange(grade: UserGamificationGradeData) {
  return grade.level_max === null
    ? `Lv.${grade.level_min}+`
    : `Lv.${grade.level_min}-${grade.level_max}`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
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

function notificationToneLabel(type: UserGamificationNotificationData["notification_type"]) {
  if (type === "level_up") return "레벨업";
  if (type === "achievement_unlocked") return "업적";
  if (type === "badge_unlocked") return "배지";
  if (type === "quest_completed") return "퀘스트";
  return "XP";
}

function matchesNotificationFilter(
  item: UserGamificationNotificationData,
  filter: NotificationFilter,
) {
  if (filter === "all") return true;
  if (filter === "achievement") {
    return item.notification_type === "achievement_unlocked" ||
      item.notification_type === "badge_unlocked";
  }
  if (filter === "growth") {
    return item.notification_type === "level_up" ||
      item.notification_type === "quest_completed" ||
      item.notification_type === "xp_awarded";
  }
  return item.notification_type !== "level_up" &&
    item.notification_type !== "quest_completed" &&
    item.notification_type !== "xp_awarded" &&
    item.notification_type !== "achievement_unlocked" &&
    item.notification_type !== "badge_unlocked";
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
  const pixelSize = size === "lg" ? 72 : size === "md" ? 52 : 40;

  if (grade.icon_url) {
    return (
      <span
        aria-hidden="true"
        className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface-fill)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_12px_rgba(37,31,20,0.12)]"
        style={{ height: pixelSize, width: pixelSize }}
      >
        <Image
          alt=""
          className="object-cover"
          fill
          sizes={`${pixelSize}px`}
          src={grade.icon_url}
          unoptimized
        />
      </span>
    );
  }

  return (
    <GrowthGradeMark
      gradeKey={grade.grade_key}
      size={size}
    />
  );
}

function PanelShell({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
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
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--overlay-40)] px-4 pb-[calc(14px+env(safe-area-inset-bottom))] pt-8 md:items-center md:pb-8"
      data-testid="mypage-growth-detail-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[min(760px,calc(100vh-40px))] w-full max-w-[520px] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_20px_60px_var(--overlay-30)] md:p-5"
        ref={dialogRef}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
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
        {children}
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
              "flex min-h-[68px] items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2",
              isCurrent
                ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                : "border-[var(--line)] bg-[var(--surface-fill)]",
            ].join(" ")}
            data-testid="mypage-grade-row"
            key={grade.grade_key}
          >
            <GradeAsset grade={grade} />
            <div
              className="min-w-0 flex-1"
              data-testid={`mypage-grade-row-${grade.grade_key}`}
            >
              <p className="truncate text-[13px] font-extrabold leading-[1.25] text-[var(--foreground)]">
                {grade.label}
              </p>
              <p className="mt-1 text-[11px] font-semibold leading-[1.3] text-[var(--text-2)]">
                {formatGradeRange(grade)}
              </p>
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
  categories,
  selected,
  setSelected,
  showAll = true,
}: {
  categories: UserGamificationAchievementCategoryData[];
  selected: string;
  setSelected: (value: string) => void;
  showAll?: boolean;
}) {
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist">
      {showAll ? (
        <button
          aria-selected={selected === "all"}
          className={[
            "h-8 shrink-0 rounded-full px-3 text-[12px] font-extrabold",
            selected === "all"
              ? "bg-[var(--brand)] text-[var(--text-inverse)]"
              : "bg-[var(--surface-fill)] text-[var(--text-2)]",
          ].join(" ")}
          onClick={() => setSelected("all")}
          role="tab"
          type="button"
        >
          전체
        </button>
      ) : null}
      {categories.map((category) => (
        <button
          aria-selected={selected === category.category_key}
          className={[
            "h-8 shrink-0 rounded-full px-3 text-[12px] font-extrabold",
            selected === category.category_key
              ? "bg-[var(--brand)] text-[var(--text-inverse)]"
              : "bg-[var(--surface-fill)] text-[var(--text-2)]",
          ].join(" ")}
          key={category.category_key}
          onClick={() => setSelected(category.category_key)}
          role="tab"
          type="button"
        >
          {category.label}
        </button>
      ))}
    </div>
  );
}

function AchievementStamp({
  milestone,
}: {
  milestone: UserGamificationAchievementMilestoneData;
}) {
  const percent = progressPercent(milestone.current, milestone.target, milestone.status);
  const earned = milestone.status === "earned";
  const locked = milestone.status === "locked";

  return (
    <li
      className={[
        "min-h-[128px] rounded-[var(--radius-md)] border p-3",
        earned
          ? "border-[var(--line)] bg-[var(--surface)]"
          : locked
            ? "border-[var(--line)] bg-[var(--surface-fill)] opacity-80"
            : "border-[var(--brand)] bg-[var(--brand-soft)]",
      ].join(" ")}
      data-testid={`achievement-stamp-${milestone.achievement_key}`}
    >
      <div className="flex items-start gap-3">
        <GrowthBadgeIcon
          earned={!locked}
          shapeKey={milestone.badge.shape_key}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-[13px] font-extrabold leading-[1.25] text-[var(--foreground)]">
              {milestone.title}
            </p>
            <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--text-2)]">
              {statusLabel(milestone.status)}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]">
            {locked && milestone.locked_hint ? milestone.locked_hint : milestone.description}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div
          aria-label={`${milestone.title} 진행률 ${percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
          role="progressbar"
        >
          <div
            className={[
              "h-full rounded-full",
              locked ? "bg-[var(--text-3)]" : "bg-[var(--brand)]",
            ].join(" ")}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-extrabold text-[var(--text-2)]">
          {milestone.current} / {milestone.target}
        </span>
      </div>
      {earned && milestone.earned_at ? (
        <p className="mt-2 text-[10px] font-bold text-[var(--text-3)]">
          {formatDate(milestone.earned_at)}
        </p>
      ) : null}
    </li>
  );
}

function AchievementGrid({
  milestones,
}: {
  milestones: UserGamificationAchievementMilestoneData[];
}) {
  if (milestones.length === 0) {
    return (
      <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-4 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]">
        아직 표시할 업적이 없어요. 첫 저장, 첫 장보기, 첫 요리부터 시작해 보세요.
      </p>
    );
  }

  return (
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {milestones.map((milestone) => (
        <AchievementStamp
          key={milestone.achievement_key}
          milestone={milestone}
        />
      ))}
    </ul>
  );
}

function AchievementPanel({ data }: { data: UserGamificationData | null }) {
  const categories = useMemo(() => sortedCategories(data), [data]);
  const [selected, setSelected] = useState("all");
  const summary = data?.achievement_album?.summary;
  const milestones = categories
    .filter((category) => selected === "all" || category.category_key === selected)
    .flatMap((category) => category.milestones);

  return (
    <>
      <div className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-2">
        <p className="text-[12px] font-semibold text-[var(--text-2)]">획득한 스탬프</p>
        <p className="mt-1 text-[20px] font-extrabold leading-[1.2] text-[var(--foreground)]">
          {summary ? `${summary.earned_count} / ${summary.total_count}` : "0 / 0"}
        </p>
      </div>
      <CategoryTabs
        categories={categories}
        selected={selected}
        setSelected={setSelected}
      />
      <AchievementGrid milestones={milestones} />
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
      <AchievementGrid milestones={milestones} />
    </>
  );
}

function NotificationPanel({ data }: { data: UserGamificationData | null }) {
  const previewItems = data?.notifications.archive_preview ?? [];
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [items, setItems] = useState<UserGamificationNotificationData[]>(previewItems);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">(
    previewItems.length > 0 ? "ready" : "loading",
  );

  useEffect(() => {
    let cancelled = false;

    async function loadArchive() {
      try {
        const archive = await fetchUserGamificationArchive({ limit: 20, cursor: null });
        if (cancelled) return;
        const visibleItems = archive.items.filter((item) => item.delivery_channel !== "silent");
        setItems(visibleItems);
        setState(visibleItems.length > 0 ? "ready" : "empty");
      } catch {
        if (cancelled) return;
        setState(previewItems.length > 0 ? "ready" : "error");
      }
    }

    void loadArchive();

    return () => {
      cancelled = true;
    };
  }, [previewItems.length]);

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
          {filteredItems.map((item) => (
            <li
              className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-3 py-2"
              key={item.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--text-2)]">
                  {notificationToneLabel(item.notification_type)}
                </span>
                <span className="shrink-0 text-[10px] font-bold text-[var(--text-3)]">
                  {formatDate(item.created_at)}
                </span>
              </div>
              <p className="mt-1 text-[12px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                {item.title}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
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
          : "알림 기록";

  return (
    <PanelShell
      onClose={onClose}
      title={title}
    >
      {panel === "grade" ? <GradePanel data={data} /> : null}
      {panel === "achievement" ? <AchievementPanel data={data} /> : null}
      {panel === "tutorial" ? <TutorialPanel data={data} /> : null}
      {panel === "notifications" ? <NotificationPanel data={data} /> : null}
    </PanelShell>
  );
}
