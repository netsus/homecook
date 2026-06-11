"use client";

import React, { useMemo, useState } from "react";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import { MypageBadgeGuideDialog } from "@/components/mypage/mypage-badge-guide-dialog";
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
  showFeaturedBadges?: boolean;
  state: MypageGamificationState;
  variant?: "mobile" | "desktop";
}

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
          className="shrink-0"
        >
          <GrowthBadgeIcon
            isNew={badge.is_new}
            shapeKey={badge.shape_key}
            size="sm"
          />
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

export function MypageGamificationCard({
  className,
  data,
  onDismissTutorialQuest,
  showFeaturedBadges = true,
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
            {showFeaturedBadges && badges.length > 0 ? (
              <ul className="mt-3 grid grid-cols-2 gap-2 min-[360px]:grid-cols-3">
                {badges.map((badge) => (
                  <BadgePill badge={badge} key={badge.badge_key} />
                ))}
              </ul>
            ) : null}
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
        <MypageBadgeGuideDialog
          data={data}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
    </>
  );
}
