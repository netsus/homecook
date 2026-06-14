"use client";

import Image from "next/image";
import React from "react";

import achievementIconManifest from "@/public/assets/growth/achievement-icons-v3-4/manifest.json";
import type { UserGamificationBadgeShapeKey } from "@/types/user-gamification";

interface GrowthBadgeIconProps {
  badgeKey?: string | null;
  className?: string;
  earned?: boolean;
  isNew?: boolean;
  shapeKey?: UserGamificationBadgeShapeKey | string | null;
  size?: "sm" | "md" | "lg";
  tier?: number;
}

const SIZE_CLASS: Record<NonNullable<GrowthBadgeIconProps["size"]>, string> = {
  sm: "h-11 w-11",
  md: "h-14 w-14",
  lg: "h-[72px] w-[72px]",
};

const SHAPE_TONE: Record<UserGamificationBadgeShapeKey, string> = {
  plate: "text-[var(--growth-badge-plate-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-plate-highlight)_0%,var(--growth-badge-plate-bg)_48%,var(--growth-badge-plate-edge)_100%)]",
  shield: "text-[var(--growth-badge-shield-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-shield-highlight)_0%,var(--growth-badge-shield-bg)_48%,var(--growth-badge-shield-edge)_100%)]",
  ribbon: "text-[var(--growth-badge-ribbon-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-ribbon-highlight)_0%,var(--growth-badge-ribbon-bg)_48%,var(--growth-badge-ribbon-edge)_100%)]",
  bookmark: "text-[var(--growth-badge-bookmark-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-bookmark-highlight)_0%,var(--growth-badge-bookmark-bg)_48%,var(--growth-badge-bookmark-edge)_100%)]",
  pot: "text-[var(--growth-badge-pot-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-pot-highlight)_0%,var(--growth-badge-pot-bg)_48%,var(--growth-badge-pot-edge)_100%)]",
  leaf: "text-[var(--growth-badge-leaf-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-leaf-highlight)_0%,var(--growth-badge-leaf-bg)_48%,var(--growth-badge-leaf-edge)_100%)]",
  bowl: "text-[var(--growth-badge-bowl-fg)] bg-[radial-gradient(circle_at_36%_30%,var(--growth-badge-bowl-highlight)_0%,var(--growth-badge-bowl-bg)_48%,var(--growth-badge-bowl-edge)_100%)]",
};

const TIER_CLASS = [
  "shadow-[var(--growth-badge-tier-0-shadow)]",
  "ring-1 ring-[var(--growth-badge-ring-soft)] shadow-[var(--growth-badge-tier-1-shadow)]",
  "ring-2 ring-[var(--growth-badge-ring-gold)] shadow-[var(--growth-badge-tier-2-shadow)]",
  "ring-2 ring-[var(--growth-badge-ring-blue)] shadow-[var(--growth-badge-tier-3-shadow)]",
];

const ACHIEVEMENT_ICON_SRC_BY_KEY = new Map(
  (
    achievementIconManifest as Array<{
      achievement_key: string;
      src: string;
    }>
  ).map((icon) => [icon.achievement_key, icon.src]),
);

function normalizeShapeKey(shapeKey: GrowthBadgeIconProps["shapeKey"]) {
  if (
    shapeKey === "plate" ||
    shapeKey === "shield" ||
    shapeKey === "ribbon" ||
    shapeKey === "bookmark" ||
    shapeKey === "pot" ||
    shapeKey === "leaf" ||
    shapeKey === "bowl"
  ) {
    return shapeKey;
  }

  return "plate";
}

function BadgeShape({ shapeKey }: { shapeKey: UserGamificationBadgeShapeKey }) {
  if (shapeKey === "shield") {
    return (
      <>
        <path d="M24 7 38 12v10c0 9-5.5 15.5-14 19-8.5-3.5-14-10-14-19V12l14-5Z" />
        <path d="M24 15 27 21l6 .8-4.5 4.2 1.1 6-5.6-3-5.6 3 1.1-6-4.5-4.2 6-.8 3-6Z" fill="var(--surface)" />
      </>
    );
  }

  if (shapeKey === "ribbon") {
    return (
      <>
        <circle cx="24" cy="18" r="12" />
        <path d="M15 27h18l-5 14-4-5-4 5-5-14Z" />
        <circle cx="24" cy="18" fill="var(--surface)" r="5.5" />
      </>
    );
  }

  if (shapeKey === "bookmark") {
    return (
      <>
        <path d="M15 7h18v34l-9-6-9 6V7Z" />
        <path d="M22 14h4v16h-4z" fill="var(--surface)" />
      </>
    );
  }

  if (shapeKey === "pot") {
    return (
      <>
        <path d="M14 21h20l-2 15H16l-2-15Z" />
        <path d="M17 17h14v4H17z" />
        <path d="M10 25c0-3 2-5 5-5v5h-5ZM38 25h-5v-5c3 0 5 2 5 5Z" />
        <path
          d="M20 12c-2-2-1-4 1-6M27 12c2-2 1-4-1-6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </>
    );
  }

  if (shapeKey === "leaf") {
    return (
      <>
        <path d="M38 9c-15 1-25 8-25 19 0 7 5 12 12 12 10 0 16-10 13-31Z" />
        <path
          d="M14 37c5-10 12-16 22-23"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
        />
      </>
    );
  }

  if (shapeKey === "bowl") {
    return (
      <>
        <path d="M9 22h30c-1 11-7 17-15 17S10 33 9 22Z" />
        <path d="M13 18c2-5 7-8 11-8s9 3 11 8H13Z" />
        <path
          d="M17 27h14"
          fill="none"
          stroke="var(--surface)"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
      </>
    );
  }

  return (
    <>
      <ellipse cx="24" cy="24" rx="17" ry="14" />
      <ellipse
        cx="24"
        cy="24"
        fill="var(--surface)"
        rx="10"
        ry="7"
        stroke="currentColor"
        strokeWidth="3"
      />
    </>
  );
}

export function GrowthBadgeIcon({
  badgeKey,
  className,
  earned = true,
  isNew = false,
  shapeKey,
  size = "md",
  tier = 0,
}: GrowthBadgeIconProps) {
  const normalizedShapeKey = normalizeShapeKey(shapeKey);
  const tierClass = TIER_CLASS[Math.min(TIER_CLASS.length - 1, Math.max(0, Math.floor(tier / 2)))];
  const achievementIconSrc = badgeKey ? ACHIEVEMENT_ICON_SRC_BY_KEY.get(badgeKey) : null;

  return (
    <span
      aria-hidden="true"
      className={[
        "relative isolate inline-flex shrink-0 items-center justify-center overflow-visible rounded-full border-2 border-[var(--surface-alpha-90)]",
        "before:absolute before:inset-[5px] before:rounded-full before:border before:border-[var(--surface-alpha-60)] before:content-['']",
        "after:absolute after:left-3 after:top-2 after:h-2 after:w-8 after:rotate-[-12deg] after:rounded-full after:bg-[var(--surface-alpha-55)] after:content-['']",
        SIZE_CLASS[size],
        earned
          ? `${SHAPE_TONE[normalizedShapeKey]} ${tierClass}`
          : "border-dashed border-[var(--line-strong)] bg-[var(--surface-fill)] text-[var(--text-3)] grayscale shadow-[var(--growth-badge-locked-shadow)]",
        className ?? "",
      ].join(" ")}
      data-testid={`growth-badge-shape-${normalizedShapeKey}`}
    >
      {achievementIconSrc ? (
        <Image
          alt=""
          className="relative z-[1] h-[64%] w-[64%] object-contain drop-shadow-[var(--growth-badge-icon-drop-shadow)]"
          data-testid={`growth-badge-image-${badgeKey}`}
          draggable={false}
          height={48}
          sizes="48px"
          src={achievementIconSrc}
          unoptimized
          width={48}
        />
      ) : (
        <svg
          className="relative z-[1] h-[56%] w-[56%] drop-shadow-[var(--growth-badge-icon-drop-shadow)]"
          fill="currentColor"
          viewBox="0 0 48 48"
        >
          <BadgeShape shapeKey={normalizedShapeKey} />
        </svg>
      )}
      {isNew ? (
        <span
          className="absolute -right-1 -top-1 z-[3] rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[8px] font-extrabold leading-none text-[var(--text-inverse)] shadow-[var(--growth-badge-new-shadow)]"
          data-testid="growth-badge-new-label"
        >
          NEW
        </span>
      ) : null}
    </span>
  );
}
