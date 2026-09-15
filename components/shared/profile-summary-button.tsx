"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";

import { fetchUserProfile, type UserProfileData } from "@/lib/api/mypage";
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

let cachedProfile: UserProfileData | null = null;
let profileRequest: Promise<UserProfileData | null> | null = null;

export function ProfileSummaryButton({
  autoLoad = false,
  className,
  isAuthenticated = true,
  profile,
  useCachedSummary = false,
  variant,
}: ProfileSummaryButtonProps) {
  const [loadedProfile, setLoadedProfile] = useState<UserProfileData | null>(
    profile ?? (useCachedSummary || autoLoad ? cachedProfile : null),
  );

  useEffect(() => {
    if (profile === undefined) return;
    setLoadedProfile(profile);
    if (profile) cachedProfile = profile;
  }, [profile]);

  useEffect(() => {
    if (!autoLoad || !isAuthenticated || loadedProfile) return;

    let mounted = true;
    const request = profileRequest ?? fetchUserProfile().catch(() => null);
    profileRequest = request;

    void request
      .then((nextProfile) => {
        if (!mounted || !nextProfile) return;
        cachedProfile = nextProfile;
        setLoadedProfile(nextProfile);
      })
      .finally(() => {
        if (profileRequest === request) profileRequest = null;
      });

    return () => {
      mounted = false;
    };
  }, [autoLoad, isAuthenticated, loadedProfile]);

  const fallbackInitial = loadedProfile?.nickname?.slice(0, 1).toUpperCase() ?? null;

  return (
    <div className={["profile-summary", `profile-summary-${variant}`, className ?? ""].join(" ")}>
      <Link
        aria-label="마이페이지"
        className="web-profile-button"
        data-testid={`${variant}-profile-summary-button`}
        href="/mypage"
        prefetch={false}
      >
        {loadedProfile?.profile_image_url ? (
          <Image
            alt=""
            className="web-profile-button-image"
            height={40}
            src={loadedProfile.profile_image_url}
            unoptimized
            width={40}
          />
        ) : fallbackInitial ? (
          <span aria-hidden="true" className="web-profile-button-fallback">
            {fallbackInitial}
          </span>
        ) : (
          <UserIcon />
        )}
      </Link>
    </div>
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
