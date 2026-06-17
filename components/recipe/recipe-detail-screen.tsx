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
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebCard,
  WebCardBody,
  WebChip,
  WebCTA,
  WebShell,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  clearPendingAction,
  readPendingAction,
} from "@/lib/auth/pending-action";
import {
  createCustomRecipeBook,
  fetchSaveableRecipeBooks,
  removeRecipeFromBook,
  saveRecipeToBooks,
} from "@/lib/api/recipe-save";
import { createMeal, isMealApiError } from "@/lib/api/meal";
import { notifyGamificationSourceAction } from "@/lib/gamification-events";
import { getCookingMethodColor, getCookingMethodTint } from "@/lib/cooking-method-colors";
import { getCookingMethodAssistiveLabel } from "@/lib/cooking-method-taxonomy";
import { formatHeatLevelLabel } from "@/lib/heat-level";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { fetchJson } from "@/lib/api/fetch-json";
import { fetchPlanner } from "@/lib/api/planner";
import {
  formatCount,
  formatRecipeSourceLabel,
  formatScaledIngredient,
} from "@/lib/recipe";
import {
  normalizeRecipeSectionLabel,
  shouldShowSectionHeading,
  stripMatchingSectionPrefix,
} from "@/lib/recipe-section-labels";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useAuthGateStore } from "@/stores/ui-store";
import type {
  RecipeBookSummary,
  RecipeDetail,
  RecipeIngredient,
  RecipeLikeData,
  RecipeUserStatus,
} from "@/types/recipe";
import type { PlannerColumnData } from "@/types/planner";

type DetailState = "loading" | "ready" | "error";
type LikeRequestState = "idle" | "pending";
type FeedbackTone = "error" | "status";
type SaveModalState = "idle" | "loading" | "ready" | "error";
type RecipeDetailTab = "ingredients" | "steps" | "reviews";

function getStepCookingMethodAssistiveLabel(
  method: RecipeDetail["steps"][number]["cooking_method"],
) {
  return getCookingMethodAssistiveLabel({
    methodCode: method?.code,
    methodLabel: method?.label,
    categoryCode: method?.category_code,
    categoryLabel: method?.category_label,
  });
}

const FEEDBACK_AUTO_DISMISS_MS = 4000;

interface RecipeDetailScreenProps {
  recipeId: string;
  authError?: string | null;
  initialAuthenticated?: boolean;
}


const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

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
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(1);
  const router = useRouter();
  const openAuthGate = useAuthGateStore((state) => state.open);
  const isDesktopViewport = useDesktopViewport();
  const appReturn = useAppReturn({ fallback: "/" });

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

  const replaceRecipeSaveState = useCallback(
    ({
      nextSavedBookIds,
      nextSaveCount,
    }: {
      nextSavedBookIds: string[];
      nextSaveCount: number;
    }) => {
      setRecipe((current) => {
        if (!current) {
          return current;
        }

        const nextUserStatus: RecipeUserStatus = {
          is_liked: current.user_status?.is_liked ?? false,
          is_saved: nextSavedBookIds.length > 0,
          saved_book_ids: nextSavedBookIds,
        };

        return {
          ...current,
          save_count: Math.max(0, nextSaveCount),
          user_status: nextUserStatus,
        };
      });
    },
    [],
  );

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
    const removedBookIds = alreadySavedBookIds.filter(
      (bookId) => !selectedSaveBookIds.includes(bookId),
    );

    if (
      !recipe ||
      (newBookIds.length === 0 && removedBookIds.length === 0) ||
      isSavingRecipe
    ) {
      return;
    }

    setIsSavingRecipe(true);
    setSaveSubmitError(null);

    try {
      const saveResult = newBookIds.length > 0
        ? await saveRecipeToBooks(recipe.id, newBookIds)
        : null;

      await Promise.all(
        removedBookIds.map((bookId) => removeRecipeFromBook(bookId, recipe.id)),
      );

      const baseSaveCount = saveResult?.save_count ?? recipe.save_count;
      replaceRecipeSaveState({
        nextSavedBookIds: selectedSaveBookIds,
        nextSaveCount: baseSaveCount - removedBookIds.length,
      });
      setIsSaveModalOpen(false);
      setSaveModalState("idle");
      setFeedback({
        message:
          removedBookIds.length > 0
            ? "레시피북 저장을 변경했어요."
            : "레시피를 저장했어요.",
        tone: "status",
      });
      if (newBookIds.length > 0) {
        notifyGamificationSourceAction();
      }
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피를 저장하지 못했어요.",
      );
    } finally {
      setIsSavingRecipe(false);
    }
  }, [isSavingRecipe, recipe, replaceRecipeSaveState, selectedSaveBookIds]);

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
    return isDesktopViewport ? (
      <RecipeDetailWebLoadingSkeleton />
    ) : (
      <RecipeDetailLoadingSkeleton />
    );
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
  const heroImageSrc = resolveRecipeImage(recipe);
  const mobileHeroStyle = {
    backgroundImage: `linear-gradient(var(--foreground-alpha-04),var(--foreground-alpha-32)),url("${heroImageSrc}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  } as const;
  const minutesLabel = getRecipeMinutesLabel(recipe);
  const displayTags = getVisibleRecipeTags(recipe);
  const youtubeSourceHref = getYoutubeSourceHref(recipe);
  const recipeDetailReturnHref = buildReturnHref(`/recipe/${recipeId}`, {
    returnSurface: "recipe.detail",
    returnTo: appReturn.href,
  });
  const cookModeHref = buildReturnHref(
    `/cooking/recipes/${recipeId}/cook-mode?servings=${selectedServings}`,
    {
      returnSurface: "recipe.detail",
      returnTo: recipeDetailReturnHref,
    },
  );
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;
  const shouldRenderLegacyWebView = false;

  return (
    <>
      {shouldRenderWebView ? (
        <div className="hidden lg:block">
          <RecipeDetailWebView
            cookCountLabel={desktopCookCountLabel}
            isLikePending={likeRequestState === "pending"}
            likeCountLabel={desktopLikeCountLabel}
            onCook={() =>
              router.push(cookModeHref)
            }
            onOpenLightbox={(index) => {
              setLightboxIndex(index);
              setIsLightboxOpen(true);
            }}
            onProtectedAction={handleProtectedAction}
            onSelectedServingsChange={setSelectedServings}
            onShare={handleShare}
            plannerCountLabel={desktopPlannerCountLabel}
            recipe={recipe}
            returnHref={appReturn.href}
            saveCountLabel={desktopSaveCountLabel}
            scaledIngredients={scaledIngredients}
            selectedServings={selectedServings}
          />
        </div>
      ) : null}
      {shouldRenderLegacyWebView ? (
      <div className="hidden bg-[var(--surface-fill)] lg:block">
        <button
          aria-label={recipe.thumbnail_url ? "레시피 사진 크게 보기" : "레시피 대표 이미지"}
          className="block aspect-[4/3] w-full max-[360px]:aspect-[16/9] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand)_22%,transparent),color-mix(in_srgb,var(--background)_85%,transparent),color-mix(in_srgb,var(--brand)_18%,transparent))] text-left disabled:cursor-default"
          onClick={() => setIsLightboxOpen(true)}
          type="button"
          style={{
            backgroundImage: `linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent),color-mix(in srgb, var(--foreground) 22%, transparent)),url("${resolveRecipeImage(recipe)}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />

        <div className="mx-auto grid max-w-[1200px] gap-6 px-8 py-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
        <div className="recipe-overview-compact flex flex-col rounded-[var(--radius-sheet)] border border-[var(--line)] bg-[var(--panel)] px-6 py-6 shadow-[var(--shadow-1)]">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--brand)]">
            <Link href="/">Home</Link>
            <span>/</span>
            <span>Recipe detail</span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[var(--radius-full)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]"
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
              <span>만들기 {recipe.steps.length}단계</span>
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

        <div className="rounded-[var(--radius-sheet)] border border-[var(--line)] bg-[var(--panel)] px-6 py-6 shadow-[var(--shadow-1)]">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
            재료
          </p>

          <div className="mb-5 rounded-[var(--radius-card)] bg-[var(--surface-fill)] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[var(--muted)]">인분 조절</div>
                <div className="text-base font-bold text-[var(--foreground)]">
                  {selectedServings}인분
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="flex h-[var(--control-height-md)] w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-lg text-[var(--foreground)]"
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
                  className="flex h-[var(--control-height-md)] w-11 items-center justify-center rounded-full bg-[var(--brand)] text-lg font-bold text-[var(--text-inverse)]"
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
              const sectionLabel = normalizeRecipeSectionLabel(ingredient.component_label);
              const previousLabel = idx > 0
                ? scaledIngredients[idx - 1]?.component_label
                : null;
              const showSectionHeading = shouldShowSectionHeading(
                sectionLabel,
                previousLabel,
              );

              return (
                <React.Fragment key={ingredient.id}>
                  {showSectionHeading ? (
                    <li className="border-t border-[var(--surface-subtle)] pt-4 text-[13px] font-bold text-[var(--brand)] first:border-t-0 first:pt-0">
                      {sectionLabel}
                    </li>
                  ) : null}
                  <li
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
                </React.Fragment>
              );
            })}
          </ul>
        </div>

        <div className="rounded-[var(--radius-sheet)] border border-[var(--line)] bg-[var(--surface)] px-6 py-6">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand)]">
            만들기
          </p>
          <ol className="space-y-3">
            {recipe.steps.map((step, idx) => {
              const sectionLabel = normalizeRecipeSectionLabel(step.component_label);
              const previousLabel = idx > 0 ? recipe.steps[idx - 1]?.component_label : null;
              const showSectionHeading = shouldShowSectionHeading(sectionLabel, previousLabel);

              return (
                <React.Fragment key={step.id}>
                  {showSectionHeading ? (
                    <li className="list-none px-1 pt-2 text-[13px] font-bold text-[var(--brand)]">
                      {sectionLabel}
                    </li>
                  ) : null}
                  <li
                    className="rounded-[var(--radius-card)] bg-[var(--panel)] p-4 shadow-[var(--shadow-1)]"
                    style={{
                      borderLeft: `4px solid ${getCookingMethodColor(step.cooking_method)}`,
                    }}
                  >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold"
                      style={{
                        backgroundColor: getCookingMethodTint(
                          step.cooking_method,
                        ),
                        color: resolveCookingMethodDark(
                          step.cooking_method,
                        ),
                      }}
                    >
                      {step.step_number}
                    </span>
                    <span
                      className="rounded px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        backgroundColor: getCookingMethodTint(
                          step.cooking_method,
                        ),
                        color: resolveCookingMethodDark(
                          step.cooking_method,
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
                  {stripMatchingSectionPrefix(
                    step.instruction,
                    step.component_label,
                  ) ?? step.instruction}
                </p>
                {formatHeatLevelLabel(step.heat_level) ? (
                  <p className="mt-1.5 pl-9 text-xs text-[var(--muted)]">
                    {formatHeatLevelLabel(step.heat_level)}
                  </p>
                ) : null}
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        </div>
          </div>

          <div className="hidden xl:block">
            <div className="sticky top-28 rounded-[var(--radius-sheet)] border border-[var(--line)] bg-[var(--panel)] p-5 shadow-[var(--shadow-1)]">
              <div className="border-b border-[var(--line)] pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--foreground)]">
                  Action
                </p>
                <h2 className="mt-2 text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                  {selectedServings}인분 기준
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-2)]">
                  재료 {recipe.ingredients.length}개 · 만들기 {recipe.steps.length}단계
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
                  onClick={() => router.push(cookModeHref)}
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

              <p className="mt-4 rounded-[var(--radius-panel)] bg-[var(--surface-fill)] px-4 py-3 text-xs leading-5 text-[var(--text-2)]">
                요리모드 진입 후에는 인분을 바꿀 수 없어요.
              </p>
            </div>
          </div>
        </div>
      </div>
      ) : null}
      {shouldRenderAppView ? (
      <div className="min-h-screen bg-[var(--surface)] pb-[190px] text-[var(--foreground)] lg:hidden">
        <section
          className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden md:max-h-[460px]"
          data-testid="recipe-detail-hero"
          style={mobileHeroStyle}
        >
          <button
            aria-label="뒤로가기"
            className="absolute left-4 top-[calc(12px+env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-alpha-92)] text-[var(--foreground)] shadow-[0_2px_8px_var(--shadow-color-strong)]"
            onClick={appReturn.goBack}
            type="button"
          >
            <ChevronLeftIcon />
          </button>
          <div
            className="recipe-overview-metrics-compact absolute bottom-[18px] right-3.5 flex flex-col flex-wrap items-center gap-0"
            style={{ gap: 0 }}
          >
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
              onClick={() => handleProtectedAction("like")}
            />
            <Wave1HeroMetricButton
              ariaLabel="저장"
              ariaPressed={recipe.user_status?.is_saved ?? false}
              count={saveCountLabel}
              icon={<BookmarkIcon filled={recipe.user_status?.is_saved ?? false} />}
              onClick={() => handleProtectedAction("save")}
            />
            <Wave1HeroMetricButton
              ariaLabel="공유하기"
              count="공유"
              icon={<ShareIcon />}
              onClick={handleShare}
            />
          </div>
        </section>

        <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] p-5">
          {recipe.source_type === "youtube" ? (
            <p className="mb-2 text-[12px] text-[var(--text-3)]" data-testid="recipe-youtube-source-note">
              YouTube에서 가져온 레시피
            </p>
          ) : null}
          <h1 className="mb-2.5 text-[24px] font-bold leading-tight text-[var(--foreground)]">
            {recipe.title}
          </h1>
          {displayTags.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="recipe-detail-tags">
              {youtubeSourceHref ? (
                <a
                  className="rounded-full bg-[var(--brand)] px-[9px] py-1 text-[12px] font-bold text-[var(--text-inverse)]"
                  href={youtubeSourceHref}
                  rel="noopener noreferrer"
                  style={{ color: "var(--text-inverse)" }}
                  target="_blank"
                >
                  유튜브
                </a>
              ) : null}
              {displayTags.map((tag, index) => (
                <span
                  className="rounded-full bg-[var(--surface-fill)] px-[9px] py-1 text-[12px] font-medium text-[var(--text-2)]"
                  key={`${tag}-${index}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : youtubeSourceHref ? (
            <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="recipe-detail-tags">
              <a
                className="rounded-full bg-[var(--brand)] px-[9px] py-1 text-[12px] font-bold text-[var(--text-inverse)]"
                href={youtubeSourceHref}
                rel="noopener noreferrer"
                style={{ color: "var(--text-inverse)" }}
                target="_blank"
              >
                유튜브
              </a>
            </div>
          ) : null}
          <div
            aria-label="레시피 요약"
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] font-semibold text-[var(--text-2)]"
          >
            <span className="inline-flex items-center gap-1.25">
              <ServingsIcon />
              <span>{recipe.base_servings}인분</span>
            </span>
            <span className="inline-flex items-center gap-1.25">
              <PlannerIcon />
              <span>플래너등록 {desktopPlannerCountLabel}</span>
            </span>
            <span className="inline-flex items-center gap-1.25">
              <CookIcon />
              <span>요리완료 {cookCountLabel}</span>
            </span>
          </div>
        </section>

        <div
          aria-label="레시피 상세 탭"
          className="sticky top-0 z-10 flex border-b border-[var(--line-strong)] bg-[var(--surface)]"
          role="tablist"
        >
          {[
            ["ingredients", "재료"],
            ["steps", "만들기"],
            ["reviews", "리뷰"],
          ].map(([tab, label]) => {
            const key = tab as RecipeDetailTab;
            const isActive = activeTab === key;

            return (
              <button
                aria-selected={isActive}
                className={[
                  "min-h-[var(--control-height-lg)] flex-1 border-b-2 px-2 py-3.5 text-[14px]",
                  isActive
                    ? "border-[var(--brand)] font-bold text-[var(--foreground)]"
                    : "border-transparent font-medium text-[var(--text-2)]",
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
          <section className="bg-[var(--surface)] p-5">
            <div className="mb-5 flex items-center justify-between rounded-[var(--radius-card)] bg-[var(--surface-fill)] px-4 py-3">
              <div>
                <div className="mb-0.5 text-[12px] text-[var(--text-2)]">
                  인분 조절
                </div>
                <div className="text-[16px] font-bold text-[var(--foreground)]">
                  {selectedServings}인분
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label="인분 줄이기"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface)] text-base font-medium text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedServings <= 1}
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
                  aria-label="인분 늘리기"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--brand)] text-base font-bold text-[var(--text-inverse)]"
                  onClick={() => setSelectedServings((value) => value + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>

            <ul>
              {scaledIngredients.map((ingredient, idx) => {
                const quantityText = ingredient.scaledText.startsWith(
                  `${ingredient.standard_name} `,
                )
                  ? ingredient.scaledText.slice(ingredient.standard_name.length + 1)
                  : ingredient.scaledText;
                const sectionLabel = normalizeRecipeSectionLabel(ingredient.component_label);
                const previousLabel = idx > 0
                  ? scaledIngredients[idx - 1]?.component_label
                  : null;
                const showSectionHeading = shouldShowSectionHeading(
                  sectionLabel,
                  previousLabel,
                );

                return (
                  <React.Fragment key={ingredient.id}>
                    {showSectionHeading ? (
                      <li className="border-t border-[var(--surface-subtle)] px-2 pt-4 text-[13px] font-bold text-[var(--brand)] first:border-t-0 first:pt-0">
                        {sectionLabel}
                      </li>
                    ) : null}
                    <li className="flex items-center justify-between border-b border-[var(--surface-subtle)] px-2 py-3 text-[15px] last:border-b-0">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-[var(--foreground)]">
                        <span>{ingredient.standard_name}</span>
                        {ingredient.ingredient_type === "TO_TASTE" ? (
                          <span className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--brand)]">
                            취향껏
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[14px] text-[var(--text-2)]">
                        {quantityText}
                      </span>
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          </section>
        ) : null}

        {activeTab === "steps" ? (
          <section className="bg-[var(--surface-fill)] px-4 py-5">
            <ol className="space-y-3">
              {recipe.steps.map((step, idx) => {
                const sectionLabel = normalizeRecipeSectionLabel(step.component_label);
                const previousLabel = idx > 0 ? recipe.steps[idx - 1]?.component_label : null;
                const showSectionHeading = shouldShowSectionHeading(sectionLabel, previousLabel);

                return (
                  <React.Fragment key={step.id}>
                    {showSectionHeading ? (
                      <li className="recipe-step-section-heading list-none">
                        {sectionLabel}
                      </li>
                    ) : null}
                    <li className="rounded-[var(--radius-card)] bg-[var(--surface)] p-4 shadow-[0_2px_8px_var(--shadow-color-soft)]">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full pt-px text-[13px] font-bold leading-[1]"
                      style={{
                        backgroundColor: getCookingMethodTint(
                          step.cooking_method,
                        ),
                        color: resolveCookingMethodDark(
                          step.cooking_method,
                        ),
                      }}
                    >
                      {step.step_number}
                    </span>
                    <span
                      aria-label={getStepCookingMethodAssistiveLabel(step.cooking_method)}
                      className="rounded-full px-2 py-0.5 text-[12px] font-bold"
                      style={{
                        backgroundColor: getCookingMethodTint(
                          step.cooking_method,
                        ),
                        color: resolveCookingMethodDark(
                          step.cooking_method,
                        ),
                      }}
                      title={getStepCookingMethodAssistiveLabel(step.cooking_method)}
                    >
                      {step.cooking_method?.label ?? "만들기"}
                    </span>
                    {step.duration_text ? (
                      <span className="ml-auto text-[12px] text-[var(--text-2)]">
                        {step.duration_text}
                      </span>
                    ) : null}
                  </div>
                  <p className="pl-9 text-base leading-[1.6] text-[var(--text-2)]">
                    {stripMatchingSectionPrefix(
                      step.instruction,
                      step.component_label,
                    ) ?? step.instruction}
                  </p>
                  {formatHeatLevelLabel(step.heat_level) ? (
                    <p className="mt-1.5 pl-9 text-[12px] text-[var(--text-2)]">
                      {formatHeatLevelLabel(step.heat_level)}
                    </p>
                  ) : null}
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          </section>
        ) : null}

        {activeTab === "reviews" ? (
          <section className="bg-[var(--surface)] p-5">
            <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-4 py-5 text-[14px] leading-5 text-[var(--text-2)]">
              아직 등록된 리뷰가 없어요.
            </div>
          </section>
        ) : null}
      </div>
      ) : null}
      {shouldRenderWebView ? (
      <div className="sticky bottom-0 z-20 hidden border-t border-[var(--line)] bg-[var(--surface)] px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_var(--shadow-color-soft)] lg:block xl:hidden">
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <ActionButton
            label="플래너에 추가"
            onClick={() => handleProtectedAction("planner")}
            tone="olive"
          />
          <ActionButton
            label="요리하기"
            onClick={() => router.push(cookModeHref)}
            tone="brand"
          />
        </div>
      </div>
      ) : null}
      {shouldRenderAppView ? (
      <div className="wave1-recipe-cta-bar fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-[var(--line-strong)] bg-[var(--surface)] px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_var(--shadow-color-soft)] lg:hidden">
        <button
          className="min-h-[var(--control-height-md)] flex-1 rounded-[var(--radius-card)] border border-[var(--brand)] bg-[var(--brand)] px-3 text-[15px] font-bold text-[var(--text-inverse)]"
          onClick={() => handleProtectedAction("planner")}
          type="button"
        >
          플래너에 추가
        </button>
        <button
          className="min-h-[var(--control-height-md)] flex-1 rounded-[var(--radius-card)] border border-[var(--brand)] bg-transparent px-3 text-[15px] font-bold text-[var(--brand)]"
          onClick={() => router.push(cookModeHref)}
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
          imageSrc: heroImageSrc,
          meta: `${minutesLabel} · 선택 ${plannerServings}인분`,
          title: recipe.title,
        }}
      />
      <RecipePhotoLightbox
        currentIndex={lightboxIndex}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        onNavigate={(nextIndex) => setLightboxIndex(nextIndex)}
        photos={getRecipePhotoSet(recipe)}
        title={recipe.title}
      />
      {feedback ? <FeedbackToast message={feedback.message} tone={feedback.tone} /> : null}
      <LoginGateModal />
    </>
  );
}

function RecipeDetailWebView({
  cookCountLabel,
  isLikePending,
  likeCountLabel,
  onCook,
  onOpenLightbox,
  onProtectedAction,
  onSelectedServingsChange,
  onShare,
  plannerCountLabel,
  recipe,
  returnHref,
  saveCountLabel,
  scaledIngredients,
  selectedServings,
}: {
  cookCountLabel: string;
  isLikePending: boolean;
  likeCountLabel: string;
  onCook: () => void;
  onOpenLightbox: (index: number) => void;
  onProtectedAction: (type: "like" | "save" | "planner") => void;
  onSelectedServingsChange: (value: number | ((current: number) => number)) => void;
  onShare: () => void;
  plannerCountLabel: string;
  recipe: RecipeDetail;
  returnHref: string;
  saveCountLabel: string;
  scaledIngredients: Array<RecipeIngredient & { scaledText: string }>;
  selectedServings: number;
}) {
  const photos = getRecipePhotoSet(recipe);
  const photoGridClassName = photos.length > 1
    ? "web-recipe-photos"
    : "web-recipe-photos web-recipe-photos-single";
  const sourceLabel = formatRecipeSourceLabel(recipe.source_type);
  const visibleTags = getVisibleRecipeTags(recipe);
  const youtubeSourceHref = getYoutubeSourceHref(recipe);

  return (
    <WebShell className="web-recipe-detail" wide>
      <WebTopNav
        activeId="home"
        items={WEB_NAV_ITEMS}
        rightSlot={<RecipeWebProfileButton />}
      />
      <div className="web-screen">
        <nav aria-label="레시피 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href={returnHref}>
            <ChevronLeftIcon />
            홈
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">{recipe.title}</span>
        </nav>

        <div className="web-recipe-layout">
          <div className="web-recipe-main">
            <div className={photoGridClassName}>
              <button
                aria-label="레시피 사진 크게 보기"
                className="web-recipe-photo-main"
                onClick={() => onOpenLightbox(0)}
                type="button"
              >
                <span style={{ backgroundImage: `url(${photos[0]})` }} />
              </button>
              {photos.length > 1 ? (
                <div className="web-recipe-photo-side">
                  {photos.slice(1, 4).map((photo, index) => (
                    <button
                      aria-label={`레시피 사진 ${index + 2} 보기`}
                      className="web-recipe-photo-thumb"
                      key={photo}
                      onClick={() => onOpenLightbox(index + 1)}
                      type="button"
                    >
                      <span style={{ backgroundImage: `url(${photo})` }} />
                      {index === 2 ? (
                        <span className="web-recipe-photo-more">
                          <GridIcon />
                          사진 전체
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <section className="web-recipe-titleblock">
              {recipe.source_type === "youtube" ? (
                <p className="web-recipe-source-note" data-testid="recipe-youtube-source-note">
                  YouTube에서 가져온 레시피
                </p>
              ) : null}
              <h1 className="web-recipe-title">{recipe.title}</h1>
              <div className="web-recipe-tags">
                {recipe.source_type === "youtube" && youtubeSourceHref ? (
                  <a
                    className="web-chip web-chip-active web-tag web-source-tag"
                    href={youtubeSourceHref}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {sourceLabel}
                  </a>
                ) : null}
                {recipe.source_type === "youtube" && !youtubeSourceHref ? (
                  <WebChip active className="web-tag">
                    {sourceLabel}
                  </WebChip>
                ) : null}
                {visibleTags.map((tag) => (
                  <WebChip className="web-tag" key={tag}>
                    {tag}
                  </WebChip>
                ))}
                {recipe.source_type !== "youtube" ? (
                  <WebChip active className="web-tag">
                    {sourceLabel}
                  </WebChip>
                ) : null}
              </div>
            </section>

            <section aria-label="레시피 요약" className="web-recipe-meta-row">
              <div className="web-recipe-metric-group">
                <RecipeMetric label="기본인분" value={`${recipe.base_servings}인분`} />
                <RecipeMetric label="플래너등록" value={plannerCountLabel} />
                <RecipeMetric label="요리완료" value={cookCountLabel} />
              </div>
              <div className="web-recipe-summary-actions">
                <button
                  aria-label={
                    isLikePending ? "좋아요 처리 중..." : `좋아요 ${likeCountLabel}`
                  }
                  aria-pressed={recipe.user_status?.is_liked ?? false}
                  className="web-icon-action"
                  disabled={isLikePending}
                  onClick={() => onProtectedAction("like")}
                  type="button"
                >
                  <HeartIcon filled={recipe.user_status?.is_liked ?? false} />
                  <span>{isLikePending ? "처리 중" : likeCountLabel}</span>
                </button>
                <button
                  aria-label={`저장 ${saveCountLabel}`}
                  aria-pressed={recipe.user_status?.is_saved ?? false}
                  className="web-icon-action web-icon-action-brand"
                  onClick={() => onProtectedAction("save")}
                  type="button"
                >
                  <BookmarkIcon filled={recipe.user_status?.is_saved ?? false} />
                  <span>{saveCountLabel}</span>
                </button>
                <button
                  aria-label="공유하기"
                  className="web-icon-action"
                  onClick={onShare}
                  type="button"
                >
                  <ShareIcon />
                  <span>공유</span>
                </button>
              </div>
            </section>

            <section className="web-reading-section web-servings-section">
              <div className="web-reading-head">
                <div>
                  <h2>인분 조절</h2>
                  <p>아래 재료량이 즉시 바뀝니다</p>
                </div>
                <WebStepper
                  onChange={onSelectedServingsChange}
                  value={selectedServings}
                />
              </div>
            </section>

            <div className="web-recipe-reading-grid">
              <section className="web-reading-section web-reading-section-grid">
                <h2 className="web-reading-title">재료</h2>
                <ul className="web-ingredient-list">
                  {scaledIngredients.map((ingredient, idx) => {
                    const quantityText = ingredient.scaledText.startsWith(
                      `${ingredient.standard_name} `,
                    )
                      ? ingredient.scaledText.slice(ingredient.standard_name.length + 1)
                      : ingredient.scaledText;
                    const sectionLabel = normalizeRecipeSectionLabel(ingredient.component_label);
                    const previousLabel = idx > 0
                      ? scaledIngredients[idx - 1]?.component_label
                      : null;
                    const showSectionHeading = shouldShowSectionHeading(
                      sectionLabel,
                      previousLabel,
                    );

                    return (
                      <React.Fragment key={ingredient.id}>
                        {showSectionHeading ? (
                          <li className="px-1 pt-3 text-[13px] font-bold text-[var(--brand)] first:pt-0">
                            {sectionLabel}
                          </li>
                        ) : null}
                        <li className="web-ingredient-row">
                          <span className="web-ingredient-name">
                            {ingredient.standard_name}
                            {ingredient.ingredient_type === "TO_TASTE" ? (
                              <span className="web-ingredient-badge">취향껏</span>
                            ) : null}
                          </span>
                          <span className="web-ingredient-amount">{quantityText}</span>
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ul>
              </section>

              <section className="web-reading-section web-reading-section-grid">
                <h2 className="web-reading-title">만들기</h2>
                <ol className="web-step-list">
                  {recipe.steps.map((step, idx) => {
                    const sectionLabel = normalizeRecipeSectionLabel(step.component_label);
                    const previousLabel = idx > 0 ? recipe.steps[idx - 1]?.component_label : null;
                    const showSectionHeading = shouldShowSectionHeading(sectionLabel, previousLabel);

                    return (
                      <React.Fragment key={step.id}>
                        {showSectionHeading ? (
                          <li className="web-step-section-heading">
                            {sectionLabel}
                          </li>
                        ) : null}
                        <li className="web-step-row">
                          <span
                            className="web-step-num"
                            style={{
                              backgroundColor: getCookingMethodTint(
                                step.cooking_method,
                              ),
                              color: resolveCookingMethodDark(
                                step.cooking_method,
                              ),
                            }}
                          >
                            {step.step_number}
                          </span>
                          <div className="web-step-body">
                            <div className="web-step-meta">
                              <span
                                aria-label={getStepCookingMethodAssistiveLabel(step.cooking_method)}
                                className="web-step-method"
                                style={{
                                  backgroundColor: getCookingMethodTint(
                                    step.cooking_method,
                                  ),
                                  color: resolveCookingMethodDark(
                                    step.cooking_method,
                                  ),
                                }}
                                title={getStepCookingMethodAssistiveLabel(step.cooking_method)}
                              >
                                {step.cooking_method?.label ?? "만들기"}
                              </span>
                              {step.duration_text ? (
                                <span className="web-step-duration">
                                  {step.duration_text}
                                </span>
                              ) : null}
                            </div>
                            <p>
                              {stripMatchingSectionPrefix(
                                step.instruction,
                                step.component_label,
                              ) ?? step.instruction}
                            </p>
                            {formatHeatLevelLabel(step.heat_level) ? (
                              <span className="web-step-heat">
                                {formatHeatLevelLabel(step.heat_level)}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      </React.Fragment>
                    );
                  })}
                </ol>
              </section>
            </div>
          </div>

          <aside className="web-recipe-rail">
            <WebCard>
              <WebCardBody className="web-recipe-rail-body">
                <div className="web-recipe-rail-head">
                  <h2>{selectedServings}인분 기준</h2>
                  <p>재료 {recipe.ingredients.length}개 · 단계 {recipe.steps.length}개</p>
                </div>
                <div className="web-recipe-rail-actions">
                  <WebButton fullWidth onClick={() => onProtectedAction("planner")}>
                    <CalendarIcon />
                    플래너에 추가
                  </WebButton>
                  <WebButton fullWidth onClick={onCook} variant="secondary">
                    <CookIcon />
                    요리하기
                  </WebButton>
                </div>
                <p className="web-recipe-rail-note">
                  <InfoIcon />
                  요리모드 진입 후에는 인분을 바꿀 수 없어요.
                </p>
              </WebCardBody>
            </WebCard>
          </aside>
        </div>
      </div>

      <WebCTA className="web-recipe-bottom-cta">
        <WebButton onClick={() => onProtectedAction("planner")}>
          플래너에 추가
        </WebButton>
        <WebButton onClick={onCook} variant="secondary">요리하기</WebButton>
      </WebCTA>
    </WebShell>
  );
}

function RecipeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="web-recipe-metric">
      <div className="web-recipe-metric-value">{value}</div>
      <div className="web-recipe-metric-label">{label}</div>
    </div>
  );
}

function WebStepper({
  onChange,
  value,
}: {
  onChange: (value: number | ((current: number) => number)) => void;
  value: number;
}) {
  return (
    <div className="web-stepper">
      <button
        aria-label="인분 줄이기"
        disabled={value <= 1}
        onClick={() => onChange((current) => Math.max(1, current - 1))}
        type="button"
      >
        -
      </button>
      <span>{value}인분</span>
      <button
        aria-label="인분 늘리기"
        onClick={() => onChange((current) => current + 1)}
        type="button"
      >
        +
      </button>
    </div>
  );
}

function RecipeWebProfileButton() {
  return (
    <Link
      aria-label="마이페이지"
      className="web-profile-button"
      href="/mypage"
    >
      <UserIcon />
    </Link>
  );
}

function getRecipePhotoSet(recipe: RecipeDetail) {
  // Single shared resolver (thumbnail column first, shared deterministic
  // fallback) so home card / detail / planner-add modal show the same image.
  return [resolveRecipeImage(recipe)];
}

function getYoutubeSourceHref(recipe: RecipeDetail) {
  if (recipe.source_type !== "youtube") {
    return null;
  }

  return recipe.source?.youtube_url ?? null;
}

function getVisibleRecipeTags(recipe: RecipeDetail) {
  const sourceLabel = formatRecipeSourceLabel(recipe.source_type);
  const sourceKey = normalizeRecipeTag(sourceLabel);
  const titleKey = normalizeRecipeTag(recipe.title);

  return recipe.tags
    .filter((tag) => {
      const tagKey = normalizeRecipeTag(tag);
      return tagKey.length > 0 && tagKey !== sourceKey && tagKey !== titleKey;
    })
    .slice(0, 3);
}

function normalizeRecipeTag(value: string) {
  return value.trim().replace(/^#+/, "").trim().toLowerCase();
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
              className="h-[var(--control-height-md)] w-24"
              key={`hero-metric-${index}`}
              rounded="md"
            />
          ))}
        </div>
        <Skeleton className="h-4 w-full" rounded="full" />
        <Skeleton className="h-4 w-5/6" rounded="full" />
        <div className="grid grid-cols-[1fr_2fr] gap-2 max-[360px]:grid-cols-2">
          <Skeleton className="h-[var(--control-height-md)]" rounded="md" />
          <Skeleton className="h-[var(--control-height-md)]" rounded="md" />
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
              className="rounded-[var(--radius-card)] bg-[var(--panel)] p-4"
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

function RecipeDetailWebLoadingSkeleton() {
  return (
    <WebShell className="web-recipe-detail" wide>
      <WebTopNav
        activeId="home"
        items={WEB_NAV_ITEMS}
        rightSlot={<RecipeWebProfileButton />}
      />
      <div className="web-screen" data-testid="recipe-detail-web-loading">
        <nav aria-label="레시피 경로" className="web-breadcrumb">
          <Link className="web-breadcrumb-link" href="/">
            <ChevronLeftIcon />
            홈
          </Link>
          <span className="web-breadcrumb-sep">/</span>
          <span className="web-breadcrumb-current">레시피 불러오는 중</span>
        </nav>

        <div className="web-recipe-layout">
          <div className="web-recipe-main">
            <div className="web-recipe-photos">
              <Skeleton className="h-full w-full" />
              <div className="web-recipe-photo-side">
                {[1, 2, 3].map((item) => (
                  <Skeleton className="h-full w-full" key={item} />
                ))}
              </div>
            </div>

            <section className="web-recipe-titleblock">
              <Skeleton className="h-10 w-2/3" />
              <div className="mt-4 flex gap-2">
                {[1, 2, 3].map((item) => (
                  <Skeleton className="h-7 w-20" key={item} rounded="full" />
                ))}
              </div>
            </section>

            <section className="web-recipe-meta-row">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton className="h-20 w-full" key={item} rounded="md" />
              ))}
            </section>
          </div>

          <aside className="web-recipe-rail" aria-hidden="true">
            <WebCard>
              <WebCardBody className="web-recipe-rail-body">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="mt-3 h-4 w-48" />
                <div className="web-recipe-rail-actions">
                  <Skeleton className="h-11 w-full" rounded="md" />
                  <Skeleton className="h-11 w-full" rounded="md" />
                  <Skeleton className="h-11 w-full" rounded="md" />
                </div>
              </WebCardBody>
            </WebCard>
          </aside>
        </div>
      </div>
    </WebShell>
  );
}

function RecipePhotoLightbox({
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  photos,
  title,
}: {
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
  photos: string[];
  title: string;
}) {
  const safeIndex = photos.length > 0
    ? ((currentIndex % photos.length) + photos.length) % photos.length
    : 0;
  const navigate = useCallback(
    (direction: -1 | 1) => {
      if (photos.length === 0) {
        return;
      }

      onNavigate((safeIndex + direction + photos.length) % photos.length);
    },
    [onNavigate, photos.length, safeIndex],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowLeft") {
        navigate(-1);
      }
      if (event.key === "ArrowRight") {
        navigate(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, navigate, onClose]);

  if (!isOpen || photos.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="사진 보기"
      aria-modal="true"
      className="web-lightbox"
      onClick={onClose}
      role="dialog"
    >
      <button
        aria-label="닫기"
        className="web-lightbox-close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        type="button"
      >
        <CloseIcon />
      </button>
      <button
        aria-label="이전"
        className="web-lightbox-nav web-lightbox-prev"
        onClick={(event) => {
          event.stopPropagation();
          navigate(-1);
        }}
        type="button"
      >
        <ChevronLeftIcon />
      </button>
      <div
        className="web-lightbox-frame"
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundImage: `url(${photos[safeIndex]})`,
        }}
        aria-label={title}
        role="img"
      />
      <button
        aria-label="다음"
        className="web-lightbox-nav web-lightbox-next"
        onClick={(event) => {
          event.stopPropagation();
          navigate(1);
        }}
        type="button"
      >
        <ChevronRightIcon />
      </button>
      <div className="web-lightbox-counter">
        {safeIndex + 1} / {photos.length}
      </div>
    </div>
  );
}

function resolveCookingMethodDark(input?: Parameters<typeof getCookingMethodColor>[0]) {
  const base = getCookingMethodColor(input);
  return `color-mix(in srgb, ${base} 52%, var(--foreground))`;
}

function Wave1HeroMetricButton({
  ariaLabel,
  ariaPressed,
  count,
  disabled = false,
  icon,
  onClick,
}: {
  ariaLabel: string;
  ariaPressed?: boolean;
  count: string;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={[
        "flex min-h-[60px] min-w-[64px] flex-col items-center justify-center gap-0 rounded-full bg-transparent px-1 py-0 font-extrabold leading-none [color:var(--text-inverse)] drop-shadow-[0_2px_5px_var(--overlay-75)] transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70",
        ariaPressed ? "scale-105" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      style={{ fontSize: 14 }}
      type="button"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 items-center justify-center [&>svg]:h-7 [&>svg]:w-7"
      >
        {icon}
      </span>
      <span
        aria-hidden={ariaLabel !== `좋아요 ${count}`}
        className="text-[14px] font-extrabold leading-none"
      >
        {count}
      </span>
    </button>
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
      className={`min-h-[var(--control-height-md)] w-full whitespace-nowrap rounded-[var(--radius-md)] border px-3 py-2 text-[12px] font-semibold shadow-[var(--shadow-1)] disabled:cursor-not-allowed disabled:opacity-60 max-[360px]:px-2 md:px-4 md:py-2.5 md:text-sm ${
        tone === "olive"
          ? "border-[color-mix(in_srgb,var(--brand)_22%,transparent)] bg-[var(--brand)] text-[var(--surface)]"
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
      className={`flex min-h-[var(--control-height-md)] w-full items-center justify-center rounded-[var(--radius-md)] border shadow-[var(--shadow-1)] ${getRecipeActionToneClass(tone)}`}
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
      className={`flex min-h-[var(--control-height-md)] w-full items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-1)] md:px-2.5 md:py-2 md:text-[13px] ${getRecipeActionToneClass(tone)}`}
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
      className={`flex min-h-[var(--control-height-md)] w-full items-center justify-center gap-1 rounded-[var(--radius-md)] border px-1.5 py-1.5 text-[11px] font-semibold shadow-[var(--shadow-1)] disabled:cursor-not-allowed disabled:opacity-60 md:gap-1.5 md:px-2.5 md:py-2 md:text-[13px] ${getRecipeActionToneClass(tone)}`}
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
    return "border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-[var(--brand)]";
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
      className={filled ? "text-[var(--like-active)]" : undefined}
      fill={filled ? "currentColor" : "none"}
      height="20"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M12 20.2 4.9 13.4a4.8 4.8 0 0 1 6.8-6.8L12 7l.3-.4a4.8 4.8 0 0 1 6.8 6.8Z" />
    </svg>
  );
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={filled ? "text-[var(--brand)]" : undefined}
      fill={filled ? "currentColor" : "none"}
      height="20"
      stroke="currentColor"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.7L6 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

function CookIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="cook-icon"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M6 9h12l-.8 8.2A2 2 0 0 1 15.2 19H8.8a2 2 0 0 1-2-1.8L6 9Z" />
      <path d="M9 9V7.5A3 3 0 0 1 12 4.5a3 3 0 0 1 3 3V9" />
      <path d="M4 11h2" />
      <path d="M18 11h2" />
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

function ChevronRightIcon() {
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
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CloseIcon() {
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
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function CalendarIcon() {
  return <PlannerIcon />;
}

function GridIcon() {
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
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </svg>
  );
}

function InfoIcon() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v5M12 7.5h.01" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ServingsIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 20a5.6 5.6 0 0 1 11 0" />
      <circle cx="16.3" cy="9" r="2.3" opacity="0.72" />
      <path d="M13.3 19.4a4.2 4.2 0 0 1 7.2 0" opacity="0.72" />
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
    return "linear-gradient(135deg, var(--accent-peach) 0%, var(--accent-peach) 100%)";
  }

  if (/김치|찌개|국물|매운탕|감자탕|삼계탕/.test(searchableText)) {
    return "var(--accent-peach)";
  }

  if (/밥|볶음밥|덮밥/.test(searchableText)) {
    return "var(--accent-gold)";
  }

  if (/면|파스타|국수|라면/.test(searchableText)) {
    return "var(--success-border)";
  }

  return "var(--accent-peach)";
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
            : "border-[color-mix(in_srgb,var(--brand)_18%,transparent)] bg-[color-mix(in_srgb,var(--surface)_96%,var(--brand))] text-[var(--foreground)]"
        }`}
        role={isError ? "alert" : "status"}
      >
        {message}
      </div>
    </div>
  );
}
