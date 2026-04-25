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

export interface ShoppingFlowScreenProps {
  initialAuthenticated: boolean;
}

interface MealConfig {
  meal_id: string;
  shopping_servings: number;
  isSelected: boolean;
  recipe_name: string;
  planned_servings: number;
}

type ViewState = "loading" | "empty" | "error" | "ready" | "creating";

export function ShoppingFlowScreen({
  initialAuthenticated,
}: ShoppingFlowScreenProps) {
  const router = useRouter();
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

      const configs: MealConfig[] = data.eligible_meals.map((meal) => ({
        meal_id: meal.id,
        shopping_servings: meal.planned_servings,
        isSelected: true,
        recipe_name: meal.recipe_name,
        planned_servings: meal.planned_servings,
      }));

      setMealConfigs(configs);
      setViewState("ready");
    } catch (error) {
      if (isShoppingApiError(error)) {
        if (error.status === 401) {
          router.push("/login?next=/shopping/flow");
          return;
        }
        setErrorMessage(error.message);
      } else {
        setErrorMessage("장보기 목록을 불러오지 못했어요.");
      }
      setViewState("error");
    }
  }, [router]);

  useEffect(() => {
    if (initialAuthenticated) {
      void loadPreview();
    }
  }, [initialAuthenticated, loadPreview]);

  const handleToggleSelection = useCallback((mealId: string) => {
    setMealConfigs((prev) =>
      prev.map((config) =>
        config.meal_id === mealId
          ? { ...config, isSelected: !config.isSelected }
          : config
      )
    );
  }, []);

  const handleServingsChange = useCallback(
    (mealId: string, newServings: number) => {
      setMealConfigs((prev) =>
        prev.map((config) =>
          config.meal_id === mealId
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
        meal_configs: selectedConfigs.map((config) => ({
          meal_id: config.meal_id,
          shopping_servings: config.shopping_servings,
        })),
      };

      const result = await createShoppingList(body);

      // Navigate to shopping detail
      router.push(`/shopping/${result.id}`);
    } catch (error) {
      if (isShoppingApiError(error)) {
        if (error.status === 401) {
          router.push("/login?next=/shopping/flow");
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
  }, [mealConfigs, router]);

  const handleBack = useCallback(() => {
    router.push("/planner");
  }, [router]);

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

      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <div className="mb-4 text-center">
          <p className="text-sm text-[var(--muted)]">
            장볼 레시피를 확인해 주세요
          </p>
        </div>

        <div className="space-y-3">
          {mealConfigs.map((config) => (
            <RecipeCard
              key={config.meal_id}
              config={config}
              onToggle={handleToggleSelection}
              onServingsChange={handleServingsChange}
            />
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-[var(--line)] bg-[var(--background)] p-4">
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
  );
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  onBack: () => void;
}

function AppBar({ onBack }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="flex h-14 items-center gap-2 px-2">
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
  onToggle: (mealId: string) => void;
  onServingsChange: (mealId: string, servings: number) => void;
}

function RecipeCard({ config, onToggle, onServingsChange }: RecipeCardProps) {
  const cardOpacity = config.isSelected ? "opacity-100" : "opacity-60";

  return (
    <div
      className={`rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 transition-opacity ${cardOpacity}`}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={
            config.isSelected
              ? `${config.recipe_name} 선택 해제`
              : `${config.recipe_name} 선택`
          }
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          onClick={() => onToggle(config.meal_id)}
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
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-[var(--foreground)]">
              {config.recipe_name}
            </h3>
            <span className="shrink-0 text-sm text-[var(--muted)]">
              {config.planned_servings}인분
            </span>
          </div>

          <div className="mt-3">
            <NumericStepperCompact
              value={config.shopping_servings}
              min={1}
              onChange={(value) => onServingsChange(config.meal_id, value)}
              disabled={!config.isSelected}
              unit="인분"
            />
          </div>

          <div className="mt-2">
            <p className="text-sm text-[var(--muted)]">
              합산 계획 인분: {config.planned_servings}인분
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
