"use client";

import React from "react";

import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { ScreenWakeLockStatus } from "@/components/cooking/use-screen-wake-lock";
import type { CookingModeRecipe } from "@/types/cooking";

export { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";

type MobileCookModeVariant = "planner" | "standalone";

interface MobileCookModeViewProps {
  recipe: CookingModeRecipe;
  variant: MobileCookModeVariant;
  mealContextLabel?: string | null;
  screenTestId: string;
  contentTestId: string;
  titleTestId: string;
  servingsTestId: string;
  cancelButtonTestId: string;
  completeButtonTestId: string;
  controlsDisabled: boolean;
  colorTheme: "dark";
  wakeLockStatus: ScreenWakeLockStatus;
  onCancel: () => void;
  onComplete: () => void;
}

export function MobileCookModeView({
  recipe,
  variant,
  mealContextLabel,
  screenTestId,
  contentTestId,
  titleTestId,
  servingsTestId,
  cancelButtonTestId,
  completeButtonTestId,
  controlsDisabled,
  colorTheme,
  wakeLockStatus,
  onCancel,
  onComplete,
}: MobileCookModeViewProps) {
  const summaryParts = [
    "요리모드",
    `${recipe.cooking_servings}인분`,
    ...(variant === "planner" ? [mealContextLabel ?? "플래너 요리"] : []),
  ];

  return (
    <div
      className="cook-mobile-whole-screen relative min-h-dvh overflow-hidden"
      data-cook-theme={colorTheme}
      data-testid={screenTestId}
    >
      <div className="relative flex h-dvh min-h-0 flex-col pb-[92px]">
        <header className="px-4 pb-2 pt-[calc(10px+env(safe-area-inset-top))]">
          <div className="cook-mobile-whole-header-row flex min-h-12 items-center gap-3">
            <button
              aria-label="취소"
              className="cook-mobile-whole-icon-button inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border-0"
              disabled={controlsDisabled}
              onClick={onCancel}
              type="button"
            >
              <ChevronLeftIcon />
            </button>

            <div className="min-w-0 flex-1">
              <h1
                className="cook-mobile-whole-title line-clamp-1 max-w-full text-[18px] font-extrabold leading-[1.12]"
                data-testid={titleTestId}
                title={recipe.title}
              >
                {recipe.title}
              </h1>
              <p
                className="cook-mobile-whole-subtitle mt-1 text-[12px] font-bold leading-[1.25]"
                data-testid={servingsTestId}
              >
                {summaryParts.map((part, index) => (
                  <React.Fragment key={`${part}-${index}`}>
                    {index > 0 ? " · " : null}
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </p>
            </div>

            <WakeLockBadge status={wakeLockStatus} />
          </div>
        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-5"
          data-testid={contentTestId}
        >
          <CookModeWholeBoard density="mobile" recipe={recipe} />
        </main>
      </div>

      <div className="cook-mobile-whole-bottom-bar fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <div className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)] gap-2.5">
          <button
            className="cook-mobile-whole-cancel-button min-h-14 rounded-[16px] border-0 px-3 text-[14px] font-bold leading-none disabled:opacity-60"
            data-testid={cancelButtonTestId}
            disabled={controlsDisabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="cook-mobile-whole-complete-button min-h-14 rounded-[16px] border-0 px-4 text-[17px] font-extrabold leading-none disabled:opacity-60"
            data-testid={completeButtonTestId}
            disabled={controlsDisabled}
            onClick={onComplete}
            type="button"
          >
            요리 완료
          </button>
        </div>
      </div>
    </div>
  );
}

function WakeLockBadge({ status }: { status: ScreenWakeLockStatus }) {
  if (status !== "active") {
    return null;
  }

  return (
    <span
      className="cook-mobile-whole-wake-badge inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-[12px] font-bold leading-none"
      data-testid="cook-mode-wake-lock-status"
    >
      <span className="h-2 w-2 rounded-full" />
      화면 안 꺼짐
    </span>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M15 18 9 12l6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}
