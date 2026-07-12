"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { CookModeDesktopView } from "@/components/cooking/cook-mode-desktop-view";
import {
  MobileCookModeLoadingBoard,
  WebCookModeLoadingBoard,
} from "@/components/cooking/cook-mode-loading-board";
import { ConsumedIngredientSheet } from "@/components/cooking/consumed-ingredient-sheet";
import {
  MobileCookModeView,
  useIsMobileViewport,
} from "@/components/cooking/cook-mode-mobile-ui";
import { useUserScreenWakeLock } from "@/components/cooking/use-screen-wake-lock";
import { ContentState } from "@/components/shared/content-state";
import { useAppReturn } from "@/components/shared/use-app-return";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
  WebShell,
  WebTopNav,
} from "@/components/web";
import { isCookingApiError } from "@/lib/api/cooking";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { notifyGamificationSourceAction } from "@/lib/gamification-events";
import { formatKoreaCompactDate } from "@/lib/korean-date";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useCookModeStore } from "@/stores/cook-mode-store";

type AuthState = "checking" | "authenticated" | "unauthorized";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

const INTERNAL_URL_BASE = "http://homecook.local";

function getMealContextLabelFromReturnHref(returnHref: string) {
  try {
    const url = new URL(returnHref, INTERNAL_URL_BASE);
    const match = url.pathname.match(/^\/planner\/(\d{4}-\d{2}-\d{2})\/[^/]+$/);
    if (!match) {
      return null;
    }

    const planDate = match[1]!;
    const slot = url.searchParams.get("slot")?.trim();

    return slot
      ? `${formatKoreaCompactDate(planDate)} ${slot}`
      : formatKoreaCompactDate(planDate);
  } catch {
    return null;
  }
}

export interface CookModeScreenProps {
  sessionId: string;
  initialAuthenticated?: boolean;
}

export function CookModeScreen({
  sessionId,
  initialAuthenticated = false,
}: CookModeScreenProps) {
  const router = useRouter();
  const appReturn = useAppReturn({ fallback: "/planner" });
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [showConsumedSheet, setShowConsumedSheet] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const colorTheme = "dark";
  const isMobileViewport = useIsMobileViewport();
  const completePendingRef = useRef(false);
  const cancelPendingRef = useRef(false);

  const screenState = useCookModeStore((s) => s.screenState);
  const storeSessionId = useCookModeStore((s) => s.sessionId);
  const data = useCookModeStore((s) => s.data);
  const errorMessage = useCookModeStore((s) => s.errorMessage);
  const loadCookMode = useCookModeStore((s) => s.loadCookMode);
  const complete = useCookModeStore((s) => s.complete);
  const cancel = useCookModeStore((s) => s.cancel);
  const isCurrentSessionState =
    storeSessionId === null || storeSessionId === sessionId;
  const visibleScreenState = isCurrentSessionState ? screenState : "loading";
  const visibleData = isCurrentSessionState ? data : null;

  // Auth check
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
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load cook mode data after auth
  useEffect(() => {
    if (authState !== "authenticated") return;

    void loadCookMode(sessionId).catch((error) => {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    });
  }, [authState, loadCookMode, sessionId]);

  // Navigate on completed/cancelled
  useEffect(() => {
    if (
      storeSessionId === sessionId &&
      (screenState === "completed" || screenState === "cancelled")
    ) {
      router.push(appReturn.href);
    }
  }, [appReturn.href, screenState, router, sessionId, storeSessionId]);

  const handleCompleteClick = useCallback(() => {
    if (authState !== "authenticated") return;
    setShowConsumedSheet(true);
  }, [authState]);

  const handleConsumedConfirm = useCallback(
    async (consumedIds: string[]) => {
      if (completePendingRef.current) return;
      completePendingRef.current = true;

      try {
        setShowConsumedSheet(false);
        await complete(consumedIds);
        notifyGamificationSourceAction();
      } catch (error) {
        if (isCookingApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
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
      notifyGamificationSourceAction();
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    } finally {
      completePendingRef.current = false;
    }
  }, [complete]);

  const handleCancelClick = useCallback(() => {
    setCancelConfirm(true);
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    if (cancelPendingRef.current) return;
    cancelPendingRef.current = true;

    try {
      setCancelConfirm(false);
      await cancel();
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    } finally {
      cancelPendingRef.current = false;
    }
  }, [cancel]);

  const handleRetry = useCallback(() => {
    void loadCookMode(sessionId).catch(() => {});
  }, [loadCookMode, sessionId]);

  const wakeLock = useUserScreenWakeLock(
    authState === "authenticated" && visibleScreenState === "ready",
  );

  // --- Auth checking ---
  if (authState === "checking") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            description="요리모드에 접근하기 위해 로그인 상태를 확인하고 있어요."
            eyebrow="세션 확인"
            title="로그인 상태를 확인하고 있어요"
            tone="loading"
          />
        </div>
      </div>
    );
  }

  // --- Unauthorized ---
  if (authState === "unauthorized") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            description="요리모드를 이용하려면 로그인이 필요해요. 로그인하면 현재 화면으로 돌아와요."
            title="로그인이 필요해요"
            tone="gate"
          >
            <SocialLoginButtons
              nextPath={`/cooking/sessions/${sessionId}/cook-mode`}
            />
          </ContentState>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (visibleScreenState === "loading") {
    if (!isMobileViewport) {
      return <PlannerCookModeDesktopLoading />;
    }

    return (
      <MobileCookModeLoadingBoard
        description="플래너 요리모드를 불러오는 중이에요."
        loadingTestId="cook-mode-loading"
        screenTestId="cook-mode-screen"
        title="요리모드"
      />
    );
  }

  // --- Not found ---
  if (visibleScreenState === "not_found") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            actionLabel="플래너로 돌아가기"
            description="요리 세션을 찾을 수 없어요."
            onAction={() => router.push("/planner")}
            title="세션을 찾을 수 없어요"
            tone="error"
          />
        </div>
      </div>
    );
  }

  // --- Error ---
  if (visibleScreenState === "error") {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            actionLabel="다시 시도"
            description={errorMessage ?? "잠시 후 다시 시도해 주세요."}
            onAction={handleRetry}
            secondaryActionLabel="플래너로 돌아가기"
            onSecondaryAction={() => router.push("/planner")}
            title="문제가 생겼어요"
            tone="error"
          />
        </div>
      </div>
    );
  }

  // --- Completing / Cancelling ---
  if (
    visibleScreenState === "completing" ||
    visibleScreenState === "cancelling"
  ) {
    return (
      <div
        className="flex min-h-dvh flex-col bg-[var(--wave1-surface)]"
        data-testid="cook-mode-screen"
      >
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            description={
              visibleScreenState === "completing"
                ? "요리를 완료하고 있어요..."
                : "요리를 취소하고 있어요..."
            }
            title={
              visibleScreenState === "completing"
                ? "요리 완료 처리 중"
                : "요리 취소 처리 중"
            }
            tone="loading"
          />
        </div>
      </div>
    );
  }

  // --- Ready (main view) ---
  if (!visibleData) return null;

  const { recipe } = visibleData;
  const mealContextLabel = getMealContextLabelFromReturnHref(appReturn.href);

  if (isMobileViewport) {
    return (
      <>
        <MobileCookModeView
          cancelButtonTestId="cancel-button"
          colorTheme={colorTheme}
          completeButtonTestId="complete-button"
          contentTestId="cook-mode-content"
          controlsDisabled={screenState !== "ready"}
          mealContextLabel={mealContextLabel}
          onCancel={handleCancelClick}
          onComplete={handleCompleteClick}
          recipe={recipe}
          screenTestId="cook-mode-screen"
          servingsTestId="cook-mode-servings"
          titleTestId="cook-mode-title"
          variant="planner"
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

        {cancelConfirm ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 backdrop-blur-[1px]"
            data-testid="cancel-confirm-overlay"
            onClick={() => setCancelConfirm(false)}
          >
            <div
              aria-labelledby="cancel-confirm-title"
              aria-modal="true"
              className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-3)]"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
            >
              <h3
                className="text-base font-bold text-[var(--foreground)]"
                id="cancel-confirm-title"
              >
                요리를 취소할까요?
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                취소하면 이전 끼니 화면으로 돌아가요.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  className="flex min-h-[var(--control-height-md)] flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-transparent text-sm font-semibold text-[var(--foreground)]"
                  data-testid="cancel-confirm-no"
                  onClick={() => setCancelConfirm(false)}
                  type="button"
                >
                  아니요
                </button>
                <button
                  className="flex min-h-[var(--control-height-md)] flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-deep)] text-sm font-bold text-[var(--text-inverse)]"
                  data-testid="cancel-confirm-yes"
                  onClick={handleCancelConfirm}
                  type="button"
                >
                  취소하기
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <CookModeDesktopView
        cancelButtonTestId="cancel-button"
        colorTheme={colorTheme}
        completeButtonTestId="complete-button"
        contentTestId="cook-mode-content"
        controlsDisabled={screenState !== "ready"}
        mealContextLabel={mealContextLabel}
        onCancel={handleCancelClick}
        onComplete={handleCompleteClick}
        recipe={recipe}
        screenTestId="cook-mode-screen"
        servingsTestId="cook-mode-servings"
        titleTestId="cook-mode-title"
        variant="planner"
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

      {cancelConfirm ? (
        <PlannerCookCancelDialog
          onCancel={() => setCancelConfirm(false)}
          onConfirm={handleCancelConfirm}
        />
      ) : null}
    </>
  );
}

function PlannerCookModeDesktopLoading() {
  return (
    <WebShell className="web-cooking-shell web-cooking-shell-dark" footer={false} wide>
      <WebTopNav
        activeId="planner"
        items={WEB_NAV_ITEMS}
        rightSlot={<div className="web-profile-button">JY</div>}
      />
      <main
        className="web-cook-mode-screen web-cook-whole-screen"
        data-cook-theme="dark"
        data-testid="cook-mode-screen"
      >
        <h1 className="sr-only">요리모드</h1>
        <WebCookModeLoadingBoard
          description="플래너 요리모드를 불러오는 중이에요."
          testId="cook-mode-loading"
          title="요리모드"
        />
      </main>
    </WebShell>
  );
}

function PlannerCookCancelDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <WebModal data-testid="cancel-confirm-overlay" onBackdropClick={onCancel}>
      <WebDialog aria-labelledby="cancel-confirm-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="cancel-confirm-title">
            요리를 취소할까요?
          </WebDialogTitle>
        </WebDialogHeader>
        <WebDialogBody>
          <p className="text-sm text-[var(--muted)]">
            취소하면 이전 끼니 화면으로 돌아가요.
          </p>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton data-testid="cancel-confirm-no" onClick={onCancel} variant="tertiary">
            아니요
          </WebButton>
          <WebButton data-testid="cancel-confirm-yes" onClick={onConfirm}>
            취소하기
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}
