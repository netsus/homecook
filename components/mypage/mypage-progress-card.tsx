"use client";

import React from "react";

import type { UserProgressData } from "@/types/user-progress";

export type MypageProgressState = "idle" | "loading" | "ready" | "error";

interface MypageProgressCardProps {
  className?: string;
  progress: UserProgressData | null;
  state: MypageProgressState;
  variant?: "card" | "inline";
}

const XP_FORMATTER = new Intl.NumberFormat("ko-KR");

function formatXp(value: number) {
  return XP_FORMATTER.format(value);
}

function isValidProgress(progress: UserProgressData | null): progress is UserProgressData {
  if (!progress) return false;

  const level = (progress as Partial<UserProgressData>).level;
  if (!level) return false;

  const { current_level, progress_percent, total_xp, xp_to_next_level } = level;

  return (
    Number.isFinite(current_level) &&
    Number.isFinite(progress_percent) &&
    Number.isFinite(total_xp) &&
    Number.isFinite(xp_to_next_level) &&
    progress_percent >= 0 &&
    progress_percent <= 100
  );
}

export function MypageProgressCard({
  className,
  progress,
  state,
  variant = "card",
}: MypageProgressCardProps) {
  const isInline = variant === "inline";

  if (state === "loading" || state === "idle") {
    if (isInline) {
      return (
        <div
          aria-label="성장 기록을 불러오는 중"
          className={["min-w-0", className ?? ""].join(" ")}
          data-testid="mypage-progress-loading"
        >
          <div className="flex items-center gap-2">
            <div className="h-3 w-10 rounded-full bg-[var(--surface-subtle)]" />
            <div className="h-3 w-20 rounded-full bg-[var(--surface-subtle)]" />
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-[var(--surface-subtle)]" />
        </div>
      );
    }

    return (
      <div
        aria-label="성장 기록을 불러오는 중"
        className={[
          "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-fill)] p-3",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-progress-loading"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="h-4 w-12 rounded-full bg-[var(--surface-subtle)]" />
          <div className="h-4 w-9 rounded-full bg-[var(--surface-subtle)]" />
        </div>
        <div className="mt-2 h-3 w-40 max-w-full rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-3 h-2 rounded-full bg-[var(--surface-subtle)]" />
        <div className="mt-2 h-3 w-20 rounded-full bg-[var(--surface-subtle)]" />
      </div>
    );
  }

  if (state === "error" || !isValidProgress(progress)) {
    if (isInline) {
      return (
        <p
          className={[
            "truncate text-[11px] font-semibold leading-[1.35] text-[var(--text-3)]",
            className ?? "",
          ].join(" ")}
          data-testid="mypage-progress-error"
        >
          성장 기록을 잠시 불러오지 못했어요
        </p>
      );
    }

    return (
      <div
        className={[
          "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-fill)] p-3 text-[12px] font-semibold leading-[1.45] text-[var(--text-3)]",
          className ?? "",
        ].join(" ")}
        data-testid="mypage-progress-error"
      >
        성장 기록을 잠시 불러오지 못했어요
      </div>
    );
  }

  const {
    current_level,
    progress_percent,
    total_xp,
    xp_to_next_level,
  } = progress.level;
  const levelLabel = `Lv.${current_level}`;
  const progressCopy =
    total_xp === 0
      ? "첫 끼니 기록을 시작해 보세요"
      : `다음 레벨까지 ${formatXp(xp_to_next_level)} XP`;

  if (isInline) {
    return (
      <div
        className={["min-w-0", className ?? ""].join(" ")}
        data-testid="mypage-progress-card"
      >
        <div className="flex min-w-0 items-center gap-2">
          <strong className="shrink-0 text-[12px] font-extrabold leading-none text-[var(--foreground)]">
            {levelLabel}
          </strong>
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-none text-[var(--text-2)]">
            {progressCopy}
          </span>
          <span className="shrink-0 text-[11px] font-extrabold leading-none text-[var(--brand)]">
            {progress_percent}%
          </span>
        </div>
        <div
          aria-label={`${levelLabel}, ${progressCopy}, 진행률 ${progress_percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress_percent}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-[var(--brand)]"
            data-testid="mypage-progress-fill"
            style={{ width: `${progress_percent}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-fill)] p-3",
        className ?? "",
      ].join(" ")}
      data-testid="mypage-progress-card"
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="min-w-0 text-[15px] font-extrabold leading-none text-[var(--foreground)]">
          {levelLabel}
        </strong>
        <span className="shrink-0 text-[12px] font-extrabold leading-none text-[var(--brand)]">
          {progress_percent}%
        </span>
      </div>
      <p className="mt-2 text-[12px] font-semibold leading-[1.35] text-[var(--text-2)]">
        {progressCopy}
      </p>
      <div
        aria-label={`${levelLabel}, ${progressCopy}, 진행률 ${progress_percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progress_percent}
        className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-[var(--brand)]"
          data-testid="mypage-progress-fill"
          style={{ width: `${progress_percent}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-none text-[var(--text-3)]">
        누적 {formatXp(total_xp)} XP
      </p>
    </div>
  );
}
