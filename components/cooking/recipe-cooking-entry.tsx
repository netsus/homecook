"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSnapshotV2CookingSession, isCookingApiError } from "@/lib/api/cooking";
import { fetchJson, isApiFetchError } from "@/lib/api/fetch-json";
import { getCookingSessionCookModeHref } from "@/lib/cooking/session-version-dispatch";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { useAppReturn } from "@/components/shared/use-app-return";
import { MobileCookModeLoadingBoard } from "./cook-mode-loading-board";
import { useMobileFullscreenPage } from "@/components/shared/use-mobile-fullscreen-page";
import type { RecipeDetail } from "@/types/recipe";

/** Old recipe-book links enter the same immutable session used by recipe detail. */
export function RecipeCookingEntry({ initialAuthenticated, recipeId, servings }: { initialAuthenticated: boolean; recipeId: string; servings: number }) {
  const router = useRouter();
  const appReturn = useAppReturn({ fallback: `/recipe/${recipeId}` });
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(!initialAuthenticated);
  useMobileFullscreenPage();
  // Strict Mode/remounting effects share an in-flight operation; an uncertain
  // response retries its original body and key, not a newly created session.
  const operation = useMemo(() => {
    let promise: ReturnType<typeof createSnapshotV2CookingSession> | null = null;
    let attempt: { key: string; revision: number } | null = null;
    return {
      start() {
        if (promise) return promise;
        promise = (async () => {
          if (!attempt) {
            const recipe = await fetchJson<RecipeDetail>(`/api/v1/recipes/${recipeId}`);
            attempt = { key: crypto.randomUUID(), revision: recipe.revision };
          }
          try {
            return await createSnapshotV2CookingSession({ mode: "standalone", recipe_id: recipeId, expected_recipe_revision: attempt.revision, cooking_servings: servings }, attempt.key);
          } catch (reason) {
            if (isCookingApiError(reason) && reason.status === 409 && reason.code === "RECIPE_REVISION_CONFLICT") attempt = null;
            throw reason;
          }
        })().finally(() => { promise = null; });
        return promise;
      },
    };
  }, [recipeId, servings]);
  useEffect(() => {
    if (!initialAuthenticated) return;
    let active = true;
    setError(null);
    void operation.start().then(session => {
      if (active) router.replace(buildReturnHref(getCookingSessionCookModeHref(session), { returnSurface: "recipe.detail", returnTo: appReturn.href }));
    }).catch(reason => {
      if (!active) return;
      if ((isCookingApiError(reason) || isApiFetchError(reason)) && reason.status === 401) setUnauthorized(true);
      else setError(reason instanceof Error ? reason.message : "요리를 시작하지 못했어요.");
    });
    return () => { active = false; };
  }, [appReturn.href, initialAuthenticated, operation, retry, router]);
  const next = buildReturnHref(`/cooking/recipes/${recipeId}/cook-mode?servings=${servings}`, { returnSurface: "recipe.detail", returnTo: appReturn.href });
  if (unauthorized || error) return <main className="mx-auto flex h-dvh max-w-lg flex-col justify-center gap-4 p-6 text-center">
    <p role="alert">{unauthorized ? "로그인이 필요해요." : error}</p>
    {unauthorized ? <a className="rounded-xl bg-[var(--brand)] p-3 text-white" href={`/login?next=${encodeURIComponent(next)}`}>로그인</a> : <button className="min-h-11 rounded-xl bg-[var(--brand)] text-white" onClick={() => setRetry(value => value + 1)} type="button">다시 시도</button>}
    <a href={appReturn.href}>돌아가기</a>
  </main>;
  return <MobileCookModeLoadingBoard description="" title="요리 준비" loadingTestId="recipe-cooking-entry-loading" screenTestId="recipe-cooking-entry" />;
}
