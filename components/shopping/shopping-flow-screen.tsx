"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { ContentState } from "@/components/shared/content-state";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import {
  createShoppingList,
  fetchShoppingPreview,
  isShoppingApiError,
} from "@/lib/api/shopping";
import type { ShoppingPreviewData, ShoppingPreviewMeal } from "@/types/shopping";

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
  planned_servings_total: number;
  meal_count: number;
  created_at: string;
}

type ViewState = "loading" | "empty" | "error" | "ready" | "creating";

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
    return data.recipes.map((recipe) => ({
      recipe_id: recipe.recipe_id,
      meal_ids: recipe.meal_ids,
      meals: recipe.meal_ids
        .map((mealId) => eligibleMealMap.get(mealId))
        .filter((meal): meal is NonNullable<typeof meal> => meal !== undefined),
      shopping_servings: recipe.shopping_servings,
      isSelected: recipe.is_selected,
      recipe_name: recipe.recipe_name,
      planned_servings_total: recipe.planned_servings_total,
      meal_count: recipe.meal_ids.length,
      created_at: "",
    }));
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

export function ShoppingFlowScreen({
  initialAuthenticated,
}: ShoppingFlowScreenProps) {
  const { push } = useRouter();
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [mealConfigs, setMealConfigs] = useState<MealConfig[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");

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

  const handleServingsChange = useCallback(
    (recipeId: string, newServings: number) => {
      setMealConfigs((prev) =>
        prev.map((config) =>
          config.recipe_id === recipeId
            ? { ...config, shopping_servings: newServings }
            : config
        )
      );
    },
    []
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

      // Navigate to shopping detail
      push(`/shopping/lists/${result.id}`);
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

  // Loading state
  if (viewState === "loading") {
    return (
      <div className="flex min-h-screen flex-col">
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
      <div className="flex min-h-screen flex-col">
        <AppBar onBack={handleBack} />
        <div className="flex flex-1 items-center justify-center p-4">
          <ContentState
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
      <div className="flex min-h-screen flex-col">
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
      <div className="flex min-h-screen flex-col">
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

  // Ready state
  const selectedCount = mealConfigs.filter((config) => config.isSelected).length;
  const isCreateDisabled = selectedCount === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <AppBar onBack={handleBack} />

      <main
        className="mx-auto flex w-full max-w-[720px] flex-1 flex-col overflow-y-auto px-4 pb-28 pt-4"
        data-testid="shopping-flow-shell"
      >
        <div className="mb-4 rounded-[14px] border border-[var(--line)] bg-white/70 px-4 py-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            장보기 대상을 레시피별로 합산했어요
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--muted)]">
            식사 등록 완료이면서 아직 장보기 리스트에 없는 식사입니다. 같은 레시피는 합산 계획 인분으로 묶이고, 장보기 완료·요리 완료·이미 연결된 식사는 자동으로 제외돼요.
          </p>
        </div>

        <div className="space-y-3">
          {mealConfigs.map((config) => (
            <RecipeCard
              key={config.recipe_id}
              config={config}
              onToggle={handleToggleSelection}
              onServingsChange={handleServingsChange}
            />
          ))}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--line)] bg-[var(--background)] p-4">
        <div className="mx-auto w-full max-w-[720px]">
          <button
            className="w-full rounded-[12px] bg-[var(--brand)] px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
            disabled={isCreateDisabled}
            onClick={handleCreateList}
            type="button"
          >
            장보기 목록 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  onBack: () => void;
}

function AppBar({ onBack }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="mx-auto flex h-14 w-full max-w-[720px] items-center gap-2 px-2">
        <button
          aria-label="뒤로 가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-white/60"
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
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
          장보기 준비
        </h1>
        {/* Right spacer matching back button width */}
        <div aria-hidden="true" className="h-11 w-11 shrink-0" />
      </div>
    </div>
  );
}

// ─── RecipeCard ──────────────────────────────────────────────────────────────

interface RecipeCardProps {
  config: MealConfig;
  onToggle: (recipeId: string) => void;
  onServingsChange: (recipeId: string, servings: number) => void;
}

function RecipeCard({ config, onToggle, onServingsChange }: RecipeCardProps) {
  const cardOpacity = config.isSelected ? "opacity-100" : "opacity-60";
  const selectedMealIds = selectMealIdsForShoppingServings(
    config.meals,
    config.meal_ids,
    config.shopping_servings,
  );

  return (
    <div
      className={`rounded-[14px] border border-[var(--line)] bg-[var(--surface)] p-4 transition-opacity ${cardOpacity}`}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={
            config.isSelected
              ? `${config.recipe_name} 선택 해제`
              : `${config.recipe_name} 선택`
          }
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          onClick={() => onToggle(config.recipe_id)}
          type="button"
        >
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${
              config.isSelected
                ? "border-[var(--olive)] bg-[var(--olive)]"
                : "border-[var(--line)] bg-white"
            }`}
          >
            {config.isSelected ? (
              <svg
                fill="none"
                height="12"
                viewBox="0 0 12 12"
                width="12"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 6L5 9L10 3"
                  stroke="white"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            ) : null}
          </div>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              {config.recipe_name}
            </h3>
            <span className="shrink-0 rounded-full bg-[color:rgba(46,166,122,0.12)] px-2.5 py-1 text-xs font-semibold text-[var(--olive)]">
              식사 등록 완료
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-[var(--muted)]">
            <span className="rounded-full border border-[var(--line)] bg-white/70 px-2.5 py-1">
              장보기 미연결
            </span>
            <span className="rounded-full border border-[var(--line)] bg-white/70 px-2.5 py-1">
              대상 식사 {selectedMealIds.length}개
            </span>
            <span className="rounded-full border border-[var(--line)] bg-white/70 px-2.5 py-1">
              합산 계획 {config.planned_servings_total}인분
            </span>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">
              장보기 기준 인분
            </p>
            <NumericStepperCompact
              value={config.shopping_servings}
              min={1}
              onChange={(value) => onServingsChange(config.recipe_id, value)}
              disabled={!config.isSelected}
              unit="인분"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
