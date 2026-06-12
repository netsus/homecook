"use client";

import React from "react";

type GrowthGradeMarkSize = "sm" | "md" | "lg";

interface GrowthGradeMarkProps {
  className?: string;
  gradeKey?: string | null;
  size?: GrowthGradeMarkSize;
}

const SIZE_CLASS: Record<GrowthGradeMarkSize, string> = {
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

const GRADE_META = {
  sprout_homecook: {
    motif: "sprout-soil",
    tone: "from-[var(--growth-badge-leaf-bg)] to-[var(--surface)] text-[var(--growth-badge-leaf-fg)]",
  },
  homecook_runner: {
    motif: "bowl-motion-timer",
    tone: "from-[var(--growth-badge-bowl-bg)] to-[var(--surface)] text-[var(--growth-badge-bowl-fg)]",
  },
  kitchen_explorer: {
    motif: "compass-spoon-map",
    tone: "from-[var(--growth-badge-shield-bg)] to-[var(--surface)] text-[var(--growth-badge-shield-fg)]",
  },
  table_maker: {
    motif: "meal-table-tray",
    tone: "from-[var(--growth-badge-ribbon-bg)] to-[var(--surface)] text-[var(--growth-badge-ribbon-fg)]",
  },
  homecook_artisan: {
    motif: "seal-tool-steam",
    tone: "from-[var(--growth-badge-bookmark-bg)] to-[var(--surface)] text-[var(--growth-badge-bookmark-fg)]",
  },
  table_curator: {
    motif: "curated-plate-leaf",
    tone: "from-[var(--growth-badge-plate-bg)] to-[var(--surface)] text-[var(--growth-badge-plate-fg)]",
  },
  homecook_master: {
    motif: "home-table-laurel",
    tone: "from-[var(--growth-badge-pot-bg)] to-[var(--surface)] text-[var(--growth-badge-pot-fg)]",
  },
} as const;

type KnownGradeKey = keyof typeof GRADE_META;

function normalizeGradeKey(gradeKey: string | null | undefined): KnownGradeKey {
  if (gradeKey && gradeKey in GRADE_META) {
    return gradeKey as KnownGradeKey;
  }

  return "sprout_homecook";
}

function GradeSymbol({ gradeKey }: { gradeKey: KnownGradeKey }) {
  if (gradeKey === "homecook_runner") {
    return (
      <>
        <path d="M16 30h20c-1.2 6.5-5.8 10-10 10s-8.8-3.5-10-10Z" />
        <path d="M18 25h16c-1.4-3.4-4.4-5.2-8-5.2S19.4 21.6 18 25Z" opacity="0.72" />
        <path
          d="M12 19h-6M14 24H7M15 29H9"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.8"
        />
        <circle cx="36" cy="16" fill="none" r="5" stroke="currentColor" strokeWidth="2.4" />
        <path d="M36 13.5V16l2 1.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      </>
    );
  }

  if (gradeKey === "kitchen_explorer") {
    return (
      <>
        <circle cx="24" cy="24" fill="none" r="14" stroke="currentColor" strokeWidth="2.8" />
        <path d="m24 10 4.2 13.8L38 24l-9.8 4.2L24 38l-4.2-9.8L10 24l9.8-.2L24 10Z" />
      </>
    );
  }

  if (gradeKey === "table_maker") {
    return (
      <>
        <path d="M12 18h24v14H12z" opacity="0.82" />
        <circle cx="19" cy="25" fill="var(--surface)" r="4" />
        <circle cx="29" cy="25" fill="var(--surface)" r="4" />
        <path d="M12 34h24M16 34v6M32 34v6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
      </>
    );
  }

  if (gradeKey === "homecook_artisan") {
    return (
      <>
        <path d="M15 12h18l5 7-14 19L10 19l5-7Z" />
        <path d="M18 20h12M20 28c4-5 8-5 12 0" fill="none" stroke="var(--surface)" strokeLinecap="round" strokeWidth="2.6" />
        <path d="M12 38 36 14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="3" />
        <path d="M35 9c3 2 3 5 0 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </>
    );
  }

  if (gradeKey === "table_curator") {
    return (
      <>
        <ellipse cx="24" cy="27" rx="15" ry="10" />
        <ellipse cx="24" cy="27" fill="var(--surface)" rx="8" ry="4.5" />
        <path d="M32 12c-8 .5-13 4.5-13 10 0 3.5 2.5 6 6 6 5 0 8.5-5 7-16Z" />
      </>
    );
  }

  if (gradeKey === "homecook_master") {
    return (
      <>
        <path d="M11 23 24 12l13 11v15H11V23Z" />
        <path d="M19 38V27h10v11" fill="var(--surface)" />
        <path d="M9 36c3-1 5-3 6-6M39 36c-3-1-5-3-6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
      </>
    );
  }

  return (
    <>
      <path d="M22 38h4V22h-4v16Z" />
      <path d="M24 22c-8-1-12-6-12-13 8 1 12 6 12 13ZM24 22c8-1 12-6 12-13-8 1-12 6-12 13Z" />
      <path d="M14 38h20c-1-5-4.5-8-10-8s-9 3-10 8Z" opacity="0.72" />
    </>
  );
}

export function GrowthGradeMark({
  className,
  gradeKey,
  size = "md",
}: GrowthGradeMarkProps) {
  const normalizedGradeKey = normalizeGradeKey(gradeKey);
  const meta = GRADE_META[normalizedGradeKey];

  return (
    <span
      aria-hidden="true"
      className={[
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_12px_rgba(37,31,20,0.12)]",
        "before:absolute before:inset-1 before:rounded-full before:border before:border-[var(--line)] before:content-['']",
        SIZE_CLASS[size],
        meta.tone,
        className ?? "",
      ].join(" ")}
      data-grade-motif={meta.motif}
      data-testid={`growth-grade-mark-${normalizedGradeKey}`}
    >
      <svg
        className="relative z-[1] h-[70%] w-[70%]"
        fill="currentColor"
        viewBox="0 0 48 48"
      >
        <GradeSymbol gradeKey={normalizedGradeKey} />
      </svg>
    </span>
  );
}
