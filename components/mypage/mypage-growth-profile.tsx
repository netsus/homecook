"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import { GrowthGradeMark } from "@/components/mypage/growth-grade-mark";
import {
  MypageGrowthDetailDialog,
  type MypageGrowthPanel,
} from "@/components/mypage/mypage-growth-detail-dialog";
import type { MypageGamificationState } from "@/components/mypage/mypage-gamification-card";
import type { MypageProgressState } from "@/components/mypage/mypage-progress-card";
import type { UserProfileData } from "@/lib/api/mypage";
import type {
  UserGamificationBadgeData,
  UserGamificationData,
  UserGamificationQuestData,
  UserGamificationTutorialStepData,
} from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

interface MypageGrowthProfileProps {
  className?: string;
  gamification: UserGamificationData | null;
  gamificationState: MypageGamificationState;
  onDismissTutorialQuest?: (questKey: string) => void;
  onEditProfile?: () => void;
  profile?: UserProfileData | null;
  providerLabel?: string | null;
  progress: UserProgressData | null;
  progressState: MypageProgressState;
  recordStats?: {
    cooking: number;
    planner: number;
    shopping: number;
  };
  variant?: "mobile" | "desktop";
}

const XP_FORMATTER = new Intl.NumberFormat("ko-KR");

function formatXp(value: number) {
  return XP_FORMATTER.format(value);
}

function isValidProgress(progress: UserProgressData | null): progress is UserProgressData {
  if (!progress) return false;
  const level = progress.level;
  return (
    Number.isFinite(level.current_level) &&
    Number.isFinite(level.progress_percent) &&
    Number.isFinite(level.total_xp) &&
    Number.isFinite(level.xp_to_next_level) &&
    level.progress_percent >= 0 &&
    level.progress_percent <= 100
  );
}

function isDisplayableGamification(
  gamification: UserGamificationData | null,
  state: MypageGamificationState,
): gamification is UserGamificationData {
  return Boolean(gamification) && (state === "ready" || state === "empty");
}

function pickFeaturedBadges(badges: UserGamificationBadgeData[]) {
  return badges.slice(0, 4);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ActionIcon({ panel }: { panel: MypageGrowthPanel }) {
  if (panel === "grade") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 12.5 7 21l5-3 5 3-1.5-8.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (panel === "achievement") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M12 3 14.7 8.7 21 9.5l-4.6 4.4 1.2 6.1L12 17l-5.6 3 1.2-6.1L3 9.5l6.3-.8L12 3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (panel === "tutorial") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path d="M5 5.5h6.5c1.4 0 2.5 1.1 2.5 2.5v10.5c0-1.4-1.1-2.5-2.5-2.5H5V5.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M14 8c0-1.4 1.1-2.5 2.5-2.5H19v11h-2.5c-1.4 0-2.5.9-2.5 2.3" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0v3.7l1.7 2.5H4.8l1.7-2.5v-3.7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M10 19h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function RecordStatsRow({
  stats,
}: {
  stats: NonNullable<MypageGrowthProfileProps["recordStats"]>;
}) {
  const items = [
    { label: "요리기록", value: stats.cooking },
    { label: "플래너 기록", value: stats.planner },
    { label: "장보기 기록", value: stats.shopping },
  ];

  return (
    <div
      aria-label="마이페이지 통계"
      className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)]"
    >
      {items.map((item, index) => (
        <div
          className={[
            "min-w-0 px-2 py-2 text-center",
            index > 0 ? "border-l border-[var(--line)]" : "",
          ].join(" ")}
          key={item.label}
        >
          <strong className="block truncate text-[16px] font-extrabold leading-[1.15] text-[var(--foreground)]">
            {formatXp(item.value)}
          </strong>
          <span className="mt-1 block truncate text-[10px] font-bold leading-[1.2] text-[var(--text-3)]">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function getQuestKeyForAchievement(achievementKey: string) {
  const mapping: Record<string, string> = {
    tutorial_recipe_saved: "first_recipe_saved",
    tutorial_planner_registered: "first_planner_registered",
    tutorial_shopping_list_create: "first_shopping_list_created",
    tutorial_shopping_list_complete: "first_shopping_done",
    tutorial_cooking_complete: "first_cook_done",
    tutorial_recipebook_created: "first_custom_book_created",
  };

  return mapping[achievementKey] ?? achievementKey;
}

function tutorialStepToQuest(step: UserGamificationTutorialStepData): UserGamificationQuestData {
  const legacyStep = step as UserGamificationTutorialStepData & {
    description?: string;
    progress_current?: number;
    progress_percent?: number;
    progress_target?: number;
    quest_key?: string;
  };
  const current = Number.isFinite(step.current)
    ? step.current
    : legacyStep.progress_current ?? 0;
  const target = Number.isFinite(step.target)
    ? step.target
    : legacyStep.progress_target ?? 1;
  const percent = Number.isFinite(legacyStep.progress_percent)
    ? clampPercent(legacyStep.progress_percent ?? 0)
    : target > 0
      ? clampPercent((Math.max(0, current) / target) * 100)
      : 0;
  const achievementKey = step.achievement_key ?? legacyStep.quest_key ?? "tutorial";

  return {
    quest_key: getQuestKeyForAchievement(achievementKey),
    quest_type: "tutorial",
    status: step.status === "earned" ? "completed" : "active",
    title: step.title,
    description: legacyStep.description ?? "",
    progress_current: current,
    progress_target: target,
    progress_percent: percent,
    completed_at: null,
    dismissed_at: null,
    is_new: false,
  };
}

function pickQuest(data: UserGamificationData | null): UserGamificationQuestData | null {
  if (!data) return null;

  const tutorialStep = data.tutorial.active_steps.find((quest) => quest.status === "active");
  if (tutorialStep) {
    return tutorialStepToQuest(tutorialStep);
  }

  return (
    data.quests.active[0] ??
    data.quests.completed_recent[0] ??
    null
  );
}

function ProfileAvatar({
  profile,
  variant,
}: {
  profile: UserProfileData | null;
  variant: "mobile" | "desktop";
}) {
  const pixelSize = variant === "desktop" ? 76 : 68;
  const fallbackInitial = (profile?.nickname?.slice(0, 1) || "?").toUpperCase();

  if (profile?.profile_image_url) {
    return (
      <Image
        alt={`${profile.nickname} 프로필`}
        className="shrink-0 rounded-full object-cover shadow-[0_3px_10px_rgba(37,31,20,0.12)]"
        height={pixelSize}
        src={profile.profile_image_url}
        style={{ height: pixelSize, width: pixelSize }}
        unoptimized
        width={pixelSize}
      />
    );
  }

  return (
    <div
      aria-label="프로필 이니셜"
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-deep)] font-extrabold text-[var(--text-inverse)] shadow-[0_3px_10px_rgba(37,31,20,0.12)]"
      data-testid="profile-fallback-avatar"
      style={{
        fontSize: variant === "desktop" ? 28 : 24,
        height: pixelSize,
        width: pixelSize,
      }}
    >
      {fallbackInitial}
    </div>
  );
}

export function MypageGrowthProfile({
  className,
  gamification,
  gamificationState,
  onDismissTutorialQuest,
  onEditProfile,
  profile,
  providerLabel,
  progress,
  progressState,
  recordStats,
  variant = "mobile",
}: MypageGrowthProfileProps) {
  const [activePanel, setActivePanel] = useState<MypageGrowthPanel | null>(null);
  const hasProgress = progressState === "ready" && isValidProgress(progress);
  const hasGamification = isDisplayableGamification(gamification, gamificationState);
  const visibleBadges = useMemo(
    () => pickFeaturedBadges(hasGamification ? gamification.featured_badges : []),
    [gamification, hasGamification],
  );
  const isDesktop = variant === "desktop";
  const hasIntegratedProfile = profile !== undefined;
  const loading =
    !hasProgress &&
    !hasGamification &&
    (progressState === "loading" ||
      progressState === "idle" ||
      gamificationState === "loading" ||
      gamificationState === "idle");

  if (loading) {
    return (
      <div
        aria-label="프로필 성장 정보를 불러오는 중"
        className={[
          "min-w-0 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4",
          isDesktop ? "w-full" : "",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-growth-profile-loading"
      >
        <div className="h-4 w-32 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-2 h-2 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((index) => (
            <div
              className="h-14 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
              key={index}
            />
          ))}
        </div>
        <div
          className="mt-3 h-16 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
          data-testid="mypage-gamification-loading"
        />
      </div>
    );
  }

  const levelLabel = hasProgress ? `Lv.${progress.level.current_level}` : null;
  const gradeLabel = hasGamification ? gamification.grade?.label ?? null : null;
  const gradeKey = hasGamification ? gamification.grade?.grade_key ?? null : null;
  const quest = hasGamification ? pickQuest(gamification) : null;
  const gamificationLoading =
    gamificationState === "loading" || gamificationState === "idle";
  const gamificationEmpty = hasGamification && visibleBadges.length === 0 && !quest;
  const headline =
    gradeLabel && levelLabel
      ? `${gradeLabel} · ${levelLabel}`
      : gradeLabel ?? levelLabel ?? "집밥 성장";
  const progressCopy = hasProgress
    ? progress.level.total_xp === 0
      ? "첫 집밥 기록을 시작해 보세요"
      : `다음 레벨까지 ${formatXp(progress.level.xp_to_next_level)} XP`
    : null;
  const actionButtons = hasGamification ? (
    <div
      aria-label="성장 상세 메뉴"
      className={[
        "grid gap-2",
        isDesktop ? "grid-cols-4" : "grid-cols-4 max-[360px]:grid-cols-2",
      ].join(" ")}
    >
      {[
        ["grade", "등급", "등급 보기"],
        ["achievement", "업적", "업적 보기"],
        ["tutorial", "튜토리얼", "튜토리얼 보기"],
        ["notifications", "알림", "알림 보기"],
      ].map(([panel, label, ariaLabel]) => (
        <button
          aria-label={ariaLabel}
          className="flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-2 py-2 text-[11px] font-extrabold text-[var(--text-2)]"
          key={panel}
          onClick={() => setActivePanel(panel as MypageGrowthPanel)}
          type="button"
        >
          <ActionIcon panel={panel as MypageGrowthPanel} />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  ) : null;

  const progressBar = hasProgress ? (
    <div
      aria-label={`${levelLabel}, ${progressCopy}, 진행률 ${progress.level.progress_percent}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={progress.level.progress_percent}
      className="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-[var(--brand)]"
        data-testid="mypage-growth-progress-fill"
        style={{ width: `${progress.level.progress_percent}%` }}
      />
    </div>
  ) : null;

  const badgeRow = visibleBadges.length > 0 ? (
    <ul
      className={[
        "grid gap-2",
        isDesktop ? "grid-cols-4" : "grid-cols-4 max-[360px]:grid-cols-2",
      ].join(" ")}
      data-testid="mypage-growth-featured-badges"
    >
      {visibleBadges.map((badge) => (
        <li className="min-w-0" key={badge.badge_key}>
          <button
            className={[
              "flex w-full min-w-0 flex-col items-center justify-start gap-1 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-2 py-2 text-center",
              isDesktop ? "min-h-[86px]" : "min-h-[78px]",
            ].join(" ")}
            onClick={() => setActivePanel("achievement")}
            type="button"
          >
            <GrowthBadgeIcon
              isNew={badge.is_new}
              shapeKey={badge.shape_key}
              size={isDesktop ? "md" : "sm"}
            />
            <span className="line-clamp-2 min-w-0 text-[10px] font-extrabold leading-[1.15] text-[var(--foreground)]">
              {badge.label}
            </span>
          </button>
        </li>
      ))}
    </ul>
  ) : hasGamification ? (
    <p className="text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]">
      첫 배지는 첫 집밥 기록에서 시작돼요.
    </p>
  ) : gamificationState === "error" && !hasIntegratedProfile ? (
    <p
      className="text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]"
      data-testid="mypage-growth-gamification-error"
    >
      배지 정보를 잠시 불러오지 못했어요
    </p>
  ) : null;

  const questPercent = quest ? clampPercent(quest.progress_percent) : 0;
  const gamificationSummary = gamificationLoading ? (
    <section
      aria-label="배지와 퀘스트를 불러오는 중"
      className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3"
      data-testid="mypage-gamification-loading"
    >
      <div className="h-4 w-28 rounded-full bg-[var(--surface-subtle)]" />
      <div className="mt-3 h-10 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]" />
    </section>
  ) : hasGamification ? (
    <section
      className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3"
      data-testid={gamificationEmpty ? "mypage-gamification-empty" : "mypage-gamification-card"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0" data-testid="mypage-growth-quest-summary">
          <p className="text-[12px] font-extrabold leading-[1.25] text-[var(--foreground)]">
            {quest ? quest.title : "나의 배지"}
          </p>
          <p className="mt-1 text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]">
            {quest ? quest.description : "집밥 활동으로 배지를 모아보세요."}
          </p>
        </div>
        <button
          className="flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface)] px-3 text-[11px] font-extrabold text-[var(--text-2)]"
          onClick={() => setActivePanel(quest?.quest_type === "tutorial" ? "tutorial" : "achievement")}
          type="button"
        >
          보기
        </button>
      </div>
      {quest ? (
        <div className="mt-3 flex items-center gap-2">
          <div
            aria-label={`${quest.title} 진행률 ${questPercent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={questPercent}
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${questPercent}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] font-extrabold text-[var(--text-2)]">
            {quest.progress_current}/{quest.progress_target}
          </span>
          {quest.quest_type === "tutorial" && onDismissTutorialQuest ? (
            <button
              className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-extrabold text-[var(--text-3)]"
              onClick={() => onDismissTutorialQuest(quest.quest_key)}
              type="button"
            >
              나중에
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  ) : gamificationState === "error" ? (
    <section
      className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3"
      data-testid="mypage-gamification-error"
    >
      <p
        className="text-[12px] font-extrabold text-[var(--foreground)]"
        data-testid="mypage-growth-gamification-error"
      >
        배지 정보를 잠시 불러오지 못했어요
      </p>
      <p className="mt-1 text-[11px] font-semibold text-[var(--text-3)]">
        마이페이지와 기본 성장 기록은 그대로 사용할 수 있어요.
      </p>
    </section>
  ) : null;

  if (hasIntegratedProfile) {
    const nickname = profile?.nickname ?? "사용자";

    return (
      <>
        <section
          className={[
            "min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)]",
            className ?? "",
          ].join(" ")}
          data-grade-key={gradeKey ?? undefined}
          data-testid="mypage-growth-profile"
        >
          <div
            className={[
              "grid gap-4 p-4",
              isDesktop ? "grid-cols-[minmax(220px,0.72fr)_minmax(0,1fr)] p-6" : "",
            ].join(" ")}
          >
            <button
              aria-label={`닉네임 변경, 현재 닉네임: ${nickname}`}
              className="flex min-w-0 items-center gap-3 border-0 bg-transparent p-0 text-left"
              data-testid="mypage-profile-edit-button"
              onClick={onEditProfile}
              type="button"
            >
              <ProfileAvatar
                profile={profile ?? null}
                variant={variant}
              />
              <span className="min-w-0">
                <span className="block truncate text-[20px] font-extrabold leading-[1.2] text-[var(--foreground)]">
                  {nickname}
                </span>
                <span className="mt-1 block truncate text-[13px] font-semibold leading-[1.3] text-[var(--text-3)]">
                  {providerLabel ?? ""}
                </span>
              </span>
            </button>

            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-3">
                <GrowthGradeMark
                  gradeKey={gradeKey}
                  size={isDesktop ? "lg" : "md"}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[18px] font-extrabold leading-[1.25] text-[var(--foreground)]">
                        {headline}
                      </p>
                      {hasProgress ? (
                        <p className="mt-1 truncate text-[12px] font-semibold leading-[1.35] text-[var(--text-2)]">
                          <span>{formatXp(progress.level.total_xp)} XP</span>
                          <span aria-hidden="true"> · </span>
                          <span>{progressCopy}</span>
                        </p>
                      ) : progressState === "error" ? (
                        <p
                          className="mt-1 text-[12px] font-semibold leading-[1.35] text-[var(--text-3)]"
                          data-testid="mypage-growth-progress-error"
                        >
                          XP를 잠시 불러오지 못했어요
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {progressBar ? <div className="mt-3">{progressBar}</div> : null}
                  {recordStats ? (
                    <div className="mt-3">
                      <RecordStatsRow stats={recordStats} />
                    </div>
                  ) : null}
                  {actionButtons ? <div className="mt-3">{actionButtons}</div> : null}
                </div>
              </div>

              <div className="mt-4">
                {badgeRow}
              </div>

              {gamificationSummary ? (
                <div className="mt-3">
                  {gamificationSummary}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {activePanel ? (
          <MypageGrowthDetailDialog
            data={gamification}
            onClose={() => setActivePanel(null)}
            panel={activePanel}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <div
        className={[
          "min-w-0 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-3",
          isDesktop ? "w-full max-w-[460px]" : "",
          className ?? "",
        ].join(" ")}
        data-grade-key={gradeKey ?? undefined}
        data-testid="mypage-growth-profile"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <GrowthGradeMark gradeKey={gradeKey} size="sm" />
              <p className="truncate text-[12px] font-extrabold leading-[1.25] text-[var(--foreground)]">
                {headline}
              </p>
            </div>
            {hasProgress ? (
              <p className="mt-0.5 truncate text-[11px] font-semibold leading-[1.35] text-[var(--text-2)]">
                {progressCopy}
              </p>
            ) : progressState === "error" ? (
              <p
                className="mt-0.5 text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]"
                data-testid="mypage-growth-progress-error"
              >
                XP를 잠시 불러오지 못했어요
              </p>
            ) : null}
          </div>
        </div>

        {progressBar ? <div className="mt-2">{progressBar}</div> : null}
        {recordStats ? (
          <div className="mt-3">
            <RecordStatsRow stats={recordStats} />
          </div>
        ) : null}
        {actionButtons ? <div className="mt-3">{actionButtons}</div> : null}

        <div className="mt-2">
          {badgeRow}
        </div>
      </div>

      {activePanel ? (
        <MypageGrowthDetailDialog
          data={gamification}
          onClose={() => setActivePanel(null)}
          panel={activePanel}
        />
      ) : null}
    </>
  );
}
