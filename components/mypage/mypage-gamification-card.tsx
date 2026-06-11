"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import type {
  UserGamificationBadgeData,
  UserGamificationData,
  UserGamificationQuestData,
} from "@/types/user-gamification";

export type MypageGamificationState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "error";

interface MypageGamificationCardProps {
  className?: string;
  data: UserGamificationData | null;
  onDismissTutorialQuest?: (questKey: string) => void;
  state: MypageGamificationState;
  variant?: "mobile" | "desktop";
}

// 화면정의서 v1.5.16 growth-leveling-v2: 첫 경험치 기준 표시. 반복 경험치는 더 낮다.
const XP_ACTIONS = [
  ["레시피 저장", "첫 +15 XP"],
  ["레시피북 생성", "첫 +25 XP"],
  ["장보기 완료", "첫 +40 XP"],
  ["요리 완료", "첫 +60 XP"],
  ["플래너 등록", "첫 +25 XP"],
] as const;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pickVisibleBadges(data: UserGamificationData) {
  const badges = data.featured_badges.length > 0
    ? data.featured_badges
    : data.badges.earned;

  return badges.slice(0, 3);
}

function pickQuest(data: UserGamificationData) {
  return (
    data.tutorial.active_steps.find((quest) => quest.status === "active") ??
    data.quests.active[0] ??
    data.quests.completed_recent[0] ??
    null
  );
}

function BadgePill({ badge }: { badge: UserGamificationBadgeData }) {
  return (
    <li className="min-w-0">
      <div className="flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-2.5 py-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--warning-soft)] text-[15px]"
        >
          {badge.is_new ? "★" : "✓"}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-extrabold leading-[1.25] text-[var(--foreground)]">
            {badge.label}
          </span>
          <span className="block truncate text-[10px] font-bold leading-[1.25] text-[var(--text-3)]">
            {badge.is_new ? "new" : "획득"}
          </span>
        </span>
      </div>
    </li>
  );
}

function QuestRow({
  onDismiss,
  quest,
}: {
  onDismiss?: (questKey: string) => void;
  quest: UserGamificationQuestData;
}) {
  const percent = clampPercent(quest.progress_percent);
  const isTutorial = quest.quest_type === "tutorial";

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] p-3"
      data-testid="mypage-gamification-quest"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold leading-[1.3] text-[var(--foreground)]">
            {quest.title}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]">
            {quest.description}
          </p>
        </div>
        {quest.status === "completed" ? (
          <span className="shrink-0 rounded-full bg-[var(--success-soft)] px-2 py-1 text-[10px] font-extrabold text-[var(--success)]">
            달성
          </span>
        ) : isTutorial && onDismiss ? (
          <button
            className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2 py-1 text-[10px] font-extrabold text-[var(--text-3)]"
            onClick={() => onDismiss(quest.quest_key)}
            type="button"
          >
            나중에
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div
          aria-label={`${quest.title} 진행률 ${percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[var(--brand)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-extrabold text-[var(--text-2)]">
          {quest.progress_current}/{quest.progress_target}
        </span>
      </div>
    </div>
  );
}

function GuideDialog({
  badges,
  onClose,
}: {
  badges: UserGamificationBadgeData[];
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[var(--overlay-40)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-10 md:items-center md:pb-10"
      data-testid="mypage-badge-guide-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="badge-guide-title"
        aria-modal="true"
        className="w-full max-w-[420px] rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_20px_60px_var(--overlay-30)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-[17px] font-extrabold leading-[1.3] text-[var(--foreground)]"
              id="badge-guide-title"
            >
              성장 시스템 안내
            </h2>
            <p className="mt-1 text-[12px] font-semibold leading-[1.45] text-[var(--text-2)]">
              활동을 기록하면 배지와 퀘스트가 자동으로 쌓여요.
            </p>
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[18px] font-extrabold text-[var(--text-2)]"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {XP_ACTIONS.map(([label, xp]) => (
            <div
              className="flex min-h-10 items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 text-[12px] font-bold"
              key={label}
            >
              <span>{label}</span>
              <strong className="text-[var(--brand)]">{xp}</strong>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[11px] font-semibold leading-[1.45] text-[var(--text-3)]">
          첫 경험치 기준이에요. 같은 활동을 반복하면 경험치가 조금 더 작게 쌓여요.
        </p>

        <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3">
          <p className="text-[12px] font-extrabold text-[var(--foreground)]">
            대표 배지
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-[1.4] text-[var(--text-2)]">
            {badges.length > 0
              ? badges.map((badge) => badge.label).join(" · ")
              : "첫 저장, 첫 장보기, 첫 요리에서 배지가 시작돼요."}
          </p>
        </div>

        <p className="mt-4 text-[11px] font-semibold leading-[1.45] text-[var(--text-3)]">
          순위, 압박형 연속 출석, 랜덤 보상은 쓰지 않아요. 집밥 루틴을 조용히
          기록하는 용도예요.
        </p>
      </section>
    </div>
  );
}

export function MypageGamificationCard({
  className,
  data,
  onDismissTutorialQuest,
  state,
  variant = "mobile",
}: MypageGamificationCardProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const isDesktop = variant === "desktop";

  const badges = useMemo(() => (data ? pickVisibleBadges(data) : []), [data]);
  const quest = useMemo(() => (data ? pickQuest(data) : null), [data]);
  const isEmpty =
    state === "empty" ||
    (state === "ready" && data && badges.length === 0 && !quest);

  if (state === "loading" || state === "idle") {
    return (
      <section
        aria-label="배지와 퀘스트를 불러오는 중"
        className={[
          "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-gamification-loading"
      >
        <div className="h-4 w-28 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div
              className="h-11 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
              key={index}
            />
          ))}
        </div>
        <div className="mt-3 h-16 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]" />
      </section>
    );
  }

  if (state === "error" || !data) {
    return (
      <section
        className={[
          "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-gamification-error"
      >
        <p className="text-[12px] font-extrabold text-[var(--foreground)]">
          성장 정보를 잠시 불러오지 못했어요
        </p>
        <p className="mt-1 text-[11px] font-semibold text-[var(--text-3)]">
          마이페이지와 기본 성장 기록은 그대로 사용할 수 있어요.
        </p>
      </section>
    );
  }

  return (
    <>
      <section
        className={[
          "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3",
          isDesktop ? "web-mypage-gamification" : "",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-gamification-card"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold leading-[1.3] text-[var(--foreground)]">
              집밥 성장
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold leading-[1.3] text-[var(--text-3)]">
              배지와 퀘스트는 자동으로 쌓여요
            </p>
          </div>
          <button
            className="flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 text-[11px] font-extrabold text-[var(--text-2)]"
            onClick={() => setGuideOpen(true)}
            type="button"
          >
            안내
          </button>
        </div>

        {isEmpty ? (
          <div
            className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3"
            data-testid="mypage-gamification-empty"
          >
            <p className="text-[12px] font-extrabold text-[var(--foreground)]">
              첫 배지는 첫 집밥 기록에서 시작돼요
            </p>
            <p className="mt-1 text-[11px] font-semibold leading-[1.4] text-[var(--text-2)]">
              레시피 저장, 장보기 완료, 요리 완료 중 하나를 해보세요.
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-3 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3">
              {badges.map((badge) => (
                <BadgePill badge={badge} key={badge.badge_key} />
              ))}
            </ul>
            {quest ? (
              <div className="mt-3">
                <QuestRow
                  onDismiss={onDismissTutorialQuest}
                  quest={quest}
                />
              </div>
            ) : null}
          </>
        )}
      </section>

      {guideOpen ? (
        <GuideDialog badges={badges} onClose={() => setGuideOpen(false)} />
      ) : null}
    </>
  );
}
