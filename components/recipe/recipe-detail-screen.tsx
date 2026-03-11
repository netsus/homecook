"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { ContentState } from "@/components/shared/content-state";
import {
  clearPendingAction,
  readPendingAction,
} from "@/lib/auth/pending-action";
import { fetchJson } from "@/lib/api/fetch-json";
import { formatCount, formatScaledIngredient } from "@/lib/recipe";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAuthGateStore } from "@/stores/ui-store";
import type { RecipeDetail } from "@/types/recipe";

type DetailState = "loading" | "ready" | "error";

interface RecipeDetailScreenProps {
  recipeId: string;
}

export function RecipeDetailScreen({ recipeId }: RecipeDetailScreenProps) {
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [selectedServings, setSelectedServings] = useState(1);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const openAuthGate = useAuthGateStore((state) => state.open);

  const loadRecipe = useCallback(async () => {
    try {
      setDetailState("loading");
      const data = await fetchJson<RecipeDetail>(`/api/v1/recipes/${recipeId}`);
      setRecipe(data);
      setDetailState("ready");
    } catch {
      setDetailState("error");
    }
  }, [recipeId]);

  useEffect(() => {
    void loadRecipe();
  }, [loadRecipe, recipeId]);

  useEffect(() => {
    if (!recipe) {
      return;
    }

    setSelectedServings(recipe.base_servings);
  }, [recipe]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setIsAuthenticated(Boolean(result.data.session));
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
      setIsAuthenticated(Boolean(session));
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const pendingAction = readPendingAction();

    if (!pendingAction || pendingAction.recipeId !== recipeId) {
      return;
    }

    const labelMap = {
      like: "좋아요",
      save: "저장",
      planner: "플래너 추가",
    } as const;

    setFeedback(
      `로그인 완료. ${labelMap[pendingAction.type]} 액션 위치로 돌아왔어요.`,
    );
    clearPendingAction();
  }, [isAuthenticated, recipeId]);

  const scaledIngredients = useMemo(() => {
    if (!recipe) {
      return [];
    }

    return recipe.ingredients.map((ingredient) => ({
      ...ingredient,
      scaledText: formatScaledIngredient(
        ingredient,
        recipe.base_servings,
        selectedServings,
      ),
    }));
  }, [recipe, selectedServings]);

  const handleProtectedAction = (type: "like" | "save" | "planner") => {
    if (!isAuthenticated) {
      openAuthGate({ recipeId, type });
      return;
    }

    setFeedback("이 액션의 실제 저장 연결은 다음 슬라이스에서 닫습니다.");
  };

  const handleShare = async () => {
    if (!recipe) {
      return;
    }

    const url = window.location.href;

    try {
      if (navigator.share) {
        await navigator.share({
          title: recipe.title,
          text: `${recipe.title} 레시피를 확인해보세요.`,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setFeedback("링크를 복사했어요.");
    } catch {
      setFeedback("공유를 완료하지 못했어요.");
    }
  };

  if (detailState === "loading") {
    return (
      <div className="glass-panel min-h-[540px] animate-pulse rounded-[30px] bg-white/60" />
    );
  }

  if (detailState === "error" || !recipe) {
    return (
      <ContentState
        actionLabel="다시 시도"
        description="레시피 상세 API나 Supabase 연결을 확인한 뒤 다시 열 수 있어요."
        onAction={() => void loadRecipe()}
        title="레시피 상세를 불러오지 못했어요"
      />
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
        <section className="space-y-5">
          <div className="glass-panel overflow-hidden rounded-[32px]">
            <div
              className="min-h-72 border-b border-[var(--line)] bg-gradient-to-br from-[#ffd6b8] via-[#fff8ef] to-[#dce8bf]"
              style={
                recipe.thumbnail_url
                  ? {
                      backgroundImage: `linear-gradient(rgba(22, 17, 10, 0.18), rgba(22, 17, 10, 0.3)), url(${recipe.thumbnail_url})`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            />
            <div className="space-y-5 px-5 py-5 md:px-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                <Link href="/">Home</Link>
                <span>/</span>
                <span>Recipe detail</span>
              </div>
              <div>
                <h2 className="display text-4xl text-[var(--brand-deep)]">
                  {recipe.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {recipe.description ?? "요리 설명이 아직 등록되지 않았어요."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {recipe.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[var(--olive)]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <dl className="grid gap-3 md:grid-cols-5">
                {[
                  ["조회", recipe.view_count],
                  ["좋아요", recipe.like_count],
                  ["저장", recipe.save_count],
                  ["플래너", recipe.plan_count],
                  ["요리완료", recipe.cook_count],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[18px] bg-white/72 px-3 py-3 text-sm"
                  >
                    <dt className="text-[var(--muted)]">{label}</dt>
                    <dd className="mt-1 font-semibold text-[var(--foreground)]">
                      {formatCount(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="glass-panel rounded-[30px] p-5 md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                  재료
                </p>
                <h3 className="display mt-2 text-3xl text-[var(--brand-deep)]">
                  인분에 따라 재료량이 바뀝니다
                </h3>
              </div>
              <div className="rounded-[22px] bg-white/70 px-3 py-2">
                <label className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                  인분
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    className="h-10 w-10 rounded-full border border-[var(--line)] bg-white"
                    onClick={() =>
                      setSelectedServings((value) => Math.max(1, value - 1))
                    }
                    type="button"
                  >
                    -
                  </button>
                  <span className="min-w-12 text-center text-lg font-semibold">
                    {selectedServings}
                  </span>
                  <button
                    className="h-10 w-10 rounded-full border border-[var(--line)] bg-white"
                    onClick={() => setSelectedServings((value) => value + 1)}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <ul className="mt-5 grid gap-3">
              {scaledIngredients.map((ingredient) => (
                <li
                  key={ingredient.id}
                  className="rounded-[20px] bg-white/70 px-4 py-3 text-sm text-[var(--foreground)]"
                >
                  {ingredient.scaledText}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass-panel rounded-[30px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Actions
            </p>
            <div className="mt-4 grid gap-3">
              <button
                className="rounded-[18px] bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white"
                onClick={handleShare}
                type="button"
              >
                공유하기
              </button>
              <button
                className="rounded-[18px] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold"
                onClick={() => handleProtectedAction("planner")}
                type="button"
              >
                플래너에 추가
              </button>
              <button
                className="rounded-[18px] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold"
                onClick={() => handleProtectedAction("like")}
                type="button"
              >
                좋아요
                {recipe.user_status?.is_liked ? "됨" : ""}
              </button>
              <button
                className="rounded-[18px] border border-[var(--line)] bg-white/80 px-4 py-3 text-sm font-semibold"
                onClick={() => handleProtectedAction("save")}
                type="button"
              >
                저장
                {recipe.user_status?.is_saved ? "됨" : ""}
              </button>
              <button
                className="rounded-[18px] border border-dashed border-[var(--line)] bg-transparent px-4 py-3 text-sm font-semibold text-[var(--muted)]"
                onClick={() =>
                  setFeedback("요리모드는 다음 슬라이스에서 이어서 구현합니다.")
                }
                type="button"
              >
                요리하기
              </button>
            </div>
            {feedback ? (
              <p className="mt-4 rounded-[18px] bg-white/75 px-4 py-3 text-sm text-[var(--muted)]">
                {feedback}
              </p>
            ) : null}
          </div>

          <div className="glass-panel rounded-[30px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              조리 단계
            </p>
            <ol className="mt-4 space-y-3">
              {recipe.steps.map((step) => (
                <li
                  key={step.id}
                  className="rounded-[20px] bg-white/70 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="display text-2xl text-[var(--brand-deep)]">
                      {step.step_number}
                    </span>
                    <span className="rounded-full bg-[#f0ead8] px-3 py-1 text-xs font-semibold text-[var(--olive)]">
                      {step.cooking_method?.label ?? "기타"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
                    {step.instruction}
                  </p>
                  {step.duration_text ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      소요 시간 {step.duration_text}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
      <LoginGateModal />
    </>
  );
}
