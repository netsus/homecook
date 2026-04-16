"use client";

import Link from "next/link";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import type { PlannerAddSheetState } from "@/components/recipe/planner-add-sheet";
import { SaveModal } from "@/components/recipe/save-modal";
import { ContentState } from "@/components/shared/content-state";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  clearPendingAction,
  readPendingAction,
} from "@/lib/auth/pending-action";
import {
  createCustomRecipeBook,
  fetchSaveableRecipeBooks,
  saveRecipeToBook,
} from "@/lib/api/recipe-save";
import { createMeal, isMealApiError } from "@/lib/api/meal";
import { fetchJson } from "@/lib/api/fetch-json";
import { fetchPlanner } from "@/lib/api/planner";
import { formatCount, formatScaledIngredient } from "@/lib/recipe";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useAuthGateStore } from "@/stores/ui-store";
import type {
  RecipeBookSummary,
  RecipeDetail,
  RecipeLikeData,
  RecipeSaveData,
  RecipeUserStatus,
} from "@/types/recipe";
import type { PlannerColumnData } from "@/types/planner";

type DetailState = "loading" | "ready" | "error";
type LikeRequestState = "idle" | "pending";
type FeedbackTone = "error" | "status";
type SaveModalState = "idle" | "loading" | "ready" | "error";

interface RecipeDetailScreenProps {
  recipeId: string;
  authError?: string | null;
  initialAuthenticated?: boolean;
}

const COOKING_METHOD_COLORS: Record<string, string> = {
  orange: "var(--cook-stir)",
  red: "var(--cook-boil)",
  brown: "var(--cook-grill)",
  blue: "var(--cook-steam)",
  yellow: "var(--cook-fry)",
  green: "var(--cook-mix)",
};

const COOKING_METHOD_TINTS: Record<string, string> = {
  orange: "rgba(255, 140, 66, 0.16)",
  red: "rgba(232, 69, 60, 0.14)",
  brown: "rgba(139, 94, 60, 0.16)",
  blue: "rgba(74, 144, 217, 0.16)",
  yellow: "rgba(245, 197, 24, 0.18)",
  green: "rgba(46, 166, 122, 0.16)",
};

export function RecipeDetailScreen({
  recipeId,
  authError,
  initialAuthenticated = false,
}: RecipeDetailScreenProps) {
  const [detailState, setDetailState] = useState<DetailState>("loading");
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [selectedServings, setSelectedServings] = useState(1);
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: FeedbackTone;
  } | null>(null);
  const [likeRequestState, setLikeRequestState] = useState<LikeRequestState>("idle");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalState, setSaveModalState] = useState<SaveModalState>("idle");
  const [saveBooks, setSaveBooks] = useState<RecipeBookSummary[]>([]);
  const [selectedSaveBookId, setSelectedSaveBookId] = useState<string | null>(null);
  const [newSaveBookName, setNewSaveBookName] = useState("");
  const [saveLoadError, setSaveLoadError] = useState<string | null>(null);
  const [saveSubmitError, setSaveSubmitError] = useState<string | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [isPlannerAddSheetOpen, setIsPlannerAddSheetOpen] = useState(false);
  const [plannerAddSheetState, setPlannerAddSheetState] = useState<PlannerAddSheetState>("loading-columns");
  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [plannerAddError, setPlannerAddError] = useState<string | null>(null);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(1);
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

    if (typeof e2eAuthOverride === "boolean") {
      setIsAuthenticated(e2eAuthOverride);
      return;
    }

    if (initialAuthenticated) {
      setIsAuthenticated(true);

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
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
  }, [initialAuthenticated]);

  useEffect(() => {
    if (authError === "oauth_failed") {
      setFeedback({
        message: "로그인을 완료하지 못했어요. 다시 시도해주세요.",
        tone: "error",
      });
    }
  }, [authError]);

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

  const updateRecipeSaveState = useCallback((result: RecipeSaveData) => {
    setRecipe((current) => {
      if (!current) {
        return current;
      }

      const previousUserStatus = current.user_status;
      const previousSavedBookIds = previousUserStatus?.saved_book_ids ?? [];
      const hasBook = previousSavedBookIds.includes(result.book_id);

      const nextUserStatus: RecipeUserStatus = {
        is_liked: previousUserStatus?.is_liked ?? false,
        is_saved: true,
        saved_book_ids: hasBook
          ? previousSavedBookIds
          : [...previousSavedBookIds, result.book_id],
      };

      return {
        ...current,
        save_count: result.save_count,
        user_status: nextUserStatus,
      };
    });
  }, []);

  const closeSaveModal = useCallback(() => {
    if (isSavingRecipe) {
      return;
    }

    setIsSaveModalOpen(false);
    setSaveSubmitError(null);
    setSaveLoadError(null);
    setSaveModalState("idle");
    setNewSaveBookName("");
  }, [isSavingRecipe]);

  const buildSelectableDates = useCallback((): string[] => {
    const dates: string[] = [];
    const base = new Date();

    for (let i = 0; i < 14; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${day}`);
    }

    return dates;
  }, []);

  const selectableDates = useMemo(() => buildSelectableDates(), [buildSelectableDates]);

  const loadPlannerColumns = useCallback(async () => {
    setPlannerAddSheetState("loading-columns");
    setPlannerAddError(null);

    try {
      const today = selectableDates[0] ?? "";
      const data = await fetchPlanner(today, today);
      setPlannerColumns(data.columns);
      setSelectedPlanColumnId((current) => {
        if (current && data.columns.some((col) => col.id === current)) {
          return current;
        }

        return data.columns[0]?.id ?? "";
      });
      setPlannerAddSheetState("ready");
    } catch {
      setPlannerAddSheetState("error");
      setPlannerAddError("플래너 슬롯을 불러오지 못했어요.");
    }
  }, [selectableDates]);

  const openPlannerAddSheet = useCallback(
    async ({ source }: { source: "manual" | "return-to-action" }) => {
      if (!isAuthenticated) {
        openAuthGate({ recipeId, type: "planner" });
        return;
      }

      setIsPlannerAddSheetOpen(true);
      setPlannerAddError(null);

      if (source === "manual") {
        setFeedback(null);
      }

      setSelectedPlanDate(selectableDates[0] ?? "");
      setPlannerServings(recipe?.base_servings ?? 1);

      await loadPlannerColumns();
    },
    [isAuthenticated, loadPlannerColumns, openAuthGate, recipe?.base_servings, recipeId, selectableDates],
  );

  const closePlannerAddSheet = useCallback(() => {
    if (plannerAddSheetState === "submitting") {
      return;
    }

    setIsPlannerAddSheetOpen(false);
    setPlannerAddError(null);
  }, [plannerAddSheetState]);

  const handlePlannerAddSubmit = useCallback(async () => {
    if (
      !recipe ||
      !selectedPlanColumnId ||
      !selectedPlanDate ||
      plannerAddSheetState !== "ready"
    ) {
      return;
    }

    setPlannerAddSheetState("submitting");
    setPlannerAddError(null);

    try {
      await createMeal({
        recipe_id: recipe.id,
        plan_date: selectedPlanDate,
        column_id: selectedPlanColumnId,
        planned_servings: plannerServings,
      });

      setIsPlannerAddSheetOpen(false);
      setRecipe((current) => {
        if (!current) {
          return current;
        }

        return { ...current, plan_count: current.plan_count + 1 };
      });
      setFeedback({
        message: "플래너에 추가했어요.",
        tone: "status",
      });
    } catch (error) {
      const message =
        isMealApiError(error) && error.status === 403
          ? "내 플래너 슬롯에만 추가할 수 있어요."
          : error instanceof Error
            ? error.message
            : "플래너 추가에 실패했어요. 다시 시도해주세요.";

      setPlannerAddError(message);
      setPlannerAddSheetState("ready");
    }
  }, [
    plannerAddSheetState,
    plannerServings,
    recipe,
    selectedPlanColumnId,
    selectedPlanDate,
  ]);

  const loadSaveBooks = useCallback(async () => {
    setSaveModalState("loading");
    setSaveLoadError(null);
    setSaveSubmitError(null);

    try {
      const books = await fetchSaveableRecipeBooks();
      setSaveBooks(books);
      setSelectedSaveBookId((currentSelectedBookId) => {
        if (books.length === 0) {
          return null;
        }

        if (currentSelectedBookId && books.some((book) => book.id === currentSelectedBookId)) {
          return currentSelectedBookId;
        }

        return books[0]?.id ?? null;
      });
      setSaveModalState("ready");
    } catch (error) {
      setSaveLoadError(
        error instanceof Error
          ? error.message
          : "레시피북 목록을 불러오지 못했어요.",
      );
      setSaveModalState("error");
    }
  }, []);

  const openSaveModal = useCallback(
    async ({ source }: { source: "manual" | "return-to-action" }) => {
      if (!isAuthenticated) {
        openAuthGate({ recipeId, type: "save" });
        return;
      }

      setIsSaveModalOpen(true);
      setSaveSubmitError(null);

      if (source === "manual") {
        setFeedback(null);
      }

      await loadSaveBooks();
    },
    [isAuthenticated, loadSaveBooks, openAuthGate, recipeId],
  );

  const handleCreateSaveBook = useCallback(async () => {
    const normalizedName = newSaveBookName.trim();

    if (!normalizedName) {
      setSaveSubmitError("레시피북 이름을 입력해 주세요.");
      return;
    }

    if (normalizedName.length > 50) {
      setSaveSubmitError("레시피북 이름은 50자를 넘길 수 없어요.");
      return;
    }

    setIsCreatingBook(true);
    setSaveSubmitError(null);

    try {
      const createdBook = await createCustomRecipeBook(normalizedName);
      setSaveBooks((currentBooks) => {
        const hasSameBook = currentBooks.some((book) => book.id === createdBook.id);

        if (hasSameBook) {
          return currentBooks;
        }

        const nextBooks = [
          ...currentBooks,
          {
            id: createdBook.id,
            name: createdBook.name,
            book_type: createdBook.book_type,
            recipe_count: createdBook.recipe_count,
            sort_order: createdBook.sort_order,
          },
        ];

        return nextBooks.sort((left, right) => {
          if (left.sort_order === right.sort_order) {
            return left.id.localeCompare(right.id);
          }

          return left.sort_order - right.sort_order;
        });
      });
      setSelectedSaveBookId(createdBook.id);
      setNewSaveBookName("");
      setSaveModalState("ready");
      setSaveSubmitError(null);
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피북을 만들지 못했어요.",
      );
    } finally {
      setIsCreatingBook(false);
    }
  }, [newSaveBookName]);

  const handleSaveRecipe = useCallback(async () => {
    if (!recipe || !selectedSaveBookId || isSavingRecipe) {
      return;
    }

    setIsSavingRecipe(true);
    setSaveSubmitError(null);

    try {
      const result = await saveRecipeToBook(recipe.id, selectedSaveBookId);
      updateRecipeSaveState(result);
      setIsSaveModalOpen(false);
      setSaveModalState("idle");
      setFeedback({
        message: "레시피를 저장했어요.",
        tone: "status",
      });
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피를 저장하지 못했어요.",
      );
    } finally {
      setIsSavingRecipe(false);
    }
  }, [isSavingRecipe, recipe, selectedSaveBookId, updateRecipeSaveState]);

  const isSelectedBookReadOnly = useMemo(() => {
    if (!selectedSaveBookId || !recipe?.user_status) {
      return false;
    }

    return recipe.user_status.saved_book_ids.includes(selectedSaveBookId);
  }, [recipe?.user_status, selectedSaveBookId]);

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
            ? {
                message: "로그인 완료. 좋아요를 반영했어요.",
                tone: "status",
              }
            : null,
        );
      } catch {
        setFeedback({
          message: "좋아요 처리에 실패했어요. 다시 시도해주세요.",
          tone: "error",
        });
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

    if (type === "save") {
      void openSaveModal({ source: "manual" });
      return;
    }

    void openPlannerAddSheet({ source: "manual" });
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

    if (pendingAction.type === "save") {
      setFeedback({
        message: "로그인 완료. 저장할 레시피북을 선택해 주세요.",
        tone: "status",
      });
      void openSaveModal({ source: "return-to-action" });
      return;
    }

    if (pendingAction.type === "planner") {
      setFeedback({
        message: "로그인 완료. 플래너에 추가할 날짜와 끼니를 선택해 주세요.",
        tone: "status",
      });
      void openPlannerAddSheet({ source: "return-to-action" });
      return;
    }
  }, [handleLikeToggle, isAuthenticated, openPlannerAddSheet, openSaveModal, recipe, recipeId]);

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
      setFeedback({
        message: "링크를 복사했어요.",
        tone: "status",
      });
    } catch {
      setFeedback({
        message: "공유를 완료하지 못했어요.",
        tone: "error",
      });
    }
  };

  if (detailState === "loading") {
    return <RecipeDetailLoadingSkeleton />;
  }

  if (detailState === "error" || !recipe) {
    return (
      <ContentState
        actionLabel="다시 시도"
        description="레시피 상세 API나 Supabase 연결을 확인한 뒤 다시 열 수 있어요."
        eyebrow="상세 동기화 오류"
        onAction={() => void loadRecipe()}
        tone="error"
        title="레시피 상세를 불러오지 못했어요"
      />
    );
  }

  const plannerCountLabel = formatCount(recipe.plan_count);
  const likeCountLabel = formatCount(recipe.like_count);
  const saveCountLabel = formatCount(recipe.save_count);

  return (
    <>
      <div className="space-y-[clamp(1.25rem,4vw,1.5rem)]">
        <section className="glass-panel flex flex-col overflow-hidden rounded-[24px]">
          <div
            className="min-h-[clamp(6.5rem,32vw,12rem)] border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,108,60,0.22),rgba(255,249,242,0.78),rgba(46,166,122,0.18))] sm:min-h-64 md:min-h-80"
            style={
              recipe.thumbnail_url
                ? {
                    backgroundImage: `linear-gradient(rgba(26, 26, 46, 0.08), rgba(26, 26, 46, 0.32)), url(${recipe.thumbnail_url})`,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  }
                : undefined
            }
          />

          <div className="recipe-overview-compact flex flex-col px-[clamp(0.875rem,4vw,1.25rem)] py-[clamp(0.875rem,4vw,1.25rem)] md:px-6 md:py-6">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--olive)] md:text-xs md:tracking-[0.22em]">
              <Link href="/">Home</Link>
              <span>/</span>
              <span>Recipe detail</span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[color:rgba(46,166,122,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[var(--olive)] md:px-3 md:text-xs"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <h1 className="text-[clamp(1.5rem,6vw,2.125rem)] font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
                {recipe.title}
              </h1>
              <p className="text-[12px] font-medium text-[var(--muted)] md:text-[13px]">
                <span>{recipe.base_servings}인분</span>
                <span className="px-1.5 text-[var(--line)]">·</span>
                <span>재료 {recipe.ingredients.length}개</span>
                <span className="px-1.5 text-[var(--line)]">·</span>
                <span>조리 {recipe.steps.length}단계</span>
              </p>
            </div>

            <div className="recipe-overview-metrics-compact grid grid-cols-4 items-center max-[360px]:order-1">
              <UtilityStatButton
                ariaLabel={`플래너 등록 ${plannerCountLabel}`}
                count={plannerCountLabel}
                icon={<PlannerIcon />}
                label="플래너"
                tone="neutral"
              />
              <IconActionButton
                ariaLabel="공유하기"
                icon={<ShareIcon />}
                onClick={handleShare}
                tone="neutral"
              />
              <MetricActionButton
                ariaLabel={
                  likeRequestState === "pending"
                    ? "좋아요 처리 중..."
                    : `좋아요 ${likeCountLabel}`
                }
                ariaPressed={recipe.user_status?.is_liked ?? false}
                count={likeCountLabel}
                disabled={likeRequestState === "pending"}
                hideLabel
                icon={
                  <HeartIcon
                    filled={recipe.user_status?.is_liked ?? false}
                  />
                }
                label={likeRequestState === "pending" ? "처리 중" : "좋아요"}
                onClick={() => handleProtectedAction("like")}
                tone={recipe.user_status?.is_liked ? "brand" : "neutral"}
              />
              <MetricActionButton
                ariaLabel="저장"
                ariaPressed={recipe.user_status?.is_saved ?? false}
                count={saveCountLabel}
                hideLabel
                icon={<BookmarkIcon filled={recipe.user_status?.is_saved ?? false} />}
                label="저장"
                onClick={() => handleProtectedAction("save")}
                tone={recipe.user_status?.is_saved ? "olive" : "neutral"}
              />
            </div>

            <div className="max-[360px]:order-4">
              <p className="max-w-3xl text-[clamp(0.8125rem,3.2vw,0.9rem)] leading-5 text-[var(--muted)] md:text-sm md:leading-6">
                {recipe.description ?? "요리 설명이 아직 등록되지 않았어요."}
              </p>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-[360px]:order-2 md:gap-2.5">
              <ActionButton
                label="플래너에 추가"
                onClick={() => handleProtectedAction("planner")}
                tone="olive"
              />
              <ActionButton
                label="요리하기"
                onClick={() =>
                  setFeedback({
                    message: "요리모드는 다음 슬라이스에서 이어서 구현합니다.",
                    tone: "status",
                  })
                }
                tone="brand"
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="glass-panel rounded-[20px] p-5 md:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                    재료
                  </p>
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
                  <p className="mt-3 text-[13px] font-semibold tracking-[-0.01em] text-[#9a3f1d] md:text-sm">
                    인분에 따라 재료량이 바뀝니다
                  </p>
                </div>
              </div>
              <ul className="grid gap-3">
                {scaledIngredients.map((ingredient) => {
                  const quantityText = ingredient.scaledText.startsWith(
                    `${ingredient.standard_name} `,
                  )
                    ? ingredient.scaledText.slice(ingredient.standard_name.length + 1)
                    : ingredient.scaledText;

                  return (
                    <li
                      key={ingredient.id}
                      className="flex items-center justify-between gap-4 rounded-[16px] bg-white/70 px-4 py-3 text-sm text-[var(--foreground)]"
                    >
                      <span>{ingredient.standard_name}</span>
                      <span className="font-medium text-[var(--muted)]">
                        {quantityText}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className="glass-panel rounded-[20px] p-5 md:p-6">
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
                        className="rounded-full border px-3 py-1 text-xs font-semibold text-[var(--foreground)]"
                        style={{
                          backgroundColor: resolveCookingMethodTint(
                            step.cooking_method?.color_key,
                          ),
                          borderColor: resolveCookingMethodColor(
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
          </section>
        </div>
      </div>
      <SaveModal
        books={saveBooks}
        isCreatingBook={isCreatingBook}
        isOpen={isSaveModalOpen}
        isSavingRecipe={isSavingRecipe}
        isSelectedBookReadOnly={isSelectedBookReadOnly}
        loadErrorMessage={saveLoadError}
        newBookName={newSaveBookName}
        onClose={closeSaveModal}
        onCreateBook={() => {
          void handleCreateSaveBook();
        }}
        onNewBookNameChange={setNewSaveBookName}
        onRetry={() => {
          void loadSaveBooks();
        }}
        onSaveRecipe={() => {
          void handleSaveRecipe();
        }}
        onSelectBook={setSelectedSaveBookId}
        saveErrorMessage={saveSubmitError}
        selectedBookId={selectedSaveBookId}
        viewState={saveModalState === "idle" ? "loading" : saveModalState}
      />
      <PlannerAddSheet
        columns={plannerColumns}
        errorMessage={plannerAddError}
        isOpen={isPlannerAddSheetOpen}
        onChangeServings={setPlannerServings}
        onClose={closePlannerAddSheet}
        onRetryLoad={() => {
          void loadPlannerColumns();
        }}
        onSelectColumn={setSelectedPlanColumnId}
        onSelectDate={setSelectedPlanDate}
        onSubmit={() => {
          void handlePlannerAddSubmit();
        }}
        selectableDates={selectableDates}
        selectedColumnId={selectedPlanColumnId}
        selectedDate={selectedPlanDate}
        servings={plannerServings}
        sheetState={plannerAddSheetState}
      />
      {feedback ? <FeedbackToast message={feedback.message} tone={feedback.tone} /> : null}
      <LoginGateModal />
    </>
  );
}

function RecipeDetailLoadingSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="space-y-6"
    >
      <section className="glass-panel overflow-hidden rounded-[24px]">
        <div className="min-h-48 animate-pulse border-b border-[var(--line)] bg-white/60 sm:min-h-64 md:min-h-80" />
        <div className="space-y-5 px-5 py-5 md:px-6 md:py-6">
          <div className="h-4 w-28 animate-pulse rounded-full bg-white/70" />
          <div className="space-y-3">
            <div className="h-10 w-3/4 animate-pulse rounded-[16px] bg-white/70" />
            <div className="h-4 w-full animate-pulse rounded-full bg-white/70" />
            <div className="h-4 w-5/6 animate-pulse rounded-full bg-white/70" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="h-7 w-20 animate-pulse rounded-full bg-white/70"
                key={`hero-tag-${index}`}
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                className="h-24 animate-pulse rounded-[18px] bg-white/72"
                key={`hero-overview-${index}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="h-12 w-36 animate-pulse rounded-[14px] bg-white/72" />
            <div className="h-12 w-36 animate-pulse rounded-[14px] bg-white/72" />
            <div className="h-12 w-12 animate-pulse rounded-[14px] bg-white/72" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                className="h-12 w-28 animate-pulse rounded-full bg-white/72"
                key={`hero-metric-${index}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-[20px] p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="h-4 w-16 animate-pulse rounded-full bg-white/70" />
            <div className="h-8 w-64 animate-pulse rounded-[16px] bg-white/70" />
          </div>
          <div className="h-20 w-full animate-pulse rounded-[16px] bg-white/70 md:w-40" />
        </div>
        <div className="mt-5 grid gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              className="h-14 animate-pulse rounded-[16px] bg-white/70"
              key={`ingredient-${index}`}
            />
          ))}
        </div>
      </section>

      <section className="glass-panel rounded-[20px] p-5 md:p-6">
        <div className="h-4 w-16 animate-pulse rounded-full bg-white/70" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="rounded-[16px] bg-white/70 px-4 py-4"
              key={`step-${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-white/80" />
                  <div className="h-7 w-20 animate-pulse rounded-full bg-white/80" />
                </div>
                <div className="h-4 w-12 animate-pulse rounded-full bg-white/80" />
              </div>
              <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-white/80" />
              <div className="mt-2 h-4 w-5/6 animate-pulse rounded-full bg-white/80" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function resolveCookingMethodColor(colorKey?: string | null) {
  if (!colorKey) {
    return "var(--cook-etc)";
  }

  return COOKING_METHOD_COLORS[colorKey] ?? "var(--cook-etc)";
}

function resolveCookingMethodTint(colorKey?: string | null) {
  if (!colorKey) {
    return "rgba(170, 170, 170, 0.16)";
  }

  return COOKING_METHOD_TINTS[colorKey] ?? "rgba(170, 170, 170, 0.16)";
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
      ? "border-[color:rgba(224,80,32,0.18)] bg-[color:rgba(255,108,60,0.16)] text-[var(--foreground)]"
      : tone === "olive"
        ? "border-transparent bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
        : "border-[var(--line)] bg-white text-[var(--foreground)]";

  return (
    <button
      aria-pressed={ariaPressed}
      className={`min-h-11 rounded-[11px] border px-3 py-2 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:px-4 md:py-2.5 md:text-sm ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function IconActionButton({
  ariaLabel,
  icon,
  onClick,
  tone = "neutral",
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "brand" | "olive" | "neutral";
}) {
  const className =
    tone === "brand"
      ? "border-[color:rgba(224,80,32,0.18)] bg-[color:rgba(255,108,60,0.16)] text-[var(--foreground)]"
      : tone === "olive"
        ? "border-transparent bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
        : "border-[var(--line)] bg-white text-[var(--foreground)]";

  return (
    <button
      aria-label={ariaLabel}
      className={`flex min-h-11 w-full items-center justify-center rounded-[11px] border shadow-[var(--shadow)] md:rounded-[13px] ${className}`}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
}

function UtilityStatButton({
  ariaLabel,
  count,
  icon,
  label,
  tone,
}: {
  ariaLabel: string;
  count: string;
  icon: React.ReactNode;
  label: string;
  tone: "brand" | "olive" | "neutral";
}) {
  const className =
    tone === "brand"
      ? "border-[color:rgba(224,80,32,0.18)] bg-[color:rgba(255,108,60,0.16)] text-[var(--foreground)]"
      : tone === "olive"
        ? "border-transparent bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
        : "border-[var(--line)] bg-white text-[var(--foreground)]";

  return (
    <div
      aria-label={ariaLabel}
      className={`flex min-h-11 w-full items-center justify-center gap-1 rounded-[11px] border px-1.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow)] md:rounded-[13px] md:px-2 md:py-2 md:text-[13px] ${className}`}
      role="status"
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      <span className="rounded-full bg-white/72 px-1.25 py-0.5 text-[10px] font-bold text-[var(--foreground)] md:px-1.75 md:text-[11px]">
        {count}
      </span>
    </div>
  );
}

function MetricActionButton({
  ariaLabel,
  ariaPressed,
  count,
  disabled = false,
  hideLabel = false,
  icon,
  label,
  onClick,
  tone,
}: {
  ariaLabel: string;
  ariaPressed?: boolean;
  count: string;
  disabled?: boolean;
  hideLabel?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone: "brand" | "olive" | "neutral";
}) {
  const className =
    tone === "brand"
      ? "border-[color:rgba(224,80,32,0.18)] bg-[color:rgba(255,108,60,0.16)] text-[var(--foreground)]"
      : tone === "olive"
        ? "border-transparent bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
        : "border-[var(--line)] bg-white text-[var(--foreground)]";

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`flex min-h-11 w-full items-center ${hideLabel ? "justify-center" : ""} gap-1 rounded-[11px] border px-1.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow)] disabled:cursor-not-allowed disabled:opacity-60 md:gap-1.5 md:rounded-[13px] md:px-3 md:py-2 md:text-[13px] ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      {hideLabel ? null : <span>{label}</span>}
      <span
        aria-hidden={ariaLabel !== `좋아요 ${count}`}
        className="rounded-full bg-white/72 px-1.25 py-0.5 text-[10px] font-bold text-[var(--foreground)] md:px-1.75 md:text-[11px]"
      >
        {count}
      </span>
    </button>
  );
}

function HeartIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      height="18"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M12 20.2 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8L12 7l.3-.4a4.8 4.8 0 0 1 6.8 6.8Z" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      height="18"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.7L6 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function PlannerIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M7 3.5v3M17 3.5v3M5.5 8.5h13M6.5 5.5h11a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-11a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M12 15.5V5m0 0L8 9m4-4 4 4M6.5 12.5v5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}

function FeedbackToast({
  message,
  tone,
}: {
  message: string;
  tone: FeedbackTone;
}) {
  const isError = tone === "error";

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center md:inset-x-auto md:right-6">
      <div
        aria-live={isError ? "assertive" : "polite"}
        className={`max-w-sm rounded-[16px] border px-4 py-3 text-sm font-medium shadow-[0_18px_44px_rgba(34,24,14,0.14)] ${
          isError
            ? "border-[color:rgba(224,80,32,0.18)] bg-[color:rgba(255,108,60,0.96)] text-white"
            : "border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(250,255,252,0.96)] text-[var(--foreground)]"
        }`}
        role={isError ? "alert" : "status"}
      >
        {message}
      </div>
    </div>
  );
}
