"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { APP_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";
import { Skeleton } from "@/components/ui/skeleton";
import { isCookingApiError } from "@/lib/api/cooking";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import {
  type CookingReadyScreenState,
  useCookingReadyStore,
} from "@/stores/cooking-ready-store";
import type { CookingReadyRecipe } from "@/types/cooking";

type AuthState = "checking" | "authenticated" | "unauthorized";
const COOK_MODE_NAVIGATION_FALLBACK_MS = 250;
const MOBILE_COOK_READY_PLACEMENTS = [
  { index: 1, slot: "아침" },
  { index: 2, slot: "아침" },
  { index: 3, slot: "아침" },
  { index: 1, slot: "점심" },
  { index: 1, slot: "저녁" },
] as const;

const mobileMethodColors = {
  boil: { bg: "#FFEBEB", border: "#FF6B6B", label: "끓이기", text: "#C92A2A" },
  mix: { bg: "#D3F9D8", border: "#51CF66", label: "무치기", text: "#2B8A3E" },
  prep: { bg: "#F1F3F5", border: "#ADB5BD", label: "준비", text: "#495057" },
  stirfry: { bg: "#FFF4E8", border: "#FFB347", label: "볶기", text: "#D97706" },
} as const;

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

function formatMobileCookDate(start: string | undefined) {
  if (!start) return "오늘";

  const date = new Date(`${start}T00:00:00.000Z`);
  const label = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  }).format(date);

  return `오늘 ${label}`;
}

function formatMobileMealDate(start: string | undefined) {
  if (!start) return "오늘";

  const date = new Date(`${start}T00:00:00.000Z`);

  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function getMobileReadyVisual(recipe: CookingReadyRecipe, index: number) {
  // The ready API owns cooking-session behavior; these fields only recreate the fixed prototype visuals.
  const title = recipe.recipe_title;

  if (title.includes("된장")) {
    return {
      bg: "linear-gradient(135deg, #FFE0E0 0%, #FFB8B8 100%)",
      emoji: "🍲",
      method: mobileMethodColors.boil,
      minutes: 25,
      status:
        index === 1
          ? { bg: "#FFF4E1", label: "장보기 완료", text: "#B8860B" }
          : { bg: "#F1F3F5", label: "등록", text: "#495057" },
    };
  }

  if (title.includes("샐러드")) {
    return {
      bg: "linear-gradient(135deg, #E8F5E0 0%, #C8E6A0 100%)",
      emoji: "🥗",
      method: mobileMethodColors.mix,
      minutes: 10,
      status: { bg: "#F1F3F5", label: "등록", text: "#495057" },
    };
  }

  if (title.includes("볶음")) {
    return {
      bg: "linear-gradient(135deg, #FFE8E0 0%, #FFD0BC 100%)",
      emoji: "🍚",
      method: mobileMethodColors.stirfry,
      minutes: 15,
      status: { bg: "#F1F3F5", label: "등록", text: "#495057" },
    };
  }

  return {
    bg: "linear-gradient(135deg, #F1F3F5 0%, #DEE2E6 100%)",
    emoji: "🍳",
    method: mobileMethodColors.prep,
    minutes: 15,
    status: { bg: "#F1F3F5", label: "등록", text: "#495057" },
  };
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
      className="group flex min-h-[160px] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"
      data-testid="recipe-ready-card"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-fill)]">
        {recipe.recipe_thumbnail_url ? (
          <Image
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            fill
            sizes="(min-width: 1024px) 280px, 64px"
            src={recipe.recipe_thumbnail_url}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-[var(--muted)]">
            <svg
              aria-hidden="true"
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              viewBox="0 0 24 24"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
              <path d="M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" />
            </svg>
            <span className="text-xs font-semibold">사진 없음</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold tracking-[-0.3px] text-[var(--foreground)]">
            {recipe.recipe_title}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-3)]">
            <span>{recipe.total_servings}인분</span>
            <span aria-hidden="true">·</span>
            <span>{recipe.meal_ids.length}개 식사</span>
          </p>
        </div>

        <button
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-bold text-white active:bg-[var(--brand-deep)] disabled:opacity-60"
          data-testid="start-session-button"
          disabled={anyCreating}
          onClick={() => onStartSession(recipe)}
          type="button"
        >
          {isCreating ? "준비 중..." : "요리하기"}
        </button>
      </div>
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const sessionPendingRef = useRef(false);
  const navigationFallbackTimeoutRef = useRef<number | null>(null);
  const activeCreatingRecipeId = sessionPendingRecipeId ?? creatingRecipeId;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const query = window.matchMedia(APP_VIEW_MEDIA_QUERY);
    const syncViewport = () => setIsMobileViewport(query.matches);
    syncViewport();
    query.addEventListener("change", syncViewport);
    return () => query.removeEventListener("change", syncViewport);
  }, []);

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

  if (isMobileViewport) {
    return (
      <MobileCookReadyListScreen
        activeCreatingRecipeId={activeCreatingRecipeId}
        dateRange={dateRange}
        errorMessage={errorMessage}
        loadReady={loadReady}
        onEmptyAction={() => router.push("/planner")}
        onStartSession={handleStartSession}
        recipes={recipes}
        screenState={screenState}
        sessionError={sessionError}
      />
    );
  }

  const totalReadyServings = recipes.reduce(
    (sum, recipe) => sum + recipe.total_servings,
    0,
  );
  const totalReadyMeals = recipes.reduce(
    (sum, recipe) => sum + recipe.meal_ids.length,
    0,
  );

  return (
    <div className="space-y-6 pb-12" data-testid="cook-ready-list-screen">
      <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-1)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Link
              aria-label="뒤로가기"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface-fill)] px-4 text-sm font-semibold text-[var(--text-2)] hover:text-[var(--brand)]"
              href="/planner"
            >
              <span aria-hidden="true">&lt;</span>
              플래너 보기
            </Link>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              Cook Ready
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-[-0.3px] text-[var(--foreground)]">
              요리하기
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              장보기까지 끝난 식사를 모아 바로 요리 세션을 시작해요.
              {dateRange ? ` ${formatDateRange(dateRange.start, dateRange.end)}` : null}
            </p>
            {screenState === "ready" && dateRange ? (
              <p className="mt-3 text-base font-semibold text-[var(--text-2)]">
                장보기 완료된 레시피예요
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--muted)]">레시피</p>
              <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
                {recipes.length}개
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--muted)]">식사</p>
              <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
                {totalReadyMeals}개
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-4 py-3">
              <p className="text-xs font-semibold text-[var(--muted)]">인분</p>
              <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
                {totalReadyServings}인분
              </p>
            </div>
          </div>
        </div>
      </section>

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
        <div
          className="grid gap-4 lg:grid-cols-3"
          data-testid="cook-ready-loading"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="border border-[var(--line)]"
              height={248}
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
          className="grid gap-4 lg:grid-cols-3"
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

function MobileCookReadyListScreen({
  activeCreatingRecipeId,
  dateRange,
  errorMessage,
  loadReady,
  onEmptyAction,
  onStartSession,
  recipes,
  screenState,
  sessionError,
}: {
  activeCreatingRecipeId: string | null;
  dateRange: { start: string; end: string } | null;
  errorMessage: string | null;
  loadReady: () => Promise<void>;
  onEmptyAction: () => void;
  onStartSession: (recipe: CookingReadyRecipe) => void;
  recipes: CookingReadyRecipe[];
  screenState: CookingReadyScreenState;
  sessionError: string | null;
}) {
  return (
    <div
      className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[#F8F9FA] lg:hidden"
      data-testid="cook-ready-list-screen"
    >
      <div className="shrink-0 border-b border-[#DEE2E6] bg-white">
        <div className="flex min-h-[52px] items-center gap-2 px-4 py-2.5">
          <Link
            aria-label="뒤로가기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#212529]"
            href="/planner"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              viewBox="0 0 20 20"
              width="20"
            >
              <path
                d="M12 5L7 10L12 15"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold leading-[1.3] text-[#212529]">
            요리하기
          </h1>
          <div aria-hidden="true" className="h-8 w-8 shrink-0" />
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-[110px]">
        <section className="border-b border-[#DEE2E6] bg-white px-5 py-5">
          <p className="text-[13px] font-medium leading-[1.35] text-[#868E96]">
            {formatMobileCookDate(dateRange?.start)}
          </p>
          <h2 className="mt-1 text-[20px] font-extrabold leading-[1.3] text-[#212529] [font-family:var(--font-jua),-apple-system,sans-serif]">
            어떤 요리부터 시작할까요?
          </h2>
        </section>

        <div className="px-4 py-4">
          {sessionError ? (
            <div
              className="mb-3 rounded-[8px] border border-[#2AC1BC] bg-[#E6F8F7] px-4 py-3 text-[13px] font-semibold text-[#20A8A4]"
              data-testid="session-error-toast"
              role="alert"
            >
              {sessionError}
            </div>
          ) : null}

          {screenState === "loading" ? (
            <div
              className="flex flex-col gap-[10px]"
              data-testid="cook-ready-loading"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton
                  className="border border-[#DEE2E6] bg-white"
                  height={154}
                  key={index}
                  rounded="lg"
                />
              ))}
            </div>
          ) : null}

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

          {screenState === "empty" ? (
            <ContentState
              actionLabel="플래너로 돌아가기"
              description="플래너에서 장보기를 먼저 완료해 주세요"
              onAction={onEmptyAction}
              title="장보기 완료된 레시피가 없어요"
              tone="empty"
            />
          ) : null}

          {screenState === "ready" ? (
            <section data-testid="cook-ready-recipe-list">
              <h3 className="mb-[10px] text-[14px] font-bold leading-[1.3] text-[#212529]">
                오늘{" "}
                <span className="font-medium text-[#868E96]">
                  · {recipes.length}개
                </span>
              </h3>
              <div className="flex flex-col gap-[10px]">
                {recipes.map((recipe, index) => (
                  <MobileCookReadyCard
                    activeCreatingRecipeId={activeCreatingRecipeId}
                    dateLabel={formatMobileMealDate(dateRange?.start)}
                    index={index}
                    key={`${recipe.recipe_id}-${index}`}
                    onStartSession={onStartSession}
                    recipe={recipe}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <Wave1MobileBottomTab
        ariaLabel="요리 준비 목록 하단 탐색"
        currentTab="planner"
      />
    </div>
  );
}

function MobileCookReadyCard({
  activeCreatingRecipeId,
  dateLabel,
  index,
  onStartSession,
  recipe,
}: {
  activeCreatingRecipeId: string | null;
  dateLabel: string;
  index: number;
  onStartSession: (recipe: CookingReadyRecipe) => void;
  recipe: CookingReadyRecipe;
}) {
  const visual = getMobileReadyVisual(recipe, index);
  const placement =
    MOBILE_COOK_READY_PLACEMENTS[index] ??
    MOBILE_COOK_READY_PLACEMENTS[MOBILE_COOK_READY_PLACEMENTS.length - 1];
  const isCreating = activeCreatingRecipeId === recipe.recipe_id;
  const anyCreating = activeCreatingRecipeId !== null;

  return (
    <article
      className="overflow-hidden rounded-[12px] border border-l-[4px] bg-white"
      data-testid="recipe-ready-card"
      style={{
        borderColor: "#DEE2E6",
        borderLeftColor: visual.method.border,
      }}
    >
      <div className="flex items-center gap-3 p-[14px]">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[10px] text-[36px]"
          style={{ background: visual.bg }}
        >
          {recipe.recipe_thumbnail_url ? (
            <Image
              alt=""
              className="h-16 w-16 rounded-[10px] object-cover"
              height={64}
              src={recipe.recipe_thumbnail_url}
              unoptimized
              width={64}
            />
          ) : (
            <span aria-hidden="true">{visual.emoji}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="rounded-[4px] px-1.5 py-0.5 text-[11px] font-bold leading-[1.2]"
              style={{
                background: visual.method.bg,
                color: visual.method.text,
              }}
            >
              {visual.method.label}
            </span>
            <span
              className="rounded-[4px] px-1.5 py-0.5 text-[10px] font-bold leading-[1.2]"
              style={{
                background: visual.status.bg,
                color: visual.status.text,
              }}
            >
              {visual.status.label}
            </span>
          </div>
          <p className="truncate text-[15px] font-bold leading-[1.3] text-[#212529]">
            {recipe.recipe_title}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.3] text-[#868E96]">
            {dateLabel} {placement.slot} #{placement.index} ·{" "}
            {recipe.total_servings}인분 · {visual.minutes}분
          </p>
        </div>
      </div>
      <div className="px-[14px] pb-[14px]">
        <button
          className="flex h-12 w-full items-center justify-center rounded-[8px] bg-[#2AC1BC] text-[16px] font-bold leading-none text-white disabled:bg-[#DEE2E6] disabled:text-[#ADB5BD]"
          data-testid="start-session-button"
          disabled={anyCreating}
          onClick={() => onStartSession(recipe)}
          type="button"
        >
          {isCreating ? "준비 중..." : "🍳 요리 시작"}
        </button>
      </div>
    </article>
  );
}
