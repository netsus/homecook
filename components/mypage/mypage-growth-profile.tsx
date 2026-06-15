"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";

import { GrowthGradeMark } from "@/components/mypage/growth-grade-mark";
import {
  MypageGrowthDetailDialog,
  type MypageGrowthPanel,
} from "@/components/mypage/mypage-growth-detail-dialog";
import { HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT } from "@/lib/gamification-events";
import type { MypageGamificationState } from "@/components/mypage/mypage-gamification-card";
import type { MypageProgressState } from "@/components/mypage/mypage-progress-card";
import type { UserProfileData } from "@/lib/api/mypage";
import type {
  UserGamificationData,
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

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d="M6.5 10.5a5.5 5.5 0 0 1 11 0v3.7l1.7 2.5H4.8l1.7-2.5v-3.7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M10 19h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

type RecordStatKind = "cooking" | "planner" | "shopping";

const RECORD_STAT_ICON_STROKE_WIDTH = "1.45";

function RecordStatIcon({ kind }: { kind: RecordStatKind }) {
  if (kind === "cooking") {
    return (
      <svg
        aria-hidden="true"
        className="h-11 w-11 max-[480px]:h-9 max-[480px]:w-9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={RECORD_STAT_ICON_STROKE_WIDTH}
        viewBox="0 0 32 32"
      >
        <path
          d="M13.6 8.6c0-1 .8-1.8 1.8-1.8h1.2c1 0 1.8.8 1.8 1.8v.5"
        />
        <path
          d="M9.4 12.6c1.1-2.2 3.7-3.5 6.6-3.5s5.5 1.3 6.6 3.5"
        />
        <path
          d="M8.5 13.2h15v9.5a2.9 2.9 0 0 1-2.9 2.9h-9.2a2.9 2.9 0 0 1-2.9-2.9v-9.5Z"
        />
        <path
          d="M8.5 16H5.8a1.7 1.7 0 0 0 0 3.4h2.7M23.5 16h2.7a1.7 1.7 0 0 1 0 3.4h-2.7"
        />
      </svg>
    );
  }

  if (kind === "planner") {
    return (
      <svg
        aria-hidden="true"
        className="h-11 w-11 max-[480px]:h-9 max-[480px]:w-9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={RECORD_STAT_ICON_STROKE_WIDTH}
        viewBox="0 0 32 32"
      >
        <rect
          height="19.4"
          rx="3"
          width="20.4"
          x="5.8"
          y="8"
        />
        <path
          d="M11 5.7v5M21 5.7v5M5.8 13.9h20.4M10.8 18.1h1.7M15.2 18.1h1.7M19.6 18.1h1.7M10.8 22.2h1.7M15.2 22.2h1.7M19.6 22.2h1.7"
        />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="h-11 w-11 max-[480px]:h-9 max-[480px]:w-9"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={RECORD_STAT_ICON_STROKE_WIDTH}
      viewBox="0 0 32 32"
    >
      <path d="M6.6 14.5h18.8l-1.9 10.7h-15l-1.9-10.7Z" />
      <path d="M4.5 14.5h23M10.7 14.5C11.6 10.3 13.5 8.3 16 8.3s4.4 2 5.3 6.2M11.6 18.1v4M16 18.1v4M20.4 18.1v4" />
    </svg>
  );
}

function RecordStatsRow({
  stats,
}: {
  stats: NonNullable<MypageGrowthProfileProps["recordStats"]>;
}) {
  const items = [
    { kind: "cooking", label: "요리기록", value: stats.cooking },
    { kind: "planner", label: "플래너기록", value: stats.planner },
    { kind: "shopping", label: "장보기기록", value: stats.shopping },
  ];

  return (
    <div
      aria-label="마이페이지 통계"
      className="grid grid-cols-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)]"
    >
      {items.map((item, index) => (
        <div
          aria-label={`${item.label} ${formatXp(item.value)}회`}
          className={[
            "relative flex min-w-0 items-center justify-center gap-3 px-2 py-4 text-left max-[480px]:gap-1 max-[480px]:px-1 max-[480px]:py-3 max-[360px]:text-center",
          ].join(" ")}
          key={item.label}
        >
          {index > 0 ? (
            <span
              aria-hidden="true"
              className="absolute bottom-4 left-0 top-4 w-px bg-[var(--line)]"
            />
          ) : null}
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center text-[var(--foreground)] max-[480px]:h-10 max-[480px]:w-10"
            data-testid={`record-stat-${item.kind}-icon`}
          >
            <RecordStatIcon kind={item.kind as RecordStatKind} />
          </span>
          <span
            className="grid min-w-0 gap-0.5"
            data-testid={`record-stat-${item.kind}-copy`}
          >
            <span className="block truncate text-[11px] font-bold leading-[1.2] text-[var(--text-3)] max-[480px]:text-[9px]">
              {item.label}
            </span>
            <strong className="block truncate text-[22px] font-extrabold leading-[1.08] text-[var(--foreground)] max-[480px]:text-[20px] max-[360px]:text-[18px]">
              {formatXp(item.value)}
            </strong>
          </span>
        </div>
      ))}
    </div>
  );
}

function ProfileAvatar({
  profile,
  variant,
}: {
  profile: UserProfileData | null;
  variant: "mobile" | "desktop";
}) {
  const pixelSize = variant === "desktop" ? 72 : 52;
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
        fontSize: variant === "desktop" ? 28 : 22,
        height: pixelSize,
        width: pixelSize,
      }}
    >
      {fallbackInitial}
    </div>
  );
}

function ProfileGradeAsset({
  grade,
  gradeKey,
  size,
}: {
  grade: UserGamificationData["grade"] | null;
  gradeKey: string | null;
  size: "sm" | "md" | "lg";
}) {
  const pixelSize = size === "lg" ? 60 : size === "md" ? 54 : 38;
  const normalizedGradeKey = gradeKey ?? "clay";

  if (grade?.icon_url) {
    return (
      <span
        aria-hidden="true"
        className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--line)]"
        data-testid={`mypage-profile-grade-image-${normalizedGradeKey}`}
        style={{ height: pixelSize, width: pixelSize }}
      >
        <Image
          alt=""
          className="scale-[1.18] object-contain"
          fill
          sizes={`${pixelSize}px`}
          src={grade.icon_url}
          unoptimized
        />
      </span>
    );
  }

  return <GrowthGradeMark gradeKey={gradeKey} size={size} />;
}

function getLevelXpMeter(progress: UserProgressData) {
  const level = progress.level;
  const levelTotal = level.next_level_start_xp - level.current_level_start_xp;
  const total = Number.isFinite(levelTotal) && levelTotal > 0
    ? levelTotal
    : level.xp_into_current_level + level.xp_to_next_level;

  return {
    current: Math.max(0, Math.min(level.xp_into_current_level, total)),
    total,
  };
}

export function MypageGrowthProfile({
  className,
  gamification,
  gamificationState,
  onEditProfile,
  profile,
  progress,
  progressState,
  recordStats,
  variant = "mobile",
}: MypageGrowthProfileProps) {
  const [activePanel, setActivePanel] = useState<MypageGrowthPanel | null>(null);
  const hasProgress = progressState === "ready" && isValidProgress(progress);
  const hasGamification = isDisplayableGamification(gamification, gamificationState);
  const isDesktop = variant === "desktop";
  const hasIntegratedProfile = profile !== undefined;
  const loading =
    !hasProgress &&
    !hasGamification &&
    (progressState === "loading" ||
      progressState === "idle" ||
      gamificationState === "loading" ||
      gamificationState === "idle");

  useEffect(() => {
    const openNotifications = () => setActivePanel("notifications");
    window.addEventListener(
      HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT,
      openNotifications,
    );
    return () => {
      window.removeEventListener(
        HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT,
        openNotifications,
      );
    };
  }, []);

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
        role="status"
      >
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 rounded-full bg-[var(--surface-subtle)]" />
          <div className="min-w-0 flex-1">
            <div className="h-5 w-28 rounded-full bg-[var(--surface-subtle)]" />
            <div className="mt-2 h-4 w-36 rounded-full bg-[var(--surface-subtle)]" />
          </div>
        </div>
        <div className="mt-4 h-3 w-36 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-2 h-4 rounded-full bg-[var(--surface-subtle)]" />
        <div className="ml-auto mt-1 h-3 w-24 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => (
            <div
              className="h-10 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
              key={index}
            />
          ))}
        </div>
        <div
          className="mt-3 h-20 rounded-[var(--radius-md)] bg-[var(--surface-subtle)]"
          data-testid="mypage-gamification-loading"
        />
      </div>
    );
  }

  const levelLabel = hasProgress ? `Lv.${progress.level.current_level}` : null;
  const gradeLabel = hasGamification ? gamification.grade?.label ?? null : null;
  const gradeKey = hasGamification ? gamification.grade?.grade_key ?? null : null;
  const headline =
    gradeLabel && levelLabel
      ? `${gradeLabel} · ${levelLabel}`
      : gradeLabel ?? levelLabel ?? "집밥 성장";
  const progressCopy = hasProgress
    ? `다음 레벨까지 ${formatXp(progress.level.xp_to_next_level)} XP`
    : null;
  const levelXpMeter = hasProgress ? getLevelXpMeter(progress) : null;
  const actionButtons = hasGamification ? (
    <div
      aria-label="성장 상세 메뉴"
      data-testid="mypage-profile-action-bar"
      className={[
        "grid shrink-0 gap-1.5 max-[360px]:gap-1",
        isDesktop ? "grid-cols-3" : "w-full grid-cols-3",
      ].join(" ")}
    >
      {[
        ["grade", "등급", "등급 보기"],
        ["achievement", "업적", "업적 보기"],
        ["notifications", "알림", "알림 보기"],
      ].map(([panel, label, ariaLabel]) => (
        <button
          aria-label={ariaLabel}
          className={[
            "flex min-w-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] font-extrabold leading-none text-[var(--text-2)]",
            isDesktop
              ? "min-h-10 gap-1 px-3 py-2 text-[12px]"
              : "min-h-10 flex-col gap-0.5 px-0.5 py-1.5 text-[10px] max-[360px]:text-[9px]",
          ].join(" ")}
          key={panel}
          onClick={() => setActivePanel(panel as MypageGrowthPanel)}
          type="button"
        >
          <ActionIcon panel={panel as MypageGrowthPanel} />
          <span className={isDesktop ? "max-w-full truncate" : "whitespace-nowrap"}>{label}</span>
        </button>
      ))}
    </div>
  ) : null;
  const topActionButtons = isDesktop ? actionButtons : null;
  const mobileActionButtons = isDesktop ? null : actionButtons;

  const progressBar = hasProgress ? (
    <div>
      <div
        aria-label={`${levelLabel}, ${progressCopy}, 진행률 ${progress.level.progress_percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress.level.progress_percent}
        className="relative h-4 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
        data-testid="mypage-growth-progress-meter"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-[var(--brand)]"
          data-testid="mypage-growth-progress-fill"
          style={{ width: `${progress.level.progress_percent}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold leading-none text-[var(--text-inverse)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
          {progress.level.progress_percent}%
        </span>
      </div>
      {levelXpMeter ? (
        <p className="mt-1 text-right text-[11px] font-extrabold leading-[1.2] text-[var(--text-2)]">
          {formatXp(levelXpMeter.current)} / {formatXp(levelXpMeter.total)} XP
        </p>
      ) : null}
    </div>
  ) : null;

  const gamificationError = gamificationState === "error" ? (
    <p
      className="text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]"
      data-testid="mypage-growth-gamification-error"
    >
      배지 정보를 잠시 불러오지 못했어요
    </p>
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
              "grid gap-3 p-4",
              isDesktop ? "p-6" : "",
            ].join(" ")}
          >
            <div
              className={[
                "min-w-0",
                isDesktop ? "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3" : "",
              ].join(" ")}
            >
              <div className="flex min-w-0 items-center gap-2 max-[360px]:gap-1.5">
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
                  <span className="min-w-0" data-testid="mypage-profile-identity">
                    <span className="block truncate text-[20px] font-extrabold leading-[1.2] text-[var(--foreground)] max-[360px]:text-[18px]">
                      {nickname}
                    </span>
                  </span>
                </button>

                {gradeLabel || levelLabel ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-12 w-px shrink-0 bg-[var(--line)]"
                      data-testid="mypage-profile-grade-divider"
                    />
                    <span
                      className={[
                        "flex min-w-0 items-center font-extrabold leading-[1.2] text-[var(--text-2)]",
                        isDesktop ? "gap-2 text-[13px]" : "gap-1.5 text-[12px] max-[360px]:text-[11px]",
                      ].join(" ")}
                      data-testid="mypage-profile-grade-row"
                    >
                      <ProfileGradeAsset
                        grade={hasGamification ? gamification.grade : null}
                        gradeKey={gradeKey}
                        size="md"
                      />
                      <span className="grid min-w-0 gap-1">
                        {gradeLabel ? <span className="truncate">{gradeLabel}</span> : null}
                        {levelLabel ? (
                          <span className="shrink-0 text-[var(--brand)]">{levelLabel}</span>
                        ) : null}
                      </span>
                    </span>
                  </>
                ) : null}
              </div>

              {topActionButtons}
            </div>

            <div className="min-w-0">
              {hasProgress ? (
                <p className="truncate text-[12px] font-extrabold leading-[1.35] text-[var(--text-2)]">
                  {progressCopy}
                </p>
              ) : progressState === "error" ? (
                <p
                  className="text-[12px] font-semibold leading-[1.35] text-[var(--text-3)]"
                  data-testid="mypage-growth-progress-error"
                >
                  XP를 잠시 불러오지 못했어요
                </p>
              ) : null}
              {progressBar ? <div className="mt-2">{progressBar}</div> : null}
              {mobileActionButtons ? <div className="mt-3">{mobileActionButtons}</div> : null}
              {recordStats ? (
                <div className="mt-3">
                  <RecordStatsRow stats={recordStats} />
                </div>
              ) : null}

              {gamificationError ? (
                <div className="mt-2">
                  {gamificationError}
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
              <ProfileGradeAsset
                grade={hasGamification ? gamification.grade : null}
                gradeKey={gradeKey}
                size="sm"
              />
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
        {mobileActionButtons ? <div className="mt-3">{mobileActionButtons}</div> : null}
        {recordStats ? (
          <div className="mt-3">
            <RecordStatsRow stats={recordStats} />
          </div>
        ) : null}
        {gamificationError ? <div className="mt-2">{gamificationError}</div> : null}
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
