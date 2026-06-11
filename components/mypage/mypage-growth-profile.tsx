"use client";

import React, { useMemo, useState } from "react";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import { MypageBadgeGuideDialog } from "@/components/mypage/mypage-badge-guide-dialog";
import type { MypageGamificationState } from "@/components/mypage/mypage-gamification-card";
import type { MypageProgressState } from "@/components/mypage/mypage-progress-card";
import type {
  UserGamificationBadgeData,
  UserGamificationData,
} from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

interface MypageGrowthProfileProps {
  className?: string;
  gamification: UserGamificationData | null;
  gamificationState: MypageGamificationState;
  progress: UserProgressData | null;
  progressState: MypageProgressState;
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

function pickFeaturedBadges(
  badges: UserGamificationBadgeData[],
  variant: "mobile" | "desktop",
) {
  return badges.slice(0, variant === "desktop" ? 4 : 3);
}

export function MypageGrowthProfile({
  className,
  gamification,
  gamificationState,
  progress,
  progressState,
  variant = "mobile",
}: MypageGrowthProfileProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const hasProgress = progressState === "ready" && isValidProgress(progress);
  const hasGamification = isDisplayableGamification(gamification, gamificationState);
  const visibleBadges = useMemo(
    () => pickFeaturedBadges(hasGamification ? gamification.featured_badges : [], variant),
    [gamification, hasGamification, variant],
  );
  const isDesktop = variant === "desktop";
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
          "min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3",
          isDesktop ? "w-full max-w-[440px]" : "",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-growth-profile-loading"
      >
        <div className="h-4 w-32 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-2 h-2 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-2 flex gap-2">
          {[0, 1, 2].map((index) => (
            <div
              className="h-7 w-16 rounded-[var(--radius-control)] bg-[var(--surface-subtle)]"
              key={index}
            />
          ))}
        </div>
      </div>
    );
  }

  const levelLabel = hasProgress ? `Lv.${progress.level.current_level}` : null;
  const gradeLabel = hasGamification ? gamification.grade?.label ?? null : null;
  const headline =
    gradeLabel && levelLabel
      ? `${gradeLabel} · ${levelLabel}`
      : gradeLabel ?? levelLabel ?? "집밥 성장";
  const progressCopy = hasProgress
    ? progress.level.total_xp === 0
      ? "첫 집밥 기록을 시작해 보세요"
      : `다음 레벨까지 ${formatXp(progress.level.xp_to_next_level)} XP`
    : null;

  return (
    <>
      <div
        className={[
          "min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-fill)] p-3",
          isDesktop ? "w-full max-w-[460px]" : "",
          className ?? "",
        ].join(" ")}
        data-grade-key={hasGamification ? gamification.grade?.grade_key : undefined}
        data-testid="mypage-growth-profile"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-extrabold leading-[1.25] text-[var(--foreground)]">
              {headline}
            </p>
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
          {hasGamification ? (
            <button
              className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--text-2)]"
              onClick={() => setGuideOpen(true)}
              type="button"
            >
              배지 안내
            </button>
          ) : null}
        </div>

        {hasProgress ? (
          <div
            aria-label={`${levelLabel}, ${progressCopy}, 진행률 ${progress.level.progress_percent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress.level.progress_percent}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              data-testid="mypage-growth-progress-fill"
              style={{ width: `${progress.level.progress_percent}%` }}
            />
          </div>
        ) : null}

        {visibleBadges.length > 0 ? (
          <ul
            className={[
              "mt-2 grid gap-1.5",
              isDesktop ? "grid-cols-4" : "grid-cols-3",
            ].join(" ")}
            data-testid="mypage-growth-featured-badges"
          >
            {visibleBadges.map((badge) => (
              <li className="min-w-0" key={badge.badge_key}>
                <button
                  className="flex min-h-9 w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--surface)] px-2 py-1.5 text-left"
                  onClick={() => setGuideOpen(true)}
                  type="button"
                >
                  <GrowthBadgeIcon
                    isNew={badge.is_new}
                    shapeKey={badge.shape_key}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-[10px] font-extrabold leading-[1.2] text-[var(--foreground)]">
                    {badge.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : hasGamification ? (
          <p className="mt-2 text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]">
            첫 배지는 첫 집밥 기록에서 시작돼요.
          </p>
        ) : gamificationState === "error" ? (
          <p
            className="mt-2 text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]"
            data-testid="mypage-growth-gamification-error"
          >
            배지 정보를 잠시 불러오지 못했어요
          </p>
        ) : null}
      </div>

      {guideOpen ? (
        <MypageBadgeGuideDialog
          data={gamification}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}
    </>
  );
}
