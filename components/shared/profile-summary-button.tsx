"use client";

import Image from "next/image";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { MypageGrowthDetailDialog } from "@/components/mypage/mypage-growth-detail-dialog";
import { fetchUserProfile, type UserProfileData } from "@/lib/api/mypage";
import { fetchUserGamification } from "@/lib/api/user-gamification";
import { fetchUserProgress } from "@/lib/api/user-progress";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";
import { getNextTutorialGuide } from "@/lib/gamification-tutorial-guide";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

interface ProfileSummaryButtonProps {
  autoLoad?: boolean;
  className?: string;
  gamification?: UserGamificationData | null;
  isAuthenticated?: boolean;
  profile?: UserProfileData | null;
  progress?: UserProgressData | null;
  useCachedSummary?: boolean;
  variant: "mobile" | "web";
}

type SummaryLoadState = "idle" | "loading" | "ready" | "error";

interface ProfileSummaryCache {
  gamification: UserGamificationData | null;
  profile: UserProfileData | null;
  progress: UserProgressData | null;
}

let cachedProfileSummary: ProfileSummaryCache | null = null;
let profileSummaryRequest: Promise<ProfileSummaryCache> | null = null;

export function ProfileSummaryButton({
  autoLoad = false,
  className,
  gamification,
  isAuthenticated = true,
  profile,
  progress,
  useCachedSummary = false,
  variant,
}: ProfileSummaryButtonProps) {
  const cachedSummary =
    (autoLoad || useCachedSummary) && isAuthenticated
      ? cachedProfileSummary
      : null;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const summaryRefreshRequestRef = useRef<Promise<void> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isNotificationDialogOpen, setIsNotificationDialogOpen] = useState(false);
  const [loadedProfile, setLoadedProfile] = useState<UserProfileData | null>(
    profile ?? cachedSummary?.profile ?? null,
  );
  const [loadedProgress, setLoadedProgress] = useState<UserProgressData | null>(
    progress ?? cachedSummary?.progress ?? null,
  );
  const [loadedGamification, setLoadedGamification] =
    useState<UserGamificationData | null>(
      gamification ?? cachedSummary?.gamification ?? null,
    );
  const [loadState, setLoadState] = useState<SummaryLoadState>(
    profile || progress || gamification || cachedSummary ? "ready" : "idle",
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
    if (!isAuthenticated) {
      return;
    }

    if (profile === undefined && progress === undefined && gamification === undefined) {
      return;
    }

    rememberProfileSummary({
      gamification: gamification ?? cachedProfileSummary?.gamification ?? null,
      profile: profile ?? cachedProfileSummary?.profile ?? null,
      progress: progress ?? cachedProfileSummary?.progress ?? null,
    });
  }, [gamification, isAuthenticated, profile, progress]);

  useEffect(() => {
    if (!autoLoad || !isAuthenticated) {
      return;
    }

    if (loadedProfile || loadedProgress || loadedGamification) {
      return;
    }

    let mounted = true;
    setLoadState("loading");

    const request =
      profileSummaryRequest ??
      Promise.allSettled([
        fetchUserProfile(),
        fetchUserProgress(),
        fetchUserGamification(),
      ]).then(([profileResult, progressResult, gamificationResult]) => {
        const nextSummary = {
          gamification:
            gamificationResult.status === "fulfilled" ? gamificationResult.value : null,
          profile: profileResult.status === "fulfilled" ? profileResult.value : null,
          progress: progressResult.status === "fulfilled" ? progressResult.value : null,
        };

        rememberProfileSummary(nextSummary);

        return nextSummary;
      });

    profileSummaryRequest = request;

    void request.then((nextSummary) => {
      if (!mounted) {
        return;
      }

      setLoadedProfile(nextSummary.profile);
      setLoadedProgress(nextSummary.progress);
      setLoadedGamification(nextSummary.gamification);

      if (hasProfileSummaryData(nextSummary)) {
        setLoadState("ready");
      } else {
        setLoadState("error");
      }
    }).finally(() => {
      if (profileSummaryRequest === request) {
        profileSummaryRequest = null;
      }
    });

    return () => {
      mounted = false;
    };
  }, [autoLoad, isAuthenticated, loadedGamification, loadedProfile, loadedProgress]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") {
      return;
    }

    let mounted = true;

    const refreshGrowthSummary = () => {
      if (summaryRefreshRequestRef.current) {
        return;
      }

      const request = Promise.allSettled([
        fetchUserProgress(),
        fetchUserGamification(),
      ]).then(([progressResult, gamificationResult]) => {
        if (!mounted) {
          return;
        }

        const nextProgress =
          progressResult.status === "fulfilled"
            ? progressResult.value
            : loadedProgress;
        const nextGamification =
          gamificationResult.status === "fulfilled"
            ? gamificationResult.value
            : loadedGamification;
        const nextSummary = {
          gamification: nextGamification,
          profile: loadedProfile ?? cachedProfileSummary?.profile ?? null,
          progress: nextProgress,
        };

        if (progressResult.status === "fulfilled") {
          setLoadedProgress(progressResult.value);
        }
        if (gamificationResult.status === "fulfilled") {
          setLoadedGamification(gamificationResult.value);
        }
        if (hasProfileSummaryData(nextSummary)) {
          setLoadState("ready");
          rememberProfileSummary(nextSummary);
        }
      }).finally(() => {
        summaryRefreshRequestRef.current = null;
      });

      summaryRefreshRequestRef.current = request;
    };

    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, refreshGrowthSummary);

    return () => {
      mounted = false;
      window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, refreshGrowthSummary);
    };
  }, [isAuthenticated, loadedGamification, loadedProfile, loadedProgress]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsidePress = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const target = event.target;

      if (!(target instanceof Node) || rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
    };
  }, [isOpen]);

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
    <div
      className={["profile-summary", `profile-summary-${variant}`, className ?? ""].join(" ")}
      ref={rootRef}
    >
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
          className={[
            "profile-summary-popover",
            variant === "mobile"
              ? "profile-summary-popover-mobile"
              : "profile-summary-popover-web",
          ].join(" ")}
          data-testid={`${variant}-profile-summary-popover`}
          role="dialog"
        >
          <ProfileSummaryPanel
            onOpenNotifications={() => {
              setIsOpen(false);
              setIsNotificationDialogOpen(true);
            }}
            summary={summary}
          />
        </section>
      ) : null}
      {isNotificationDialogOpen ? (
        <MypageGrowthDetailDialog
          data={loadedGamification}
          onClose={() => setIsNotificationDialogOpen(false)}
          panel="notifications"
        />
      ) : null}
    </div>
  );
}

function hasProfileSummaryData(summary: ProfileSummaryCache) {
  return Boolean(summary.profile || summary.progress || summary.gamification);
}

function rememberProfileSummary(summary: ProfileSummaryCache) {
  if (!hasProfileSummaryData(summary)) {
    return;
  }

  cachedProfileSummary = summary;
}

function ProfileSummaryPanel({
  onOpenNotifications,
  summary,
}: {
  onOpenNotifications: () => void;
  summary: ProfileSummaryViewModel;
}) {
  if (summary.state === "guest") {
    return (
      <div className="profile-summary-head">
        <div>
          <strong>로그인이 필요해요</strong>
          <span>로그인하면 기록과 알림을 볼 수 있어요.</span>
        </div>
      </div>
    );
  }

  if (summary.state === "loading") {
    return (
      <div className="profile-summary-head">
        <div>
          <strong>요약을 불러오는 중이에요</strong>
          <span>잠시만 기다려 주세요.</span>
        </div>
      </div>
    );
  }

  if (summary.state === "error") {
    return (
        <div className="profile-summary-head">
          <div>
            <strong>요약을 불러오지 못했어요</strong>
            <span>잠시 후 다시 열어 주세요.</span>
          </div>
        </div>
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
        <button
          className="profile-summary-link profile-summary-link-secondary"
          onClick={onOpenNotifications}
          type="button"
        >
          알림 기록 보기
        </button>
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

  const tutorialGuide = getNextTutorialGuide(gamification);
  const priorityNotice = gamification?.notifications.priority_unseen?.[0] ?? null;
  const archivePreview =
    gamification?.notifications.archive_preview?.slice(0, 2).map((item) => ({
      id: item.id,
      title: item.title,
    })) ?? [];

  return {
    ...base,
    archivePreview,
    cookingCount: progress?.event_counts.cooking_completed ?? 0,
    displayName: profile?.nickname ?? "집밥러",
    gradeLabel: gamification?.grade?.label ?? "새싹 집밥러",
    level: gamification?.level.current_level ?? progress?.level.current_level ?? 1,
    notificationMessage:
      tutorialGuide?.body ??
      priorityNotice?.body ??
      "새로운 알림이 없어요.",
    notificationTitle: tutorialGuide ? "튜토리얼 안내" : (priorityNotice?.title ?? "알림"),
    plannerCount:
      (progress?.event_counts.planner_registered_first ?? 0) +
      (progress?.event_counts.planner_registered_repeat ?? 0),
    questTitle: tutorialGuide?.title ?? null,
    shoppingCount: progress?.event_counts.shopping_completed ?? 0,
    state: "ready",
  };
}

function hasUnreadSummary(gamification: UserGamificationData | null) {
  if (!gamification) {
    return false;
  }

  return (
    (gamification.notifications.priority_unseen?.length ?? 0) > 0 ||
    (gamification.notifications.unseen?.length ?? 0) > 0 ||
    (gamification.quests?.active ?? []).some((quest) => quest.is_new)
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
