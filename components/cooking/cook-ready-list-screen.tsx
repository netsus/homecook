"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isCookingApiError } from "@/lib/api/cooking";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useCookingReadyStore } from "@/stores/cooking-ready-store";
import type { CookingReadyRecipe } from "@/types/cooking";

type AuthState = "checking" | "authenticated" | "unauthorized";
const COOK_MODE_NAVIGATION_FALLBACK_MS = 250;

export interface CookReadyListScreenProps {
  initialAuthenticated?: boolean;
}

function formatDateRange(start: string, end: string) {
  function format(dateStr: string) {
    const date = new Date(`${dateStr}T00:00:00.000Z`);

    return new Intl.DateTimeFormat("ko-KR", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  return `${format(start)} ~ ${format(end)}`;
}

function RecipeReadyCard({
  recipe,
  isCreating,
  anyCreating,
  onStartSession,
}: {
  recipe: CookingReadyRecipe;
  isCreating: boolean;
  anyCreating: boolean;
  onStartSession: (recipe: CookingReadyRecipe) => void;
}) {
  return (
    <article
      className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-3 shadow-[var(--shadow-2)]"
      data-testid="recipe-ready-card"
    >
      {recipe.recipe_thumbnail_url ? (
        <Image
          alt=""
          className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover"
          height={64}
          src={recipe.recipe_thumbnail_url}
          unoptimized
          width={64}
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-fill)]">
          <span className="text-2xl" aria-hidden="true">
            🍳
          </span>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold text-[var(--foreground)]">
          {recipe.recipe_title}
        </p>
        <p className="text-sm text-[var(--text-3)]">
          {recipe.total_servings}인분
        </p>
      </div>

      <button
        className="shrink-0 rounded-[var(--radius-md)] bg-[var(--brand)] px-4 py-2.5 text-sm font-bold text-white active:bg-[var(--brand-deep)] disabled:opacity-60"
        data-testid="start-session-button"
        disabled={anyCreating}
        onClick={() => onStartSession(recipe)}
        style={{ minHeight: 44 }}
        type="button"
      >
        {isCreating ? "준비 중..." : "요리하기"}
      </button>
    </article>
  );
}

function scheduleCookModeNavigationFallback(targetPath: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.setTimeout(() => {
    if (
      typeof window !== "undefined" &&
      window.location.pathname === "/cooking/ready"
    ) {
      window.location.assign(targetPath);
    }
  }, COOK_MODE_NAVIGATION_FALLBACK_MS);
}

export function CookReadyListScreen({
  initialAuthenticated = false,
}: CookReadyListScreenProps) {
  const router = useRouter();
  const screenState = useCookingReadyStore((s) => s.screenState);
  const dateRange = useCookingReadyStore((s) => s.dateRange);
  const recipes = useCookingReadyStore((s) => s.recipes);
  const errorMessage = useCookingReadyStore((s) => s.errorMessage);
  const creatingRecipeId = useCookingReadyStore((s) => s.creatingRecipeId);
  const loadReady = useCookingReadyStore((s) => s.loadReady);
  const startSession = useCookingReadyStore((s) => s.startSession);

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionPendingRecipeId, setSessionPendingRecipeId] = useState<
    string | null
  >(null);
  const sessionPendingRef = useRef(false);
  const navigationFallbackTimeoutRef = useRef<number | null>(null);
  const activeCreatingRecipeId = sessionPendingRecipeId ?? creatingRecipeId;

  const clearNavigationFallback = useCallback(() => {
    if (
      navigationFallbackTimeoutRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.clearTimeout(navigationFallbackTimeoutRef.current);
    }

    navigationFallbackTimeoutRef.current = null;
  }, []);

  useEffect(() => clearNavigationFallback, [clearNavigationFallback]);

  useEffect(() => {
    const e2eOverride = readE2EAuthOverride();

    if (typeof e2eOverride === "boolean") {
      setAuthState(e2eOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        if (!mounted) return;
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  useEffect(() => {
    if (authState !== "authenticated") return;

    void loadReady().catch((error: unknown) => {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
      }
    });
  }, [authState, loadReady]);

  const handleStartSession = useCallback(
    async (recipe: CookingReadyRecipe) => {
      if (sessionPendingRef.current) return;
      sessionPendingRef.current = true;
      setSessionPendingRecipeId(recipe.recipe_id);
      setSessionError(null);

      try {
        const sessionId = await startSession(recipe);
        const targetPath = `/cooking/sessions/${sessionId}/cook-mode`;
        // Keep locked so buttons do not re-enable before navigation.
        router.push(targetPath);
        clearNavigationFallback();
        navigationFallbackTimeoutRef.current =
          scheduleCookModeNavigationFallback(targetPath);
      } catch (error) {
        clearNavigationFallback();
        sessionPendingRef.current = false;
        setSessionPendingRecipeId(null);

        if (isCookingApiError(error) && error.status === 409) {
          setSessionError(
            "이미 다른 상태로 변경된 식사가 있어요. 새로고침해 주세요.",
          );

          void loadReady().catch(() => {});
          return;
        }

        if (isCookingApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }

        setSessionError("요리 세션을 만들지 못했어요. 다시 시도해 주세요.");
      }
    },
    [clearNavigationFallback, loadReady, router, startSession],
  );

  if (authState === "checking") {
    return (
      <ContentState
        description="요리하기 화면에 접근하기 위해 로그인 상태를 확인하고 있어요."
        eyebrow="세션 확인"
        tone="loading"
        title="로그인 상태를 확인하고 있어요"
      />
    );
  }

  if (authState === "unauthorized") {
    return (
      <ContentState
        description="요리하기를 시작하려면 로그인이 필요해요. 로그인 후에는 다시 이 화면으로 돌아옵니다."
        eyebrow="로그인 필요"
        safeBottomPadding
        tone="gate"
        title="이 화면은 로그인이 필요해요"
      >
        <div className="space-y-3">
          <SocialLoginButtons nextPath="/cooking/ready" />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/planner"
          >
            플래너로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="cook-ready-list-screen">
      {/* AppBar-like header section */}
      <div className="flex items-center gap-3">
        <Link
          aria-label="뒤로가기"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--foreground)]"
          href="/planner"
        >
          <svg fill="none" height="20" viewBox="0 0 12 20" width="12">
            <path
              d="M10 2L2 10l8 8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.5"
            />
          </svg>
        </Link>
        <h1 className="text-xl font-extrabold text-[var(--foreground)]">
          요리하기
        </h1>
      </div>

      {/* Helper section */}
      {screenState === "ready" && dateRange ? (
        <div className="px-1">
          <p className="text-base font-semibold text-[var(--text-2)]">
            장보기 완료된 레시피예요
          </p>
          <p className="text-sm text-[var(--text-3)]">
            {formatDateRange(dateRange.start, dateRange.end)}
          </p>
        </div>
      ) : null}

      {/* Session error toast */}
      {sessionError ? (
        <div
          className="rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand-deep)]"
          data-testid="session-error-toast"
          role="alert"
        >
          {sessionError}
        </div>
      ) : null}

      {/* Loading */}
      {screenState === "loading" ? (
        <div className="flex flex-col gap-3" data-testid="cook-ready-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="border border-[var(--line)]"
              height={88}
              rounded="lg"
            />
          ))}
        </div>
      ) : null}

      {/* Error */}
      {screenState === "error" ? (
        <ContentState
          actionLabel="다시 시도"
          description={errorMessage ?? "잠시 후 다시 시도해주세요."}
          onAction={() => {
            void loadReady().catch(() => {});
          }}
          title="레시피를 불러오지 못했어요"
          tone="error"
        />
      ) : null}

      {/* Empty */}
      {screenState === "empty" ? (
        <ContentState
          actionLabel="플래너로 돌아가기"
          description="플래너에서 장보기를 먼저 완료해 주세요"
          onAction={() => router.push("/planner")}
          title="장보기 완료된 레시피가 없어요"
          tone="empty"
        />
      ) : null}

      {/* Ready: recipe list */}
      {screenState === "ready" ? (
        <div
          className="flex flex-col gap-3"
          data-testid="cook-ready-recipe-list"
        >
          {recipes.map((recipe) => (
            <RecipeReadyCard
              key={recipe.recipe_id}
              anyCreating={activeCreatingRecipeId !== null}
              isCreating={activeCreatingRecipeId === recipe.recipe_id}
              onStartSession={handleStartSession}
              recipe={recipe}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
