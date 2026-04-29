"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import type { PlannerAddSheetState } from "@/components/recipe/planner-add-sheet";
import { SaveModal } from "@/components/recipe/save-modal";
import { ContentState } from "@/components/shared/content-state";
import { Skeleton } from "@/components/ui/skeleton";
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

const FEEDBACK_AUTO_DISMISS_MS = 4000;

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
  orange: "color-mix(in srgb, var(--cook-stir) 16%, transparent)",
  red: "color-mix(in srgb, var(--cook-boil) 14%, transparent)",
  brown: "color-mix(in srgb, var(--cook-grill) 16%, transparent)",
  blue: "color-mix(in srgb, var(--cook-steam) 16%, transparent)",
  yellow: "color-mix(in srgb, var(--cook-fry) 18%, transparent)",
  green: "color-mix(in srgb, var(--cook-mix) 16%, transparent)",
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
  const router = useRouter();
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

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback(null);
    }, FEEDBACK_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedback]);

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
      // `N월 D일 끼니에 추가됐어요` — locale-independent format (D3)
      const [, planM, planD] = selectedPlanDate.split("-").map(Number);
      const dateLabel = `${planM}월 ${planD}일`;
      const columnName =
        plannerColumns.find((c) => c.id === selectedPlanColumnId)?.name ?? "선택한 끼니";
      setFeedback({
        message: `${dateLabel} ${columnName}에 추가됐어요`,
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
    plannerColumns,
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
      <div className="bg-[var(--surface-fill)]">
        <div
          className="aspect-[4/3] max-[360px]:aspect-[16/9] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_22%,transparent),color-mix(in_srgb,var(--background)_85%,transparent),color-mix(in_srgb,var(--olive)_18%,transparent))]"
          style={
            recipe.thumbnail_url
              ? {
                  backgroundImage: `linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent),color-mix(in srgb, var(--foreground) 22%, transparent)),url(${recipe.thumbnail_url})`,
                  backgroundPosition: "center",
                  backgroundSize: "cover",
                }
              : undefined
          }
        />

        <div className="recipe-overview-compact flex flex-col border-b border-[var(--line)] bg-[var(--panel)] px-5 py-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--olive)] md:text-xs md:tracking-[0.22em]">
              <Link href="/">Home</Link>
              <span>/</span>
              <span>Recipe detail</span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-1.5">
                {recipe.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-[var(--radius-full)] bg-[color-mix(in_srgb,var(--olive)_10%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--olive)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              <h1 className="text-2xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
                {recipe.title}
              </h1>
              <p className="flex items-center gap-2 text-[13px] text-[var(--text-2)]">
                <span>{recipe.base_servings}인분</span>
                <span className="text-[var(--line)]">·</span>
                <span>재료 {recipe.ingredients.length}개</span>
                <span className="text-[var(--line)]">·</span>
                <span>조리 {recipe.steps.length}단계</span>
              </p>
            </div>

            <div className="recipe-overview-metrics-compact flex flex-wrap items-center gap-2 max-[360px]:order-1 max-[360px]:grid max-[360px]:grid-cols-[minmax(0,1fr)_44px_64px_64px]">
              <div className="min-w-[8.5rem] flex-1 max-[360px]:min-w-0 max-[360px]:flex-none md:min-w-[9rem] md:flex-none">
                <UtilityStatButton
                  ariaLabel={`플래너 등록 ${plannerCountLabel}`}
                  count={plannerCountLabel}
                  icon={<PlannerIcon />}
                  label="플래너"
                  tone="neutral"
                />
              </div>
              <div className="w-11 shrink-0 max-[360px]:w-11 md:w-[3rem]">
                <IconActionButton
                  ariaLabel="공유하기"
                  icon={<ShareIcon />}
                  onClick={handleShare}
                  tone="neutral"
                />
              </div>
              <div className="min-w-[5.5rem] flex-1 max-[360px]:min-w-0 max-[360px]:flex-none md:min-w-[6.25rem] md:flex-none">
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
                  tone={recipe.user_status?.is_liked ? "signal" : "neutral"}
                />
              </div>
              <div className="min-w-[5.5rem] flex-1 max-[360px]:min-w-0 max-[360px]:flex-none md:min-w-[6.25rem] md:flex-none">
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
            </div>

            <div className="max-[360px]:order-4">
              <p className="max-w-3xl text-[13px] leading-5 text-[var(--text-2)]">
                {recipe.description ?? "요리 설명이 아직 등록되지 않았어요."}
              </p>
            </div>

            <div className="grid grid-cols-[1fr_2fr] gap-2 max-[360px]:order-2 max-[360px]:grid-cols-2">
              <ActionButton
                label="플래너에 추가"
                onClick={() => handleProtectedAction("planner")}
                tone="olive"
              />
              <ActionButton
                label="요리하기"
                onClick={() =>
                  router.push(
                    `/cooking/recipes/${recipeId}/cook-mode?servings=${selectedServings}`,
                  )
                }
                tone="brand"
              />
            </div>
          </div>

        <div className="bg-[var(--panel)] px-5 py-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            재료
          </p>

          <div className="mb-5 rounded-xl bg-[var(--surface-fill)] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[var(--muted)]">몇 인분?</div>
                <div className="text-base font-bold text-[var(--foreground)]">{selectedServings}인분</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-lg text-[var(--foreground)]"
                  onClick={() =>
                    setSelectedServings((value) => Math.max(1, value - 1))
                  }
                  type="button"
                >
                  −
                </button>
                <span className="min-w-6 text-center font-bold text-[var(--foreground)]">
                  {selectedServings}
                </span>
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--olive)] text-lg font-bold text-white"
                  onClick={() => setSelectedServings((value) => value + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
            <p className="mt-2 text-[12px] font-medium" style={{ color: 'color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))' }}>
              인분에 따라 재료량이 바뀝니다
            </p>
          </div>

          <ul>
            {scaledIngredients.map((ingredient, idx) => {
              const quantityText = ingredient.scaledText.startsWith(
                `${ingredient.standard_name} `,
              )
                ? ingredient.scaledText.slice(ingredient.standard_name.length + 1)
                : ingredient.scaledText;

              return (
                <li
                  key={ingredient.id}
                  className="flex items-center justify-between py-3 text-[15px]"
                  style={{
                    borderBottom:
                      idx < scaledIngredients.length - 1
                        ? "1px solid var(--surface-subtle)"
                        : "none",
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--foreground)]">
                    <span>{ingredient.standard_name}</span>
                    {ingredient.ingredient_type === "TO_TASTE" ? (
                      <span className="rounded-[var(--radius-full)] border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: 'color-mix(in srgb, var(--brand) 16%, transparent)', backgroundColor: 'color-mix(in srgb, var(--brand) 8%, transparent)', color: 'color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))' }}>
                        취향껏
                      </span>
                    ) : null}
                  </span>
                  <span className="text-sm text-[var(--text-2)]">
                    {quantityText}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="px-4 py-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            조리 단계
          </p>
          <ol className="space-y-3">
            {recipe.steps.map((step) => (
              <li
                key={step.id}
                className="rounded-xl bg-[var(--panel)] p-4 shadow-[var(--shadow-1)]"
                style={{
                  borderLeft: `4px solid ${resolveCookingMethodColor(step.cooking_method?.color_key)}`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold"
                      style={{
                        backgroundColor: resolveCookingMethodTint(
                          step.cooking_method?.color_key,
                        ),
                        color: resolveCookingMethodDark(
                          step.cooking_method?.color_key,
                        ),
                      }}
                    >
                      {step.step_number}
                    </span>
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        backgroundColor: resolveCookingMethodTint(
                          step.cooking_method?.color_key,
                        ),
                        color: resolveCookingMethodDark(
                          step.cooking_method?.color_key,
                        ),
                      }}
                    >
                      {step.cooking_method?.label ?? "기타"}
                    </span>
                  </div>
                  {step.duration_text ? (
                    <span className="text-xs text-[var(--muted)]">
                      {step.duration_text}
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 pl-9 text-sm leading-6 text-[var(--text-2)]">
                  {step.instruction}
                </p>
                {step.heat_level ? (
                  <p className="mt-1.5 pl-9 text-xs text-[var(--muted)]">
                    불 세기 {step.heat_level}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
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
      className="bg-[var(--surface-fill)]"
    >
      <div className="aspect-[4/3] max-[360px]:aspect-[16/9] bg-[var(--surface-fill)]">
        <div className="h-full w-full animate-pulse bg-[var(--surface-fill)]" />
      </div>

      <div className="space-y-4 border-b border-[var(--line)] bg-[var(--panel)] px-5 py-5">
        <Skeleton className="h-4 w-28" rounded="full" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              className="h-6 w-16"
              key={`hero-tag-${index}`}
              rounded="full"
            />
          ))}
        </div>
        <Skeleton className="h-8 w-3/4" rounded="lg" />
        <Skeleton className="h-4 w-48" rounded="full" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              className="h-11 w-24"
              key={`hero-metric-${index}`}
              rounded="md"
            />
          ))}
        </div>
        <Skeleton className="h-4 w-full" rounded="full" />
        <Skeleton className="h-4 w-5/6" rounded="full" />
        <div className="grid grid-cols-[1fr_2fr] gap-2 max-[360px]:grid-cols-2">
          <Skeleton className="h-11" rounded="md" />
          <Skeleton className="h-11" rounded="md" />
        </div>
      </div>

      <div className="bg-[var(--panel)] px-5 py-5">
        <Skeleton className="mb-4 h-4 w-12" rounded="full" />
        <Skeleton className="mb-5 h-16 w-full" rounded="lg" />
        <div className="space-y-0">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              className="py-3"
              key={`ingredient-${index}`}
              style={{
                borderBottom:
                  index < 5 ? "1px solid var(--surface-subtle)" : "none",
              }}
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" rounded="full" />
                <Skeleton className="h-4 w-16" rounded="full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-5">
        <Skeleton className="mb-4 h-4 w-16" rounded="full" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="rounded-xl bg-[var(--panel)] p-4"
              key={`step-${index}`}
              style={{ borderLeft: "4px solid var(--line)" }}
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-7" rounded="full" />
                <Skeleton className="h-5 w-16" rounded="md" />
              </div>
              <div className="mt-2 pl-9">
                <Skeleton className="h-4 w-full" rounded="full" />
                <Skeleton className="mt-2 h-4 w-5/6" rounded="full" />
              </div>
            </div>
          ))}
        </div>
      </div>
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
    return "color-mix(in srgb, var(--cook-etc) 16%, transparent)";
  }

  return COOKING_METHOD_TINTS[colorKey] ?? "color-mix(in srgb, var(--cook-etc) 16%, transparent)";
}

function resolveCookingMethodDark(colorKey?: string | null) {
  const base = resolveCookingMethodColor(colorKey);
  return `color-mix(in srgb, ${base} 52%, var(--foreground))`;
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
  return (
    <button
      aria-pressed={ariaPressed}
      className={`min-h-11 whitespace-nowrap rounded-[var(--radius-md)] border px-3 py-2 text-[12px] font-semibold shadow-[var(--shadow-1)] disabled:cursor-not-allowed disabled:opacity-60 max-[360px]:px-2 md:px-4 md:py-2.5 md:text-sm ${
        tone === "olive"
          ? "border-[color-mix(in_srgb,var(--olive)_22%,transparent)] bg-[var(--olive)] text-[var(--surface)]"
          : getRecipeActionToneClass(tone)
      }`}
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
  tone?: "brand" | "olive" | "neutral" | "signal";
}) {
  return (
    <button
      aria-label={ariaLabel}
      className={`flex min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] border shadow-[var(--shadow-1)] ${getRecipeActionToneClass(tone)}`}
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
  tone: "brand" | "olive" | "neutral" | "signal";
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={`flex min-h-11 w-full items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-1)] md:px-2.5 md:py-2 md:text-[13px] ${getRecipeActionToneClass(tone)}`}
      role="status"
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="truncate">{label}</span>
      <span className="rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-1.25 py-0.5 text-[10px] font-bold text-[var(--foreground)] md:px-1.75 md:text-[11px]">
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
  tone: "brand" | "olive" | "neutral" | "signal";
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={`flex min-h-11 w-full items-center ${hideLabel ? "justify-center" : ""} gap-1 rounded-[var(--radius-md)] border px-2 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-1)] disabled:cursor-not-allowed disabled:opacity-60 md:gap-1.5 md:px-2.5 md:py-2 md:text-[13px] ${getRecipeActionToneClass(tone)}`}
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
        className="rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-1.25 py-0.5 text-[10px] font-bold text-[var(--foreground)] md:px-1.75 md:text-[11px]"
      >
        {count}
      </span>
    </button>
  );
}

function getRecipeActionToneClass(
  tone: "brand" | "olive" | "neutral" | "signal",
) {
  if (tone === "brand") {
    return "border-[color-mix(in_srgb,var(--brand)_18%,transparent)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--foreground)]";
  }

  if (tone === "olive") {
    return "border-[color-mix(in_srgb,var(--olive)_20%,transparent)] bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] text-[var(--olive)]";
  }

  if (tone === "signal") {
    return "border-[color-mix(in_srgb,var(--brand-deep)_18%,transparent)] bg-[color-mix(in_srgb,var(--brand-deep)_10%,transparent)] text-[var(--brand-deep)]";
  }

  return "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)]";
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
        className={`max-w-sm rounded-[var(--radius-lg)] border px-4 py-3 text-sm font-medium shadow-[var(--shadow-3)] ${
          isError
            ? "border-[color-mix(in_srgb,var(--brand)_18%,transparent)] bg-[color-mix(in_srgb,var(--brand)_96%,var(--surface))] text-[var(--surface)]"
            : "border-[color-mix(in_srgb,var(--olive)_18%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,var(--olive))] text-[var(--foreground)]"
        }`}
        role={isError ? "alert" : "status"}
      >
        {message}
      </div>
    </div>
  );
}
