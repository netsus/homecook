"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { deleteMeal, fetchMeals, isMealApiError, updateMealServings } from "@/lib/api/meal";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { MealListItemData } from "@/types/meal";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";

interface ModalState {
  type: "serving-change" | "delete";
  mealId: string;
  pendingServings?: number;
}

export interface MealScreenProps {
  planDate: string;
  columnId: string;
  slotName: string;
  initialAuthenticated: boolean;
}

// Status data preserved for logic; visual badges removed per Wave1 port.

function formatDateLong(planDate: string) {
  const date = new Date(`${planDate}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateShort(planDate: string) {
  const date = new Date(`${planDate}T00:00:00.000Z`);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return `${month}/${day}`;
}

function buildNextPath(planDate: string, columnId: string, slotName: string) {
  const base = `/planner/${planDate}/${columnId}`;
  return slotName ? `${base}?slot=${encodeURIComponent(slotName)}` : base;
}

const mealVisualMeta: Record<
  string,
  { bg: string; chips: string[]; emoji: string; minutes: number }
> = {
  김치볶음밥: {
    bg: "#FFE2CF",
    chips: ["묵은지", "찬밥", "대파", "계란", "참기름", "+2"],
    emoji: "🍚",
    minutes: 15,
  },
  된장찌개: {
    bg: "#FFE1E1",
    chips: ["된장", "애호박", "감자", "두부", "청양고추", "+1"],
    emoji: "🍲",
    minutes: 25,
  },
  "닭가슴살 샐러드": {
    bg: "#DFF5E7",
    chips: ["닭가슴살", "양상추", "토마토", "오이", "올리브유"],
    emoji: "🥗",
    minutes: 20,
  },
  김치찌개: {
    bg: "#FFE1E1",
    chips: ["김치", "돼지고기", "두부", "대파", "고춧가루"],
    emoji: "🍲",
    minutes: 25,
  },
  미역국: {
    bg: "#E8F5FF",
    chips: ["미역", "소고기", "국간장", "마늘"],
    emoji: "🍜",
    minutes: 20,
  },
};

function getMealVisualMeta(meal: MealListItemData) {
  return (
    mealVisualMeta[meal.recipe_title] ?? {
      bg: "#E6F8F7",
      chips: ["집밥", "간단", "플래너"],
      emoji: "🍽️",
      minutes: 20,
    }
  );
}

function getVisibleMealChips(chips: string[], limit = 3) {
  const normalized = chips.filter((chip) => !/^\+\d+$/.test(chip));
  const visible = normalized.slice(0, limit);
  const hiddenCount = Math.max(0, normalized.length - visible.length);

  return { hiddenCount, visible };
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  titleFull: string;
  titleShort: string;
  onBack: () => void;
}

function AppBar({ titleFull, titleShort, onBack }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[#DEE2E6] bg-white">
      <div className="flex min-h-[52px] items-center gap-2 px-4 py-2.5">
        <button
          aria-label="뒤로 가기"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#212529] hover:bg-[#F8F9FA]"
          onClick={onBack}
          type="button"
        >
          <svg
            fill="none"
            height="20"
            viewBox="0 0 20 20"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 5L7 10L12 15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold leading-[1.3] text-[#212529]">
          {/* Full title on ≥361px, short title on narrow */}
          <span className="hidden [@media(min-width:361px)]:inline">{titleFull}</span>
          <span className="[@media(min-width:361px)]:hidden">{titleShort}</span>
        </h1>
        {/* Right spacer matching back button width */}
        <div className="h-8 w-8 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="식사 목록 불러오는 중">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-[14px] border border-[#DEE2E6] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <div className="h-4 w-44 rounded-full bg-[#DEE2E6]" />
          <div className="mt-2 h-3 w-20 rounded-full bg-[#DEE2E6]" />
          <div className="mt-4 flex items-center gap-2">
            <div className="h-11 w-11 rounded-[12px] bg-[#DEE2E6]" />
            <div className="h-4 w-6 rounded-full bg-[#DEE2E6]" />
            <div className="h-11 w-11 rounded-[12px] bg-[#DEE2E6]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Status badge visually removed per Wave1 port. Status data preserved in meal object.

// ─── Meal card ────────────────────────────────────────────────────────────────

interface MealCardProps {
  meal: MealListItemData;
  conflictError: string | null;
  isPending: boolean;
  onStepDown: () => void;
  onStepUp: () => void;
  onDelete: () => void;
  onCreateShopping: () => void;
  onRecipeClick: () => void;
  onStartCook: () => void;
}

function MealCard({
  meal,
  conflictError,
  isPending,
  onCreateShopping,
  onStepDown,
  onStepUp,
  onDelete,
  onRecipeClick,
  onStartCook,
}: MealCardProps) {
  const isMin = meal.planned_servings <= 1;
  const visual = getMealVisualMeta(meal);
  const { hiddenCount, visible } = getVisibleMealChips(visual.chips);

  function stopProp(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <article
      aria-label={`${meal.recipe_title} 식사 카드`}
      className={`relative overflow-hidden rounded-[14px] border border-[#DEE2E6] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-opacity ${isPending ? "opacity-60" : ""}`}
    >
      {/* Delete trash icon — top-right */}
      <button
        aria-label={`${meal.recipe_title} 삭제`}
        className="absolute right-3 top-3 z-[1] flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F9FA] text-[#868E96] disabled:opacity-40"
        data-testid={`meal-delete-${meal.id}`}
        disabled={isPending}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        type="button"
      >
        <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
        </svg>
      </button>

      <div className="flex gap-3 p-3.5">
        <div
          className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] text-[40px]"
          style={{ backgroundColor: visual.bg }}
        >
          {meal.recipe_thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover"
              src={meal.recipe_thumbnail_url}
            />
          ) : (
            <span aria-hidden="true">{visual.emoji}</span>
          )}
        </div>
        <div className="min-w-0 flex-1 pr-7">
          <button
            className="block w-full truncate text-left text-[16px] font-semibold leading-[1.3] text-[#212529] hover:text-[#2AC1BC]"
            data-testid={`meal-recipe-link-${meal.id}`}
            onClick={onRecipeClick}
            type="button"
          >
            {meal.recipe_title}
          </button>
          <div className="mt-[3px] text-[12px] font-medium leading-[1.4] text-[#868E96]">
            {visual.minutes}분 · {meal.planned_servings}인분
          </div>
        </div>
      </div>

      <div className="px-3.5 pb-3.5">
        <div
          className="mb-2.5 flex items-center justify-between rounded-[10px] bg-[#F8F9FA] p-2.5"
          onClick={stopProp}
          role="group"
          aria-label="인분 조절"
        >
          <span className="text-[12px] font-semibold leading-[1.3] text-[#495057]">
            계획 인분
          </span>
          <div className="flex items-center gap-2.5">
          <button
            aria-label="인분 감소"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#495057] disabled:opacity-40"
            disabled={isMin || isPending}
            onClick={onStepDown}
            type="button"
          >
            <span aria-hidden="true" className="text-lg font-bold leading-none">−</span>
          </button>
          <span
            className="min-w-[42px] text-center text-[17px] font-semibold leading-[1.3] text-[#212529]"
            aria-live="polite"
            aria-label={`${meal.planned_servings}인분`}
          >
            {meal.planned_servings}
            <span className="ml-0.5 text-[16px] font-semibold">인분</span>
          </span>
          <button
            aria-label="인분 증가"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2AC1BC] text-white disabled:opacity-40"
            disabled={isPending}
            onClick={onStepUp}
            type="button"
          >
            <span aria-hidden="true" className="text-lg font-bold leading-none">+</span>
          </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-[5px]">
          {visible.map((chip) => (
            <span
              className="rounded-full bg-[#F8F9FA] px-2 py-[5px] text-[11px] font-medium leading-[1.3] text-[#495057]"
              key={chip}
            >
              {chip}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className="rounded-full bg-[#F1F3F5] px-2 py-[5px] text-[11px] font-semibold leading-[1.3] text-[#868E96]">
              +{hiddenCount}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-[38px] rounded-[8px] border border-[#DEE2E6] bg-white text-[14px] font-bold text-[#212529]"
            onClick={onCreateShopping}
            type="button"
          >
            장보기
          </button>
          <button
            className="min-h-[38px] rounded-[8px] border border-[#2AC1BC] bg-[#2AC1BC] text-[14px] font-bold text-white"
            onClick={onStartCook}
            type="button"
          >
            요리하기
          </button>
        </div>
      </div>

      {/* 409 conflict inline error */}
      {conflictError ? (
        <p className="px-3.5 pb-3 text-sm text-[#E03131]" role="alert">
          {conflictError}
        </p>
      ) : null}
    </article>
  );
}

function getMealStatusLabel(status: MealListItemData["status"]) {
  if (status === "shopping_done") {
    return "장보기 완료";
  }

  if (status === "cook_done") {
    return "요리 완료";
  }

  return "등록";
}

function MealWebCard({
  meal,
  conflictError,
  isPending,
  onCreateShopping,
  onStepDown,
  onStepUp,
  onDelete,
  onRecipeClick,
  onStartCook,
}: MealCardProps) {
  const isMin = meal.planned_servings <= 1;

  return (
    <article
      aria-label={`${meal.recipe_title} 식사 카드`}
      className={`overflow-hidden rounded-[20px] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-1)] transition ${isPending ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]"}`}
    >
      <div className="grid gap-5 p-5 md:grid-cols-[132px_minmax(0,1fr)]">
        <button
          aria-label={`${meal.recipe_title} 레시피 보기`}
          className="relative aspect-square overflow-hidden rounded-[18px] bg-[#EAEDEF]"
          onClick={onRecipeClick}
          type="button"
        >
          {meal.recipe_thumbnail_url ? (
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${meal.recipe_thumbnail_url})` }}
            />
          ) : (
            <span className="grid h-full place-items-center text-4xl font-black text-[var(--muted)]">
              {meal.recipe_title.charAt(0)}
            </span>
          )}
        </button>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-[var(--brand-soft)] px-3 py-1 text-xs font-bold text-[var(--brand-deep)]">
                {getMealStatusLabel(meal.status)}
              </span>
              {meal.is_leftover ? (
                <span className="ml-2 inline-flex rounded-full bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] px-3 py-1 text-xs font-bold text-[var(--olive)]">
                  남은요리
                </span>
              ) : null}
              <button
                className="mt-3 block w-full truncate text-left text-2xl font-black tracking-[-0.02em] text-[var(--foreground)] hover:text-[var(--brand)]"
                data-testid={`meal-recipe-link-${meal.id}`}
                onClick={onRecipeClick}
                type="button"
              >
                {meal.recipe_title}
              </button>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                {meal.planned_servings}인분 계획
              </p>
            </div>
            <button
              aria-label={`${meal.recipe_title} 삭제`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-40"
              data-testid={`meal-delete-${meal.id}`}
              disabled={isPending}
              onClick={onDelete}
              type="button"
            >
              <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"/>
              </svg>
            </button>
          </div>

          <div
            aria-label="인분 조절"
            className="mt-5 flex items-center justify-between rounded-[16px] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3"
            role="group"
          >
            <span className="text-sm font-bold text-[var(--text-2)]">계획 인분</span>
            <div className="flex items-center gap-3">
              <button
                aria-label="인분 감소"
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--panel)] text-lg font-bold text-[var(--foreground)] shadow-[var(--shadow-1)] disabled:opacity-40"
                disabled={isMin || isPending}
                onClick={onStepDown}
                type="button"
              >
                -
              </button>
              <span
                aria-label={`${meal.planned_servings}인분`}
                aria-live="polite"
                className="min-w-16 text-center text-lg font-black text-[var(--foreground)]"
              >
                {meal.planned_servings}인분
              </span>
              <button
                aria-label="인분 증가"
                className="grid h-9 w-9 place-items-center rounded-full bg-[var(--brand)] text-lg font-bold text-white shadow-[var(--shadow-1)] disabled:opacity-40"
                disabled={isPending}
                onClick={onStepUp}
                type="button"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-bold text-[var(--foreground)] hover:border-[var(--brand)]"
              onClick={onRecipeClick}
              type="button"
            >
              레시피 보기
            </button>
            <button
              className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-bold text-[var(--foreground)] hover:border-[var(--brand)]"
              onClick={onCreateShopping}
              type="button"
            >
              장보기
            </button>
            <button
              className="min-h-11 rounded-[14px] bg-[var(--brand)] px-3 text-sm font-bold text-white hover:brightness-95"
              onClick={onStartCook}
              type="button"
            >
              요리하기
            </button>
          </div>

          {conflictError ? (
            <p className="mt-4 text-sm font-semibold text-[var(--danger)]" role="alert">
              {conflictError}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ─── Center modal backdrop + container ───────────────────────────────────────

interface CenterModalProps {
  children: React.ReactNode;
  onClose: () => void;
  labelledBy?: string;
}

function CenterModal({ children, onClose, labelledBy }: CenterModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    contentRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      {/* backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* content */}
      <div
        ref={contentRef}
        className="relative w-full max-w-sm rounded-t-[20px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)] lg:rounded-[20px] lg:p-5"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex justify-center lg:hidden">
          <span className="h-1 w-9 rounded-full bg-[#DEE2E6]" />
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MealScreen({
  planDate,
  columnId,
  slotName,
  initialAuthenticated,
}: MealScreenProps) {
  const router = useRouter();
  const appReturn = useAppReturn({ fallback: "/planner" });
  const isDesktopViewport = useDesktopViewport();

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [meals, setMeals] = useState<MealListItemData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictErrors, setConflictErrors] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());

  // ── Auth setup (identical pattern to PlannerWeekScreen) ──────────────────
  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
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
        if (!mounted) {
          return;
        }
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

  // ── Meal loading ─────────────────────────────────────────────────────────
  const loadMeals = useCallback(async () => {
    setScreenState("loading");
    setErrorMessage(null);
    try {
      const data = await fetchMeals(planDate, columnId);
      setMeals(data.items);
      setScreenState(data.items.length === 0 ? "empty" : "ready");
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setErrorMessage(
        isMealApiError(error) ? error.message : "식사 목록을 불러오지 못했어요.",
      );
      setScreenState("error");
    }
  }, [planDate, columnId]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }
    void loadMeals();
  }, [authState, loadMeals]);

  // ── Sync screenState when meals list changes ──────────────────────────────
  useEffect(() => {
    if (screenState === "ready" || screenState === "empty") {
      setScreenState(meals.length === 0 ? "empty" : "ready");
    }
  }, [meals]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clearConflictError(mealId: string) {
    setConflictErrors((prev) => {
      const next = { ...prev };
      delete next[mealId];
      return next;
    });
  }

  function setConflictError(mealId: string) {
    setConflictErrors((prev) => ({
      ...prev,
      [mealId]: "변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요.",
    }));
  }

  function addPending(mealId: string) {
    setPendingMealIds((prev) => new Set([...prev, mealId]));
  }

  function removePending(mealId: string) {
    setPendingMealIds((prev) => {
      const next = new Set(prev);
      next.delete(mealId);
      return next;
    });
  }

  // ── API actions ───────────────────────────────────────────────────────────
  async function applyServingChange(mealId: string, newServings: number) {
    addPending(mealId);
    clearConflictError(mealId);
    try {
      const updated = await updateMealServings(mealId, newServings);
      setMeals((prev) =>
        prev.map((meal) =>
          meal.id === mealId
            ? { ...meal, planned_servings: updated.planned_servings, status: updated.status }
            : meal,
        ),
      );
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setConflictError(mealId);
    } finally {
      removePending(mealId);
    }
  }

  async function applyDelete(mealId: string) {
    addPending(mealId);
    clearConflictError(mealId);
    try {
      await deleteMeal(mealId);
      setMeals((prev) => prev.filter((meal) => meal.id !== mealId));
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setConflictError(mealId);
    } finally {
      removePending(mealId);
    }
  }

  // ── Interaction handlers ──────────────────────────────────────────────────
  function handleStepperTap(meal: MealListItemData, delta: number) {
    const newServings = meal.planned_servings + delta;
    if (newServings < 1) {
      return;
    }
    if (meal.status === "shopping_done" || meal.status === "cook_done") {
      setModal({ type: "serving-change", mealId: meal.id, pendingServings: newServings });
      return;
    }
    void applyServingChange(meal.id, newServings);
  }

  function handleDeleteTap(mealId: string) {
    setModal({ type: "delete", mealId });
  }

  function handleModalCancel() {
    setModal(null);
  }

  function handleServingChangeConfirm() {
    if (!modal || modal.type !== "serving-change" || modal.pendingServings === undefined) {
      return;
    }
    const { mealId, pendingServings } = modal;
    setModal(null);
    void applyServingChange(mealId, pendingServings);
  }

  function handleDeleteConfirm() {
    if (!modal || modal.type !== "delete") {
      return;
    }
    const { mealId } = modal;
    setModal(null);
    void applyDelete(mealId);
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const titleFull = slotName
    ? `${slotName} 음식${meals.length > 0 ? ` ${meals.length}개` : ""}`
    : formatDateLong(planDate);
  const titleShort = slotName
    ? `${slotName} 음식${meals.length > 0 ? ` ${meals.length}개` : ""}`
    : formatDateShort(planDate);
  const summaryTitle =
    meals.length > 1
      ? "한 끼에 여러 음식을 같이 먹어요"
      : "이 끼니에 등록된 식사";
  const totalServings = meals.reduce(
    (sum, meal) => sum + meal.planned_servings,
    0,
  );
  const nextPath = buildNextPath(planDate, columnId, slotName);
  const mealAddParams = new URLSearchParams({
    columnId,
    date: planDate,
  });
  if (slotName) {
    mealAddParams.set("slot", slotName);
  }
  const mealAddQuery = mealAddParams.toString();
  const addMealHref = buildReturnHref(`/menu-add?${mealAddQuery}`, {
    restore: "meal-add-modal",
    returnSurface: "planner.meal-add-modal",
    returnTo: `/planner?${mealAddQuery}`,
  });
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;
  const navigateToPlanner = useCallback(() => {
    appReturn.goBack();
  }, [appReturn]);

  // ── Unauthorized gate ─────────────────────────────────────────────────────
  if (authState === "unauthorized") {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[#F8F9FA] lg:bg-[var(--background)]"
        style={{ paddingBottom: "84px" }}
      >
        <AppBar
          titleFull={titleFull}
          titleShort={titleShort}
          onBack={navigateToPlanner}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
          <div className="rounded-[14px] border border-[#DEE2E6] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-base font-semibold text-[#212529]">
              식사 목록을 보려면 로그인이 필요해요.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#868E96]">
              로그인 후 이 화면으로 자동으로 돌아옵니다.
            </p>
          </div>
          <SocialLoginButtons nextPath={nextPath} />
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      {shouldRenderWebView ? (
        <div className="hidden min-h-screen bg-[var(--surface-fill)] px-8 py-8 text-[var(--foreground)] lg:block">
          <main className="mx-auto grid max-w-[1200px] gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 space-y-5">
              <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-1)]">
                <button
                  className="text-sm font-bold text-[var(--brand)]"
                  onClick={navigateToPlanner}
                  type="button"
                >
                  플래너로 돌아가기
                </button>
                <p className="mt-4 text-xs font-bold tracking-[0.2em] text-[var(--brand-deep)]">
                  끼니 화면
                </p>
                <h1 className="mt-2 text-4xl font-black tracking-[-0.02em]">
                  {titleFull}
                </h1>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[var(--surface-fill)] px-3 py-1.5 text-sm font-bold text-[var(--text-2)]">
                    {formatDateLong(planDate)}
                  </span>
                  {slotName ? (
                    <span className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-sm font-bold text-[var(--brand-deep)]">
                      {slotName}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-[var(--surface-fill)] px-3 py-1.5 text-sm font-bold text-[var(--text-2)]">
                    총 {totalServings}인분
                  </span>
                </div>
              </div>

              {authState === "checking" || screenState === "loading" ? (
                <div className="grid gap-4">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div
                      className="rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow-1)]"
                      key={index}
                    >
                      <div className="h-5 w-48 animate-pulse rounded-full bg-[#EAEDEF]" />
                      <div className="mt-4 h-24 animate-pulse rounded-[18px] bg-[#EAEDEF]" />
                    </div>
                  ))}
                </div>
              ) : null}

              {screenState === "error" ? (
                <div
                  className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-8 text-center shadow-[var(--shadow-1)]"
                  data-testid="meal-screen-error"
                >
                  <h2 className="text-xl font-black">식사 목록을 불러오지 못했어요.</h2>
                  {errorMessage ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{errorMessage}</p>
                  ) : null}
                  <button
                    className="mt-5 rounded-[14px] bg-[var(--brand)] px-5 py-3 text-sm font-bold text-white"
                    onClick={() => void loadMeals()}
                    type="button"
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}

              {screenState === "empty" ? (
                <div
                  className="rounded-[24px] border border-dashed border-[var(--line)] bg-[var(--panel)] p-10 text-center"
                  data-testid="meal-screen-empty"
                >
                  <h2 className="text-xl font-black">이 끼니에 등록된 식사가 없어요.</h2>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    레시피 검색, 팬트리 추천, 직접 입력으로 식사를 추가할 수 있어요.
                  </p>
                  <button
                    className="mt-6 inline-flex min-h-12 items-center justify-center rounded-[14px] bg-[var(--brand)] px-6 text-sm font-bold text-white"
                    data-testid="meal-screen-add-cta"
                    onClick={() => router.push(addMealHref)}
                    type="button"
                  >
                    + 식사 추가
                  </button>
                </div>
              ) : null}

              {screenState === "ready" ? (
                <div className="space-y-4">
                  {meals.map((meal) => (
                    <MealWebCard
                      key={meal.id}
                      conflictError={conflictErrors[meal.id] ?? null}
                      isPending={pendingMealIds.has(meal.id)}
                      meal={meal}
                      onCreateShopping={() => router.push("/shopping/flow")}
                      onDelete={() => handleDeleteTap(meal.id)}
                      onRecipeClick={() => router.push(`/recipe/${meal.recipe_id}`)}
                      onStartCook={() => router.push("/cooking/ready")}
                      onStepDown={() => handleStepperTap(meal, -1)}
                      onStepUp={() => handleStepperTap(meal, 1)}
                    />
                  ))}
                  <button
                    className="flex min-h-12 w-full items-center justify-center rounded-[16px] border border-[var(--brand)] bg-[var(--panel)] text-sm font-bold text-[var(--brand)]"
                    data-testid="meal-screen-add-cta"
                    onClick={() => router.push(addMealHref)}
                    type="button"
                  >
                    + 식사 추가
                  </button>
                </div>
              ) : null}
            </section>

            <aside className="hidden xl:block">
              <div className="sticky top-28 rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow-1)]">
                <p className="text-xs font-bold tracking-[0.2em] text-[var(--brand-deep)]">
                  SUMMARY
                </p>
                <h2 className="mt-2 text-xl font-black">{summaryTitle}</h2>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">음식</span>
                    <span className="font-bold">{meals.length}개</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">총 인분</span>
                    <span className="font-bold">{totalServings}인분</span>
                  </div>
                </div>
                <div className="mt-5 grid gap-2">
                  <button
                    className="min-h-11 rounded-[14px] bg-[var(--brand)] text-sm font-bold text-white"
                    onClick={() => router.push(addMealHref)}
                    type="button"
                  >
                    식사 추가
                  </button>
                  <button
                    className="min-h-11 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] text-sm font-bold text-[var(--foreground)]"
                    onClick={() => router.push("/shopping/flow")}
                    type="button"
                  >
                    장보기 만들기
                  </button>
                </div>
              </div>
            </aside>
          </main>
        </div>
      ) : null}
      {shouldRenderAppView ? (
        <div
          className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[#F8F9FA] lg:hidden"
          style={{ paddingBottom: "84px" }}
        >
        <AppBar
          titleFull={titleFull}
          titleShort={titleShort}
          onBack={navigateToPlanner}
        />

        {/* Scrollable content area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {screenState === "ready" ? (
              <section className="border-b border-[#DEE2E6] bg-white px-5 py-5">
                <div className="mb-1 text-[13px] font-semibold leading-[1.3] text-[#20A8A4]">
                  {formatDateShort(planDate)}{slotName ? ` · ${slotName}` : ""}
                </div>
                <h2 className="text-[24px] font-semibold leading-[1.25] text-[#212529]">
                  {summaryTitle}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#F8F9FA] px-2.5 py-1.5 text-[12px] font-bold leading-[1.3] text-[#495057]">
                    {meals.length}개 음식
                  </span>
                  <span className="rounded-full bg-[#F8F9FA] px-2.5 py-1.5 text-[12px] font-bold leading-[1.3] text-[#495057]">
                    총 {totalServings}인분 계획
                  </span>
                </div>
              </section>
            ) : null}

            <div className="space-y-3 p-4">
              {/* Loading skeletons */}
              {authState === "checking" || screenState === "loading" ? (
                <LoadingSkeleton />
              ) : null}

              {/* Error state */}
              {screenState === "error" ? (
                <div
                  className="flex flex-col items-center justify-center py-12 text-center"
                  data-testid="meal-screen-error"
                >
                  <p className="text-base text-[#868E96]">
                    식사 목록을 불러오지 못했어요.
                  </p>
                  {errorMessage ? (
                    <p className="mt-1 text-sm text-[#868E96]">{errorMessage}</p>
                  ) : null}
                  <button
                    className="mt-4 min-h-11 rounded-[8px] border border-[#2AC1BC] px-5 py-2.5 text-sm font-semibold text-[#20A8A4]"
                    onClick={() => void loadMeals()}
                    type="button"
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}

              {/* Empty state */}
              {screenState === "empty" ? (
                <div
                  className="flex flex-col items-center justify-center py-12 text-center"
                  data-testid="meal-screen-empty"
                >
                  <p className="text-base text-[#868E96]">
                    이 끼니에 등록된 식사가 없어요.
                  </p>
                  {/* Inline prominent CTA for empty state */}
                  <button
                    className="mt-6 flex h-[52px] w-full max-w-xs items-center justify-center rounded-[8px] bg-[#2AC1BC] px-4 text-base font-semibold text-white hover:bg-[#20A8A4]"
                    data-testid="meal-screen-add-cta"
                    onClick={() => router.push(addMealHref)}
                    type="button"
                  >
                    + 식사 추가
                  </button>
                </div>
              ) : null}

              {/* Meal cards */}
              {screenState === "ready"
                ? meals.map((meal) => (
                    <MealCard
                      key={meal.id}
                      conflictError={conflictErrors[meal.id] ?? null}
                      isPending={pendingMealIds.has(meal.id)}
                      meal={meal}
                      onCreateShopping={() => router.push("/shopping/flow")}
                      onDelete={() => handleDeleteTap(meal.id)}
                      onRecipeClick={() => router.push(`/recipe/${meal.recipe_id}`)}
                      onStartCook={() => router.push("/cooking/ready")}
                      onStepDown={() => handleStepperTap(meal, -1)}
                      onStepUp={() => handleStepperTap(meal, 1)}
                    />
                  ))
                : null}

              {screenState === "ready" ? (
                <button
                  className="mt-2 flex h-[52px] w-full items-center justify-center rounded-[8px] border border-[#2AC1BC] bg-white px-4 text-base font-semibold text-[#20A8A4]"
                  data-testid="meal-screen-add-cta"
                  onClick={() => router.push(addMealHref)}
                  type="button"
                >
                  + 식사 추가
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      ) : null}

      {shouldRenderAppView ? (
        <Wave1MobileBottomTab
          ariaLabel="식사 화면 하단 탐색"
          currentTab="planner"
        />
      ) : null}

      {/* Serving-change confirmation modal */}
      {modal?.type === "serving-change" ? (
        <CenterModal labelledBy="serving-change-title" onClose={handleModalCancel}>
          <ModalHeader
            title="인분 변경"
            titleId="serving-change-title"
            onClose={handleModalCancel}
          />
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            상태가 진행된 식사입니다. 인분 변경 시 다시 장보기/요리 흐름이 필요할 수 있어요.
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              className="flex-1 rounded-[14px] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)]"
              onClick={handleModalCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex-[2] rounded-[14px] bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
              data-testid="serving-change-confirm"
              onClick={handleServingChangeConfirm}
              type="button"
            >
              변경하기
            </button>
          </div>
        </CenterModal>
      ) : null}

      {/* Delete confirmation modal */}
      {modal?.type === "delete" ? (
        <CenterModal labelledBy="delete-confirm-title" onClose={handleModalCancel}>
          <ModalHeader
            title="식사 삭제"
            titleId="delete-confirm-title"
            onClose={handleModalCancel}
          />
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            이 식사를 삭제하시겠어요?
          </p>
          <div className="mt-5 flex gap-2.5">
            <button
              className="flex-1 rounded-[14px] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)]"
              onClick={handleModalCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex-[2] rounded-[14px] bg-[var(--brand-deep)] py-3.5 text-sm font-bold text-white"
              data-testid="delete-confirm"
              onClick={handleDeleteConfirm}
              type="button"
            >
              삭제
            </button>
          </div>
        </CenterModal>
      ) : null}
    </>
  );
}
