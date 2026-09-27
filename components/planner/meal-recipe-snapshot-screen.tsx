"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ContentState } from "@/components/shared/content-state";
import { fetchJson, isApiFetchError } from "@/lib/api/fetch-json";
import { formatHeatLevelLabel } from "@/lib/heat-level";
import type { MealRecipeSnapshotData } from "@/types/meal-recipe-snapshot";

export function MealRecipeSnapshotScreen({ mealId }: { mealId: string }) {
  const router = useRouter();
  const [data, setData] = useState<MealRecipeSnapshotData | null>(null);
  const [error, setError] = useState<{ message: string; login: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null);
    void fetchJson<MealRecipeSnapshotData>(`/api/v1/meals/${encodeURIComponent(mealId)}/recipe-snapshot`, { signal: controller.signal, cache: "no-store" })
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError({ message: cause instanceof Error ? cause.message : "불러오지 못했어요.", login: isApiFetchError(cause) && (cause.status === 401 || cause.code === "ACCOUNT_SESSION_STALE") });
      });
    return () => controller.abort();
  }, [mealId, attempt]);
  return <div className="mx-auto max-w-3xl px-4 pb-4 pt-4">
    <header className="mb-6 flex items-center gap-3">
      <button aria-label="이전 화면" className="min-h-11 min-w-11 rounded-full border border-[var(--line)] text-xl" onClick={() => window.history.length > 1 ? router.back() : router.push("/planner")} type="button">‹</button>
      <p className="font-semibold">계획에 저장된 레시피</p>
    </header>
    {error ? <ContentState tone="error" showEyebrow={false} title={error.message} actionLabel={error.login ? "로그인" : "다시 시도"} onAction={() => error.login ? router.push(`/login?next=${encodeURIComponent(`/meal/${mealId}/recipe`)}`) : setAttempt((value) => value + 1)} />
      : !data ? <ContentState tone="loading" title="레시피를 불러오는 중이에요" showEyebrow={false} />
      : <>
        <h1 className="break-words text-2xl font-bold">{data.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-2)]">이 계획에 저장한 내용 · {data.planned_servings}인분</p>
        <section aria-labelledby="planned-ingredients" className="mt-7">
          <h2 id="planned-ingredients" className="mb-2 text-lg font-bold">재료</h2>
          <ul>{data.ingredients.map((ingredient, index) => <li key={`${ingredient.ingredient_id}:${index}`} className="flex items-start justify-between gap-4 border-b border-[var(--line)] py-3">
            <div className="min-w-0 break-words">{ingredient.component_label ? <span className="mr-2 text-xs text-[var(--text-2)]">{ingredient.component_label}</span> : null}{ingredient.standard_name}</div>
            <span className="shrink-0">{ingredient.ingredient_type === "TO_TASTE" ? "적당량" : `${ingredient.amount ?? ""}${ingredient.unit ?? ""}`}</span>
          </li>)}</ul>
        </section>
        <section aria-labelledby="planned-steps" className="mt-8">
          <h2 id="planned-steps" className="mb-4 text-lg font-bold">만들기</h2>
          <ol className="space-y-5">{data.steps.map((step) => {
            const duration = step.duration_text || (step.duration_seconds ? `${step.duration_seconds}초` : null);
            const metadata = [formatHeatLevelLabel(step.heat_level), duration].filter(Boolean).join(" · ");
            return <li key={step.step_number}>
              <p className="mb-1 text-sm font-semibold text-[var(--brand)]">{step.step_number}. {step.component_label}</p>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{step.instruction}</p>
              {metadata ? <p className="mt-2 text-sm text-[var(--text-2)]">{metadata}</p> : null}
            </li>;
          })}</ol>
        </section>
        <Link className="mt-8 inline-flex min-h-11 items-center rounded-xl border border-[var(--line)] px-4 text-sm" href={`/recipe/${data.recipe_id}`}>최신 레시피 보기</Link>
      </>}
  </div>;
}
