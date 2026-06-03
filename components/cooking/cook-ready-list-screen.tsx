"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  formatKoreaCompactDate,
  formatKoreaDate,
  formatKoreaWeekday,
} from "@/lib/korean-date";
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
  boil: { bg: "var(--danger-soft)", border: "var(--danger)", label: "끓이기", text: "var(--danger-strong)" },
  mix: { bg: "var(--success-soft)", border: "var(--success-border)", label: "무치기", text: "var(--success-strong)" },
  prep: { bg: "var(--surface-subtle)", border: "var(--text-4)", label: "준비", text: "var(--text-2)" },
  stirfry: { bg: "var(--warning-soft)", border: "var(--warning-border)", label: "볶기", text: "var(--warning-strong)" },
} as const;

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export interface CookReadyListScreenProps {
  initialAuthenticated?: boolean;
}

function formatDateRange(start: string, end: string) {
  function format(dateStr: string) {
    return formatKoreaDate(dateStr, {
      month: "long",
      day: "numeric",
    });
  }

  return `${format(start)} ~ ${format(end)}`;
}

function formatMobileCookDate(start: string | undefined) {
  if (!start) return "오늘";

  const label = formatKoreaDate(start, {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  return `오늘 ${label}`;
}

function formatMobileMealDate(start: string | undefined) {
  if (!start) return "오늘";

  return formatKoreaCompactDate(start);
}

function formatDesktopCookDate(start: string | undefined) {
  if (!start) return "오늘";

  const weekday = formatKoreaWeekday(start, "long");
  const monthDay = formatKoreaDate(start, {
    day: "numeric",
    month: "long",
  });

  return `${weekday} (${monthDay})`;
}

function formatDesktopRecipeMeta(
  recipe: CookingReadyRecipe,
  start: string | undefined,
) {
  const dateLabel = start ? formatMobileMealDate(start) : "오늘";
  const mealCountLabel = `${recipe.meal_ids.length}개 끼니`;

  return `${dateLabel} · ${mealCountLabel} · ${recipe.total_servings}인분`;
}

function getMobileReadyVisual(recipe: CookingReadyRecipe, index: number) {
  // The ready API owns cooking-session behavior; these fields only recreate the fixed prototype visuals.
  const title = recipe.recipe_title;

  if (title.includes("된장")) {
    return {
      bg: "linear-gradient(135deg, var(--danger-soft) 0%, var(--danger-border) 100%)",
      emoji: "🍲",
      method: mobileMethodColors.boil,
      minutes: 25,
      status:
        index === 1
          ? { bg: "var(--warning-soft)", label: "장보기 완료", text: "var(--warning-strong)" }
          : { bg: "var(--surface-subtle)", label: "등록", text: "var(--text-2)" },
    };
  }

  if (title.includes("샐러드")) {
    return {
      bg: "linear-gradient(135deg, var(--accent-green-soft) 0%, var(--success-border) 100%)",
      emoji: "🥗",
      method: mobileMethodColors.mix,
      minutes: 10,
      status: { bg: "var(--surface-subtle)", label: "등록", text: "var(--text-2)" },
    };
  }

  if (title.includes("볶음")) {
    return {
      bg: "linear-gradient(135deg, var(--accent-peach-soft) 0%, var(--accent-peach) 100%)",
      emoji: "🍚",
      method: mobileMethodColors.stirfry,
      minutes: 15,
      status: { bg: "var(--surface-subtle)", label: "등록", text: "var(--text-2)" },
    };
  }

  return {
    bg: "linear-gradient(135deg, var(--surface-subtle) 0%, var(--line-strong) 100%)",
    emoji: "🍳",
    method: mobileMethodColors.prep,
    minutes: 15,
    status: { bg: "var(--surface-subtle)", label: "등록", text: "var(--text-2)" },
  };
}

function DesktopRecipeReadyRow({
  recipe,
  isCreating,
  anyCreating,
  dateRangeStart,
  onStartSession,
}: {
  recipe: CookingReadyRecipe;
  isCreating: boolean;
  anyCreating: boolean;
  dateRangeStart: string | undefined;
  onStartSession: (recipe: CookingReadyRecipe) => void;
}) {
  return (
    <article
      className="web-cook-ready-row"
      data-testid="recipe-ready-card"
    >
      <div className="web-cook-ready-row-main">
        <div className="web-cook-ready-status-line">
          <span className="web-cook-status-pill web-cook-status-done">
            장보기 완료
          </span>
          <span className="web-cook-ready-minutes">15분</span>
        </div>
        <h3 className="web-cook-ready-title">{recipe.recipe_title}</h3>
        <p className="web-cook-ready-meta">
          {formatDesktopRecipeMeta(recipe, dateRangeStart)}
        </p>
      </div>

      <div className="web-cook-ready-actions">
        <Link className="web-button web-button-tertiary" href={`/recipe/${recipe.recipe_id}`}>
          상세 보기
        </Link>
        <WebButton
          data-testid="start-session-button"
          disabled={anyCreating}
          onClick={() => onStartSession(recipe)}
        >
          {isCreating ? "준비 중..." : "요리 시작"}
        </WebButton>
      </div>
    </article>
  );
}

function CookNoticeDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <WebModal data-testid="cook-notice-dialog" onBackdropClick={onClose}>
      <WebDialog aria-labelledby="cook-notice-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="cook-notice-title">
            데스크탑 요리모드
          </WebDialogTitle>
          <button
            aria-label="닫기"
            className="web-cook-dialog-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-cook-notice-icon" aria-hidden="true">
            ▱
          </div>
          <p className="web-cook-notice-copy">
            데스크탑에서 레시피 단계를 보면서 요리하고, 사용한 재료를 팬트리에서 차감할 수 있어요.
          </p>
          <ul className="web-cook-notice-list">
            <li>만들기 확인</li>
            <li>사용 재료 차감</li>
            <li>플래너 끼니 완료 처리</li>
          </ul>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onClose} variant="tertiary">
            닫기
          </WebButton>
          <WebButton onClick={onClose}>
            요리 준비 목록
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
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
  const [showNoticeDialog, setShowNoticeDialog] = useState(false);
  const [sessionPendingRecipeId, setSessionPendingRecipeId] = useState<
    string | null
  >(null);
  const isMobileViewport = useIsMobileViewport();
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
            className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
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

  return (
    <WebShell className="web-cooking-shell" wide>
      <WebTopNav
        activeId="planner"
        items={WEB_NAV_ITEMS}
        rightSlot={<div className="web-profile-button">JY</div>}
      />
      <div className="web-cook-ready-screen" data-testid="cook-ready-list-screen">
        <nav aria-label="현재 위치" className="web-cook-breadcrumb">
          <Link aria-label="뒤로가기" href="/planner">
            플래너
          </Link>
          <span aria-hidden="true">/</span>
          <strong>요리 준비</strong>
        </nav>

        <section className="web-cook-ready-head">
          <div>
            <h1>요리 준비</h1>
            <p>
              플래너에 등록한 끼니 중 요리할 수 있는 메뉴를 모아 보여드려요.
              {dateRange ? ` ${formatDateRange(dateRange.start, dateRange.end)}` : null}
            </p>
          </div>
          <WebButton
            className="web-cook-notice-trigger"
            onClick={() => setShowNoticeDialog(true)}
            variant="tertiary"
          >
            요리모드 안내
          </WebButton>
        </section>

        {sessionError ? (
          <div
            className="web-cook-alert"
            data-testid="session-error-toast"
            role="alert"
          >
            {sessionError}
          </div>
        ) : null}

        {screenState === "loading" ? (
          <div className="web-cook-ready-list" data-testid="cook-ready-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton
                className="border border-[var(--line)]"
                height={96}
                key={i}
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
            onAction={() => router.push("/planner")}
            title="장보기 완료된 레시피가 없어요"
            tone="empty"
          />
        ) : null}

        {screenState === "ready" ? (
          <section className="web-cook-ready-group">
            <div className="web-cook-ready-group-head">
              <h2>{formatDesktopCookDate(dateRange?.start)}</h2>
              <span>{recipes.length}개 끼니</span>
            </div>
            <div className="web-cook-ready-list" data-testid="cook-ready-recipe-list">
              {recipes.map((recipe) => (
                <DesktopRecipeReadyRow
                  anyCreating={activeCreatingRecipeId !== null}
                  dateRangeStart={dateRange?.start}
                  isCreating={activeCreatingRecipeId === recipe.recipe_id}
                  key={recipe.recipe_id}
                  onStartSession={handleStartSession}
                  recipe={recipe}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {showNoticeDialog ? (
        <CookNoticeDialog onClose={() => setShowNoticeDialog(false)} />
      ) : null}
    </WebShell>
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
      className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--surface-fill)] lg:hidden"
      data-testid="cook-ready-list-screen"
    >
      <div className="shrink-0 border-b border-[var(--line-strong)] bg-[var(--surface)]">
        <div className="flex min-h-[var(--control-height-xl)] items-center gap-2 px-4 py-2.5">
          <Link
            aria-label="뒤로가기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--foreground)]"
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
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold leading-[1.3] text-[var(--foreground)]">
            요리하기
          </h1>
          <div aria-hidden="true" className="h-8 w-8 shrink-0" />
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto pb-[110px]">
        <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-5">
          <p className="text-[13px] font-medium leading-[1.35] text-[var(--text-3)]">
            {formatMobileCookDate(dateRange?.start)}
          </p>
          <h2 className="mt-1 text-[20px] font-extrabold leading-[1.3] text-[var(--foreground)]">
            어떤 요리부터 시작할까요?
          </h2>
        </section>

        <div className="px-4 py-4">
          {sessionError ? (
            <div
              className="mb-3 rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--brand)]"
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
                  className="border border-[var(--line-strong)] bg-[var(--surface)]"
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
              <h3 className="mb-[10px] text-[14px] font-bold leading-[1.3] text-[var(--foreground)]">
                오늘{" "}
                <span className="font-medium text-[var(--text-3)]">
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
        ariaLabel="요리 준비 목록 하단 내비게이션"
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
      className="overflow-hidden rounded-[var(--radius-card)] border border-l-[4px] bg-[var(--surface)]"
      data-testid="recipe-ready-card"
      style={{
        borderColor: "var(--line-strong)",
        borderLeftColor: visual.method.border,
      }}
    >
      <div className="flex items-center gap-3 p-[14px]">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[36px]"
          style={{ background: visual.bg }}
        >
          {recipe.recipe_thumbnail_url ? (
            <Image
              alt=""
              className="h-16 w-16 rounded-[var(--radius-control)] object-cover"
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
          <p className="truncate text-[15px] font-bold leading-[1.3] text-[var(--foreground)]">
            {recipe.recipe_title}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.3] text-[var(--text-3)]">
            {dateLabel} {placement.slot} #{placement.index} ·{" "}
            {recipe.total_servings}인분 · {visual.minutes}분
          </p>
        </div>
      </div>
      <div className="px-[14px] pb-[14px]">
        <button
          className="flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-bold leading-none text-[var(--text-inverse)] disabled:bg-[var(--line-strong)] disabled:text-[var(--text-4)]"
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
