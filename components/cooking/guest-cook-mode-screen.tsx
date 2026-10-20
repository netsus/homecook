"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchStandaloneCookMode } from "@/lib/api/cooking";
import { useAppReturn } from "@/components/shared/use-app-return";
import type { CookingModeRecipe } from "@/types/cooking";
import type { ExecutionQuantityChange } from "./execution-quantity-inline";
import { MobileCookModeLoadingBoard } from "./cook-mode-loading-board";
import { SnapshotV2CookModeView } from "./snapshot-v2-cook-mode-view";

/** The public read API enforces visibility. Guest edits never leave React state. */
export function GuestCookModeScreen({ recipeId, servings }: { recipeId: string; servings: number }) {
  const appReturn = useAppReturn({ fallback: `/recipe/${recipeId}` });
  const [recipe, setRecipe] = useState<CookingModeRecipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [completed, setCompleted] = useState(false);
  useEffect(() => {
    let active = true;
    setRecipe(null);
    setError(null);
    setCompleted(false);
    // A rejected account cookie must not block this public read again.
    void fetchStandaloneCookMode(recipeId, servings, { credentials: "omit" }).then(data => {
      if (active) setRecipe(data.recipe);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "요리 가이드를 불러오지 못했어요.");
    });
    return () => { active = false; };
  }, [recipeId, servings, retry]);

  async function saveIngredients(changes: ExecutionQuantityChange[]) {
    setRecipe(current => current ? { ...current, ingredients: current.ingredients.map((ingredient, index) => {
      const change = changes.find(item => item.row_index === index);
      if (!change) return ingredient;
      const updated = { ...ingredient, amount: change.amount, unit: change.unit, display_text: null, ingredient_type: "QUANT" as const, scalable: false };
      delete updated.quantity_input;
      return updated;
    }) } : null);
  }

  if (error) return <main className="mx-auto flex h-dvh max-w-lg flex-col justify-center gap-4 p-6 text-center">
    <p role="alert">{error}</p>
    <button className="min-h-11 rounded-xl bg-[var(--brand)] text-white" onClick={() => setRetry(value => value + 1)} type="button">다시 시도</button>
    <Link href={appReturn.href}>돌아가기</Link>
  </main>;
  if (!recipe) return <MobileCookModeLoadingBoard description="" title="요리 가이드 준비" loadingTestId="guest-cook-mode-loading" screenTestId="guest-cook-mode" />;
  return <SnapshotV2CookModeView
    data={{ recipe, mode: "standalone", status: completed ? "completed" : "in_progress" }}
    notice={<p className="mb-4 text-sm">게스트 요리 · 재료량은 이 화면에만 적용되며 새로고침하면 초기화돼요. 식사 기록과 팬트리 저장은 로그인 후 이용할 수 있어요.</p>}
    quantityDescription="이 화면의 재료량만 바꿔요. 레시피와 요리 기록에는 저장되지 않아요."
    completionActions={<div className="space-y-3 text-center"><p role="status">요리 가이드를 마쳤어요. 이 요리는 계정에 저장되지 않았어요.</p><Link className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--brand-primary)] px-4 font-bold text-[var(--text-inverse)]" href={`/login?next=${encodeURIComponent(appReturn.href)}`}>로그인하고 기록 시작하기</Link></div>}
    onCancel={appReturn.goBack}
    onComplete={() => setCompleted(true)}
    onSaveIngredients={saveIngredients}
    returnHref={appReturn.href}
  />;
}
