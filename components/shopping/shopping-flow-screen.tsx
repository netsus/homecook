"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { APP_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";
import { PantryReflectionPopup } from "@/components/shopping/pantry-reflection-popup";
import {
  WebButton,
  WebCard,
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
import type {
  ShoppingListDetail,
  ShoppingListItemSummary,
  ShoppingPreviewData,
  ShoppingPreviewMeal,
} from "@/types/shopping";

export interface ShoppingFlowScreenProps {
  initialAuthenticated: boolean;
}

interface MealConfig {
  recipe_id: string;
  meal_ids: string[];
  meals: Array<{
    id: string;
    planned_servings: number;
    created_at: string;
  }>;
  shopping_servings: number;
  isSelected: boolean;
  recipe_name: string;
  recipe_thumbnail: string | null;
  planned_servings_total: number;
  meal_count: number;
  created_at: string;
}

type ViewState = "loading" | "empty" | "error" | "ready" | "creating" | "review";

function groupMealsByRecipe(meals: ShoppingPreviewMeal[]): MealConfig[] {
  const grouped = new Map<string, MealConfig>();

  meals.forEach((meal) => {
    const existing = grouped.get(meal.recipe_id);

    if (existing) {
      existing.meal_ids.push(meal.id);
      existing.meals.push({
        id: meal.id,
        planned_servings: meal.planned_servings,
        created_at: meal.created_at,
      });
      existing.planned_servings_total += meal.planned_servings;
      existing.shopping_servings += meal.planned_servings;
      existing.meal_count += 1;
      if (meal.created_at < existing.created_at) {
        existing.created_at = meal.created_at;
      }
      return;
    }

    grouped.set(meal.recipe_id, {
      recipe_id: meal.recipe_id,
      meal_ids: [meal.id],
      meals: [
        {
          id: meal.id,
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
      created_at: meal.created_at,
    });
  });

  return [...grouped.values()].sort((left, right) => {
    const byCreatedAt = left.created_at.localeCompare(right.created_at);
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return left.recipe_id.localeCompare(right.recipe_id);
  });
}

function buildMealConfigs(data: ShoppingPreviewData): MealConfig[] {
  const eligibleMealMap = new Map(
    data.eligible_meals.map((meal) => [
      meal.id,
      {
        id: meal.id,
        planned_servings: meal.planned_servings,
        created_at: meal.created_at,
      },
    ]),
  );

  if (Array.isArray(data.recipes) && data.recipes.length > 0) {
    return data.recipes.map((recipe) => {
      const meals = recipe.meal_ids
        .map((mealId) => eligibleMealMap.get(mealId))
        .filter((meal): meal is NonNullable<typeof meal> => meal !== undefined);
      const createdAt =
        [...meals].sort((left, right) =>
          left.created_at.localeCompare(right.created_at),
        )[0]?.created_at ?? "";

      return {
        recipe_id: recipe.recipe_id,
        meal_ids: recipe.meal_ids,
        meals,
        shopping_servings: recipe.shopping_servings,
        isSelected: recipe.is_selected,
        recipe_name: recipe.recipe_name,
        recipe_thumbnail: recipe.recipe_thumbnail,
        planned_servings_total: recipe.planned_servings_total,
        meal_count: recipe.meal_ids.length,
        created_at: createdAt,
      };
    });
  }

  return groupMealsByRecipe(data.eligible_meals);
}

function selectMealIdsForShoppingServings(
  meals: MealConfig["meals"],
  fallbackMealIds: string[],
  shoppingServings: number,
) {
  if (meals.length === 0) {
    return fallbackMealIds;
  }

  const totalServings = meals.reduce(
    (total, meal) => total + meal.planned_servings,
    0,
  );

  if (shoppingServings >= totalServings) {
    return meals.map((meal) => meal.id);
  }

  const sortedMeals = [...meals].sort((left, right) => {
    const byCreatedAt = left.created_at.localeCompare(right.created_at);
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return left.id.localeCompare(right.id);
  });
  const reachable = new Map<number, MealConfig["meals"]>([[0, []]]);

  sortedMeals.forEach((meal) => {
    const snapshots = [...reachable.entries()];

    snapshots.forEach(([servings, selectedMeals]) => {
      const nextServings = servings + meal.planned_servings;

      if (nextServings > shoppingServings || reachable.has(nextServings)) {
        return;
      }

      reachable.set(nextServings, [...selectedMeals, meal]);
    });
  });

  const bestServings = [...reachable.keys()]
    .filter((servings) => servings > 0)
    .sort((left, right) => right - left)[0];

  if (bestServings) {
    return (reachable.get(bestServings) ?? []).map((meal) => meal.id);
  }

  const smallestMeal = sortedMeals.reduce((best, meal) =>
    meal.planned_servings < best.planned_servings ? meal : best,
  );

  return [smallestMeal.id];
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

function formatDateShort(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "예정";
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function groupConfigsByDate(configs: MealConfig[]) {
  const groups = new Map<string, MealConfig[]>();

  configs.forEach((config) => {
    const key = formatDateShort(config.created_at);
    groups.set(key, [...(groups.get(key) ?? []), config]);
  });

  return [...groups.entries()];
}

const recipeVisualMeta: Record<string, { bg: string; emoji: string; meal: string }> = {
  감자: { bg: "#FFEBC5", emoji: "🥟", meal: "저녁" },
  감자수제비: { bg: "#FFEBC5", emoji: "🥟", meal: "저녁" },
  김치볶음밥: { bg: "#FFE6E6", emoji: "🍚", meal: "아침" },
  된장찌개: { bg: "#FFE7E2", emoji: "🍲", meal: "저녁" },
  제육볶음: { bg: "#FFB69D", emoji: "🥩", meal: "저녁" },
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

  const handleToggleSelection = useCallback((recipeId: string) => {
    setMealConfigs((prev) =>
      prev.map((config) =>
        config.recipe_id === recipeId
          ? { ...config, isSelected: !config.isSelected }
          : config
      )
    );
  }, []);

  const handleShoppingServingsChange = useCallback(
    (recipeId: string, nextServings: number) => {
      setMealConfigs((prev) =>
        prev.map((config) =>
          config.recipe_id === recipeId
            ? { ...config, shopping_servings: Math.max(1, nextServings) }
            : config,
        ),
      );
    },
    [],
  );

  const handleCreateList = useCallback(async () => {
    const selectedConfigs = mealConfigs.filter((config) => config.isSelected);

    if (selectedConfigs.length === 0) {
      return;
    }

    setViewState("creating");

    try {
      const body = {
        recipes: selectedConfigs.map((config) => ({
          recipe_id: config.recipe_id,
          meal_ids: selectMealIdsForShoppingServings(
            config.meals,
            config.meal_ids,
            config.shopping_servings,
          ),
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
            description="플래너에 식사를 먼저 등록해 주세요. 등록 완료 전이거나 이미 장보기·요리 흐름에 들어간 식사는 제외돼요."
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
  const isCreateDisabled = selectedCount === 0;

  if (isMobileViewport) {
    return (
      <MobileSelectScreen
        configs={mealConfigs}
        isCreateDisabled={isCreateDisabled}
        onBack={handleBack}
        onCreate={handleCreateList}
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
        <nav aria-label="장보기 경로" className="web-breadcrumb">
          <button
            aria-label="뒤로 가기"
            className="web-breadcrumb-link"
            onClick={handleBack}
            type="button"
          >
            Planner
          </button>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">장보기</span>
        </nav>

        <header className="web-shopping-flow-head">
          <div>
            <p className="web-menu-add-eyebrow">Shopping</p>
            <h1>장보기 준비</h1>
            <p>
              식사 등록 완료이면서 아직 장보기 리스트에 없는 식사입니다.
              같은 레시피는 합산 계획 인분으로 묶어요.
            </p>
          </div>
        </header>

        <section className="web-shopping-mode-grid" aria-label="장보기 메뉴">
          <WebCard className="web-shopping-mode-card web-shopping-mode-card-active">
            <strong>진행할 장보기</strong>
            <span>{selectedCount}개 레시피 선택</span>
          </WebCard>
          <WebCard className="web-shopping-mode-card">
            <strong>지난 장보기</strong>
            <span>완료된 목록을 다시 확인</span>
            <button onClick={() => push("/mypage?restore=shopping-history-tab")} type="button">
              기록 보기 &gt;
            </button>
          </WebCard>
          <WebCard className="web-shopping-mode-card">
            <strong>직접 추가</strong>
            <span>필요한 재료를 직접 담기</span>
            <button onClick={() => push("/pantry")} type="button">
              팬트리 보기 &gt;
            </button>
          </WebCard>
        </section>

        <div className="web-shopping-flow-layout">
          <section className="web-shopping-flow-main" aria-labelledby="shopping-flow-meals-title">
            <div className="web-shopping-section-head">
              <div>
                <h2 id="shopping-flow-meals-title">장볼 끼니</h2>
                <p>대상 식사와 합산 인분을 확인하세요.</p>
              </div>
              <span>{mealConfigs.length}개 묶음</span>
            </div>
            <div className="web-shopping-recipe-list">
              {mealConfigs.map((config) => (
                <RecipeCard
                  config={config}
                  key={config.recipe_id}
                  onServingsChange={handleShoppingServingsChange}
                  onToggle={handleToggleSelection}
                />
              ))}
            </div>
          </section>

          <aside className="web-shopping-summary" aria-label="장보기 요약">
            <h2>선택한 레시피</h2>
            <strong>{selectedCount}</strong>
            <p>선택한 레시피로 장보기 목록을 생성하세요.</p>
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
          className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-white/60"
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
          {title}
        </h1>
        <div aria-hidden="true" className="h-8 w-8 shrink-0" />
      </div>
    </div>
  );
}

function MobileSelectScreen({
  configs,
  isCreateDisabled,
  onBack,
  onCreate,
  onToggle,
}: {
  configs: MealConfig[];
  isCreateDisabled: boolean;
  onBack: () => void;
  onCreate: () => void;
  onToggle: (recipeId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[#F8F9FA] lg:hidden">
      <MobileAppBar onBack={onBack} />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[168px]">
        <section className="border-b border-[#DEE2E6] bg-white px-5 py-5">
          <p className="text-[12px] font-extrabold leading-[1.3] text-[var(--brand)]">
            STEP 1 / 2
          </p>
          <h2 className="mt-1 text-[20px] font-extrabold leading-[1.3] text-[#212529]">
            어떤 끼니의 재료를 살까요?
          </h2>
          <p className="mt-3 text-[13px] font-medium leading-[1.5] text-[#868E96]">
            선택한 끼니의 재료를 자동으로 모아드려요
          </p>
        </section>

        <div className="space-y-3 p-4">
          {groupConfigsByDate(configs).map(([dateLabel, items]) => (
            <section
              className="overflow-hidden rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white"
              key={dateLabel}
            >
              <h3 className="border-b border-[#F1F3F5] bg-[#F8F9FA] px-4 py-2.5 text-[14px] font-extrabold leading-[1.3] text-[#212529]">
                {dateLabel}
              </h3>
              <div className="divide-y divide-[#F1F3F5]">
                {items.map((config) => (
                  <MobileSelectRow
                    config={config}
                    key={config.recipe_id}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-[82px] z-20 border-t border-[#DEE2E6] bg-white px-4 py-4">
        <button
          className="flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-bold text-white disabled:bg-[#DEE2E6] disabled:text-[#ADB5BD]"
          data-testid="shopping-create-button"
          disabled={isCreateDisabled}
          onClick={onCreate}
          type="button"
        >
          장보기 목록 만들기
        </button>
      </div>
      <Wave1MobileBottomTab
        ariaLabel="장보기 목록 생성 화면 하단 탐색"
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
  onToggle: (recipeId: string) => void;
}) {
  const visual = getRecipeVisual(config);

  return (
    <div className={`flex min-h-[56px] items-center gap-3 px-4 py-2.5 ${config.isSelected ? "" : "opacity-45"}`}>
      <button
        aria-label={
          config.isSelected
            ? `${config.recipe_name} 선택 해제`
            : `${config.recipe_name} 선택`
        }
        className="flex h-8 w-8 shrink-0 items-center justify-center"
        onClick={() => onToggle(config.recipe_id)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={[
            "flex h-[22px] w-[22px] items-center justify-center rounded-[var(--radius-badge)] border text-white",
            config.isSelected
              ? "border-[var(--brand)] bg-[var(--brand)]"
              : "border-[#DEE2E6] bg-white",
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
        <p className="truncate text-[14px] font-extrabold leading-[1.3] text-[#212529]">
          {config.recipe_name}
        </p>
        <p className="mt-[2px] truncate text-[11px] font-medium leading-[1.3] text-[#868E96]">
          {visual.meal} · {config.shopping_servings}인분 · 장보기 대기
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
    <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[#F8F9FA] lg:hidden">
      <MobileAppBar onBack={onBack} />

      <main className="min-h-0 flex-1 overflow-y-auto pb-[168px]">
        <section className="border-b border-[#DEE2E6] bg-white px-5 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold leading-[1.3] text-[var(--brand)]">
                STEP 2 / 2
              </p>
              <h2 className="mt-1 truncate text-[20px] font-extrabold leading-[1.3] text-[#212529]">
                {formatDateDot(detail.created_at)} · 장보기 목록
              </h2>
              <p className="mt-2 text-[12px] font-medium leading-[1.4] text-[#868E96]">
                {purchaseItems.length}개 구매 예정 · {excludedItems.length}개 팬트리 제외
              </p>
            </div>
            <div className="shrink-0 text-[32px] font-extrabold leading-none text-[var(--brand)]">
              {progress}%
            </div>
          </div>
          <div className="mt-3 h-1 rounded-full bg-[#F1F3F5]">
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
          <h3 className="text-[14px] font-extrabold leading-[1.3] text-[#212529]">
            장볼 재료 목록
          </h3>
          <p className="mt-3 text-[12px] font-bold leading-[1.3] text-[#868E96]">
            메인 · {purchaseItems.length}
          </p>

          <div className="mt-3 overflow-hidden rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white">
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

      <div className="fixed inset-x-0 bottom-[82px] z-20 border-t border-[#DEE2E6] bg-white px-4 py-4">
        <div className="grid grid-cols-[1fr_86px] gap-2">
          <button
            className="flex h-[var(--control-height-lg)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-bold text-white disabled:bg-[#DEE2E6]"
            disabled={isCompleting || detail.is_completed}
            onClick={onComplete}
            type="button"
          >
            {detail.is_completed ? "완료됨" : isCompleting ? "완료 중..." : "장보기 완료"}
          </button>
          <button
            className="flex h-[var(--control-height-lg)] items-center justify-center rounded-[var(--radius-control)] bg-[#F8F9FA] text-[15px] font-bold text-[#212529] disabled:opacity-50"
            disabled={isSharing}
            onClick={onShare}
            type="button"
          >
            {isSharing ? "공유 중" : "공유"}
          </button>
        </div>
      </div>
      <Wave1MobileBottomTab
        ariaLabel="장보기 목록 리뷰 화면 하단 탐색"
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
    <div className="flex min-h-[64px] items-center gap-3 border-b border-[#F1F3F5] px-4 py-2.5 last:border-b-0">
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
            "flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[12px] text-white",
            item.is_checked
              ? "border-[var(--brand)] bg-[var(--brand)]"
              : "border-[#DEE2E6] bg-white",
          ].join(" ")}
        >
          {item.is_checked ? "✓" : ""}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-[1.3] text-[#212529]">
          {label}
        </p>
        <p className="mt-1 truncate text-[11px] font-medium leading-[1.3] text-[#868E96]">
          {amountText(item)} · 1끼에 사용
        </p>
      </div>

      <button
        aria-label={`${item.display_text} 이미있음`}
        className="flex h-[30px] shrink-0 items-center justify-center rounded-full border border-[#DEE2E6] bg-white px-3 text-[11px] font-extrabold text-[#495057] disabled:opacity-50"
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
  onServingsChange: (recipeId: string, nextServings: number) => void;
  onToggle: (recipeId: string) => void;
}

function RecipeCard({ config, onServingsChange, onToggle }: RecipeCardProps) {
  const selectedMealIds = selectMealIdsForShoppingServings(
    config.meals,
    config.meal_ids,
    config.shopping_servings,
  );
  const visual = getRecipeVisual(config);
  const shouldShowAggregationMeta =
    selectedMealIds.length > 1 || config.meal_count > 1;

  return (
    <article
      className={[
        "web-shopping-recipe-card",
        config.isSelected ? "web-shopping-recipe-card-selected" : "",
      ].join(" ")}
    >
      <button
        aria-label={
          config.isSelected
            ? `${config.recipe_name} 선택 해제`
            : `${config.recipe_name} 선택`
        }
        className="web-shopping-recipe-toggle"
        onClick={() => onToggle(config.recipe_id)}
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
          <h3>{config.recipe_name}</h3>
        </div>

        {shouldShowAggregationMeta ? (
          <div className="web-shopping-recipe-meta">
            <span>대상 식사 {selectedMealIds.length}개</span>
            <span>합산 계획 {config.planned_servings_total}인분</span>
          </div>
        ) : null}
        <p className="web-shopping-recipe-servings">
          계획 {config.planned_servings_total}인분
        </p>
        <div className="web-shopping-servings">
          <p>장보기 기준 인분</p>
          <div className="web-stepper" role="group" aria-label="장보기 기준 인분">
            <button
              aria-label="인분 줄이기"
              disabled={!config.isSelected || config.shopping_servings <= 1}
              onClick={() =>
                onServingsChange(config.recipe_id, config.shopping_servings - 1)
              }
              type="button"
            >
              -
            </button>
            <span aria-label={`${config.shopping_servings}인분`} aria-live="polite">
              {config.shopping_servings}인분
            </span>
            <button
              aria-label="인분 늘리기"
              disabled={!config.isSelected}
              onClick={() =>
                onServingsChange(config.recipe_id, config.shopping_servings + 1)
              }
              type="button"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
