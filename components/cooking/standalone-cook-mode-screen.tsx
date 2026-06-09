"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { CookModeDesktopView } from "@/components/cooking/cook-mode-desktop-view";
import { ConsumedIngredientSheet } from "@/components/cooking/consumed-ingredient-sheet";
import {
  MobileCookModeView,
  useIsMobileViewport,
} from "@/components/cooking/cook-mode-mobile-ui";
import { useUserScreenWakeLock } from "@/components/cooking/use-screen-wake-lock";
import { ContentState } from "@/components/shared/content-state";
import { useAppReturn } from "@/components/shared/use-app-return";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebCard,
  WebEmptyState,
  WebErrorState,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import { isCookingApiError } from "@/lib/api/cooking";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useStandaloneCookModeStore } from "@/stores/standalone-cook-mode-store";

type AuthState = "checking" | "authenticated" | "unauthorized";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export interface StandaloneCookModeScreenProps {
  recipeId: string;
  servings: number;
}

export function StandaloneCookModeScreen({
  recipeId,
  servings,
}: StandaloneCookModeScreenProps) {
  const { goBack: goAppBack, href: appReturnHref } = useAppReturn({
    fallback: `/recipe/${recipeId}`,
  });
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [showConsumedSheet, setShowConsumedSheet] = useState(false);
  const [showLoginGate, setShowLoginGate] = useState(false);
  const colorTheme = "dark";
  const isMobileViewport = useIsMobileViewport();
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
      goAppBack();
    }
  }, [goAppBack, screenState]);

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
    goAppBack();
  }, [goAppBack]);

  const handleRetry = useCallback(() => {
    void loadStandaloneCookMode(recipeId, servings);
  }, [loadStandaloneCookMode, recipeId, servings]);

  const returnPath = buildReturnHref(
    `/cooking/recipes/${recipeId}/cook-mode?servings=${servings}`,
    {
      returnSurface: "recipe.detail",
      returnTo: appReturnHref,
    },
  );

  const wakeLock = useUserScreenWakeLock(
    authState === "authenticated" && screenState === "ready",
  );

  // --- Auth checking ---
  if (authState === "checking") {
    if (!isMobileViewport) {
      return (
        <StandaloneCookModeDesktopLoading
          description="요리모드 준비 중이에요."
          recipeId={recipeId}
          title="요리모드를 불러오고 있어요"
        />
      );
    }

    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
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
    if (!isMobileViewport) {
      return (
        <StandaloneCookModeDesktopState recipeId={recipeId}>
          <WebCard className="web-cook-mode-state-card">
            <WebEmptyState
              action={
                <>
                  <SocialLoginButtons nextPath={returnPath} />
                  <WebButton
                    data-testid="login-gate-back"
                    onClick={() => setShowLoginGate(false)}
                    variant="ghost"
                  >
                    돌아가기
                  </WebButton>
                </>
              }
              description="요리 완료를 위해 로그인이 필요해요. 로그인하면 현재 화면으로 돌아옵니다."
              title="로그인이 필요해요"
            />
          </WebCard>
        </StandaloneCookModeDesktopState>
      );
    }

    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
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
    if (!isMobileViewport) {
      return (
        <StandaloneCookModeDesktopLoading
          description="레시피와 만들기를 준비하고 있어요."
          recipeId={recipeId}
          title="요리모드를 불러오고 있어요"
        />
      );
    }

    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
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
    if (!isMobileViewport) {
      return (
        <StandaloneCookModeDesktopState recipeId={recipeId}>
          <WebCard className="web-cook-mode-state-card">
            <WebErrorState
              action={
                <WebButton onClick={goAppBack} variant="secondary">
                  레시피로 돌아가기
                </WebButton>
              }
              description="레시피를 찾을 수 없어요."
              title="레시피를 찾을 수 없어요"
            />
          </WebCard>
        </StandaloneCookModeDesktopState>
      );
    }

    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            actionLabel="레시피로 돌아가기"
            description="레시피를 찾을 수 없어요."
            onAction={goAppBack}
            title="레시피를 찾을 수 없어요"
            tone="error"
          />
        </div>
      </div>
    );
  }

  // --- Error ---
  if (screenState === "error") {
    if (!isMobileViewport) {
      return (
        <StandaloneCookModeDesktopState recipeId={recipeId}>
          <WebCard className="web-cook-mode-state-card">
            <WebErrorState
              action={
                <div className="web-cook-mode-state-actions">
                  <WebButton onClick={handleRetry}>다시 시도</WebButton>
                  <WebButton onClick={goAppBack} variant="ghost">
                    레시피로 돌아가기
                  </WebButton>
                </div>
              }
              description={errorMessage ?? "잠시 후 다시 시도해주세요."}
              title="문제가 생겼어요"
            />
          </WebCard>
        </StandaloneCookModeDesktopState>
      );
    }

    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="standalone-cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
            onAction={handleRetry}
            secondaryActionLabel="레시피로 돌아가기"
            onSecondaryAction={goAppBack}
            title="문제가 생겼어요"
            tone="error"
          />
        </div>
      </div>
    );
  }

  // --- Completing ---
  if (screenState === "completing") {
    if (!isMobileViewport) {
      return (
        <StandaloneCookModeDesktopState recipeId={recipeId}>
          <WebCard className="web-cook-mode-state-card">
            <WebEmptyState
              description="요리를 완료하고 있어요..."
              title="요리 완료 처리 중"
            />
          </WebCard>
        </StandaloneCookModeDesktopState>
      );
    }

    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
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

  if (isMobileViewport) {
    return (
      <>
        <MobileCookModeView
          cancelButtonTestId="standalone-cancel-button"
          colorTheme={colorTheme}
          completeButtonTestId="standalone-complete-button"
          contentTestId="standalone-cook-mode-content"
          controlsDisabled={screenState !== "ready"}
          onCancel={handleCancelClick}
          onComplete={handleCompleteClick}
          recipe={recipe}
          screenTestId="standalone-cook-mode-screen"
          servingsTestId="standalone-cook-mode-servings"
          titleTestId="standalone-cook-mode-title"
          variant="standalone"
          wakeLockStatus={wakeLock.status}
        />

        {showConsumedSheet ? (
          <ConsumedIngredientSheet
            ingredients={recipe.ingredients}
            onClose={() => setShowConsumedSheet(false)}
            onConfirm={handleConsumedConfirm}
            onSkip={handleConsumedSkip}
            recipeTitle={recipe.title}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <CookModeDesktopView
        cancelButtonTestId="standalone-cancel-button"
        colorTheme={colorTheme}
        completeButtonTestId="standalone-complete-button"
        contentTestId="standalone-cook-mode-content"
        controlsDisabled={screenState !== "ready"}
        onCancel={handleCancelClick}
        onComplete={handleCompleteClick}
        recipe={recipe}
        screenTestId="standalone-cook-mode-screen"
        servingsTestId="standalone-cook-mode-servings"
        titleTestId="standalone-cook-mode-title"
        variant="standalone"
        wakeLockStatus={wakeLock.status}
      />

      {showConsumedSheet ? (
        <ConsumedIngredientSheet
          ingredients={recipe.ingredients}
          onClose={() => setShowConsumedSheet(false)}
          onConfirm={handleConsumedConfirm}
          onSkip={handleConsumedSkip}
          recipeTitle={recipe.title}
        />
      ) : null}

    </>
  );
}

function StandaloneCookModeDesktopState({
  children,
  recipeId,
}: {
  children: React.ReactNode;
  recipeId: string;
}) {
  return (
    <WebShell className="web-cooking-shell" wide>
      <WebTopNav
        items={WEB_NAV_ITEMS}
        rightSlot={<div className="web-profile-button">◎</div>}
      />
      <main
        className="web-cook-mode-screen"
        data-testid="standalone-cook-mode-screen"
      >
        <nav aria-label="현재 위치" className="web-cook-breadcrumb">
          <a href={`/recipe/${recipeId}`}>레시피</a>
          <span aria-hidden="true">/</span>
          <strong>독립 요리모드</strong>
        </nav>
        {children}
      </main>
    </WebShell>
  );
}

function StandaloneCookModeDesktopLoading({
  description,
  recipeId,
  title,
}: {
  description: string;
  recipeId: string;
  title: string;
}) {
  return (
    <StandaloneCookModeDesktopState recipeId={recipeId}>
      <WebCard
        className="web-cook-mode-state-card"
        data-testid="standalone-cook-mode-loading"
      >
        <div className="web-cook-mode-loading-head">
          <WebSkeleton height={18} width={120} />
          <WebSkeleton height={34} width="42%" />
          <WebSkeleton height={16} width="34%" />
          <span className="visually-hidden">
            {title}. {description}
          </span>
        </div>
        <div className="web-cook-mode-loading-layout">
          <div className="web-cook-mode-loading-list">
            {Array.from({ length: 4 }).map((_, index) => (
              <WebSkeleton height={96} key={index} />
            ))}
          </div>
          <div className="web-cook-mode-loading-rail">
            <WebSkeleton height={22} width={140} />
            {Array.from({ length: 5 }).map((_, index) => (
              <WebSkeleton height={48} key={index} />
            ))}
            <WebSkeleton height={44} />
            <WebSkeleton height={44} />
          </div>
        </div>
      </WebCard>
    </StandaloneCookModeDesktopState>
  );
}
