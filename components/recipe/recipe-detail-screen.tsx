"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { ContentState } from "@/components/shared/content-state";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  clearPendingAction,
  readPendingAction,
} from "@/lib/auth/pending-action";
import { fetchJson } from "@/lib/api/fetch-json";
import { formatCount, formatScaledIngredient } from "@/lib/recipe";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useAuthGateStore } from "@/stores/ui-store";
import type { RecipeDetail, RecipeLikeData, RecipeUserStatus } from "@/types/recipe";

type DetailState = "loading" | "ready" | "error";
type LikeRequestState = "idle" | "pending";

interface RecipeDetailScreenProps {
  recipeId: string;
}

const COOKING_METHOD_COLORS: Record<string, string> = {
  orange: "var(--cook-stir)",
  red: "var(--cook-boil)",
  brown: "var(--cook-grill)",
  blue: "var(--cook-steam)",
  yellow: "var(--cook-fry)",
  green: "var(--cook-mix)",
};

export function RecipeDetailScreen({ recipeId }: RecipeDetailScreenProps) {
  const searchParams = useSearchParams();
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [selectedServings, setSelectedServings] = useState(1);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [likeRequestState, setLikeRequestState] = useState<LikeRequestState>("idle");
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
    const e2eAuthOverride = readE2EAuthOverride();

    if (e2eAuthOverride !== null) {
      setIsAuthenticated(e2eAuthOverride);
      return;
    }

    if (!hasSupabasePublicEnv()) {
      setIsAuthenticated(false);
      return;
    }

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
    if (searchParams.get("authError") === "oauth_failed") {
      setFeedback("로그인을 완료하지 못했어요. 다시 시도해주세요.");
    }
  }, [searchParams]);

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

  const updateRecipeLikeState = useCallback((result: RecipeLikeData) => {
    setRecipe((current) => {
      if (!current) {
        return current;
      }

      const nextUserStatus: RecipeUserStatus = current.user_status
        ? {
            ...current.user_status,
            is_liked: result.is_liked,
          }
        : {
            is_liked: result.is_liked,
            is_saved: false,
            saved_book_ids: [],
          };

      return {
        ...current,
        like_count: result.like_count,
        user_status: nextUserStatus,
      };
    });
  }, []);

  const handleLikeToggle = useCallback(
    async ({ source }: { source: "manual" | "return-to-action" }) => {
      if (!isAuthenticated) {
        openAuthGate({ recipeId, type: "like" });
        return;
      }

      if (!recipe || likeRequestState === "pending") {
        return;
      }

      setLikeRequestState("pending");

      if (source === "manual") {
        setFeedback(null);
      }

      try {
        const data = await fetchJson<RecipeLikeData>(
          `/api/v1/recipes/${recipeId}/like`,
          {
            method: "POST",
          },
        );

        updateRecipeLikeState(data);
        setFeedback(
          source === "return-to-action"
            ? "로그인 완료. 좋아요를 반영했어요."
            : null,
        );
      } catch {
        setFeedback("좋아요 처리에 실패했어요. 다시 시도해주세요.");
      } finally {
        setLikeRequestState("idle");
      }
    },
    [
      isAuthenticated,
      likeRequestState,
      openAuthGate,
      recipe,
      recipeId,
      updateRecipeLikeState,
    ],
  );

  const handleProtectedAction = (type: "like" | "save" | "planner") => {
    if (type === "like") {
      void handleLikeToggle({ source: "manual" });
      return;
    }

    if (!isAuthenticated) {
      openAuthGate({ recipeId, type });
      return;
    }

    setFeedback("이 액션의 실제 저장 연결은 다음 슬라이스에서 닫습니다.");
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const pendingAction = readPendingAction();

    if (!pendingAction || pendingAction.recipeId !== recipeId || !recipe) {
      return;
    }

    clearPendingAction();

    if (pendingAction.type === "like") {
      void handleLikeToggle({ source: "return-to-action" });
      return;
    }

    const labelMap = {
      save: "저장",
      planner: "플래너 추가",
    } as const;

    setFeedback(
      `로그인 완료. ${labelMap[pendingAction.type]} 액션 위치로 돌아왔어요.`,
    );
  }, [handleLikeToggle, isAuthenticated, recipe, recipeId]);

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
      <div className="glass-panel min-h-[540px] animate-pulse rounded-[20px] bg-white/60" />
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px]">
        <section className="space-y-6">
          <div className="glass-panel overflow-hidden rounded-[20px]">
            <div
              className="min-h-72 border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,108,60,0.22),rgba(255,249,242,0.78),rgba(46,166,122,0.18))]"
              style={
                recipe.thumbnail_url
                  ? {
                      backgroundImage: `linear-gradient(rgba(26, 26, 46, 0.08), rgba(26, 26, 46, 0.3)), url(${recipe.thumbnail_url})`,
                      backgroundPosition: "center",
                      backgroundSize: "cover",
                    }
                  : undefined
              }
            />
            <div className="space-y-5 px-5 py-5 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                  <Link href="/">Home</Link>
                  <span>/</span>
                  <span>Recipe detail</span>
                </div>
                <button
                  className="min-h-11 rounded-[12px] border border-[var(--line)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
                  onClick={handleShare}
                  type="button"
                >
                  공유하기
                </button>
              </div>
              <div>
                <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-[var(--foreground)] md:text-[2rem]">
                  {recipe.title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  {recipe.description ?? "요리 설명이 아직 등록되지 않았어요."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {recipe.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[color:rgba(46,166,122,0.1)] px-3 py-1 text-xs font-semibold text-[var(--olive)]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["조회", recipe.view_count],
                  ["좋아요", recipe.like_count],
                  ["저장", recipe.save_count],
                  ["플래너", recipe.plan_count],
                  ["요리완료", recipe.cook_count],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-[12px] bg-white/72 px-3 py-3 text-sm"
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

          <div className="glass-panel rounded-[20px] p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                  재료
                </p>
                <h3 className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                  인분에 따라 재료량이 바뀝니다
                </h3>
              </div>
              <div className="rounded-[16px] bg-white/70 px-4 py-3">
                <label className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                  인분
                </label>
                <div className="mt-2 flex items-center gap-3">
                  <button
                    className="h-11 w-11 rounded-[12px] border border-[var(--line)] bg-white"
                    onClick={() =>
                      setSelectedServings((value) => Math.max(1, value - 1))
                    }
                    type="button"
                  >
                    -
                  </button>
                  <span className="min-w-16 text-center text-lg font-semibold">
                    {selectedServings}인분
                  </span>
                  <button
                    className="h-11 w-11 rounded-[12px] border border-[var(--line)] bg-white"
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
                  className="flex items-center justify-between gap-4 rounded-[16px] bg-white/70 px-4 py-3 text-sm text-[var(--foreground)]"
                >
                  <span>{ingredient.standard_name}</span>
                  <span className="font-medium text-[var(--muted)]">
                    {ingredient.scaledText}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <ActionButton
                label="요리하기"
                onClick={() =>
                  setFeedback("요리모드는 다음 슬라이스에서 이어서 구현합니다.")
                }
                tone="brand"
              />
              <ActionButton
                label="공유하기"
                onClick={handleShare}
                tone="neutral"
              />
              <ActionButton
                label="플래너에 추가"
                onClick={() => handleProtectedAction("planner")}
                tone="olive"
              />
              <ActionButton
                ariaPressed={recipe.user_status?.is_liked ?? false}
                disabled={likeRequestState === "pending"}
                label={
                  likeRequestState === "pending"
                    ? "좋아요 처리 중..."
                    : `${recipe.user_status?.is_liked ? "♥" : "♡"} 좋아요 ${formatCount(recipe.like_count)}`
                }
                onClick={() => handleProtectedAction("like")}
                tone={recipe.user_status?.is_liked ? "brand" : "neutral"}
              />
              <ActionButton
                label={`저장${recipe.user_status?.is_saved ? "됨" : ""}`}
                onClick={() => handleProtectedAction("save")}
                tone={recipe.user_status?.is_saved ? "olive" : "neutral"}
              />
            </div>

            {feedback ? (
              <p className="mt-4 rounded-[16px] bg-white/75 px-4 py-3 text-sm text-[var(--muted)]">
                {feedback}
              </p>
            ) : null}
          </div>

          <div className="glass-panel rounded-[20px] p-5 md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              조리 단계
            </p>
            <ol className="mt-4 space-y-3">
              {recipe.steps.map((step) => (
                <li
                  key={step.id}
                  className="rounded-[16px] bg-white/70 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--foreground)] text-sm font-bold text-white">
                        {step.step_number}
                      </span>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                        style={{
                          backgroundColor: resolveCookingMethodColor(
                            step.cooking_method?.color_key,
                          ),
                        }}
                      >
                        {step.cooking_method?.label ?? "기타"}
                      </span>
                    </div>
                    {step.duration_text ? (
                      <span className="text-xs font-medium text-[var(--muted)]">
                        {step.duration_text}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">
                    {step.instruction}
                  </p>
                  {step.heat_level ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      불 세기 {step.heat_level}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass-panel rounded-[20px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Recipe Snapshot
            </p>
            <dl className="mt-4 space-y-3 text-sm text-[var(--muted)]">
              <div className="flex items-center justify-between gap-3">
                <dt>기본 인분</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {recipe.base_servings}인분
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>재료 수</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {recipe.ingredients.length}개
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>단계 수</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {recipe.steps.length}단계
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>로그인 상태</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {isAuthenticated ? "로그인됨" : "게스트"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="glass-panel rounded-[20px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Slice Note
            </p>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              저장, 플래너 추가는 로그인 게이트까지 연결되고 실제 쓰기 완료는 다음 슬라이스에서 이어집니다. 좋아요는 이번 슬라이스에서 토글까지 연결됩니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["좋아요 토글", "보호 액션 게이트", "return-to-action"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-[var(--foreground)]"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
        </aside>
      </div>
      <LoginGateModal />
    </>
  );
}

function resolveCookingMethodColor(colorKey?: string | null) {
  if (!colorKey) {
    return "var(--cook-etc)";
  }

  return COOKING_METHOD_COLORS[colorKey] ?? "var(--cook-etc)";
}

function ActionButton({
  ariaPressed,
  disabled = false,
  label,
  onClick,
  tone,
}: {
  ariaPressed?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  tone: "brand" | "olive" | "neutral";
}) {
  const className =
    tone === "brand"
      ? "border-transparent bg-[color:rgba(255,108,60,0.12)] text-[var(--brand-deep)]"
      : tone === "olive"
        ? "border-transparent bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
        : "border-[var(--line)] bg-white text-[var(--foreground)]";

  return (
    <button
      aria-pressed={ariaPressed}
      className={`min-h-11 rounded-[12px] border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
