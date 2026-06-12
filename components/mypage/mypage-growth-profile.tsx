"use client";

import Image from "next/image";
import React, { useMemo, useState } from "react";

import { GrowthBadgeIcon } from "@/components/mypage/growth-badge-icon";
import { GrowthGradeMark } from "@/components/mypage/growth-grade-mark";
import { MypageBadgeGuideDialog } from "@/components/mypage/mypage-badge-guide-dialog";
import type { MypageGamificationState } from "@/components/mypage/mypage-gamification-card";
import type { MypageProgressState } from "@/components/mypage/mypage-progress-card";
import type { UserProfileData } from "@/lib/api/mypage";
import type {
  UserGamificationBadgeData,
  UserGamificationData,
  UserGamificationQuestData,
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

function pickQuest(data: UserGamificationData | null): UserGamificationQuestData | null {
  if (!data) return null;

  return (
    data.tutorial.active_steps.find((quest) => quest.status === "active") ??
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
  variant = "mobile",
}: MypageGrowthProfileProps) {
  const [guideOpen, setGuideOpen] = useState(false);
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
            onClick={() => setGuideOpen(true)}
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
          onClick={() => setGuideOpen(true)}
          type="button"
        >
          안내
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
                    {hasGamification ? (
                      <button
                        className="shrink-0 rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 py-1.5 text-[11px] font-extrabold text-[var(--text-2)]"
                        onClick={() => setGuideOpen(true)}
                        type="button"
                      >
                        배지 안내
                      </button>
                    ) : null}
                  </div>
                  {progressBar ? <div className="mt-3">{progressBar}</div> : null}
                </div>
              </div>

              <div className="mt-4">
                {badgeRow}
              </div>
            </div>
          </div>

          {gamificationSummary ? (
            <div className="border-t border-[var(--line)] px-4 py-4 md:px-6">
              {gamificationSummary}
            </div>
          ) : null}
        </section>

        {guideOpen ? (
          <MypageBadgeGuideDialog
            data={gamification}
            onClose={() => setGuideOpen(false)}
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
          {hasGamification ? (
            <button
              className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2.5 py-1 text-[10px] font-extrabold text-[var(--text-2)]"
              onClick={() => setGuideOpen(true)}
              type="button"
            >
              배지 안내
            </button>
          ) : null}
        </div>

        {progressBar ? <div className="mt-2">{progressBar}</div> : null}

        <div className="mt-2">
          {badgeRow}
        </div>
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
