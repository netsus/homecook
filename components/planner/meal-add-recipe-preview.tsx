"use client";

import React, { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchRecipePreview } from "@/lib/api/recipe";
import { buildRecipeNutritionDisplay, hasCompleteEnergyAndMacros } from "@/lib/nutrition/recipe-nutrition-display";
import { formatScaledIngredient } from "@/lib/recipe";
import type { RecipeDetail } from "@/types/recipe";

/** Read-only source preview; it never counts a recipe view or modifies a meal. */
export function MealAddRecipePreview({ recipeId, servings }: { recipeId: string; servings: number }) {
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRecipe(null); setLoading(true); setFailed(false);
    void fetchRecipePreview(recipeId, controller.signal)
      .then(data => { if (!controller.signal.aborted) setRecipe(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, recipeId]);
  if (loading) return <div aria-label="레시피 미리보기 불러오는 중" role="status" className="my-5 space-y-3"><Skeleton className="h-5" /><Skeleton className="h-8" /></div>;
  if (failed || !recipe) return <div className="my-4 flex items-center justify-between gap-3 text-sm"><p>재료·영양을 불러오지 못했어요.</p><button type="button" className="min-h-11 shrink-0 text-[var(--brand)]" onClick={() => setAttempt(value => value + 1)}>다시 확인</button></div>;
  const nutrition = buildRecipeNutritionDisplay(recipe.nutrition, servings);
  const incompleteCore = !hasCompleteEnergyAndMacros(recipe.nutrition.values);
  const calories = nutrition.nutrients.find(item => item.code === "energy_kcal")?.selectedTotalText ?? "정보 없음";
  const integerCalories = calories.replace(/\d[\d,]*(?:\.\d+)?/u, value => Math.round(Number(value.replaceAll(",", ""))).toLocaleString("ko-KR"));
  return <div className="mt-5 space-y-5">
    <details className="border-y border-[var(--line)] py-3">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">재료 {recipe.ingredients.length}개 보기</summary>
      <ul className="space-y-3 pb-3 text-sm">{recipe.ingredients.map(ingredient => <li key={ingredient.id}>{formatScaledIngredient(ingredient, recipe.base_servings, servings)}</li>)}</ul>
    </details>
    <div className="flex items-center justify-between gap-3"><span className="text-sm">예상 영양 · {servings}인분</span><span className="text-xl tabular-nums">{integerCalories}</span></div>
    {nutrition.aiEstimateText ? <p className="text-xs text-[var(--brand-primary-text)]">{nutrition.aiEstimateText}{incompleteCore ? " · 일부 영양정보가 빠진 추정값" : ""}</p> : null}
    {!nutrition.aiEstimateText && incompleteCore ? <p className="text-xs text-[var(--text-2)]">일부 영양 정보 없음</p> : null}
  </div>;
}
