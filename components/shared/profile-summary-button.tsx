"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

import { fetchUserProfile, type UserProfileData } from "@/lib/api/mypage";
import { fetchUserGamification } from "@/lib/api/user-gamification";
import { fetchUserProgress } from "@/lib/api/user-progress";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

interface ProfileSummaryButtonProps {
  autoLoad?: boolean;
  className?: string;
  gamification?: UserGamificationData | null;
  isAuthenticated?: boolean;
  profile?: UserProfileData | null;
  progress?: UserProgressData | null;
  variant: "mobile" | "web";
}

type SummaryLoadState = "idle" | "loading" | "ready" | "error";

export function ProfileSummaryButton({
  autoLoad = false,
  className,
  gamification,
  isAuthenticated = true,
  profile,
  progress,
  variant,
}: ProfileSummaryButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<UserProfileData | null>(
    profile ?? null,
  );
  const [loadedProgress, setLoadedProgress] = useState<UserProgressData | null>(
    progress ?? null,
  );
  const [loadedGamification, setLoadedGamification] =
    useState<UserGamificationData | null>(gamification ?? null);
  const [loadState, setLoadState] = useState<SummaryLoadState>(
    profile || progress || gamification ? "ready" : "idle",
  );

  useEffect(() => {
    if (profile !== undefined) {
      setLoadedProfile(profile);
    }
  }, [profile]);

  useEffect(() => {
    if (progress !== undefined) {
      setLoadedProgress(progress);
    }
  }, [progress]);

  useEffect(() => {
    if (gamification !== undefined) {
      setLoadedGamification(gamification);
    }
  }, [gamification]);

  useEffect(() => {
    if (!autoLoad || !isAuthenticated) {
      return;
    }

    if (loadedProfile || loadedProgress || loadedGamification) {
      return;
    }

    let mounted = true;
    setLoadState("loading");

    void Promise.allSettled([
      fetchUserProfile(),
      fetchUserProgress(),
      fetchUserGamification(),
    ]).then(([profileResult, progressResult, gamificationResult]) => {
      if (!mounted) {
        return;
      }

      if (profileResult.status === "fulfilled") {
        setLoadedProfile(profileResult.value);
      }
      if (progressResult.status === "fulfilled") {
        setLoadedProgress(progressResult.value);
      }
      if (gamificationResult.status === "fulfilled") {
        setLoadedGamification(gamificationResult.value);
      }

      if (
        profileResult.status === "fulfilled" ||
        progressResult.status === "fulfilled" ||
        gamificationResult.status === "fulfilled"
      ) {
        setLoadState("ready");
      } else {
        setLoadState("error");
      }
    });

    return () => {
      mounted = false;
    };
  }, [autoLoad, isAuthenticated, loadedGamification, loadedProfile, loadedProgress]);

  const summary = useMemo(
    () =>
      buildProfileSummary({
        gamification: loadedGamification,
        isAuthenticated,
        loadState,
        profile: loadedProfile,
        progress: loadedProgress,
      }),
    [isAuthenticated, loadState, loadedGamification, loadedProfile, loadedProgress],
  );

  return (
    <div className={["profile-summary", `profile-summary-${variant}`, className ?? ""].join(" ")}>
      <button
        aria-expanded={isOpen}
        aria-label={
          summary.profileName
            ? `${summary.profileName} 프로필 요약 ${isOpen ? "닫기" : "열기"}`
            : `내 프로필 요약 ${isOpen ? "닫기" : "열기"}`
        }
        className="web-profile-button"
        data-testid={`${variant}-profile-summary-button`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {summary.profileImageUrl ? (
          <Image
            alt=""
            className="web-profile-button-image"
            height={40}
            src={summary.profileImageUrl}
            unoptimized
            width={40}
          />
        ) : summary.fallbackInitial ? (
          <span aria-hidden="true" className="web-profile-button-fallback">
            {summary.fallbackInitial}
          </span>
        ) : (
          <UserIcon />
        )}
        {summary.hasUnread ? (
          <span
            aria-hidden="true"
            className="profile-summary-unread-badge"
            data-testid="profile-summary-unread-badge"
          />
        ) : null}
      </button>

      {isOpen ? (
        <section
          aria-label="마이페이지 요약"
          className="profile-summary-popover"
          data-testid={`${variant}-profile-summary-popover`}
          role="dialog"
        >
          <ProfileSummaryPanel summary={summary} />
        </section>
      ) : null}
    </div>
  );
}

function ProfileSummaryPanel({ summary }: { summary: ProfileSummaryViewModel }) {
  if (summary.state === "guest") {
    return (
      <>
        <div className="profile-summary-head">
          <div>
            <strong>로그인이 필요해요</strong>
            <span>로그인하면 기록과 알림을 볼 수 있어요.</span>
          </div>
        </div>
        <Link className="profile-summary-link" href="/mypage">
          마이페이지로 이동
        </Link>
      </>
    );
  }

  if (summary.state === "loading") {
    return (
      <>
        <div className="profile-summary-head">
          <div>
            <strong>요약을 불러오는 중이에요</strong>
            <span>잠시만 기다려 주세요.</span>
          </div>
        </div>
        <Link className="profile-summary-link" href="/mypage">
          마이페이지로 이동
        </Link>
      </>
    );
  }

  if (summary.state === "error") {
    return (
      <>
        <div className="profile-summary-head">
          <div>
            <strong>요약을 불러오지 못했어요</strong>
            <span>마이페이지에서 다시 확인할 수 있어요.</span>
          </div>
        </div>
        <Link className="profile-summary-link" href="/mypage">
          마이페이지로 이동
        </Link>
      </>
    );
  }

  if (summary.state !== "ready") {
    return null;
  }

  return (
    <>
      <div className="profile-summary-head">
        <div>
          <strong>{summary.displayName}</strong>
          <span>{summary.gradeLabel}</span>
        </div>
        <b>Lv.{summary.level}</b>
      </div>
      <div className="profile-summary-stats" aria-label="기록 요약">
        <span>
          <b>{summary.cookingCount}</b>
          요리기록
        </span>
        <span>
          <b>{summary.plannerCount}</b>
          플래너기록
        </span>
        <span>
          <b>{summary.shoppingCount}</b>
          장보기기록
        </span>
      </div>
      <div className="profile-summary-notice" role="status">
        <strong>{summary.notificationTitle}</strong>
        {summary.questTitle ? <span>{summary.questTitle}</span> : null}
        <span>{summary.notificationMessage}</span>
      </div>
      {summary.archivePreview.length > 0 ? (
        <div className="profile-summary-archive-preview">
          <strong>최근 알림</strong>
          {summary.archivePreview.map((item) => (
            <span key={item.id}>{item.title}</span>
          ))}
        </div>
      ) : null}
      <div className="profile-summary-actions">
        <Link className="profile-summary-link profile-summary-link-secondary" href="/mypage?notifications=1">
          알림 기록 보기
        </Link>
        <Link className="profile-summary-link" href="/mypage">
          마이페이지로 이동
        </Link>
      </div>
    </>
  );
}

type ProfileSummaryViewModel =
  | {
      fallbackInitial: string | null;
      hasUnread: boolean;
      profileImageUrl: string | null;
      profileName: string | null;
      state: "guest" | "loading" | "error";
    }
  | {
      archivePreview: Array<{ id: string; title: string }>;
      cookingCount: number;
      displayName: string;
      fallbackInitial: string | null;
      gradeLabel: string;
      hasUnread: boolean;
      level: number;
      notificationMessage: string;
      notificationTitle: string;
      plannerCount: number;
      profileImageUrl: string | null;
      profileName: string | null;
      questTitle: string | null;
      shoppingCount: number;
      state: "ready";
    };

function buildProfileSummary({
  gamification,
  isAuthenticated,
  loadState,
  profile,
  progress,
}: {
  gamification: UserGamificationData | null;
  isAuthenticated: boolean;
  loadState: SummaryLoadState;
  profile: UserProfileData | null;
  progress: UserProgressData | null;
}): ProfileSummaryViewModel {
  const fallbackInitial = profile?.nickname?.slice(0, 1).toUpperCase() ?? null;
  const base = {
    fallbackInitial,
    hasUnread: hasUnreadSummary(gamification),
    profileImageUrl: profile?.profile_image_url ?? null,
    profileName: profile?.nickname ?? null,
  };
  const hasSummaryData = Boolean(profile || progress || gamification);

  if (!isAuthenticated && !hasSummaryData) {
    return { ...base, state: "guest" };
  }

  if (!hasSummaryData && loadState === "error") {
    return { ...base, state: "error" };
  }

  if (!hasSummaryData) {
    return { ...base, state: "loading" };
  }

  const quest =
    gamification?.quests.active.find((item) => item.quest_type === "tutorial") ??
    gamification?.quests.active[0] ??
    null;
  const priorityNotice = gamification?.notifications.priority_unseen[0] ?? null;
  const archivePreview =
    gamification?.notifications.archive_preview.slice(0, 2).map((item) => ({
      id: item.id,
      title: item.title,
    })) ?? [];

  return {
    ...base,
    archivePreview,
    cookingCount: progress?.event_counts.cooking_completed ?? 0,
    displayName: profile?.nickname ?? "집밥러",
    gradeLabel: gamification?.grade.label ?? "새싹 집밥러",
    level: gamification?.level.current_level ?? progress?.level.current_level ?? 1,
    notificationMessage:
      priorityNotice?.body ??
      (quest ? `${quest.title}부터 차근차근 시작해 보세요.` : "새로운 알림이 없어요."),
    notificationTitle: priorityNotice?.title ?? (quest ? "튜토리얼 안내" : "알림"),
    plannerCount:
      (progress?.event_counts.planner_registered_first ?? 0) +
      (progress?.event_counts.planner_registered_repeat ?? 0),
    questTitle: quest?.title ?? null,
    shoppingCount: progress?.event_counts.shopping_completed ?? 0,
    state: "ready",
  };
}

function hasUnreadSummary(gamification: UserGamificationData | null) {
  if (!gamification) {
    return false;
  }

  return (
    gamification.notifications.priority_unseen.length > 0 ||
    gamification.notifications.unseen.length > 0 ||
    gamification.quests.active.some((quest) => quest.is_new)
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      viewBox="0 0 20 20"
      width="20"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.75 17c.65-2.65 2.46-4 5.25-4s4.6 1.35 5.25 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}
