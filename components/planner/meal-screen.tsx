"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { MealAddOptionsSheet } from "@/components/planner/meal-add-options-sheet";
import type {
  MealAddPickerMode,
  MealAddRouteMode,
} from "@/components/planner/meal-add-options-sheet";
import { MealAddPickerFlow } from "@/components/planner/meal-add-picker-flow";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebEmptyState,
  WebErrorState,
  WebIconButton,
  WebModal,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import { createCookingSession, isCookingApiError } from "@/lib/api/cooking";
import {
  deleteMeal,
  fetchMeals,
  isMealApiError,
  updateMealServings,
} from "@/lib/api/meal";
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

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

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
      bg: "var(--brand-soft)",
      chips: [],
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
      <div className="flex min-h-[var(--control-height-xl)] items-center gap-2 px-4 py-2.5">
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
    <div
      className="space-y-3"
      aria-busy="true"
      aria-label="식사 목록 불러오는 중"
      data-testid="meal-screen-loading-skeleton"
    >
      {[0, 1].map((i) => (
        <article
          key={i}
          className="relative overflow-hidden rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          data-testid="meal-screen-loading-card"
        >
          <Skeleton
            className="absolute right-3 top-3 z-[1] h-8 w-8 rounded-full"
            data-testid="meal-screen-loading-delete"
          />

          <div className="flex gap-3 p-3.5">
            <Skeleton
              className="h-[76px] w-[76px] shrink-0 rounded-[var(--radius-card)]"
              data-testid="meal-screen-loading-thumb"
            />
            <div className="min-w-0 flex-1 pr-7">
              <Skeleton className="h-5 w-36 max-w-full" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          </div>

          <div className="px-3.5 pb-3.5">
            <div
              className="mb-2.5 flex items-center justify-between rounded-[var(--radius-control)] bg-[#F8F9FA] p-2.5"
              data-testid="meal-screen-loading-stepper"
            >
              <Skeleton className="h-4 w-16" />
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-5 w-12" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-[5px]">
              {[48, 56, 44].map((width) => (
                <Skeleton
                  className="h-[26px] rounded-full"
                  key={width}
                  width={width}
                />
              ))}
            </div>

            <Skeleton
              className="h-[38px] w-full rounded-[var(--radius-control)]"
              data-testid="meal-screen-loading-action"
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function LoadingSummarySkeleton({
  planDate,
  slotName,
}: {
  planDate: string;
  slotName: string;
}) {
  return (
    <section
      className="border-b border-[#DEE2E6] bg-white px-5 py-5"
      data-testid="meal-screen-loading-summary"
    >
      <div className="mb-2">
        <span className="sr-only">끼니 요약 불러오는 중</span>
        <Skeleton
          className="h-[17px] rounded-full"
          width={slotName ? 104 : 72}
        />
      </div>
      <Skeleton
        className="h-[30px] rounded-[var(--radius-md)]"
        width="min(72%, 220px)"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-[30px] w-[72px] rounded-full" />
        <Skeleton className="h-[30px] w-[104px] rounded-full" />
      </div>
      <span className="sr-only">
        {formatDateShort(planDate)}
        {slotName ? ` · ${slotName}` : ""}
      </span>
    </section>
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
  const canStartCook = meal.status === "shopping_done";
  const visual = getMealVisualMeta(meal);
  const { hiddenCount, visible } = getVisibleMealChips(visual.chips);

  function stopProp(e: React.MouseEvent) {
    e.stopPropagation();
  }

  return (
    <article
      aria-label={`${meal.recipe_title} 식사 카드`}
      className={`relative overflow-hidden rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-opacity ${isPending ? "opacity-60" : ""}`}
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
          className="flex h-[76px] w-[76px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-card)] text-[40px]"
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
            className="block w-full truncate text-left text-[16px] font-semibold leading-[1.3] text-[#212529] hover:text-[var(--brand)]"
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
          className="mb-2.5 flex items-center justify-between rounded-[var(--radius-control)] bg-[#F8F9FA] p-2.5"
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
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-white disabled:opacity-40"
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

        <div className={canStartCook ? "grid grid-cols-2 gap-2" : "grid grid-cols-1 gap-2"}>
          <button
            className="min-h-[38px] rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white text-[14px] font-bold text-[#212529]"
            onClick={onCreateShopping}
            type="button"
          >
            장보기
          </button>
          {canStartCook ? (
            <button
              aria-label={`${meal.recipe_title} 요리하기`}
              className="min-h-[38px] rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--brand)] text-[14px] font-bold text-white"
              disabled={isPending}
              onClick={onStartCook}
              type="button"
            >
              요리하기
            </button>
          ) : null}
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

function getMealStatusClass(status: MealListItemData["status"]) {
  if (status === "shopping_done") {
    return "shopped";
  }

  if (status === "cook_done") {
    return "cooked";
  }

  return "registered";
}

function MealWebProfileButton() {
  return (
    <Link
      aria-label="마이페이지"
      className="web-profile-button"
      href="/mypage"
    >
      <UserIcon />
    </Link>
  );
}

function MealWebListCard({
  conflictError,
  isPending,
  meal,
  onCreateShopping,
  onDelete,
  onRecipeClick,
  onStartCook,
  onStepDown,
  onStepUp,
}: {
  conflictError: string | null;
  isPending: boolean;
  meal: MealListItemData;
  onCreateShopping: () => void;
  onDelete: () => void;
  onRecipeClick: () => void;
  onStartCook: () => void;
  onStepDown: () => void;
  onStepUp: () => void;
}) {
  const isMin = meal.planned_servings <= 1;
  const canStartCook = meal.status === "shopping_done";
  const visual = getMealVisualMeta(meal);
  return (
    <article className="web-meal-list-card" aria-label={`${meal.recipe_title} 끼니 음식`}>
      <div
        className="web-meal-list-thumb"
        style={{ backgroundColor: visual.bg }}
        aria-hidden="true"
      >
        {meal.recipe_thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={meal.recipe_thumbnail_url} />
        ) : (
          <span>{visual.emoji}</span>
        )}
      </div>

      <div className="web-meal-list-copy">
        <div className="web-meal-title-meta">
          <span
            className={`web-meal-status web-meal-status-${getMealStatusClass(meal.status)}`}
          >
            {getMealStatusLabel(meal.status)}
          </span>
          {meal.is_leftover ? (
            <span className="web-meal-leftover">남은요리</span>
          ) : null}
        </div>
        <button
          className="web-meal-title-button"
          data-testid={`meal-recipe-link-${meal.id}`}
          onClick={onRecipeClick}
          type="button"
        >
          {meal.recipe_title}
        </button>
        <div className="web-meal-meta-row">
          <span>{meal.planned_servings}인분</span>
          <span>{visual.minutes}분</span>
        </div>
      </div>

      <div className="web-meal-list-delete">
        <button
          aria-label={`${meal.recipe_title} 삭제`}
          className="web-meal-delete-button"
          data-testid={`meal-delete-${meal.id}`}
          disabled={isPending}
          onClick={onDelete}
          type="button"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="web-meal-list-footer">
        <div className="web-meal-inline-stepper" aria-label="인분 조절" role="group">
          <button
            aria-label="인분 감소"
            disabled={isMin || isPending}
            onClick={onStepDown}
            type="button"
          >
            -
          </button>
          <span aria-label={`${meal.planned_servings}인분`} aria-live="polite">
            {meal.planned_servings}인분
          </span>
          <button
            aria-label="인분 증가"
            disabled={isPending}
            onClick={onStepUp}
            type="button"
          >
            +
          </button>
        </div>

        <div className="web-meal-list-actions">
          {canStartCook ? (
            <button
              aria-label={`${meal.recipe_title} 요리하기`}
              className="web-meal-action-primary"
              disabled={isPending}
              onClick={onStartCook}
              type="button"
            >
              <CookIcon />
              요리하기
            </button>
          ) : null}
          <button
            className="web-meal-action-secondary"
            onClick={onCreateShopping}
            type="button"
          >
            <ShoppingIcon />
            장보기
          </button>
        </div>
      </div>

      {conflictError ? (
        <p className="web-meal-conflict" role="alert">
          {conflictError}
        </p>
      ) : null}
    </article>
  );
}

function MealWebLoadingCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="web-meal-list-card"
      data-testid="web-meal-loading-card"
    >
      <WebSkeleton
        className="web-meal-list-thumb"
        data-testid="web-meal-loading-thumb"
      />

      <div className="web-meal-list-copy">
        <div className="web-meal-title-meta">
          <WebSkeleton height={30} width={62} />
          <WebSkeleton height={30} width={72} />
        </div>
        <WebSkeleton className="mt-3" height={22} width="80%" />
        <div className="web-meal-meta-row">
          <WebSkeleton height={16} width={48} />
          <WebSkeleton height={16} width={36} />
        </div>
      </div>

      <div className="web-meal-list-delete">
        <WebSkeleton height={36} width={36} />
      </div>

      <div className="web-meal-list-footer">
        <WebSkeleton height={34} width={118} />
        <div className="web-meal-list-actions">
          <WebSkeleton height={36} width={86} />
          <WebSkeleton height={36} width={78} />
        </div>
      </div>
    </article>
  );
}

function MealWebLoadingSkeleton({
  planDate,
  slotName,
}: {
  planDate: string;
  slotName: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="끼니 화면 불러오는 중"
      className="web-meal-layout web-meal-list-layout"
      data-testid="web-meal-loading-skeleton"
    >
      <section className="web-meal-main" aria-labelledby="web-meal-loading-title">
        <div className="web-meal-list-head">
          <div>
            <WebSkeleton
              aria-hidden="true"
              className="mb-2"
              height={36}
              width={180}
            />
            <WebSkeleton aria-hidden="true" height={18} width={260} />
            <h1 className="sr-only" id="web-meal-loading-title">
              끼니 음식 불러오는 중
            </h1>
          </div>
        </div>

        <div className="web-meal-list">
          {Array.from({ length: 2 }).map((_, index) => (
            <MealWebLoadingCardSkeleton key={index} />
          ))}
        </div>
      </section>

      <aside className="web-meal-rail">
        <div
          className="web-meal-rail-card"
          data-testid="web-meal-loading-summary"
        >
          <div className="web-meal-rail-head">
            <WebSkeleton height={14} width={64} />
            <WebSkeleton className="mt-2" height={30} width="78%" />
          </div>
          <div className="web-meal-rail-stats">
            <div>
              <WebSkeleton height={14} width={42} />
              <WebSkeleton className="mt-2" height={24} width={38} />
            </div>
            <div>
              <WebSkeleton height={14} width={52} />
              <WebSkeleton className="mt-2" height={24} width={52} />
            </div>
          </div>
          <WebSkeleton className="mt-5" height={44} width="100%" />
          <span className="sr-only">
            {formatDateLong(planDate)}
            {slotName ? ` · ${slotName}` : ""}
          </span>
        </div>
      </aside>
    </div>
  );
}

function MealWebView({
  addMealHref,
  authState,
  conflictErrors,
  errorMessage,
  meals,
  onAddMeal,
  onBack,
  onCreateShopping,
  onDelete,
  onRecipeClick,
  onRetry,
  onStartCook,
  onStepDown,
  onStepUp,
  pendingMealIds,
  planDate,
  screenState,
  slotName,
  totalServings,
}: {
  addMealHref: string;
  authState: AuthState;
  conflictErrors: Record<string, string>;
  errorMessage: string | null;
  meals: MealListItemData[];
  onAddMeal: () => void;
  onBack: () => void;
  onCreateShopping: () => void;
  onDelete: (meal: MealListItemData) => void;
  onRecipeClick: (meal: MealListItemData) => void;
  onRetry: () => void;
  onStartCook: (meal: MealListItemData) => void;
  onStepDown: (meal: MealListItemData) => void;
  onStepUp: (meal: MealListItemData) => void;
  pendingMealIds: Set<string>;
  planDate: string;
  screenState: ScreenState;
  slotName: string;
  totalServings: number;
}) {
  const isLoading = authState === "checking" || screenState === "loading";
  const breadcrumbCurrent = slotName
    ? `${formatDateLong(planDate)} · ${slotName}`
    : formatDateLong(planDate);

  return (
    <WebShell className="web-meal" wide>
      <WebTopNav
        activeId="planner"
        items={WEB_NAV_ITEMS}
        rightSlot={<MealWebProfileButton />}
      />
      <div className="web-screen web-meal-screen">
        <nav aria-label="식사 경로" className="web-breadcrumb">
          <button
            aria-label="플래너로 돌아가기"
            className="web-breadcrumb-link"
            onClick={onBack}
            type="button"
          >
            <ChevronLeftIcon />
            플래너
          </button>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">{breadcrumbCurrent}</span>
        </nav>

        {isLoading ? (
          <MealWebLoadingSkeleton planDate={planDate} slotName={slotName} />
        ) : null}

        {screenState === "error" ? (
          <WebErrorState
            action={<WebButton onClick={onRetry}>다시 시도</WebButton>}
            data-testid="meal-screen-error"
            description={errorMessage ?? "잠시 후 다시 시도해주세요."}
            title="식사 목록을 불러오지 못했어요"
          />
        ) : null}

        {screenState === "empty" ? (
          <WebEmptyState
            action={
              <WebButton onClick={onAddMeal} data-testid="meal-screen-add-cta">
                식사 추가
              </WebButton>
            }
            data-testid="meal-screen-empty"
            description="레시피 검색, 팬트리 추천, 직접 입력으로 식사를 추가할 수 있어요."
            title="이 끼니에 등록된 식사가 없어요"
          />
        ) : null}

        {screenState === "ready" && meals.length > 0 ? (
          <div className="web-meal-layout web-meal-list-layout">
            <section aria-labelledby="web-meal-list-title" className="web-meal-main">
              <div className="web-meal-list-head">
                <div>
                  <h1 id="web-meal-list-title">끼니 음식 {meals.length}개</h1>
                  <p>이 끼니에 등록된 음식을 한 번에 관리해요.</p>
                </div>
              </div>

              <div className="web-meal-list" data-testid="web-meal-list">
                {meals.map((meal) => (
                  <MealWebListCard
                    conflictError={conflictErrors[meal.id] ?? null}
                    isPending={pendingMealIds.has(meal.id)}
                    key={meal.id}
                    meal={meal}
                    onCreateShopping={onCreateShopping}
                    onDelete={() => onDelete(meal)}
                    onRecipeClick={() => onRecipeClick(meal)}
                    onStartCook={() => onStartCook(meal)}
                    onStepDown={() => onStepDown(meal)}
                    onStepUp={() => onStepUp(meal)}
                  />
                ))}
              </div>
            </section>

            <aside className="web-meal-rail">
              <div className="web-meal-rail-card" data-testid="web-meal-summary">
                <div className="web-meal-rail-head">
                  <p>끼니 요약</p>
                  <h2>{slotName || formatDateLong(planDate)}</h2>
                </div>
                <div className="web-meal-rail-stats">
                  <div>
                    <span>음식</span>
                    <strong>{meals.length}개</strong>
                  </div>
                  <div>
                    <span>총 인분</span>
                    <strong>{totalServings}인분</strong>
                  </div>
                </div>

                <Link className="web-meal-add-link" data-testid="meal-screen-add-cta" href={addMealHref}>
                  <PlusIcon />
                  식사 추가
                </Link>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </WebShell>
  );
}

function MealWebConfirmDialog({
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  testId,
  title,
  titleId,
  variant = "normal",
}: {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  testId: string;
  title: string;
  titleId: string;
  variant?: "normal" | "destructive";
}) {
  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog aria-labelledby={titleId} className="web-confirm-dialog" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id={titleId}>{title}</WebDialogTitle>
          <WebIconButton aria-label="닫기" onClick={onCancel}>
            <CloseIcon />
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-confirm-body">
            <span
              aria-hidden="true"
              className={[
                "web-confirm-icon",
                variant === "destructive" ? "web-confirm-icon-danger" : "",
              ].join(" ")}
            >
              {variant === "destructive" ? <TrashIcon /> : "?"}
            </span>
            <p className="web-confirm-copy">{description}</p>
          </div>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            className={variant === "destructive" ? "web-confirm-danger" : undefined}
            data-testid={testId}
            onClick={onConfirm}
          >
            {confirmLabel}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 4.5L6.5 9l4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function CookIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 14h8M6 7.5h6.2a2.8 2.8 0 010 5.6H6A3.8 3.8 0 116 5.5h1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function ShoppingIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 7h9l-.7 6.3a1.8 1.8 0 01-1.8 1.6H7a1.8 1.8 0 01-1.8-1.6L4.5 7z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M6.5 7a2.5 2.5 0 015 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M3.5 5h11M7 5V3.7c0-.7.5-1.2 1.2-1.2h1.6c.7 0 1.2.5 1.2 1.2V5m2.1 0l-.5 9a1.4 1.4 0 01-1.4 1.3H6.8A1.4 1.4 0 015.4 14L4.9 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M7.8 8v4M10.2 8v4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="7" r="3.25" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.75 17c.65-2.65 2.46-4 5.25-4s4.6 1.35 5.25 4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
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
        className="relative w-full max-w-sm rounded-t-[var(--radius-sheet)] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)] lg:rounded-[var(--radius-sheet)] lg:p-5"
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
  const [mealAddSheetOpen, setMealAddSheetOpen] = useState(false);
  const [mealAddPickerMode, setMealAddPickerMode] =
    useState<MealAddPickerMode | null>(null);

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

  function setMealActionError(mealId: string, message: string) {
    setConflictErrors((prev) => ({
      ...prev,
      [mealId]: message,
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

  async function startMealCooking(meal: MealListItemData) {
    if (meal.status !== "shopping_done") {
      return;
    }

    addPending(meal.id);
    clearConflictError(meal.id);

    try {
      const session = await createCookingSession({
        recipe_id: meal.recipe_id,
        meal_ids: [meal.id],
        cooking_servings: meal.planned_servings,
      });
      router.push(
        buildReturnHref(`/cooking/sessions/${session.session_id}/cook-mode`, {
          returnTo: buildNextPath(planDate, columnId, slotName),
        }),
      );
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }

      setMealActionError(
        meal.id,
        isCookingApiError(error) && error.status === 409
          ? "이미 다른 상태로 변경된 식사가 있어요. 새로고침 후 다시 시도해 주세요."
          : "요리 세션을 만들지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      removePending(meal.id);
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

  function openMealAddSheet() {
    setMealAddSheetOpen(true);
    setMealAddPickerMode(null);
  }

  function closeMealAddSheet() {
    setMealAddPickerMode(null);
    setMealAddSheetOpen(false);
  }

  function openMealAddPicker(mode: MealAddPickerMode) {
    setMealAddPickerMode(mode);
  }

  function closeMealAddPicker() {
    setMealAddPickerMode(null);
  }

  async function handleMealAddComplete() {
    setMealAddPickerMode(null);
    setMealAddSheetOpen(false);
    await loadMeals();
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
  const mealAddSheetTitle = `${formatDateShort(planDate)}${slotName ? ` ${slotName}` : ""} · 식사 추가`;
  function getMealAddRouteHref(mode: MealAddRouteMode) {
    const targetPath = `/menu/add/${mode}?${mealAddQuery}`;

    return buildReturnHref(targetPath, {
      returnTo: buildNextPath(planDate, columnId, slotName),
    });
  }
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;
  const isLoading = authState === "checking" || screenState === "loading";
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
          <div className="rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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
        <div className="hidden lg:block">
          <MealWebView
            addMealHref={addMealHref}
            authState={authState}
            conflictErrors={conflictErrors}
            errorMessage={errorMessage}
            meals={meals}
            onAddMeal={() => router.push(addMealHref)}
            onBack={navigateToPlanner}
            onCreateShopping={() => router.push("/shopping/flow")}
            onDelete={(meal) => handleDeleteTap(meal.id)}
            onRecipeClick={(meal) => router.push(`/recipe/${meal.recipe_id}`)}
            onRetry={() => void loadMeals()}
            onStartCook={(meal) => void startMealCooking(meal)}
            onStepDown={(meal) => handleStepperTap(meal, -1)}
            onStepUp={(meal) => handleStepperTap(meal, 1)}
            pendingMealIds={pendingMealIds}
            planDate={planDate}
            screenState={screenState}
            slotName={slotName}
            totalServings={totalServings}
          />
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
                <div className="mb-1 text-[13px] font-semibold leading-[1.3] text-[var(--brand)]">
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
            {isLoading ? (
              <LoadingSummarySkeleton planDate={planDate} slotName={slotName} />
            ) : null}

            <div className="space-y-3 p-4">
              {/* Loading skeletons */}
              {isLoading ? <LoadingSkeleton /> : null}

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
                    className="mt-4 min-h-[var(--control-height-md)] rounded-[var(--radius-control)] border border-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-[var(--brand)]"
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
                    className="mt-6 flex h-[var(--control-height-xl)] w-full max-w-xs items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-base font-semibold text-white hover:bg-[var(--brand)]"
                    data-testid="meal-screen-add-cta"
                    onClick={openMealAddSheet}
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
                      onStartCook={() => void startMealCooking(meal)}
                      onStepDown={() => handleStepperTap(meal, -1)}
                      onStepUp={() => handleStepperTap(meal, 1)}
                    />
                  ))
                : null}

              {screenState === "ready" ? (
                <button
                  className="mt-2 flex h-[var(--control-height-xl)] w-full items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand)] bg-white px-4 text-base font-semibold text-[var(--brand)]"
                  data-testid="meal-screen-add-cta"
                  onClick={openMealAddSheet}
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

      {shouldRenderAppView && mealAddSheetOpen && !mealAddPickerMode ? (
        <MealAddOptionsSheet
          onClose={closeMealAddSheet}
          onPickerSelect={openMealAddPicker}
          routeHrefFor={getMealAddRouteHref}
          testId="meal-screen-meal-add-sheet"
          title={mealAddSheetTitle}
        />
      ) : null}

      {shouldRenderAppView && mealAddSheetOpen && mealAddPickerMode ? (
        <MealAddPickerFlow
          columnId={columnId}
          entryMode={mealAddPickerMode}
          key={`${planDate}-${columnId}-${mealAddPickerMode}`}
          onClose={closeMealAddPicker}
          onComplete={handleMealAddComplete}
          planDate={planDate}
          slotName={slotName}
        />
      ) : null}

      {/* Serving-change confirmation modal */}
      {modal?.type === "serving-change" ? (
        isDesktopViewport ? (
          <MealWebConfirmDialog
            confirmLabel="변경하기"
            description="상태가 진행된 식사입니다. 인분 변경 시 다시 장보기/요리 흐름이 필요할 수 있어요."
            onCancel={handleModalCancel}
            onConfirm={handleServingChangeConfirm}
            testId="serving-change-confirm"
            title="인분 변경"
            titleId="serving-change-title"
          />
        ) : (
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
                className="flex-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)]"
                onClick={handleModalCancel}
                type="button"
              >
                취소
              </button>
              <button
                className="flex-[2] rounded-[var(--radius-card)] bg-[var(--brand)] py-3.5 text-sm font-bold text-white"
                data-testid="serving-change-confirm"
                onClick={handleServingChangeConfirm}
                type="button"
              >
                변경하기
              </button>
            </div>
          </CenterModal>
        )
      ) : null}

      {/* Delete confirmation modal */}
      {modal?.type === "delete" ? (
        isDesktopViewport ? (
          <MealWebConfirmDialog
            confirmLabel="삭제"
            description="이 식사를 삭제하시겠어요?"
            onCancel={handleModalCancel}
            onConfirm={handleDeleteConfirm}
            testId="delete-confirm"
            title="식사 삭제"
            titleId="delete-confirm-title"
            variant="destructive"
          />
        ) : (
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
                className="flex-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)]"
                onClick={handleModalCancel}
                type="button"
              >
                취소
              </button>
              <button
                className="flex-[2] rounded-[var(--radius-card)] bg-[var(--brand-deep)] py-3.5 text-sm font-bold text-white"
                data-testid="delete-confirm"
                onClick={handleDeleteConfirm}
                type="button"
              >
                삭제
              </button>
            </div>
          </CenterModal>
        )
      ) : null}
    </>
  );
}
