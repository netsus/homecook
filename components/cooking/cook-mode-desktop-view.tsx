"use client";

import React from "react";

import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { ScreenWakeLockStatus } from "@/components/cooking/use-screen-wake-lock";
import { WebShell, WebTopNav } from "@/components/web";
import type { CookingModeRecipe } from "@/types/cooking";

interface CookModeDesktopViewProps {
  recipe: CookingModeRecipe;
  variant: "planner" | "standalone";
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

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export function CookModeDesktopView({
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
}: CookModeDesktopViewProps) {
  const summaryParts = [
    "요리모드",
    `${recipe.cooking_servings}인분`,
    ...(variant === "planner" ? [mealContextLabel ?? "플래너 요리"] : []),
  ];

  return (
    <WebShell className="web-cooking-shell web-cooking-shell-dark" wide>
      <WebTopNav
        activeId={variant === "planner" ? "planner" : undefined}
        items={WEB_NAV_ITEMS}
        rightSlot={
          <div className="web-profile-button">
            {variant === "planner" ? "JY" : "◎"}
          </div>
        }
      />

      <main
        className="web-cook-mode-screen web-cook-whole-screen"
        data-cook-theme={colorTheme}
        data-testid={screenTestId}
      >
        <h1 className="sr-only">요리모드</h1>

        <div className="web-cook-whole-board" data-testid={contentTestId}>
          <header className="web-cook-whole-top">
            <div className="web-cook-whole-title">
              <b data-testid={titleTestId} title={recipe.title}>
                {recipe.title}
              </b>
              <span>
                {summaryParts.map((part, index) => (
                  <React.Fragment key={`${part}-${index}`}>
                    {index > 0 ? " · " : null}
                    <span
                      data-testid={
                        part === `${recipe.cooking_servings}인분`
                          ? servingsTestId
                          : undefined
                      }
                    >
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </span>
            </div>

            <div className="web-cook-whole-actions">
              <WakeLockBadge status={wakeLockStatus} />
              <button
                className="web-cook-whole-cancel"
                data-testid={cancelButtonTestId}
                disabled={controlsDisabled}
                onClick={onCancel}
                type="button"
              >
                취소
              </button>
              <button
                className="web-cook-whole-complete"
                data-testid={completeButtonTestId}
                disabled={controlsDisabled}
                onClick={onComplete}
                type="button"
              >
                요리 완료
              </button>
            </div>
          </header>

          <CookModeWholeBoard
            className="web-cook-whole-grid"
            density="desktop"
            recipe={recipe}
          />
        </div>
      </main>
    </WebShell>
  );
}

function WakeLockBadge({ status }: { status: ScreenWakeLockStatus }) {
  if (status !== "active") {
    return null;
  }

  return (
    <span className="web-cook-whole-status" data-testid="cook-mode-wake-lock-status">
      화면 안 꺼짐
    </span>
  );
}
