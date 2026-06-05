"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { APP_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";
import { PantryReflectionPopup } from "@/components/shopping/pantry-reflection-popup";
import {
  WebButton,
  WebShell,
  WebTopNav,
} from "@/components/web";
import {
  completeShoppingList,
  createShoppingList,
  fetchShoppingListDetail,
  fetchShoppingShareText,
  fetchShoppingPreview,
  isShoppingApiError,
  updateShoppingListItem,
} from "@/lib/api/shopping";
import { buildReturnHref } from "@/lib/navigation/return-context";
import type {
  ShoppingListDetail,
  ShoppingListItemSummary,
  ShoppingPreviewData,
} from "@/types/shopping";

export interface ShoppingFlowScreenProps {
  initialAuthenticated: boolean;
}

interface MealConfig {
  selection_id: string;
  recipe_id: string;
  meal_ids: string[];
  meals: Array<{
    column_id: string;
    column_name?: string | null;
    id: string;
    plan_date: string;
    planned_servings: number;
    created_at: string;
  }>;
  shopping_servings: number;
  isSelected: boolean;
  recipe_name: string;
  recipe_thumbnail: string | null;
  planned_servings_total: number;
  meal_count: number;
  plan_date: string;
  created_at: string;
}

type ViewState = "loading" | "empty" | "error" | "ready" | "creating" | "review";
const SHOPPING_FLOW_RETURN_PATH = "/shopping/flow";
const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function buildMealConfigs(data: ShoppingPreviewData): MealConfig[] {
  return data.eligible_meals
    .map((meal) => ({
      selection_id: meal.id,
      recipe_id: meal.recipe_id,
      meal_ids: [meal.id],
      meals: [
        {
          column_id: meal.column_id,
          column_name: meal.column_name ?? null,
          id: meal.id,
          plan_date: meal.plan_date,
          planned_servings: meal.planned_servings,
          created_at: meal.created_at,
        },
      ],
      shopping_servings: meal.planned_servings,
      isSelected: true,
      recipe_name: meal.recipe_name,
      recipe_thumbnail: meal.recipe_thumbnail,
      planned_servings_total: meal.planned_servings,
      meal_count: 1,
      plan_date: meal.plan_date,
      created_at: meal.created_at,
    }))
    .sort(compareMealConfigs);
}

function shouldUseInlineReview() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(APP_VIEW_MEDIA_QUERY).matches
  );
}

function formatDateDot(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "예정";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}.${month}.${day}`;
}

function parseDateOnly(dateString: string) {
  const match = DATE_ONLY_PATTERN.exec(dateString);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const sortValue = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(sortValue);

  if (
    !Number.isFinite(sortValue) ||
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return {
    day,
    key: `${match[1]}-${match[2]}-${match[3]}`,
    month,
    sortValue,
    weekday: KOREAN_WEEKDAYS[new Date(sortValue).getUTCDay()],
  };
}

function formatShoppingDateLabel(dateString: string) {
  const dateOnly = parseDateOnly(dateString);
  if (dateOnly) {
    return `${dateOnly.month}월 ${dateOnly.day}일 ${dateOnly.weekday}요일`;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "날짜 미정";
  }
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${KOREAN_WEEKDAYS[date.getDay()]}요일`;
}

function getShoppingDateKey(dateString: string) {
  const dateOnly = parseDateOnly(dateString);
  if (dateOnly) {
    return dateOnly.key;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getDateSortValue(dateString: string) {
  const dateOnly = parseDateOnly(dateString);
  if (dateOnly) {
    return dateOnly.sortValue;
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return Number.MAX_SAFE_INTEGER;
  }
  return date.getTime();
}

function groupConfigsByDate(configs: MealConfig[]) {
  const groups = new Map<
    string,
    { items: MealConfig[]; label: string; sortValue: number }
  >();

  [...configs].sort(compareMealConfigs).forEach((config) => {
    const dateString = getPrimaryMeal(config)?.plan_date || config.plan_date || config.created_at;
    const key = getShoppingDateKey(dateString);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(config);
      return;
    }
    groups.set(key, {
      items: [config],
      label: formatShoppingDateLabel(dateString),
      sortValue: getDateSortValue(dateString),
    });
  });

  return [...groups.entries()]
    .sort(([, left], [, right]) => left.sortValue - right.sortValue)
    .map(([key, group]) => ({ key, ...group }));
}

function getPrimaryMeal(config: MealConfig) {
  return [...config.meals].sort((left, right) => {
    const byPlanDate = left.plan_date.localeCompare(right.plan_date);
    if (byPlanDate !== 0) return byPlanDate;

    const byCreatedAt = left.created_at.localeCompare(right.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;

    return left.id.localeCompare(right.id);
  })[0];
}

function compareMealConfigs(left: MealConfig, right: MealConfig) {
  const leftMeal = getPrimaryMeal(left);
  const rightMeal = getPrimaryMeal(right);
  const byPlanDate =
    getDateSortValue(leftMeal?.plan_date ?? left.plan_date) -
    getDateSortValue(rightMeal?.plan_date ?? right.plan_date);
  if (byPlanDate !== 0) return byPlanDate;

  const byCreatedAt =
    getDateSortValue(leftMeal?.created_at ?? left.created_at) -
    getDateSortValue(rightMeal?.created_at ?? right.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  const byName = left.recipe_name.localeCompare(right.recipe_name, "ko");
  if (byName !== 0) return byName;

  const byRecipeId = left.recipe_id.localeCompare(right.recipe_id);
  if (byRecipeId !== 0) return byRecipeId;

  return left.selection_id.localeCompare(right.selection_id);
}

function buildMealHref(config: MealConfig) {
  const meal = getPrimaryMeal(config);
  if (!meal?.plan_date || !meal.column_id) return "/planner";
  const slotQuery = meal.column_name
    ? `?slot=${encodeURIComponent(meal.column_name)}`
    : "";
  return buildReturnHref(`/planner/${meal.plan_date}/${meal.column_id}${slotQuery}`, {
    returnTo: SHOPPING_FLOW_RETURN_PATH,
  });
}

function inferColumnName(columnId: string) {
  const normalized = columnId.toLowerCase();
  if (normalized.includes("breakfast")) return "아침";
  if (normalized.includes("lunch")) return "점심";
  if (normalized.includes("dinner")) return "저녁";
  return "끼니";
}

function getMealSlotLabel(config: MealConfig) {
  const meal = getPrimaryMeal(config);
  if (!meal) return "끼니";
  return meal.column_name?.trim() || inferColumnName(meal.column_id);
}

const recipeVisualMeta: Record<string, { bg: string; emoji: string; meal: string }> = {
  감자: { bg: "var(--warning-soft)", emoji: "🥟", meal: "저녁" },
  감자수제비: { bg: "var(--warning-soft)", emoji: "🥟", meal: "저녁" },
  김치볶음밥: { bg: "var(--danger-soft)", emoji: "🍚", meal: "아침" },
  된장찌개: { bg: "var(--accent-meat-soft)", emoji: "🍲", meal: "저녁" },
  제육볶음: { bg: "var(--accent-peach)", emoji: "🥩", meal: "저녁" },
};

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

function getRecipeVisual(config: MealConfig) {
  return (
    recipeVisualMeta[config.recipe_name] ??
    Object.entries(recipeVisualMeta).find(([key]) =>
      config.recipe_name.includes(key),
    )?.[1] ?? { bg: "var(--brand-soft)", emoji: "🍽️", meal: "식사" }
  );
}

function amountText(item: ShoppingListItemSummary) {
  return item.amounts_json.map((amount) => `${amount.amount}${amount.unit}`).join(" + ");
}

export function ShoppingFlowScreen({
  initialAuthenticated,
}: ShoppingFlowScreenProps) {
  const { push } = useRouter();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [mealConfigs, setMealConfigs] = useState<MealConfig[]>([]);
  const [reviewDetail, setReviewDetail] = useState<ShoppingListDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const [showPantryPopup, setShowPantryPopup] = useState(false);
  const [reviewToast, setReviewToast] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setViewState("loading");
    setErrorMessage("");

    try {
      const data = await fetchShoppingPreview();

      if (data.eligible_meals.length === 0) {
        setViewState("empty");
        return;
      }

      setMealConfigs(buildMealConfigs(data));
      setViewState("ready");
    } catch (error) {
      if (isShoppingApiError(error)) {
        if (error.status === 401) {
          push("/login?next=/shopping/flow");
          return;
        }
        setErrorMessage(error.message);
      } else {
        setErrorMessage("장보기 목록을 불러오지 못했어요.");
      }
      setViewState("error");
    }
  }, [push]);

  useEffect(() => {
    if (initialAuthenticated) {
      void loadPreview();
    }
  }, [initialAuthenticated, loadPreview]);

  const handleToggleSelection = useCallback((selectionId: string) => {
    setMealConfigs((prev) =>
      prev.map((config) =>
        config.selection_id === selectionId
          ? { ...config, isSelected: !config.isSelected }
          : config
      )
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setMealConfigs((prev) =>
      prev.map((config) => ({ ...config, isSelected: true })),
    );
  }, []);

  const handleClearAll = useCallback(() => {
    setMealConfigs((prev) =>
      prev.map((config) => ({ ...config, isSelected: false })),
    );
  }, []);

  const handleCreateList = useCallback(async () => {
    const selectedConfigs = mealConfigs.filter((config) => config.isSelected);

    if (selectedConfigs.length === 0) {
      return;
    }

    setViewState("creating");

    try {
      const body = {
        meal_configs: selectedConfigs.map((config) => ({
          meal_id: config.meal_ids[0],
          shopping_servings: config.shopping_servings,
        })),
      };

      const result = await createShoppingList(body);

      if (!shouldUseInlineReview()) {
        push(`/shopping/lists/${result.id}`);
        return;
      }

      try {
        const detail = await fetchShoppingListDetail(result.id);
        setReviewDetail(detail);
        setViewState("review");
      } catch {
        push(`/shopping/lists/${result.id}`);
      }
    } catch (error) {
      if (isShoppingApiError(error)) {
        if (error.status === 401) {
          push("/login?next=/shopping/flow");
          return;
        }
        if (error.status === 409) {
          setErrorMessage("이미 다른 장보기 리스트에 포함된 식사가 있어요.");
        } else {
          setErrorMessage(error.message);
        }
      } else {
        setErrorMessage("장보기 목록을 만들지 못했어요.");
      }
      setViewState("error");
    }
  }, [mealConfigs, push]);

  const handleBack = useCallback(() => {
    push("/planner");
  }, [push]);

  const handleRetry = useCallback(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleReviewBack = useCallback(() => {
    if (viewState === "review") {
      setViewState("ready");
      return;
    }
    handleBack();
  }, [handleBack, viewState]);

  const handleReviewCheck = useCallback(
    async (itemId: string, currentChecked: boolean) => {
      if (!reviewDetail || reviewDetail.is_completed) {
        return;
      }

      const nextChecked = !currentChecked;
      setUpdatingItemId(itemId);
      setReviewDetail((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId ? { ...item, is_checked: nextChecked } : item,
              ),
            }
          : prev,
      );

      try {
        const updated = await updateShoppingListItem(reviewDetail.id, itemId, {
          is_checked: nextChecked,
        });
        setReviewDetail((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === itemId ? updated : item,
                ),
              }
            : prev,
        );
      } catch {
        setReviewDetail((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === itemId ? { ...item, is_checked: currentChecked } : item,
                ),
              }
            : prev,
        );
        setReviewToast("구매 상태를 바꾸지 못했어요.");
      } finally {
        setUpdatingItemId(null);
      }
    },
    [reviewDetail],
  );

  const handleReviewExclude = useCallback(
    async (
      itemId: string,
      currentExcluded: boolean,
      currentChecked: boolean,
    ) => {
      if (!reviewDetail || reviewDetail.is_completed) {
        return;
      }

      const nextExcluded = !currentExcluded;
      setUpdatingItemId(itemId);
      setReviewDetail((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === itemId
                  ? {
                      ...item,
                      is_checked: nextExcluded ? false : item.is_checked,
                      is_pantry_excluded: nextExcluded,
                    }
                  : item,
              ),
            }
          : prev,
      );

      try {
        const updated = await updateShoppingListItem(reviewDetail.id, itemId, {
          is_pantry_excluded: nextExcluded,
        });
        setReviewDetail((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === itemId ? updated : item,
                ),
              }
            : prev,
        );
      } catch {
        setReviewDetail((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        is_checked: currentChecked,
                        is_pantry_excluded: currentExcluded,
                      }
                    : item,
                ),
              }
            : prev,
        );
        setReviewToast("팬트리 제외 상태를 바꾸지 못했어요.");
      } finally {
        setUpdatingItemId(null);
      }
    },
    [reviewDetail],
  );

  const handleReviewShare = useCallback(async () => {
    if (!reviewDetail) {
      return;
    }

    setIsSharing(true);
    setReviewToast(null);
    try {
      const { text } = await fetchShoppingShareText(reviewDetail.id);
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ text });
        setReviewToast("공유되었습니다.");
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setReviewToast("복사되었습니다.");
      } else {
        setReviewToast("이 환경에서는 공유할 수 없어요.");
      }
    } catch {
      setReviewToast("공유 텍스트를 만들지 못했어요.");
    } finally {
      setIsSharing(false);
    }
  }, [reviewDetail]);

  const handleReviewComplete = useCallback(() => {
    if (!reviewDetail || reviewDetail.is_completed) {
      return;
    }
    setShowPantryPopup(true);
  }, [reviewDetail]);

  const handleReviewPantryConfirm = useCallback(
    async (selectedItemIds: string[] | undefined) => {
      if (!reviewDetail || reviewDetail.is_completed) {
        return;
      }

      setShowPantryPopup(false);
      setIsCompleting(true);
      setReviewToast(null);

      try {
        const result = await completeShoppingList(
          reviewDetail.id,
          selectedItemIds === undefined
            ? { add_to_pantry_item_ids: null }
            : { add_to_pantry_item_ids: selectedItemIds },
        );
        setReviewDetail((prev) =>
          prev
            ? {
                ...prev,
                completed_at: new Date().toISOString(),
                is_completed: true,
                items: prev.items.map((item) =>
                  result.pantry_added_item_ids.includes(item.id)
                    ? { ...item, added_to_pantry: true }
                    : item,
                ),
              }
            : prev,
        );
        setReviewToast("장보기를 완료했어요.");
      } catch {
        setReviewToast("장보기를 완료하지 못했어요.");
      } finally {
        setIsCompleting(false);
      }
    },
    [reviewDetail],
  );

  // Loading state
  if (viewState === "loading") {
    return (
      <div
        className="flex min-h-screen flex-col bg-[var(--wave1-surface)]"
        data-testid="shopping-flow-state-shell"
      >
        <AppBar onBack={handleBack} />
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            tone="loading"
            title="장볼 레시피를 불러오고 있어요"
            description="잠시만 기다려 주세요."
          />
        </div>
      </div>
    );
  }

  // Empty state
  if (viewState === "empty") {
    return (
      <div
        className="flex min-h-screen flex-col bg-[var(--wave1-surface)]"
        data-testid="shopping-flow-state-shell"
      >
        <AppBar onBack={handleBack} />
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            className="shopping-flow-blue-state"
            tone="empty"
            title="장보기 대상이 없어요"
            description="플래너에 식사를 먼저 등록해 주세요."
            actionLabel="플래너로 돌아가기"
            onAction={handleBack}
          />
        </div>
      </div>
    );
  }

  // Error state
  if (viewState === "error") {
    return (
      <div
        className="flex min-h-screen flex-col bg-[var(--wave1-surface)]"
        data-testid="shopping-flow-state-shell"
      >
        <AppBar onBack={handleBack} />
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            tone="error"
            title="장보기 목록을 불러오지 못했어요"
            description={errorMessage || "네트워크를 확인해 주세요."}
            actionLabel="다시 시도"
            onAction={handleRetry}
          />
        </div>
      </div>
    );
  }

  // Creating state
  if (viewState === "creating") {
    return (
      <div
        className="flex min-h-screen flex-col bg-[var(--wave1-surface)]"
        data-testid="shopping-flow-state-shell"
      >
        <AppBar onBack={handleBack} />
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
            tone="loading"
            title="장보기 목록을 만들고 있어요"
            description="팬트리 재료를 확인 중이에요..."
          />
        </div>
      </div>
    );
  }

  if (viewState === "review" && reviewDetail) {
    return (
      <>
        <MobileReviewScreen
          detail={reviewDetail}
          isCompleting={isCompleting}
          isSharing={isSharing}
          onBack={handleReviewBack}
          onComplete={handleReviewComplete}
          onShare={handleReviewShare}
          onToggleCheck={handleReviewCheck}
          onToggleExclude={handleReviewExclude}
          toast={reviewToast}
          updatingItemId={updatingItemId}
        />
        {showPantryPopup ? (
          <PantryReflectionPopup
            items={reviewDetail.items}
            onCancel={() => setShowPantryPopup(false)}
            onConfirm={handleReviewPantryConfirm}
          />
        ) : null}
      </>
    );
  }

  // Ready state
  const selectedCount = mealConfigs.filter((config) => config.isSelected).length;
  const selectedServings = mealConfigs.reduce(
    (total, config) => total + (config.isSelected ? config.shopping_servings : 0),
    0,
  );
  const isAllSelected = mealConfigs.length > 0 && selectedCount === mealConfigs.length;
  const isCreateDisabled = selectedCount === 0;

  if (isMobileViewport) {
    return (
      <MobileSelectScreen
        configs={mealConfigs}
        isAllSelected={isAllSelected}
        isCreateDisabled={isCreateDisabled}
        onBack={handleBack}
        onClearAll={handleClearAll}
        onCreate={handleCreateList}
        onSelectAll={handleSelectAll}
        onToggle={handleToggleSelection}
      />
    );
  }

  return (
    <WebShell className="web-shopping-shell" wide>
      <WebTopNav activeId="planner" items={WEB_NAV_ITEMS} />
      <main
        className="web-screen web-shopping-flow-screen max-w-none"
        data-testid="shopping-flow-shell"
      >
        <header className="web-shopping-flow-head">
          <div>
            <p className="web-menu-add-eyebrow">Shopping</p>
            <h1>장보기 준비</h1>
            <p>같은 재료는 장보기 목록에서 자동으로 합산돼요.</p>
          </div>
          <div className="web-shopping-flow-tools" aria-label="장보기 보조 메뉴">
            <button onClick={() => push("/mypage?restore=shopping-history-tab")} type="button">
              지난 장보기
            </button>
            <button onClick={() => push("/pantry")} type="button">
              팬트리 보기
            </button>
          </div>
        </header>

        <div className="web-shopping-flow-layout">
          <section className="web-shopping-flow-main" aria-labelledby="shopping-flow-meals-title">
            <div className="web-shopping-section-head">
              <div>
                <h2 id="shopping-flow-meals-title">어떤 끼니의 재료를 살까요?</h2>
              </div>
              <div className="web-shopping-section-actions">
                <button disabled={isAllSelected} onClick={handleSelectAll} type="button">
                  전체 선택
                </button>
                <button disabled={isCreateDisabled} onClick={handleClearAll} type="button">
                  전체 해제
                </button>
              </div>
            </div>
            <div className="web-shopping-date-list">
              {groupConfigsByDate(mealConfigs).map((group) => (
                <section className="web-shopping-date-section" key={group.key}>
                  <h3 className="web-shopping-date-heading">{group.label}</h3>
                  <div className="web-shopping-recipe-list">
                    {group.items.map((config) => (
                      <RecipeCard
                        config={config}
                        key={config.selection_id}
                        onToggle={handleToggleSelection}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <aside className="web-shopping-summary" aria-label="장보기 요약">
            <h2>선택한 식사</h2>
            <strong>{selectedCount}개 · {selectedServings}인분</strong>
            <p>장보기 목록으로 만들어요.</p>
            <WebButton
              data-testid="shopping-create-button"
              disabled={isCreateDisabled}
              fullWidth
              onClick={handleCreateList}
            >
              장보기 목록 만들기
            </WebButton>
          </aside>
        </div>
      </main>
    </WebShell>
  );
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  onBack: () => void;
}

function AppBar({ onBack }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--wave1-surface)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-6">
        <button
          aria-label="뒤로 가기"
          className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-[var(--surface-alpha-60)]"
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
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-normal text-[var(--foreground)]">
          장보기 준비
        </h1>
        {/* Right spacer matching back button width */}
        <div aria-hidden="true" className="h-[var(--control-height-md)] w-11 shrink-0" />
      </div>
    </div>
  );
}

function MobileAppBar({
  onBack,
  title = "장보기 목록",
}: {
  onBack: () => void;
  title?: string;
}) {
  return (
    <div className="shrink-0 border-b border-[var(--line-strong)] bg-[var(--surface)]">
      <div className="flex min-h-[var(--control-height-xl)] items-center gap-2 px-4 py-2.5">
        <button
          aria-label="뒤로 가기"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-[var(--surface-fill)]"
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
        <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold leading-[1.3] text-[var(--foreground)]">
          {title}
        </h1>
        <div aria-hidden="true" className="h-8 w-8 shrink-0" />
      </div>
    </div>
  );
}

function MobileSelectScreen({
  configs,
  isAllSelected,
  isCreateDisabled,
  onBack,
  onClearAll,
  onCreate,
  onSelectAll,
  onToggle,
}: {
  configs: MealConfig[];
  isAllSelected: boolean;
  isCreateDisabled: boolean;
  onBack: () => void;
  onClearAll: () => void;
  onCreate: () => void;
  onSelectAll: () => void;
  onToggle: (selectionId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--surface-fill)] lg:hidden">
      <MobileAppBar onBack={onBack} title="장보기 준비" />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[168px]">
        <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-5">
          <h2 className="text-[20px] font-extrabold leading-[1.3] text-[var(--foreground)]">
            어떤 끼니의 재료를 살까요?
          </h2>
          <p className="mt-3 text-[13px] font-medium leading-[1.5] text-[var(--text-3)]">
            같은 재료는 장보기 목록에서 자동으로 합산돼요.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              className="h-9 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--brand)] disabled:text-[var(--text-4)]"
              disabled={isAllSelected}
              onClick={onSelectAll}
              type="button"
            >
              전체 선택
            </button>
            <button
              className="h-9 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--text-2)] disabled:text-[var(--text-4)]"
              disabled={isCreateDisabled}
              onClick={onClearAll}
              type="button"
            >
              전체 해제
            </button>
          </div>
        </section>

        <div className="space-y-3 p-4">
          {groupConfigsByDate(configs).map((group) => (
            <section
              className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]"
              key={group.key}
            >
              <h3 className="border-b border-[var(--surface-subtle)] bg-[var(--surface-fill)] px-4 py-2.5 text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                {group.label}
              </h3>
              <div className="divide-y divide-[var(--surface-subtle)]">
                {group.items.map((config) => (
                  <MobileSelectRow
                    config={config}
                    key={config.selection_id}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-[430px] px-4">
        <button
          className="flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-bold text-[var(--text-inverse)] shadow-[0_10px_26px_var(--brand-shadow-color-soft)] disabled:bg-[var(--line-strong)] disabled:text-[var(--text-4)] disabled:shadow-none"
          data-testid="shopping-create-button"
          disabled={isCreateDisabled}
          onClick={onCreate}
          type="button"
        >
          장보기 목록 만들기
        </button>
      </div>
      <Wave1MobileBottomTab
        ariaLabel="장보기 목록 생성 화면 하단 내비게이션"
        currentTab="planner"
      />
    </div>
  );
}

function MobileSelectRow({
  config,
  onToggle,
}: {
  config: MealConfig;
  onToggle: (selectionId: string) => void;
}) {
  const visual = getRecipeVisual(config);
  const slotLabel = getMealSlotLabel(config);

  return (
    <div
      className={`flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5 ${config.isSelected ? "" : "opacity-45"}`}
      data-testid={`shopping-mobile-recipe-row-${config.selection_id}`}
      onClick={() => onToggle(config.selection_id)}
    >
      <button
        aria-label={
          config.isSelected
            ? `${config.recipe_name} 선택 해제`
            : `${config.recipe_name} 선택`
        }
        className="flex h-8 w-8 shrink-0 items-center justify-center"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(config.selection_id);
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className={[
            "flex h-[22px] w-[22px] items-center justify-center rounded-[var(--radius-badge)] border text-[var(--text-inverse)]",
            config.isSelected
              ? "border-[var(--brand)] bg-[var(--brand)]"
              : "border-[var(--line-strong)] bg-[var(--surface)]",
          ].join(" ")}
        >
          {config.isSelected ? "✓" : ""}
        </span>
      </button>
      <div
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-badge)] text-[18px]"
        style={{ backgroundColor: visual.bg }}
      >
        {config.recipe_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-full w-full object-cover"
            src={config.recipe_thumbnail}
          />
        ) : (
          <span aria-hidden="true">{visual.emoji}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          className="inline-block max-w-full truncate text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)] underline-offset-4 hover:text-[var(--brand)] hover:underline"
          href={buildMealHref(config)}
          onClick={(event) => event.stopPropagation()}
        >
          {config.recipe_name}
        </Link>
        <p className="mt-[2px] truncate text-[11px] font-bold leading-[1.3] text-[var(--text-3)]">
          {slotLabel} · {config.shopping_servings}인분
        </p>
      </div>
    </div>
  );
}

function MobileReviewScreen({
  detail,
  isCompleting,
  isSharing,
  onBack,
  onComplete,
  onShare,
  onToggleCheck,
  onToggleExclude,
  toast,
  updatingItemId,
}: {
  detail: ShoppingListDetail;
  isCompleting: boolean;
  isSharing: boolean;
  onBack: () => void;
  onComplete: () => void;
  onShare: () => void;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
  toast: string | null;
  updatingItemId: string | null;
}) {
  const purchaseItems = detail.items.filter((item) => !item.is_pantry_excluded);
  const excludedItems = detail.items.filter((item) => item.is_pantry_excluded);
  const checkedCount = purchaseItems.filter((item) => item.is_checked).length;
  const progress = purchaseItems.length
    ? Math.round((checkedCount / purchaseItems.length) * 100)
    : 100;

  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--surface-fill)] lg:hidden">
      <MobileAppBar onBack={onBack} />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[168px]">
        <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold leading-[1.3] text-[var(--brand)]">
                STEP 2 / 2
              </p>
              <h2 className="mt-1 truncate text-[20px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                {formatDateDot(detail.created_at)} · 장보기 목록
              </h2>
              <p className="mt-2 text-[12px] font-medium leading-[1.4] text-[var(--text-3)]">
                {purchaseItems.length}개 구매 예정 · {excludedItems.length}개 팬트리 제외
              </p>
            </div>
            <div className="shrink-0 text-[32px] font-extrabold leading-none text-[var(--brand)]">
              {progress}%
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-[var(--surface-subtle)]">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>

        {toast ? (
          <div
            className="mx-4 mt-3 rounded-[var(--radius-control)] bg-[var(--brand-soft)] px-4 py-3 text-[13px] font-bold text-[var(--brand)]"
            role="status"
          >
            {toast}
          </div>
        ) : null}

        <section className="px-4 py-5">
          <h3 className="text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)]">
            장볼 재료 목록
          </h3>
          <p className="mt-3 text-[12px] font-bold leading-[1.3] text-[var(--text-3)]">
            메인 · {purchaseItems.length}
          </p>

          <div className="mt-3 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)]">
            {purchaseItems.map((item) => (
              <MobileReviewItem
                isUpdating={updatingItemId === item.id}
                item={item}
                key={item.id}
                onToggleCheck={onToggleCheck}
                onToggleExclude={onToggleExclude}
              />
            ))}
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 mx-auto max-w-[430px] px-4">
        <div className="grid grid-cols-[1fr_86px] gap-2">
          <button
            className="flex h-[var(--control-height-lg)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-bold text-[var(--text-inverse)] shadow-[0_10px_26px_var(--brand-shadow-color-soft)] disabled:bg-[var(--line-strong)] disabled:shadow-none"
            disabled={isCompleting || detail.is_completed}
            onClick={onComplete}
            type="button"
          >
            {detail.is_completed ? "완료됨" : isCompleting ? "완료 중..." : "장보기 완료"}
          </button>
          <button
            className="flex h-[var(--control-height-lg)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[15px] font-bold text-[var(--foreground)] shadow-[0_10px_26px_var(--shadow-color-soft)] disabled:opacity-50 disabled:shadow-none"
            disabled={isSharing}
            onClick={onShare}
            type="button"
          >
            {isSharing ? "공유 중" : "공유"}
          </button>
        </div>
      </div>
      <Wave1MobileBottomTab
        ariaLabel="장보기 목록 리뷰 화면 하단 내비게이션"
        currentTab="planner"
      />
    </div>
  );
}

function MobileReviewItem({
  isUpdating,
  item,
  onToggleCheck,
  onToggleExclude,
}: {
  isUpdating: boolean;
  item: ShoppingListItemSummary;
  onToggleCheck: (itemId: string, currentChecked: boolean) => void;
  onToggleExclude: (
    itemId: string,
    currentExcluded: boolean,
    currentChecked: boolean,
  ) => void;
}) {
  const label = item.display_text.replace(/\s+\d+.*$/, "");

  return (
    <div className="flex min-h-[64px] items-center gap-3 border-b border-[var(--surface-subtle)] px-4 py-2.5 last:border-b-0">
      <button
        aria-checked={item.is_checked}
        aria-label={`${item.display_text} 구매 완료 표시`}
        className="flex h-8 w-8 shrink-0 items-center justify-center disabled:opacity-50"
        disabled={isUpdating}
        onClick={() => onToggleCheck(item.id, item.is_checked)}
        role="checkbox"
        type="button"
      >
        <span
          aria-hidden="true"
          className={[
            "flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[12px] text-[var(--text-inverse)]",
            item.is_checked
              ? "border-[var(--brand)] bg-[var(--brand)]"
              : "border-[var(--line-strong)] bg-[var(--surface)]",
          ].join(" ")}
        >
          {item.is_checked ? "✓" : ""}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)]">
          {label}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium leading-[1.3] text-[var(--text-3)]">
          {amountText(item)}
        </p>
      </div>

      <button
        aria-label={`${item.display_text} 이미있음`}
        className="flex h-[30px] shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[11px] font-extrabold text-[var(--text-2)] disabled:opacity-50"
        disabled={isUpdating}
        onClick={() =>
          onToggleExclude(item.id, item.is_pantry_excluded, item.is_checked)
        }
        type="button"
      >
        이미있음
      </button>
    </div>
  );
}

// ─── RecipeCard ──────────────────────────────────────────────────────────────

interface RecipeCardProps {
  config: MealConfig;
  onToggle: (selectionId: string) => void;
}

function RecipeCard({ config, onToggle }: RecipeCardProps) {
  const visual = getRecipeVisual(config);
  const slotLabel = getMealSlotLabel(config);

  return (
    <article
      className={[
        "web-shopping-recipe-card",
        config.isSelected ? "web-shopping-recipe-card-selected" : "",
      ].join(" ")}
      data-testid={`shopping-recipe-card-${config.selection_id}`}
      onClick={() => onToggle(config.selection_id)}
    >
      <button
        aria-label={
          config.isSelected
            ? `${config.recipe_name} 선택 해제`
            : `${config.recipe_name} 선택`
        }
        className="web-shopping-recipe-toggle"
        onClick={(event) => {
          event.stopPropagation();
          onToggle(config.selection_id);
        }}
        type="button"
      >
        {config.isSelected ? "✓" : ""}
      </button>

      <span
        aria-hidden="true"
        className="web-shopping-recipe-thumb"
        data-emoji={config.recipe_thumbnail ? undefined : visual.emoji}
        style={{ backgroundColor: visual.bg }}
      >
        {config.recipe_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" src={config.recipe_thumbnail} />
        ) : null}
      </span>

      <div className="web-shopping-recipe-copy">
        <div className="web-shopping-recipe-title-row">
          <h3>
            <Link
              className="web-shopping-recipe-title-link"
              href={buildMealHref(config)}
              onClick={(event) => event.stopPropagation()}
            >
              {config.recipe_name}
            </Link>
          </h3>
        </div>

        <div className="web-shopping-recipe-meta">
          <span>{slotLabel}</span>
          <span>{config.shopping_servings}인분</span>
        </div>
      </div>
    </article>
  );
}
