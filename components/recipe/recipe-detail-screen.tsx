"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import type { PlannerAddSheetState } from "@/components/recipe/planner-add-sheet";
import { SaveModal } from "@/components/recipe/save-modal";
import { ContentState } from "@/components/shared/content-state";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  clearPendingAction,
  readPendingAction,
} from "@/lib/auth/pending-action";
import {
  createCustomRecipeBook,
  fetchSaveableRecipeBooks,
  saveRecipeToBooks,
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
type RecipeDetailTab = "ingredients" | "steps" | "reviews";

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
  const [activeTab, setActiveTab] = useState<RecipeDetailTab>("ingredients");
  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: FeedbackTone;
  } | null>(null);
  const [likeRequestState, setLikeRequestState] = useState<LikeRequestState>("idle");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalState, setSaveModalState] = useState<SaveModalState>("idle");
  const [saveBooks, setSaveBooks] = useState<RecipeBookSummary[]>([]);
  const [selectedSaveBookIds, setSelectedSaveBookIds] = useState<string[]>([]);
  const [newSaveBookName, setNewSaveBookName] = useState("");
  const [saveLoadError, setSaveLoadError] = useState<string | null>(null);
  const [saveSubmitError, setSaveSubmitError] = useState<string | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [isPlannerAddSheetOpen, setIsPlannerAddSheetOpen] = useState(false);
  const [plannerAddSheetState, setPlannerAddSheetState] = useState<PlannerAddSheetState>("loading-columns");
  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [plannerAddError, setPlannerAddError] = useState<string | null>(null);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(1);
  const router = useRouter();
  const openAuthGate = useAuthGateStore((state) => state.open);
  const isDesktopViewport = useDesktopViewport();

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
      const nextSavedBookIds = [
        ...previousSavedBookIds,
        ...result.book_ids.filter((bookId) => !previousSavedBookIds.includes(bookId)),
      ];

      const nextUserStatus: RecipeUserStatus = {
        is_liked: previousUserStatus?.is_liked ?? false,
        is_saved: true,
        saved_book_ids: nextSavedBookIds,
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

        return (
          data.columns.find((column) => column.name === "저녁")?.id ??
          data.columns[0]?.id ??
          ""
        );
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
      setSelectedSaveBookIds((currentSelectedBookIds) => {
        if (books.length === 0) {
          return [];
        }

        const availableBookIds = new Set(books.map((book) => book.id));
        const retainedBookIds = currentSelectedBookIds.filter((bookId) => availableBookIds.has(bookId));

        if (retainedBookIds.length > 0) {
          return retainedBookIds;
        }

        const alreadySavedBookIds = recipe?.user_status?.saved_book_ids.filter((bookId) =>
          availableBookIds.has(bookId),
        ) ?? [];

        return alreadySavedBookIds.length > 0
          ? alreadySavedBookIds
          : books[0]
            ? [books[0].id]
            : [];
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
  }, [recipe?.user_status?.saved_book_ids]);

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
      setSelectedSaveBookIds((currentBookIds) => (
        currentBookIds.includes(createdBook.id)
          ? currentBookIds
          : [...currentBookIds, createdBook.id]
      ));
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
    const alreadySavedBookIds = recipe?.user_status?.saved_book_ids ?? [];
    const newBookIds = selectedSaveBookIds.filter(
      (bookId) => !alreadySavedBookIds.includes(bookId),
    );

    if (!recipe || newBookIds.length === 0 || isSavingRecipe) {
      return;
    }

    setIsSavingRecipe(true);
    setSaveSubmitError(null);

    try {
      const result = await saveRecipeToBooks(recipe.id, newBookIds);
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
  }, [isSavingRecipe, recipe, selectedSaveBookIds, updateRecipeSaveState]);

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

  const desktopPlannerCountLabel = formatCount(recipe.plan_count);
  const desktopLikeCountLabel = formatCount(recipe.like_count);
  const desktopSaveCountLabel = formatCount(recipe.save_count);
  const desktopCookCountLabel = formatCount(recipe.cook_count);
  const likeCountLabel = formatRecipeHeroCount(recipe.like_count);
  const saveCountLabel = formatRecipeHeroCount(recipe.save_count);
  const cookCountLabel = formatRecipeHeroCount(recipe.cook_count);
  const heroEmoji = getRecipeHeroEmoji(recipe);
  const heroBackground = getRecipeHeroBackground(recipe);
  const minutesLabel = getRecipeMinutesLabel(recipe);
  const displayTags = recipe.tags.slice(0, 3);
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;

  return (
    <>
      {shouldRenderWebView ? (
      <div className="hidden bg-[var(--surface-fill)] lg:block">
        <button
          aria-label={recipe.thumbnail_url ? "레시피 사진 크게 보기" : "레시피 대표 이미지"}
          className="block aspect-[4/3] w-full max-[360px]:aspect-[16/9] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_22%,transparent),color-mix(in_srgb,var(--background)_85%,transparent),color-mix(in_srgb,var(--olive)_18%,transparent))] text-left disabled:cursor-default"
          disabled={!recipe.thumbnail_url}
          onClick={() => setIsLightboxOpen(true)}
          type="button"
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

        <div className="mx-auto grid max-w-[1200px] gap-6 px-8 py-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
        <div className="recipe-overview-compact flex flex-col rounded-[24px] border border-[var(--line)] bg-[var(--panel)] px-6 py-6 shadow-[var(--shadow-1)]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
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

          <div className="recipe-overview-metrics-compact flex flex-wrap items-center gap-2">
            <div className="min-w-[6.25rem] flex-none">
              <MetricActionButton
                ariaLabel={
                  likeRequestState === "pending"
                    ? "좋아요 처리 중..."
                    : `좋아요 ${desktopLikeCountLabel}`
                }
                ariaPressed={recipe.user_status?.is_liked ?? false}
                count={desktopLikeCountLabel}
                disabled={likeRequestState === "pending"}
                icon={<HeartIcon filled={recipe.user_status?.is_liked ?? false} />}
                label={likeRequestState === "pending" ? "처리 중" : "좋아요"}
                onClick={() => handleProtectedAction("like")}
                tone={recipe.user_status?.is_liked ? "signal" : "neutral"}
              />
            </div>
            <div className="min-w-[6.25rem] flex-none">
              <MetricActionButton
                ariaLabel="저장"
                ariaPressed={recipe.user_status?.is_saved ?? false}
                count={desktopSaveCountLabel}
                icon={<BookmarkIcon filled={recipe.user_status?.is_saved ?? false} />}
                label="저장"
                onClick={() => handleProtectedAction("save")}
                tone={recipe.user_status?.is_saved ? "olive" : "neutral"}
              />
            </div>
            <div className="min-w-[6.25rem] flex-none">
              <UtilityStatButton
                ariaLabel={`요리완료 ${desktopCookCountLabel}`}
                count={desktopCookCountLabel}
                icon={<CookIcon />}
                label="요리완료"
                tone="neutral"
              />
            </div>
            <div className="min-w-[6.25rem] flex-none">
              <UtilityStatButton
                ariaLabel={`플래너 등록 ${desktopPlannerCountLabel}`}
                count={desktopPlannerCountLabel}
                icon={<PlannerIcon />}
                label="플래너"
                tone="neutral"
              />
            </div>
            <div className="w-[3rem] shrink-0">
              <IconActionButton
                ariaLabel="공유하기"
                icon={<ShareIcon />}
                onClick={handleShare}
                tone="neutral"
              />
            </div>
          </div>

          <div>
            <p className="max-w-3xl text-[13px] leading-5 text-[var(--text-2)]">
              {recipe.description ?? "요리 설명이 아직 등록되지 않았어요."}
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] px-6 py-6 shadow-[var(--shadow-1)]">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
            재료
          </p>

          <div className="mb-5 rounded-xl bg-[var(--surface-fill)] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[var(--muted)]">몇 인분?</div>
                <div className="text-base font-bold text-[var(--foreground)]">
                  {selectedServings}인분
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-lg text-[var(--foreground)]"
                  onClick={() =>
                    setSelectedServings((value) => Math.max(1, value - 1))
                  }
                  type="button"
                >
                  -
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
            <p
              className="mt-2 text-[12px] font-medium"
              style={{
                color:
                  "color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))",
              }}
            >
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
                      <span
                        className="rounded-[var(--radius-full)] border px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--brand) 8%, transparent)",
                          borderColor:
                            "color-mix(in srgb, var(--brand) 16%, transparent)",
                          color:
                            "color-mix(in srgb, var(--brand-deep) 80%, var(--foreground))",
                        }}
                      >
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

        <div className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] px-6 py-6">
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
                <p className="mt-2 pl-9 text-base leading-7 text-[var(--text-2)]">
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

          <div className="hidden xl:block">
            <div className="sticky top-28 rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow-1)]">
              <div className="border-b border-[var(--line)] pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">
                  Action
                </p>
                <h2 className="mt-2 text-xl font-black tracking-[-0.02em] text-[var(--foreground)]">
                  {selectedServings}인분 기준
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-2)]">
                  재료 {recipe.ingredients.length}개 · 조리 {recipe.steps.length}단계
                </p>
              </div>

              <div className="space-y-3 py-4">
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

              <div className="space-y-2 border-t border-[var(--line)] pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">좋아요</span>
                  <span className="font-bold text-[var(--foreground)]">
                    {desktopLikeCountLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">저장</span>
                  <span className="font-bold text-[var(--foreground)]">
                    {desktopSaveCountLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--muted)]">플래너 등록</span>
                  <span className="font-bold text-[var(--foreground)]">
                    {desktopPlannerCountLabel}
                  </span>
                </div>
              </div>

              <p className="mt-4 rounded-[16px] bg-[var(--surface-fill)] px-4 py-3 text-xs leading-5 text-[var(--text-2)]">
                요리모드 진입 후에는 인분을 바꿀 수 없어요.
              </p>
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {shouldRenderAppView ? (
      <div className="min-h-screen bg-white pb-[190px] text-[#212529] lg:hidden">
        <section
          className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden text-[132px] max-[360px]:text-[108px] md:max-h-[460px]"
          style={{ background: heroBackground }}
        >
          <span aria-hidden="true" className="select-none leading-none">
            {heroEmoji}
          </span>
          <button
            aria-label="뒤로가기"
            className="absolute left-4 top-[52px] flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#212529] shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
            onClick={() => router.back()}
            type="button"
          >
            <ChevronLeftIcon />
          </button>
          <button
            aria-label="공유하기"
            className="visually-hidden"
            onClick={handleShare}
            type="button"
          >
            공유하기
          </button>
          <div className="recipe-overview-metrics-compact absolute bottom-[18px] right-3.5 flex flex-col flex-wrap items-center gap-[9px]">
            <Wave1HeroMetricButton
              ariaLabel={
                likeRequestState === "pending"
                  ? "좋아요 처리 중..."
                  : `좋아요 ${likeCountLabel}`
              }
              ariaPressed={recipe.user_status?.is_liked ?? false}
              count={likeCountLabel}
              disabled={likeRequestState === "pending"}
              icon={<HeartIcon filled={recipe.user_status?.is_liked ?? false} />}
              label={likeRequestState === "pending" ? "처리 중" : "좋아요"}
              onClick={() => handleProtectedAction("like")}
            />
            <Wave1HeroMetricButton
              ariaLabel="저장"
              ariaPressed={recipe.user_status?.is_saved ?? false}
              count={saveCountLabel}
              icon={<BookmarkIcon filled={recipe.user_status?.is_saved ?? false} />}
              label="저장"
              onClick={() => handleProtectedAction("save")}
            />
            <Wave1HeroMetricStatus
              ariaLabel={`요리완료 ${cookCountLabel}`}
              count={cookCountLabel}
              icon={<CookIcon />}
              label="요리완료"
            />
          </div>
        </section>

        <section className="border-b border-[#DEE2E6] bg-white p-5">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {displayTags.map((tag, index) => (
              <span
                className={[
                  "rounded-full px-[9px] py-1 text-[12px] font-extrabold",
                  index === 0
                    ? "bg-[#E8F8F7] text-[#007A76]"
                    : "bg-[#F8F9FA] text-[#495057]",
                ].join(" ")}
                key={`${tag}-${index}`}
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mb-2.5 text-[24px] font-bold leading-tight text-[#212529]">
            {recipe.title}
          </h1>
          <div className="flex items-center gap-2 text-[12px] text-[#5F6470]">
            <ClockIcon />
            <span>{minutesLabel}</span>
            <span>·</span>
            <ServingsIcon />
            <span>{recipe.base_servings}인분</span>
          </div>
        </section>

        <div
          aria-label="레시피 상세 탭"
          className="sticky top-0 z-10 flex border-b border-[#DEE2E6] bg-white"
          role="tablist"
        >
          {[
            ["ingredients", "재료"],
            ["steps", "조리법"],
            ["reviews", "리뷰"],
          ].map(([tab, label]) => {
            const key = tab as RecipeDetailTab;
            const isActive = activeTab === key;

            return (
              <button
                aria-selected={isActive}
                className={[
                  "min-h-12 flex-1 border-b-2 px-2 py-3.5 text-[14px]",
                  isActive
                    ? "border-[#2AC1BC] font-bold text-[#212529]"
                    : "border-transparent font-medium text-[#5F6470]",
                ].join(" ")}
                key={key}
                onClick={() => setActiveTab(key)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>

        {activeTab === "ingredients" ? (
          <section className="bg-white p-5">
            <div className="mb-5 flex items-center justify-between rounded-[12px] bg-[#F8F9FA] px-4 py-3">
              <div>
                <div className="mb-0.5 text-[12px] text-[#5F6470]">
                  몇 인분?
                </div>
                <div className="text-[16px] font-bold text-[#212529]">
                  {selectedServings}인분
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="인분 줄이기"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[#DEE2E6] bg-white text-[18px] text-[#212529] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedServings <= 1}
                  onClick={() =>
                    setSelectedServings((value) => Math.max(1, value - 1))
                  }
                  type="button"
                >
                  -
                </button>
                <span className="min-w-6 text-center font-bold text-[#212529]">
                  {selectedServings}
                </span>
                <button
                  aria-label="인분 늘리기"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#007A76] text-[18px] font-bold text-white"
                  onClick={() => setSelectedServings((value) => value + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>

            <ul>
              {scaledIngredients.map((ingredient) => {
                const quantityText = ingredient.scaledText.startsWith(
                  `${ingredient.standard_name} `,
                )
                  ? ingredient.scaledText.slice(ingredient.standard_name.length + 1)
                  : ingredient.scaledText;

                return (
                  <li
                    className="flex items-center justify-between border-b border-[#F1F3F5] py-3 text-[15px] last:border-b-0"
                    key={ingredient.id}
                  >
                    <span className="flex min-w-0 items-center gap-2 font-medium text-[#212529]">
                      <span>{ingredient.standard_name}</span>
                      {ingredient.ingredient_type === "TO_TASTE" ? (
                        <span className="rounded-full border border-[#BEEAE7] bg-[#E8F8F7] px-2 py-0.5 text-[10px] font-semibold text-[#007A76]">
                          취향껏
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[14px] text-[#495057]">
                      {quantityText}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {activeTab === "steps" ? (
          <section className="bg-[#F8F9FA] px-4 py-5">
            <ol className="space-y-3">
              {recipe.steps.map((step) => (
                <li
                  className="rounded-[12px] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                  key={step.id}
                  style={{
                    borderLeft: `4px solid ${resolveCookingMethodColor(step.cooking_method?.color_key)}`,
                  }}
                >
                  <div className="mb-2 flex items-center gap-2">
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
                    <span className="flex-1 text-[15px] font-bold text-[#212529]">
                      {step.cooking_method?.label ?? "조리"}
                    </span>
                    {step.duration_text ? (
                      <span className="text-[12px] text-[#5F6470]">
                        {step.duration_text}
                      </span>
                    ) : null}
                  </div>
                  <p className="pl-9 text-base leading-[1.6] text-[#495057]">
                    {step.instruction}
                  </p>
                  {step.heat_level ? (
                    <p className="mt-1.5 pl-9 text-[12px] text-[#5F6470]">
                      불 세기 {step.heat_level}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {activeTab === "reviews" ? (
          <section className="bg-white p-5">
            <div className="rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-4 py-5 text-[14px] leading-5 text-[#5F6470]">
              아직 등록된 리뷰가 없어요.
            </div>
          </section>
        ) : null}
      </div>
      ) : null}
      {shouldRenderWebView ? (
      <div className="sticky bottom-0 z-20 hidden border-t border-[var(--line)] bg-[var(--surface)] px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] lg:block xl:hidden">
        <div className="grid grid-cols-[1fr_2fr] gap-2">
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
      ) : null}
      {shouldRenderAppView ? (
      <div className="wave1-recipe-cta-bar fixed inset-x-0 bottom-[96px] z-20 flex gap-2 border-t border-[#DEE2E6] bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 lg:hidden">
        <button
          className="min-h-11 flex-1 rounded-[12px] border border-[#2AC1BC] bg-[#E8F8F7] px-3 text-[15px] font-bold text-[#007A76]"
          onClick={() => handleProtectedAction("planner")}
          type="button"
        >
          플래너에 추가
        </button>
        <button
          className="min-h-11 flex-1 rounded-[12px] bg-[#007A76] px-3 text-[15px] font-bold text-white"
          onClick={() =>
            router.push(
              `/cooking/recipes/${recipeId}/cook-mode?servings=${selectedServings}`,
            )
          }
          type="button"
        >
          요리하기
        </button>
      </div>
      ) : null}
      {shouldRenderAppView ? (
      <div className="lg:hidden">
        <Wave1MobileBottomTab ariaLabel="레시피 상세 하단 탭" currentTab="home" />
      </div>
      ) : null}
      <SaveModal
        alreadySavedBookIds={recipe.user_status?.saved_book_ids ?? []}
        books={saveBooks}
        isCreatingBook={isCreatingBook}
        isOpen={isSaveModalOpen}
        isSavingRecipe={isSavingRecipe}
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
        onSelectBook={(bookId) => {
          if (recipe.user_status?.saved_book_ids.includes(bookId)) {
            return;
          }

          setSelectedSaveBookIds((currentBookIds) =>
            currentBookIds.includes(bookId)
              ? currentBookIds.filter((currentBookId) => currentBookId !== bookId)
              : [...currentBookIds, bookId],
          );
        }}
        saveErrorMessage={saveSubmitError}
        selectedBookIds={selectedSaveBookIds}
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
        variant="recipe-detail"
        recipePreview={{
          background: heroBackground,
          emoji: heroEmoji,
          meta: `${minutesLabel} · 선택 ${plannerServings}인분`,
          title: recipe.title,
        }}
      />
      <RecipePhotoLightbox
        imageUrl={recipe.thumbnail_url}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        title={recipe.title}
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

function RecipePhotoLightbox({
  imageUrl,
  isOpen,
  onClose,
  title,
}: {
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) {
    return null;
  }

  return (
    <div
      aria-label="사진 갤러리"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/82 p-8"
      onClick={onClose}
      role="dialog"
    >
      <button
        aria-label="닫기"
        className="absolute right-8 top-8 grid h-11 w-11 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition hover:bg-white/20"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        type="button"
      >
        ×
      </button>
      <div
        className="relative aspect-[4/3] max-h-[78vh] w-full max-w-5xl overflow-hidden rounded-[24px] bg-[#EAEDEF] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundImage: `url(${imageUrl})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-6 text-white">
          <p className="text-sm font-semibold opacity-85">1 / 1</p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.02em]">
            {title}
          </h2>
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

function Wave1HeroMetricButton({
  ariaLabel,
  ariaPressed,
  count,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  ariaLabel: string;
  ariaPressed?: boolean;
  count: string;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className="flex min-h-[58px] min-w-[52px] flex-col items-center justify-center gap-[3px] rounded-[14px] border border-white/70 bg-white/92 px-1.5 py-1 text-[11px] font-bold leading-none text-[#212529] shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur disabled:cursor-not-allowed disabled:opacity-70"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
        {icon}
      </span>
      <span
        aria-hidden={ariaLabel !== `좋아요 ${count}`}
        className="text-[11px] font-bold leading-none"
      >
        {count}
      </span>
      <span className="text-[10px] font-semibold leading-none text-[#495057]">
        {label}
      </span>
    </button>
  );
}

function Wave1HeroMetricStatus({
  ariaLabel,
  count,
  icon,
  label,
}: {
  ariaLabel: string;
  count: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className="flex min-h-[58px] min-w-[52px] flex-col items-center justify-center gap-[3px] rounded-[14px] border border-white/70 bg-white/92 px-1.5 py-1 text-[11px] font-bold leading-none text-[#212529] shadow-[0_2px_10px_rgba(0,0,0,0.18)] backdrop-blur"
      role="status"
    >
      <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">
        {icon}
      </span>
      <span className="text-[11px] font-bold leading-none">
        {count}
      </span>
      <span className="text-[10px] font-semibold leading-none text-[#495057]">
        {label}
      </span>
    </div>
  );
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
      className={`min-h-11 w-full whitespace-nowrap rounded-[var(--radius-md)] border px-3 py-2 text-[12px] font-semibold shadow-[var(--shadow-1)] disabled:cursor-not-allowed disabled:opacity-60 max-[360px]:px-2 md:px-4 md:py-2.5 md:text-sm ${
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
      className={`flex min-h-11 w-full items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-1)] md:px-2.5 md:py-2 md:text-[13px] ${getRecipeActionToneClass(tone)}`}
      role="status"
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="shrink-0 whitespace-nowrap">{label}</span>
      <span className="shrink-0 rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-1.25 py-0.5 text-[10px] font-bold text-[var(--foreground)] md:px-1.75 md:text-[11px]">
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
      className={`flex min-h-11 w-full items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-1)] disabled:cursor-not-allowed disabled:opacity-60 md:gap-1.5 md:px-2.5 md:py-2 md:text-[13px] ${getRecipeActionToneClass(tone)}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      {hideLabel ? null : (
        <span className="shrink-0 whitespace-nowrap">{label}</span>
      )}
      <span
        aria-hidden={ariaLabel !== `좋아요 ${count}`}
        className="shrink-0 rounded-[var(--radius-full)] bg-[var(--surface-fill)] px-1.25 py-0.5 text-[10px] font-bold text-[var(--foreground)] md:px-1.75 md:text-[11px]"
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
      className={filled ? "text-[#E03131]" : undefined}
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

function CookIcon() {
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
      <path d="M12 3v2M5.6 5.6l1.4 1.4M3 12h2M5.6 18.4l1.4-1.4M12 19v2M17 17l1.4 1.4M19 12h2M17 7l1.4-1.4" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function ServingsIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="M4.5 11.5h15a6.5 6.5 0 0 1-6.5 6.5h-2a6.5 6.5 0 0 1-6.5-6.5Z" />
      <path d="M7 8.5c.6-.7.6-1.4 0-2.1M12 8.5c.6-.7.6-1.4 0-2.1M17 8.5c.6-.7.6-1.4 0-2.1" />
      <path d="M8 20h8" />
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

function getRecipeHeroEmoji(recipe: RecipeDetail) {
  const searchableText = [
    recipe.title,
    ...recipe.tags,
    ...recipe.ingredients.map((ingredient) => ingredient.standard_name),
  ].join(" ");

  if (/제육|돼지|소고기|고기|스테이크|불고기/.test(searchableText)) {
    return "🥩";
  }

  if (/김치|찌개|국물|매운탕|감자탕|삼계탕/.test(searchableText)) {
    return "🍲";
  }

  if (/밥|볶음밥|덮밥/.test(searchableText)) {
    return "🍚";
  }

  if (/면|파스타|국수|라면/.test(searchableText)) {
    return "🍜";
  }

  return "🍽️";
}

function getRecipeHeroBackground(recipe: RecipeDetail) {
  const searchableText = [
    recipe.title,
    ...recipe.tags,
    ...recipe.ingredients.map((ingredient) => ingredient.standard_name),
  ].join(" ");

  if (/제육|돼지|소고기|고기|스테이크|불고기/.test(searchableText)) {
    return "linear-gradient(135deg, #FFD6C0 0%, #FFA07A 100%)";
  }

  if (/김치|찌개|국물|매운탕|감자탕|삼계탕/.test(searchableText)) {
    return "#FFB89F";
  }

  if (/밥|볶음밥|덮밥/.test(searchableText)) {
    return "#FFD166";
  }

  if (/면|파스타|국수|라면/.test(searchableText)) {
    return "#B7E4C7";
  }

  return "#FFD6A5";
}

function getRecipeMinutesLabel(recipe: RecipeDetail) {
  const totalSeconds = recipe.steps.reduce(
    (sum, step) => sum + (step.duration_seconds ?? 0),
    0,
  );

  if (totalSeconds > 0) {
    return `${Math.max(1, Math.round(totalSeconds / 60))}분`;
  }

  return recipe.steps.find((step) => step.duration_text)?.duration_text ?? "시간 미정";
}

function formatRecipeHeroCount(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
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
