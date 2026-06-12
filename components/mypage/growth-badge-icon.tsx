"use client";

import React from "react";

import type { UserGamificationBadgeShapeKey } from "@/types/user-gamification";

interface GrowthBadgeIconProps {
  className?: string;
  earned?: boolean;
  isNew?: boolean;
  shapeKey?: UserGamificationBadgeShapeKey | string | null;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASS: Record<NonNullable<GrowthBadgeIconProps["size"]>, string> = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
};

const SHAPE_TONE: Record<UserGamificationBadgeShapeKey, string> = {
  plate: "text-[var(--growth-badge-plate-fg)] bg-[var(--growth-badge-plate-bg)]",
  shield: "text-[var(--growth-badge-shield-fg)] bg-[var(--growth-badge-shield-bg)]",
  ribbon: "text-[var(--growth-badge-ribbon-fg)] bg-[var(--growth-badge-ribbon-bg)]",
  bookmark: "text-[var(--growth-badge-bookmark-fg)] bg-[var(--growth-badge-bookmark-bg)]",
  pot: "text-[var(--growth-badge-pot-fg)] bg-[var(--growth-badge-pot-bg)]",
  leaf: "text-[var(--growth-badge-leaf-fg)] bg-[var(--growth-badge-leaf-bg)]",
  bowl: "text-[var(--growth-badge-bowl-fg)] bg-[var(--growth-badge-bowl-bg)]",
};

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
  className,
  earned = true,
  isNew = false,
  shapeKey,
  size = "md",
}: GrowthBadgeIconProps) {
  const normalizedShapeKey = normalizeShapeKey(shapeKey);

  return (
    <span
      aria-hidden="true"
      className={[
        "relative inline-flex shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_3px_9px_rgba(37,31,20,0.12)]",
        "before:absolute before:inset-1 before:rounded-full before:border before:border-[var(--line)] before:content-['']",
        SIZE_CLASS[size],
        earned ? SHAPE_TONE[normalizedShapeKey] : "bg-[var(--surface-fill)] text-[var(--text-3)]",
        className ?? "",
      ].join(" ")}
      data-testid={`growth-badge-shape-${normalizedShapeKey}`}
    >
      <svg
        className="relative z-[1] h-[72%] w-[72%]"
        fill="currentColor"
        viewBox="0 0 48 48"
      >
        <BadgeShape shapeKey={normalizedShapeKey} />
      </svg>
      {isNew ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[var(--surface)] bg-[var(--danger)]" />
      ) : null}
    </span>
  );
}
