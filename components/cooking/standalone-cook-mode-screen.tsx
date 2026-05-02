"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ConsumedIngredientSheet } from "@/components/cooking/consumed-ingredient-sheet";
import { ContentState } from "@/components/shared/content-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isCookingApiError } from "@/lib/api/cooking";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useStandaloneCookModeStore } from "@/stores/standalone-cook-mode-store";
import type { CookingModeIngredient, CookingModeStep } from "@/types/cooking";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ActiveTab = "ingredients" | "steps";

function formatHeatLevel(heat: string | null): string | null {
  if (!heat) return null;
  switch (heat) {
    case "high":
      return "강불";
    case "medium_high":
      return "중강불";
    case "medium":
      return "중불";
    case "medium_low":
      return "중약불";
    case "low":
      return "약불";
    default:
      return heat;
  }
}

function formatDuration(seconds: number | null, text: string | null): string | null {
  if (text) return text;
  if (seconds === null) return null;
  if (seconds < 60) return `${seconds}초`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}분 ${sec}초` : `${min}분`;
}

const SWIPE_MIN_DISTANCE = 30;

function useSwipe(onSwipeLeft: () => void, onSwipeRight: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const handlers = useMemo(
    () => ({
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0];
        startRef.current = { x: touch.clientX, y: touch.clientY };
      },
      onTouchEnd: (e: React.TouchEvent) => {
        if (!startRef.current) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - startRef.current.x;
        const dy = touch.clientY - startRef.current.y;
        startRef.current = null;

        if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
        if (Math.abs(dy) > Math.abs(dx)) return;

        if (dx < 0) {
          onSwipeLeft();
        } else {
          onSwipeRight();
        }
      },
    }),
    [onSwipeLeft, onSwipeRight],
  );

  return handlers;
}

export interface StandaloneCookModeScreenProps {
  recipeId: string;
  servings: number;
}

export function StandaloneCookModeScreen({
  recipeId,
  servings,
}: StandaloneCookModeScreenProps) {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [activeTab, setActiveTab] = useState<ActiveTab>("ingredients");
  const [showConsumedSheet, setShowConsumedSheet] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState(false);
  const completePendingRef = useRef(false);

  const screenState = useStandaloneCookModeStore((s) => s.screenState);
  const data = useStandaloneCookModeStore((s) => s.data);
  const errorMessage = useStandaloneCookModeStore((s) => s.errorMessage);
  const loadStandaloneCookMode = useStandaloneCookModeStore(
    (s) => s.loadStandaloneCookMode,
  );
  const complete = useStandaloneCookModeStore((s) => s.complete);

  // Auth check: standalone cook-mode is public for viewing.
  // We only need auth state to guard the complete action.
  useEffect(() => {
    const e2eOverride = readE2EAuthOverride();
    if (typeof e2eOverride === "boolean") {
      setAuthState(e2eOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      })
      .catch(() => {
        setAuthState("unauthorized");
      });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const newState = session ? "authenticated" : "unauthorized";
        setAuthState(newState);
        if (newState === "authenticated") {
          setShowLoginGate(false);
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load cook mode data from the public endpoint.
  useEffect(() => {
    if (authState === "checking") return;
    void loadStandaloneCookMode(recipeId, servings);
  }, [authState, loadStandaloneCookMode, recipeId, servings]);

  // Navigate on completed
  useEffect(() => {
    if (screenState === "completed") {
      router.push(`/recipe/${recipeId}`);
    }
  }, [screenState, router, recipeId]);

  const handleCompleteClick = useCallback(() => {
    if (authState !== "authenticated") {
      setShowLoginGate(true);
      return;
    }
    setShowConsumedSheet(true);
  }, [authState]);

  const handleConsumedConfirm = useCallback(
    async (consumedIds: string[]) => {
      if (completePendingRef.current) return;
      completePendingRef.current = true;

      try {
        setShowConsumedSheet(false);
        await complete(consumedIds);
      } catch (error) {
        if (isCookingApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          setShowLoginGate(true);
        }
      } finally {
        completePendingRef.current = false;
      }
    },
    [complete],
  );

  const handleConsumedSkip = useCallback(async () => {
    if (completePendingRef.current) return;
    completePendingRef.current = true;

    try {
      setShowConsumedSheet(false);
      await complete([]);
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        setShowLoginGate(true);
      }
    } finally {
      completePendingRef.current = false;
    }
  }, [complete]);

  const handleCancelClick = useCallback(() => {
    router.push(`/recipe/${recipeId}`);
  }, [router, recipeId]);

  const handleRetry = useCallback(() => {
    void loadStandaloneCookMode(recipeId, servings);
  }, [loadStandaloneCookMode, recipeId, servings]);

  const handleSwipeLeft = useCallback(() => setActiveTab("steps"), []);
  const handleSwipeRight = useCallback(() => setActiveTab("ingredients"), []);
  const swipeHandlers = useSwipe(handleSwipeLeft, handleSwipeRight);

  const returnPath = `/cooking/recipes/${recipeId}/cook-mode?servings=${servings}`;

  // --- Auth checking ---
  if (authState === "checking") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--background)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            description="요리모드 준비 중이에요."
            eyebrow="준비 중"
            title="요리모드를 불러오고 있어요"
            tone="loading"
          />
        </div>
      </div>
    );
  }

  // --- Login gate (shown when unauthenticated user tries to complete) ---
  if (showLoginGate) {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--background)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            description="요리 완료를 위해 로그인이 필요해요. 로그인하면 현재 화면으로 돌아옵니다."
            title="로그인이 필요해요"
            tone="gate"
          >
            <SocialLoginButtons nextPath={returnPath} />
            <button
              className="mt-3 text-sm text-[var(--muted)] underline"
              data-testid="login-gate-back"
              onClick={() => setShowLoginGate(false)}
              type="button"
            >
              돌아가기
            </button>
          </ContentState>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (screenState === "loading") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--background)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="p-4" data-testid="standalone-cook-mode-loading">
          <Skeleton className="mb-3" height={32} rounded="md" />
          <Skeleton className="mb-2" height={20} rounded="sm" width="40%" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                className="border border-[var(--line)]"
                height={64}
                key={i}
                rounded="md"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Not found ---
  if (screenState === "not_found") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--background)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            actionLabel="레시피로 돌아가기"
            description="레시피를 찾을 수 없어요."
            onAction={() => router.push(`/recipe/${recipeId}`)}
            title="레시피를 찾을 수 없어요"
            tone="error"
          />
        </div>
      </div>
    );
  }

  // --- Error ---
  if (screenState === "error") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--background)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
            onAction={handleRetry}
            secondaryActionLabel="레시피로 돌아가기"
            onSecondaryAction={() => router.push(`/recipe/${recipeId}`)}
            title="문제가 생겼어요"
            tone="error"
          />
        </div>
      </div>
    );
  }

  // --- Completing ---
  if (screenState === "completing") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--background)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            description="요리를 완료하고 있어요..."
            title="요리 완료 처리 중"
            tone="loading"
          />
        </div>
      </div>
    );
  }

  // --- Ready (main view) ---
  if (!data) return null;

  const { recipe } = data;

  return (
    <div
      className="flex min-h-dvh flex-col bg-[var(--background)]"
      data-testid="standalone-cook-mode-screen"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <h1
          className="truncate text-lg font-bold text-[var(--foreground)]"
          data-testid="standalone-cook-mode-title"
        >
          {recipe.title}
        </h1>
        <span
          className="shrink-0 rounded-full border border-[var(--line)] px-3 py-1 text-xs font-semibold text-[var(--muted)]"
          data-testid="standalone-cook-mode-servings"
        >
          {recipe.cooking_servings}인분
        </span>
      </header>

      {/* Tabs */}
      <nav
        className="flex border-b border-[var(--line)] bg-[var(--surface)]"
        data-testid="standalone-cook-mode-tabs"
        role="tablist"
      >
        <button
          aria-selected={activeTab === "ingredients"}
          className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
            activeTab === "ingredients"
              ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
              : "text-[var(--muted)]"
          }`}
          data-testid="tab-ingredients"
          onClick={() => setActiveTab("ingredients")}
          role="tab"
          type="button"
        >
          재료
        </button>
        <button
          aria-selected={activeTab === "steps"}
          className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
            activeTab === "steps"
              ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
              : "text-[var(--muted)]"
          }`}
          data-testid="tab-steps"
          onClick={() => setActiveTab("steps")}
          role="tab"
          type="button"
        >
          과정
        </button>
      </nav>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-36 pt-4"
        data-testid="standalone-cook-mode-content"
        {...swipeHandlers}
      >
        {activeTab === "ingredients" ? (
          <IngredientList ingredients={recipe.ingredients} />
        ) : (
          <StepList steps={recipe.steps} />
        )}
      </div>

      {/* Bottom CTA */}
      <div className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--surface)] px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        <div className="flex gap-3">
          <button
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)] px-4 py-3 text-sm font-bold text-white"
            data-testid="standalone-complete-button"
            disabled={screenState !== "ready"}
            onClick={handleCompleteClick}
            type="button"
          >
            요리 완료
          </button>
          <button
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--muted)] bg-transparent px-4 py-3 text-sm font-semibold text-[var(--foreground)]"
            data-testid="standalone-cancel-button"
            disabled={screenState !== "ready"}
            onClick={handleCancelClick}
            type="button"
          >
            취소
          </button>
        </div>
      </div>

      {/* Consumed ingredient sheet */}
      {showConsumedSheet ? (
        <ConsumedIngredientSheet
          ingredients={recipe.ingredients}
          onClose={() => setShowConsumedSheet(false)}
          onConfirm={handleConsumedConfirm}
          onSkip={handleConsumedSkip}
        />
      ) : null}
    </div>
  );
}

// --- Sub-components ---

function IngredientList({ ingredients }: { ingredients: CookingModeIngredient[] }) {
  if (ingredients.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        등록된 재료가 없어요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="ingredient-list">
      {ingredients.map((ing) => (
        <li
          className="flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--surface)] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          data-testid="ingredient-item"
          key={ing.ingredient_id}
        >
          <span className="text-sm font-medium text-[var(--foreground)]">
            {ing.standard_name}
          </span>
          <span className="text-sm text-[var(--muted)]">
            {ing.display_text ?? (ing.ingredient_type === "TO_TASTE" ? "적당량" : "")}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepList({ steps }: { steps: CookingModeStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        등록된 조리 과정이 없어요.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4" data-testid="step-list">
      {steps.map((step) => {
        const methodColor = getCookingMethodColor(step.cooking_method.color_key);
        const heat = formatHeatLevel(step.heat_level);
        const duration = formatDuration(step.duration_seconds, step.duration_text);

        return (
          <li
            className="rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            data-testid="step-item"
            key={step.step_number}
            style={{ borderLeft: `4px solid ${methodColor}` }}
          >
            <div className="px-4 py-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--muted)]">
                  {step.step_number}단계
                </span>
                {step.cooking_method.label ? (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: methodColor }}
                  >
                    {step.cooking_method.label}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed text-[var(--foreground)]">
                {step.instruction}
              </p>
              {heat || duration ? (
                <div className="mt-2 flex gap-3">
                  {heat ? (
                    <span className="text-xs text-[var(--muted)]">{heat}</span>
                  ) : null}
                  {duration ? (
                    <span className="text-xs text-[var(--muted)]">{duration}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
