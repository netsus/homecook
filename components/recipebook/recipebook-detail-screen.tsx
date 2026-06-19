"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  PlannerAddSheet,
  type PlannerAddSheetState,
} from "@/components/recipe/planner-add-sheet";
import { SaveModal } from "@/components/recipe/save-modal";
import { ContentState } from "@/components/shared/content-state";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
  WebRecipeCard,
  WebShell,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { createMeal, isMealApiError } from "@/lib/api/meal";
import { deleteRecipeBook, renameRecipeBook } from "@/lib/api/mypage";
import { fetchPlanner } from "@/lib/api/planner";
import {
  fetchRecipeBookRecipeDetail,
  fetchRecipeBookRecipes,
  removeRecipeBookRecipe,
} from "@/lib/api/recipe";
import {
  createCustomRecipeBook,
  fetchSaveableRecipeBooks,
  removeRecipeFromBook,
  saveRecipeToBooks,
} from "@/lib/api/recipe-save";
import { getSurfaceChromeRule } from "@/lib/navigation/app-nav";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getRecipeBookCoverViewModel } from "@/lib/recipebook-cover";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  RecipeBookReaderRecipeData,
  RecipeBookCoverColorKey,
  RecipeBookRecipeItem,
  RecipeBookSummary,
  RecipeBookType,
  RecipeIngredient,
} from "@/types/recipe";
import type { PlannerColumnData } from "@/types/planner";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "empty" | "error" | "ready";
type ReaderDetailState =
  | { status: "loading" }
  | { status: "ready"; data: RecipeBookReaderRecipeData }
  | { status: "error"; message: string };
type SaveModalState = "idle" | "loading" | "ready" | "error";

const TOAST_DURATION_MS = 3000;
const PAGE_SIZE = 20;
const RECIPEBOOK_DETAIL_CHROME = getSurfaceChromeRule("recipebook.detail");

const REMOVE_LABEL: Record<string, string> = {
  liked: "좋아요 해제",
  saved: "제거",
  custom: "제거",
};

function buildRecipeBookDetailHref({
  bookId,
  bookName,
  bookType,
}: {
  bookId: string;
  bookName: string;
  bookType: RecipeBookType;
}) {
  const params = new URLSearchParams({
    type: bookType,
    name: bookName,
  });

  return `/mypage/recipe-books/${bookId}?${params.toString()}`;
}

function normalizeServings(servings?: number | null) {
  if (typeof servings !== "number" || !Number.isFinite(servings)) {
    return 1;
  }

  return Math.max(1, Math.floor(servings));
}

function getRecipeBookItemServings(
  item: RecipeBookRecipeItem,
  readerDetailState?: ReaderDetailState,
) {
  if (readerDetailState?.status === "ready") {
    return normalizeServings(readerDetailState.data.base_servings);
  }

  return normalizeServings(item.base_servings);
}

export interface RecipeBookDetailScreenProps {
  bookId: string;
  bookName: string;
  bookType: RecipeBookType;
  bookCoverColorKey?: RecipeBookCoverColorKey | null;
  bookCoverImageSrc?: string | null;
  embedded?: boolean;
  initialAuthenticated?: boolean;
}

export function RecipeBookDetailScreen({
  bookId,
  bookName,
  bookType,
  bookCoverColorKey,
  bookCoverImageSrc,
  embedded = false,
  initialAuthenticated = false,
}: RecipeBookDetailScreenProps) {
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: "/mypage" });
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [currentBookName, setCurrentBookName] = useState(bookName);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [items, setItems] = useState<RecipeBookRecipeItem[]>([]);
  const [readerDetailsById, setReaderDetailsById] = useState<
    Record<string, ReaderDetailState>
  >({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("데이터를 불러오지 못했어요");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RecipeBookRecipeItem | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bookMenuOpen, setBookMenuOpen] = useState(false);
  const [bookRenameOpen, setBookRenameOpen] = useState(false);
  const [bookRenameValue, setBookRenameValue] = useState(bookName);
  const [bookDeleteOpen, setBookDeleteOpen] = useState(false);
  const [bookActionError, setBookActionError] = useState<string | null>(null);
  const [isBookActionSaving, setIsBookActionSaving] = useState(false);
  const [desktopReaderMode, setDesktopReaderMode] = useState<"book" | "list">("book");
  const [activeDesktopRecipeId, setActiveDesktopRecipeId] = useState<string | null>(
    null,
  );
  const [saveTarget, setSaveTarget] = useState<RecipeBookRecipeItem | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveModalState, setSaveModalState] = useState<SaveModalState>("idle");
  const [saveBooks, setSaveBooks] = useState<RecipeBookSummary[]>([]);
  const [selectedSaveBookIds, setSelectedSaveBookIds] = useState<string[]>([]);
  const [newSaveBookName, setNewSaveBookName] = useState("");
  const [saveLoadError, setSaveLoadError] = useState<string | null>(null);
  const [saveSubmitError, setSaveSubmitError] = useState<string | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [plannerTarget, setPlannerTarget] = useState<RecipeBookRecipeItem | null>(null);
  const [isPlannerAddSheetOpen, setIsPlannerAddSheetOpen] = useState(false);
  const [plannerAddSheetState, setPlannerAddSheetState] =
    useState<PlannerAddSheetState>("loading-columns");
  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(1);
  const [plannerAddError, setPlannerAddError] = useState<string | null>(null);

  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const requestedReaderRecipeIdsRef = useRef<Set<string>>(new Set());
  const lastBookNamePropRef = useRef(bookName);
  const canManageBook = bookType === "custom";
  const knownSavedBookIds = useMemo(() => {
    if (bookType === "saved" || bookType === "custom") {
      return [bookId];
    }

    return [];
  }, [bookId, bookType]);
  const selectablePlannerDates = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < 14; i += 1) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
    }

    return dates;
  }, []);

  const buildRecipeDetailReturnHref = useCallback(
    (recipeId: string) =>
      buildReturnHref(`/recipe/${recipeId}`, {
        restore: "recipebook-tab",
        returnSurface: "mypage.recipebooks",
        returnTo: buildRecipeBookDetailHref({
          bookId,
          bookName: currentBookName,
          bookType,
        }),
      }),
    [bookId, bookType, currentBookName],
  );
  const buildRecipeCookHref = useCallback(
    (item: RecipeBookRecipeItem, readerDetailState?: ReaderDetailState) =>
      buildReturnHref(
        `/cooking/recipes/${item.recipe_id}/cook-mode?servings=${getRecipeBookItemServings(
          item,
          readerDetailState,
        )}`,
        {
          returnSurface: "recipe.detail",
          returnTo: buildRecipeDetailReturnHref(item.recipe_id),
        },
      ),
    [buildRecipeDetailReturnHref],
  );

  const clearToastTimeout = useCallback(() => {
    if (toastTimeoutRef.current === null) {
      return;
    }

    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = null;
  }, []);

  const showToast = useCallback(
    (message: string, tone: "success" | "error") => {
      clearToastTimeout();
      setToast({ message, tone });
      toastTimeoutRef.current = setTimeout(() => {
        setToast(null);
        toastTimeoutRef.current = null;
      }, TOAST_DURATION_MS);
    },
    [clearToastTimeout],
  );

  useEffect(() => () => clearToastTimeout(), [clearToastTimeout]);

  useEffect(() => {
    if (lastBookNamePropRef.current === bookName) {
      return;
    }

    lastBookNamePropRef.current = bookName;
    setCurrentBookName(bookName);
    if (!bookRenameOpen) {
      setBookRenameValue(bookName);
    }
  }, [bookName, bookRenameOpen]);

  const closeSaveModal = useCallback(() => {
    if (isSavingRecipe || isCreatingBook) {
      return;
    }

    setIsSaveModalOpen(false);
    setSaveTarget(null);
    setSaveModalState("idle");
    setSaveLoadError(null);
    setSaveSubmitError(null);
    setNewSaveBookName("");
  }, [isCreatingBook, isSavingRecipe]);

  const loadSaveBooks = useCallback(async () => {
    setSaveModalState("loading");
    setSaveLoadError(null);
    setSaveSubmitError(null);

    try {
      const books = await fetchSaveableRecipeBooks();
      const availableBookIds = new Set(books.map((book) => book.id));
      const retainedKnownSavedBookIds = knownSavedBookIds.filter((savedBookId) =>
        availableBookIds.has(savedBookId),
      );

      setSaveBooks(books);
      setSelectedSaveBookIds((currentBookIds) => {
        const retained = currentBookIds.filter((bookId) => availableBookIds.has(bookId));

        if (retained.length > 0) {
          return retained;
        }

        if (retainedKnownSavedBookIds.length > 0) {
          return retainedKnownSavedBookIds;
        }

        return books[0] ? [books[0].id] : [];
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
  }, [knownSavedBookIds]);

  const openSaveModal = useCallback(
    async (item: RecipeBookRecipeItem) => {
      if (authState !== "authenticated") {
        return;
      }

      setSaveTarget(item);
      setIsSaveModalOpen(true);
      await loadSaveBooks();
    },
    [authState, loadSaveBooks],
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
        const nextBooks = currentBooks.some((book) => book.id === createdBook.id)
          ? currentBooks
          : [...currentBooks, createdBook];

        return [...nextBooks].sort((left, right) => {
          if (left.sort_order === right.sort_order) {
            return left.id.localeCompare(right.id);
          }

          return left.sort_order - right.sort_order;
        });
      });
      setSelectedSaveBookIds((currentBookIds) =>
        currentBookIds.includes(createdBook.id)
          ? currentBookIds
          : [...currentBookIds, createdBook.id],
      );
      setNewSaveBookName("");
      setSaveModalState("ready");
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피북을 만들지 못했어요.",
      );
    } finally {
      setIsCreatingBook(false);
    }
  }, [newSaveBookName]);

  const handleSaveRecipe = useCallback(async () => {
    if (!saveTarget || isSavingRecipe) {
      return;
    }

    const newBookIds = selectedSaveBookIds.filter(
      (selectedBookId) => !knownSavedBookIds.includes(selectedBookId),
    );
    const removedBookIds = knownSavedBookIds.filter(
      (savedBookId) => !selectedSaveBookIds.includes(savedBookId),
    );

    if (newBookIds.length === 0 && removedBookIds.length === 0) {
      return;
    }

    setIsSavingRecipe(true);
    setSaveSubmitError(null);

    try {
      if (newBookIds.length > 0) {
        await saveRecipeToBooks(saveTarget.recipe_id, newBookIds);
      }

      await Promise.all(
        removedBookIds.map((removedBookId) =>
          removeRecipeFromBook(removedBookId, saveTarget.recipe_id),
        ),
      );

      if (removedBookIds.includes(bookId)) {
        setItems((currentItems) =>
          currentItems.filter((item) => item.recipe_id !== saveTarget.recipe_id),
        );
        setViewState((currentState) =>
          items.length <= 1 ? "empty" : currentState,
        );
      }

      setIsSaveModalOpen(false);
      setSaveModalState("idle");
      setSaveTarget(null);
      showToast("레시피북 저장을 변경했어요", "success");
    } catch (error) {
      setSaveSubmitError(
        error instanceof Error ? error.message : "레시피를 저장하지 못했어요.",
      );
    } finally {
      setIsSavingRecipe(false);
    }
  }, [
    bookId,
    isSavingRecipe,
    items.length,
    knownSavedBookIds,
    saveTarget,
    selectedSaveBookIds,
    showToast,
  ]);

  const loadPlannerColumns = useCallback(async () => {
    setPlannerAddSheetState("loading-columns");
    setPlannerAddError(null);

    try {
      const today = selectablePlannerDates[0] ?? "";
      const data = await fetchPlanner(today, today);
      setPlannerColumns(data.columns);
      setSelectedPlanColumnId((current) => {
        if (current && data.columns.some((column) => column.id === current)) {
          return current;
        }

        return (
          data.columns.find((column) => column.name === "저녁")?.id
          ?? data.columns[0]?.id
          ?? ""
        );
      });
      setPlannerAddSheetState("ready");
    } catch {
      setPlannerAddSheetState("error");
      setPlannerAddError("플래너 슬롯을 불러오지 못했어요.");
    }
  }, [selectablePlannerDates]);

  const openPlannerAddSheet = useCallback(
    async (item: RecipeBookRecipeItem) => {
      if (authState !== "authenticated") {
        return;
      }

      setPlannerTarget(item);
      setIsPlannerAddSheetOpen(true);
      setPlannerAddError(null);
      setSelectedPlanDate(selectablePlannerDates[0] ?? "");
      setPlannerServings(item.base_servings ?? 1);

      await loadPlannerColumns();
    },
    [authState, loadPlannerColumns, selectablePlannerDates],
  );

  const closePlannerAddSheet = useCallback(() => {
    if (plannerAddSheetState === "submitting") {
      return;
    }

    setIsPlannerAddSheetOpen(false);
    setPlannerTarget(null);
    setPlannerAddError(null);
  }, [plannerAddSheetState]);

  const handlePlannerAddSubmit = useCallback(async () => {
    if (
      !plannerTarget ||
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
        recipe_id: plannerTarget.recipe_id,
        plan_date: selectedPlanDate,
        column_id: selectedPlanColumnId,
        planned_servings: plannerServings,
      });

      setIsPlannerAddSheetOpen(false);
      const [, month, day] = selectedPlanDate.split("-").map(Number);
      const columnName =
        plannerColumns.find((column) => column.id === selectedPlanColumnId)?.name
        ?? "선택한 끼니";
      showToast(`${month}월 ${day}일 ${columnName}에 추가됐어요`, "success");
      setPlannerTarget(null);
    } catch (error) {
      const message =
        isMealApiError(error) && error.status === 403
          ? "내 플래너 슬롯에만 추가할 수 있어요."
          : error instanceof Error
            ? error.message
            : "플래너 추가에 실패했어요.";

      setPlannerAddError(message);
      setPlannerAddSheetState("ready");
    }
  }, [
    plannerAddSheetState,
    plannerColumns,
    plannerServings,
    plannerTarget,
    selectedPlanColumnId,
    selectedPlanDate,
    showToast,
  ]);

  const loadRecipes = useCallback(
    async (nextCursor?: string) => {
      try {
        if (!nextCursor) {
          setErrorMessage("데이터를 불러오지 못했어요");
        }

        const result = await fetchRecipeBookRecipes(bookId, {
          cursor: nextCursor,
          limit: PAGE_SIZE,
        });

        if (!result.success || !result.data) {
          if (!nextCursor) {
            setErrorMessage(result.error?.message ?? "데이터를 불러오지 못했어요");
            setViewState("error");
          }
          return;
        }

        if (nextCursor) {
          setItems((prev) => mergeUniqueRecipeItems(prev, result.data!.items));
        } else {
          requestedReaderRecipeIdsRef.current.clear();
          setReaderDetailsById({});
          setItems(result.data.items);
        }

        setCursor(result.data.next_cursor);
        setHasNext(result.data.has_next);

        if (!nextCursor) {
          setViewState(result.data.items.length === 0 ? "empty" : "ready");
        }
      } catch {
        if (!nextCursor) {
          setErrorMessage("데이터를 불러오지 못했어요");
          setViewState("error");
        }
      }
    },
    [bookId],
  );

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await loadRecipes(cursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, loadRecipes]);

  const handleRemove = useCallback(
    async (recipeId: string) => {
      if (removingId) return;
      setRemovingId(recipeId);

      // Optimistic removal
      const previousItems = items;
      setItems((prev) => prev.filter((item) => item.recipe_id !== recipeId));

      const result = await removeRecipeBookRecipe(bookId, recipeId);

      if (result.success) {
        showToast(
          bookType === "liked" ? "좋아요를 해제했어요" : "레시피를 제거했어요",
          "success",
        );
        // If list is now empty, switch to empty state
        if (previousItems.length === 1) {
          setViewState("empty");
        }
      } else {
        // Rollback on failure
        setItems(previousItems);
        setActiveDesktopRecipeId(recipeId);
        setViewState(previousItems.length === 0 ? "empty" : "ready");
        showToast(
          result.error?.message ?? "제거에 실패했어요",
          "error",
        );
      }

      setRemovingId(null);
    },
    [bookId, bookType, items, removingId, showToast],
  );

  const handleRemoveRequest = useCallback(
    (recipeId: string) => {
      const target = items.find((item) => item.recipe_id === recipeId);
      if (target) {
        setRemoveTarget(target);
      }
    },
    [items],
  );

  const handleRemoveConfirm = useCallback(async () => {
    if (!removeTarget) {
      return;
    }

    const recipeId = removeTarget.recipe_id;
    setRemoveTarget(null);
    await handleRemove(recipeId);
  }, [handleRemove, removeTarget]);

  const handleBookRenameStart = useCallback(() => {
    setBookMenuOpen(false);
    setBookRenameValue(currentBookName);
    setBookActionError(null);
    setBookRenameOpen(true);
  }, [currentBookName]);

  const handleBookRenameCancel = useCallback(() => {
    setBookRenameOpen(false);
    setBookRenameValue(currentBookName);
    setBookActionError(null);
  }, [currentBookName]);

  const handleBookRename = useCallback(async () => {
    if (!canManageBook || isBookActionSaving) return;

    const trimmed = bookRenameValue.trim();
    if (!trimmed) return;

    if (trimmed === currentBookName) {
      handleBookRenameCancel();
      return;
    }

    setIsBookActionSaving(true);
    setBookActionError(null);

    try {
      const result = await renameRecipeBook(bookId, trimmed);
      setCurrentBookName(result.name);
      setBookRenameOpen(false);
      showToast("레시피북 이름을 변경했어요", "success");
    } catch (error) {
      setBookActionError(
        error instanceof Error ? error.message : "이름 변경에 실패했어요.",
      );
    } finally {
      setIsBookActionSaving(false);
    }
  }, [
    bookId,
    bookRenameValue,
    canManageBook,
    currentBookName,
    handleBookRenameCancel,
    isBookActionSaving,
    showToast,
  ]);

  const handleBookDeleteRequest = useCallback(() => {
    setBookMenuOpen(false);
    setBookActionError(null);
    setBookDeleteOpen(true);
  }, []);

  const handleBookDelete = useCallback(async () => {
    if (!canManageBook || isBookActionSaving) return;

    setIsBookActionSaving(true);
    setBookActionError(null);

    try {
      await deleteRecipeBook(bookId);
      router.replace(appReturn.href);
    } catch (error) {
      setBookActionError(
        error instanceof Error ? error.message : "레시피북 삭제에 실패했어요.",
      );
    } finally {
      setIsBookActionSaving(false);
    }
  }, [appReturn.href, bookId, canManageBook, isBookActionSaving, router]);

  const renderDetailHeader = () => (
    <DetailHeader
      backHref={appReturn.href}
      bookName={currentBookName}
      canManageBook={canManageBook}
      errorMessage={bookRenameOpen ? bookActionError : null}
      isMenuOpen={bookMenuOpen}
      isRenaming={bookRenameOpen}
      isSaving={isBookActionSaving}
      onDeleteRequest={handleBookDeleteRequest}
      onMenuToggle={() => setBookMenuOpen((current) => !current)}
      onRenameCancel={handleBookRenameCancel}
      onRenameConfirm={() => void handleBookRename()}
      onRenameStart={handleBookRenameStart}
      onRenameValueChange={setBookRenameValue}
      renameValue={bookRenameValue}
    />
  );

  const renderBookDeleteDialog = () =>
    bookDeleteOpen ? (
      <BookDeleteConfirmDialog
        bookName={currentBookName}
        disabled={isBookActionSaving}
        errorMessage={bookActionError}
        mobile={isMobileViewport}
        onCancel={() => {
          setBookDeleteOpen(false);
          setBookActionError(null);
        }}
        onConfirm={() => void handleBookDelete()}
      />
    ) : null;

  const renderRecipeRemoveDialog = () =>
    removeTarget ? (
      <RecipeRemoveConfirmDialog
        disabled={removingId === removeTarget.recipe_id}
        mobile={isMobileViewport}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => void handleRemoveConfirm()}
        recipeTitle={removeTarget.title}
        removeLabel={removeLabel}
      />
    ) : null;

  const renderReaderActionModals = () => (
    <>
      <SaveModal
        alreadySavedBookIds={knownSavedBookIds}
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
        onSelectBook={(targetBookId) => {
          setSelectedSaveBookIds((currentBookIds) =>
            currentBookIds.includes(targetBookId)
              ? currentBookIds.filter((currentBookId) => currentBookId !== targetBookId)
              : [...currentBookIds, targetBookId],
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
        recipePreview={
          plannerTarget
            ? {
                background: getRecipeThumbColor(plannerTarget.title),
                emoji: "🍽",
                imageSrc: getRecipeBookItemImage(plannerTarget),
                meta: `${plannerServings}인분`,
                title: plannerTarget.title,
              }
            : undefined
        }
        selectableDates={selectablePlannerDates}
        selectedColumnId={selectedPlanColumnId}
        selectedDate={selectedPlanDate}
        servings={plannerServings}
        sheetState={plannerAddSheetState}
        variant="recipe-detail"
      />
    </>
  );

  // Auth check
  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  // Load data on auth
  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadRecipes();
  }, [authState, loadRecipes]);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasNext) return;

    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadMore]);

  useEffect(() => {
    if (items.length === 0) {
      setActiveDesktopRecipeId(null);
      return;
    }

    setActiveDesktopRecipeId((current) => {
      if (current && items.some((item) => item.recipe_id === current)) {
        return current;
      }

      return items[0]?.recipe_id ?? null;
    });
  }, [items]);

  useEffect(() => {
    if (authState !== "authenticated" || viewState !== "ready") return;

    const recipeIdsToLoad = items
      .map((item) => item.recipe_id)
      .filter((recipeId) => !requestedReaderRecipeIdsRef.current.has(recipeId));

    if (recipeIdsToLoad.length === 0) return;

    recipeIdsToLoad.forEach((recipeId) => {
      requestedReaderRecipeIdsRef.current.add(recipeId);
    });

    let cancelled = false;

    setReaderDetailsById((current) => {
      const next = { ...current };
      recipeIdsToLoad.forEach((recipeId) => {
        next[recipeId] = { status: "loading" };
      });
      return next;
    });

    recipeIdsToLoad.forEach((recipeId) => {
      void fetchRecipeBookRecipeDetail(bookId, recipeId).then((result) => {
        if (cancelled) return;

        setReaderDetailsById((current) => ({
          ...current,
          [recipeId]:
            result.success && result.data
              ? { status: "ready", data: result.data }
              : {
                  status: "error",
                  message:
                    result.error?.message ?? "레시피 상세를 불러오지 못했어요.",
                },
        }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authState, bookId, items, viewState]);

  const canRemove = bookType !== "my_added";
  const removeLabel = REMOVE_LABEL[bookType] ?? "제거";

  const renderDesktopBookActions = () =>
    canManageBook ? (
      <div className="web-recipebook-detail-actions">
        <div className="web-recipebook-detail-menu-wrap">
          <WebIconButton
            aria-controls="recipebook-detail-book-menu"
            aria-expanded={bookMenuOpen}
            aria-haspopup="menu"
            aria-label={`${currentBookName} 옵션 메뉴`}
            onClick={() => setBookMenuOpen((current) => !current)}
          >
            ⋯
          </WebIconButton>
          {bookMenuOpen ? (
            <div
              className="web-recipebook-menu"
              id="recipebook-detail-book-menu"
              role="menu"
            >
              <button onClick={handleBookRenameStart} role="menuitem" type="button">
                이름 변경
              </button>
              <button onClick={handleBookDeleteRequest} role="menuitem" type="button">
                삭제
              </button>
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  const renderDesktopFrame = (
    children: React.ReactNode,
    recipeCount: number | null = items.length,
  ) => {
    const frame = (
      <div className="web-recipebook-detail-screen">
        <div className="web-recipebook-detail-head" data-testid="recipebook-detail-header">
          <div>
            <h1>레시피북 리더</h1>
            <p>{currentBookName} · 왼쪽 목차와 오른쪽 책 페이지로 레시피를 읽어요.</p>
          </div>
          {renderDesktopBookActions()}
        </div>
        <div
          className="web-recipebook-detail-layout web-recipebook-open-book"
          data-testid="recipebook-open-book"
        >
          <DesktopRecipeBookRail
            activeRecipeId={activeDesktopRecipeId}
            bookCoverColorKey={bookCoverColorKey}
            bookCoverImageSrc={bookCoverImageSrc}
            bookId={bookId}
            bookName={currentBookName}
            bookType={bookType}
            hasNext={hasNext}
            items={items}
            onSelectRecipe={setActiveDesktopRecipeId}
            recipeCount={recipeCount}
          />
          <section className="web-recipebook-detail-main" aria-label="레시피 목록">
            {children}
          </section>
        </div>
        {toast ? (
          <div
            className={`fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-[var(--radius-lg)] px-4 py-3 text-center text-sm font-semibold shadow-lg ${
              toast.tone === "success"
                ? "bg-[var(--brand)] text-[var(--text-inverse)]"
                : "bg-[var(--danger)] text-[var(--text-inverse)]"
            }`}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}
        {bookRenameOpen ? (
          <DesktopBookRenameDialog
            disabled={isBookActionSaving}
            errorMessage={bookActionError}
            onCancel={handleBookRenameCancel}
            onConfirm={() => void handleBookRename()}
            onValueChange={setBookRenameValue}
            value={bookRenameValue}
          />
        ) : null}
        {renderBookDeleteDialog()}
        {renderRecipeRemoveDialog()}
        {renderReaderActionModals()}
      </div>
    );

    if (embedded) {
      return frame;
    }

    return (
      <WebShell className="web-recipebook-detail-shell" wide>
        <WebTopNav activeId={RECIPEBOOK_DETAIL_CHROME.primaryNavId} />
        {frame}
      </WebShell>
    );
  };

  // --- Render states ---

  if (authState === "checking") {
    if (isMobileViewport) {
      return (
        <RecipeBookDetailSkeleton
          backHref={appReturn.href}
          bookName={currentBookName}
          mobile
        />
      );
    }

    return renderDesktopFrame(
      <div
        className="web-recipebook-detail-grid web-recipebook-detail-grid-loading"
        data-testid="recipebook-detail-skeleton"
      >
        {[1, 2, 3, 4].map((i) => (
          <div className="web-recipebook-detail-skeleton-card" key={i}>
            <Skeleton className="h-48 w-full rounded-[var(--web-r-md)]" />
            <Skeleton className="mt-4 h-5 w-32" />
            <Skeleton className="mt-2 h-4 w-24" />
          </div>
        ))}
      </div>,
      null,
    );
  }

  if (authState === "unauthorized") {
    return (
      <ContentState
        description="레시피북을 보려면 로그인이 필요해요."
        eyebrow="레시피북 접근"
        safeBottomPadding
        title="이 화면은 로그인이 필요해요"
        tone="gate"
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              로그인하면 레시피북으로 바로 복귀해요.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
              저장한 레시피를 확인하고 관리할 수 있어요.
            </p>
          </div>
          <SocialLoginButtons
            nextPath={buildRecipeBookDetailHref({
              bookId,
              bookName: currentBookName,
              bookType,
            })}
          />
          <Link
            className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href={appReturn.href}
          >
            마이페이지로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  if (viewState === "loading") {
    if (!isMobileViewport) {
      return renderDesktopFrame(
        <div
          className="web-recipebook-detail-grid web-recipebook-detail-grid-loading"
          data-testid="recipebook-detail-skeleton"
        >
          {[1, 2, 3, 4].map((i) => (
            <div className="web-recipebook-detail-skeleton-card" key={i}>
              <Skeleton className="h-48 w-full rounded-[var(--web-r-md)]" />
              <Skeleton className="mt-4 h-5 w-32" />
              <Skeleton className="mt-2 h-4 w-24" />
            </div>
          ))}
        </div>,
        null,
      );
    }

    return (
      <RecipeBookDetailSkeleton
        backHref={appReturn.href}
        bookName={currentBookName}
        mobile={isMobileViewport}
      />
    );
  }

  if (viewState === "error") {
    if (!isMobileViewport) {
      return renderDesktopFrame(
        <div className="web-recipebook-detail-state" role="alert">
          <h2>{errorMessage}</h2>
          <p>잠시 후 다시 시도해 주세요.</p>
          <WebButton onClick={() => void loadRecipes()} variant="secondary">
            다시 시도
          </WebButton>
        </div>,
        0,
      );
    }

    return (
      <div className="pb-32">
        {renderDetailHeader()}
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            {errorMessage}
          </h2>
          <button
            className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--text-inverse)]"
            onClick={() => void loadRecipes()}
            type="button"
          >
            다시 시도
          </button>
        </div>
        {renderBookDeleteDialog()}
      </div>
    );
  }

  if (viewState === "empty") {
    if (!isMobileViewport) {
      return renderDesktopFrame(
        <div className="web-recipebook-detail-state">
          <h2>아직 이 레시피북에 레시피가 없어요</h2>
          <p>레시피를 추가하면 여기에 표시돼요.</p>
          <Link className="web-button web-button-secondary" href="/">
            레시피 둘러보기
          </Link>
        </div>,
        0,
      );
    }

    return (
      <div className="pb-32">
        {renderDetailHeader()}
        <ContentState
          className="mx-4 mt-8"
          description="레시피를 추가하면 여기에 표시돼요."
          title="아직 이 레시피북에 레시피가 없어요"
          tone="empty"
          variant="subtle"
        >
          <Link
            className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--brand)] px-5 py-3 text-sm font-semibold text-[var(--brand)]"
            href="/"
          >
            레시피 둘러보기
          </Link>
        </ContentState>
        {renderBookDeleteDialog()}
      </div>
    );
  }

  if (isMobileViewport) {
    return (
      <>
        <MobileRecipeBookDetailView
          backHref={appReturn.href}
          bookMenuOpen={bookMenuOpen}
          bookName={currentBookName}
          bookRenameOpen={bookRenameOpen}
          bookRenameValue={bookRenameValue}
          canManageBook={canManageBook}
          canRemove={canRemove}
          errorMessage={bookActionError}
          hasNext={hasNext}
          isLoadingMore={isLoadingMore}
          isSaving={isBookActionSaving}
          items={items}
          readerDetailsById={readerDetailsById}
          buildRecipeCookHref={buildRecipeCookHref}
          buildRecipeHref={buildRecipeDetailReturnHref}
          onDeleteRequest={handleBookDeleteRequest}
          onMenuToggle={() => setBookMenuOpen((current) => !current)}
          onPlannerAdd={(item) => void openPlannerAddSheet(item)}
          onRemove={handleRemoveRequest}
          onRenameCancel={handleBookRenameCancel}
          onRenameConfirm={() => void handleBookRename()}
          onRenameStart={handleBookRenameStart}
          onRenameValueChange={setBookRenameValue}
          onSave={(item) => void openSaveModal(item)}
          removeLabel={removeLabel}
          removingId={removingId}
          renderBookDeleteDialog={renderBookDeleteDialog}
          renderRecipeRemoveDialog={renderRecipeRemoveDialog}
          scrollSentinelRef={scrollSentinelRef}
          toast={toast}
        />
        {renderReaderActionModals()}
      </>
    );
  }

  const activeDesktopIndex = Math.max(
    0,
    items.findIndex((item) => item.recipe_id === activeDesktopRecipeId),
  );
  const activeDesktopItem = items[activeDesktopIndex] ?? items[0];

  if (!activeDesktopItem) {
    return renderDesktopFrame(
      <div className="web-recipebook-detail-state">
        <h2>아직 이 레시피북에 레시피가 없어요</h2>
        <p>레시피를 추가하면 여기에 표시돼요.</p>
        <Link className="web-button web-button-secondary" href="/">
          레시피 둘러보기
        </Link>
      </div>,
      0,
    );
  }

  return renderDesktopFrame(
    <DesktopRecipeBookReader
      activeIndex={activeDesktopIndex}
      activeItem={activeDesktopItem}
      bookName={currentBookName}
      buildRecipeCookHref={buildRecipeCookHref}
      buildRecipeHref={buildRecipeDetailReturnHref}
      canRemove={canRemove}
      items={items}
      readerDetailsById={readerDetailsById}
      mode={desktopReaderMode}
      onModeChange={setDesktopReaderMode}
      onPlannerAdd={(item) => void openPlannerAddSheet(item)}
      onRemove={handleRemoveRequest}
      onSave={(item) => void openSaveModal(item)}
      onSelectRecipe={setActiveDesktopRecipeId}
      removeLabel={removeLabel}
      removingId={removingId}
    >
      {isLoadingMore ? (
        <div className="flex justify-center py-4">
          <Skeleton className="h-5 w-32" />
        </div>
      ) : null}
      {hasNext ? <div ref={scrollSentinelRef} className="h-4" /> : null}
    </DesktopRecipeBookReader>,
    items.length,
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DesktopRecipeBookRail({
  activeRecipeId,
  bookCoverColorKey,
  bookCoverImageSrc,
  bookId,
  bookName,
  bookType,
  hasNext,
  items,
  onSelectRecipe,
  recipeCount,
}: {
  activeRecipeId: string | null;
  bookCoverColorKey?: RecipeBookCoverColorKey | null;
  bookCoverImageSrc?: string | null;
  bookId: string;
  bookName: string;
  bookType: RecipeBookType;
  hasNext: boolean;
  items: RecipeBookRecipeItem[];
  onSelectRecipe: (recipeId: string) => void;
  recipeCount: number | null;
}) {
  const coverItem = items[0];
  const loadedImageSrc =
    bookCoverImageSrc === undefined
      ? coverItem
        ? getRecipeBookItemImage(coverItem)
        : null
      : bookCoverImageSrc;
  const coverViewModel = getRecipeBookCoverViewModel(
    {
      id: bookId,
      name: bookName,
      book_type: bookType,
      recipe_count: recipeCount ?? items.length,
      sort_order: 0,
      cover_color_key: bookCoverColorKey ?? null,
      cover_image_url:
        bookCoverImageSrc === undefined ? null : bookCoverImageSrc,
    },
    { loadedImageSrc },
  );
  const safeCoverImageSrc = coverViewModel.imageSrc.replace(/"/g, "%22");

  return (
    <aside
      className="web-recipebook-detail-rail"
      data-testid="recipebook-detail-toc"
    >
      <div
        className={`web-recipebook-detail-cover web-recipebook-detail-cover-${coverViewModel.tone}`}
        data-testid="recipebook-detail-cover"
      >
        <span
          className="web-recipebook-detail-cover-image"
          aria-hidden="true"
          data-testid="recipebook-detail-cover-image"
          style={{ backgroundImage: `url("${safeCoverImageSrc}")` }}
        />
        <strong>{bookName}</strong>
        <span>{recipeCount === null ? "불러오는 중" : `${recipeCount}개 레시피`}</span>
      </div>
      <nav className="web-recipebook-toc" aria-label={`${bookName} 목차`}>
        <h2>목차</h2>
        {items.length > 0 ? (
          <ol>
            {items.map((item, index) => (
              <li key={item.recipe_id}>
                <button
                  aria-current={
                    item.recipe_id === activeRecipeId ? "page" : undefined
                  }
                  className={
                    item.recipe_id === activeRecipeId
                      ? "web-recipebook-toc-button web-recipebook-toc-button-active"
                      : "web-recipebook-toc-button"
                  }
                  onClick={() => onSelectRecipe(item.recipe_id)}
                  type="button"
                >
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>{item.title}</span>
                  <em>{String(index + 1).padStart(2, "0")}쪽</em>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>레시피가 담기면 목차가 표시돼요.</p>
        )}
        {hasNext ? (
          <p className="web-recipebook-toc-more">
            아래로 스크롤하면 더 많은 레시피를 이어서 불러와요.
          </p>
        ) : null}
      </nav>
    </aside>
  );
}

function DesktopBookRenameDialog({
  disabled,
  errorMessage,
  onCancel,
  onConfirm,
  onValueChange,
  value,
}: {
  disabled: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog aria-labelledby="recipebook-rename-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="recipebook-rename-title">
            레시피북 이름 변경
          </WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={disabled} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <label className="web-form-label" htmlFor="recipebook-rename-input">
            새 이름
          </label>
          <input
            autoFocus
            className="web-form-input"
            disabled={disabled}
            id="recipebook-rename-input"
            maxLength={50}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onConfirm();
              if (event.key === "Escape") onCancel();
            }}
            value={value}
          />
          {errorMessage ? (
            <p className="web-form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton disabled={disabled} onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton disabled={disabled || !value.trim()} onClick={onConfirm}>
            {disabled ? "저장 중..." : "완료"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

interface DetailHeaderProps {
  backHref?: string;
  bookName: string;
  canManageBook?: boolean;
  isMenuOpen?: boolean;
  isRenaming?: boolean;
  isSaving?: boolean;
  renameValue?: string;
  errorMessage?: string | null;
  onMenuToggle?: () => void;
  onRenameStart?: () => void;
  onRenameCancel?: () => void;
  onRenameConfirm?: () => void;
  onRenameValueChange?: (value: string) => void;
  onDeleteRequest?: () => void;
}

function DetailHeader({
  backHref = "/mypage",
  bookName,
  canManageBook = false,
  isMenuOpen = false,
  isRenaming = false,
  isSaving = false,
  renameValue = "",
  errorMessage = null,
  onMenuToggle,
  onRenameStart,
  onRenameCancel,
  onRenameConfirm,
  onRenameValueChange,
  onDeleteRequest,
}: DetailHeaderProps) {
  return (
      <div
        className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-[var(--shadow-1)]"
        data-testid="recipebook-detail-header"
      >
      <Link
        aria-label="뒤로 가기"
        className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full"
        href={backHref}
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6 text-[var(--text-2)]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            d="M15 19l-7-7 7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      {isRenaming ? (
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <input
              aria-label="레시피북 이름"
              className="min-h-[var(--control-height-md)] min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--surface-fill)] px-3 text-base font-semibold text-[var(--foreground)] outline-none"
              disabled={isSaving}
              maxLength={50}
              onChange={(event) => onRenameValueChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRenameConfirm?.();
                if (event.key === "Escape") onRenameCancel?.();
              }}
              value={renameValue}
            />
            <button
              className="flex min-h-[var(--control-height-md)] shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-3 text-sm font-bold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={isSaving || !renameValue.trim()}
              onClick={onRenameConfirm}
              type="button"
            >
              {isSaving ? "저장 중..." : "완료"}
            </button>
            <button
              className="flex min-h-[var(--control-height-md)] shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-sm font-semibold text-[var(--text-2)] disabled:opacity-50"
              disabled={isSaving}
              onClick={onRenameCancel}
              type="button"
            >
              취소
            </button>
          </div>
          {errorMessage ? (
            <p className="mt-1 text-xs font-semibold text-[var(--danger)]">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-[-0.3px] text-[var(--foreground)]">
            {bookName}
          </h1>
          {canManageBook ? (
            <div className="relative">
              <button
                aria-controls="recipebook-detail-book-menu"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label={`${bookName} 옵션 메뉴`}
                className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
                onClick={onMenuToggle}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>
              {isMenuOpen ? (
                <div
                  id="recipebook-detail-book-menu"
                  className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-2)]"
                  role="menu"
                >
                  <button
                    className="flex w-full items-center px-4 py-3 text-base font-medium text-[var(--foreground)] hover:bg-[var(--surface-fill)]"
                    onClick={onRenameStart}
                    role="menuitem"
                    type="button"
                  >
                    이름 변경
                  </button>
                  <div className="border-t border-[var(--line)]" />
                  <button
                    className="flex w-full items-center px-4 py-3 text-base font-medium text-[var(--danger)] hover:bg-[var(--surface-fill)]"
                    onClick={onDeleteRequest}
                    role="menuitem"
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function BookDeleteConfirmDialog({
  bookName,
  disabled,
  errorMessage,
  mobile = false,
  onCancel,
  onConfirm,
}: {
  bookName: string;
  disabled: boolean;
  errorMessage: string | null;
  mobile?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (mobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]">
        <div
          aria-describedby="recipebook-delete-description"
          aria-labelledby="recipebook-delete-title"
          aria-modal="true"
          className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_28px_var(--shadow-color-heavy)]"
          role="alertdialog"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--line-strong)] min-[390px]:hidden"
          />
          <h2
            className="text-[18px] font-extrabold leading-[1.35] text-[var(--foreground)]"
            id="recipebook-delete-title"
          >
            이 레시피북을 삭제할까요?
          </h2>
          <p
            className="mt-4 text-[13px] font-medium leading-[1.45] text-[var(--text-2)]"
            id="recipebook-delete-description"
          >
            레시피북 안의 레시피는 삭제되지 않아요.
          </p>
          {errorMessage ? (
            <p
              className="mt-3 rounded-[var(--radius-control)] bg-[var(--danger-soft)] px-3 py-2 text-[13px] font-bold text-[var(--danger)]"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)] disabled:opacity-50"
              disabled={disabled}
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--danger)] text-[14px] font-extrabold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={disabled}
              onClick={onConfirm}
              type="button"
            >
              {disabled ? "삭제 중..." : "삭제하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog
        aria-describedby="recipebook-delete-description"
        aria-labelledby="recipebook-delete-title"
        className="web-confirm-dialog"
        role="alertdialog"
        size="narrow"
      >
        <WebDialogHeader>
          <WebDialogTitle id="recipebook-delete-title">
            레시피북을 삭제할까요?
          </WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={disabled} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-confirm-body">
            <span aria-hidden="true" className="web-confirm-icon web-confirm-icon-danger">
              !
            </span>
            <p className="web-confirm-copy" id="recipebook-delete-description">
              &ldquo;{bookName}&rdquo;을 삭제하면 되돌릴 수 없어요.
            </p>
          </div>
          {errorMessage ? (
            <p className="web-form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton disabled={disabled} onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            className="web-confirm-danger"
            disabled={disabled}
            onClick={onConfirm}
          >
            {disabled ? "삭제 중..." : "삭제"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function RecipeRemoveConfirmDialog({
  disabled,
  mobile = false,
  onCancel,
  onConfirm,
  recipeTitle,
  removeLabel,
}: {
  disabled: boolean;
  mobile?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  recipeTitle: string;
  removeLabel: string;
}) {
  if (mobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]">
        <div
          aria-describedby="recipe-remove-description"
          aria-labelledby="recipe-remove-title"
          aria-modal="true"
          className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_28px_var(--shadow-color-heavy)]"
          role="alertdialog"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--line-strong)] min-[390px]:hidden"
          />
          <h2
            className="text-[18px] font-extrabold leading-[1.35] text-[var(--foreground)]"
            id="recipe-remove-title"
          >
            레시피를 제거할까요?
          </h2>
          <p
            className="mt-4 text-[13px] font-medium leading-[1.45] text-[var(--text-2)]"
            id="recipe-remove-description"
          >
            &ldquo;{recipeTitle}&rdquo;을 이 레시피북에서 제거해요.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)] disabled:opacity-50"
              disabled={disabled}
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--danger)] text-[14px] font-extrabold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={disabled}
              onClick={onConfirm}
              type="button"
            >
              {disabled ? "처리 중..." : removeLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog
        aria-describedby="recipe-remove-description"
        aria-labelledby="recipe-remove-title"
        className="web-confirm-dialog"
        role="alertdialog"
        size="narrow"
      >
        <WebDialogHeader>
          <WebDialogTitle id="recipe-remove-title">
            레시피를 제거할까요?
          </WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={disabled} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-confirm-body">
            <span aria-hidden="true" className="web-confirm-icon web-confirm-icon-danger">
              !
            </span>
            <p className="web-confirm-copy" id="recipe-remove-description">
              &ldquo;{recipeTitle}&rdquo;을 이 레시피북에서 제거해요.
            </p>
          </div>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton disabled={disabled} onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            className="web-confirm-danger"
            disabled={disabled}
            onClick={onConfirm}
          >
            {disabled ? "처리 중..." : removeLabel}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function MobileRecipeBookDetailView({
  backHref,
  buildRecipeCookHref,
  buildRecipeHref,
  bookMenuOpen,
  bookName,
  bookRenameOpen,
  bookRenameValue,
  canManageBook,
  canRemove,
  errorMessage,
  hasNext,
  isLoadingMore,
  isSaving,
  items,
  readerDetailsById,
  onDeleteRequest,
  onMenuToggle,
  onPlannerAdd,
  onRemove,
  onRenameCancel,
  onRenameConfirm,
  onRenameStart,
  onRenameValueChange,
  onSave,
  removeLabel,
  removingId,
  renderBookDeleteDialog,
  renderRecipeRemoveDialog,
  scrollSentinelRef,
  toast,
}: {
  backHref: string;
  buildRecipeCookHref: (
    item: RecipeBookRecipeItem,
    readerDetailState?: ReaderDetailState,
  ) => string;
  buildRecipeHref: (recipeId: string) => string;
  bookMenuOpen: boolean;
  bookName: string;
  bookRenameOpen: boolean;
  bookRenameValue: string;
  canManageBook: boolean;
  canRemove: boolean;
  errorMessage: string | null;
  hasNext: boolean;
  isLoadingMore: boolean;
  isSaving: boolean;
  items: RecipeBookRecipeItem[];
  readerDetailsById: Record<string, ReaderDetailState>;
  onDeleteRequest: () => void;
  onMenuToggle: () => void;
  onPlannerAdd: (item: RecipeBookRecipeItem) => void;
  onRemove: (recipeId: string) => void;
  onRenameCancel: () => void;
  onRenameConfirm: () => void;
  onRenameStart: () => void;
  onRenameValueChange: (value: string) => void;
  onSave: (item: RecipeBookRecipeItem) => void;
  removeLabel: string;
  removingId: string | null;
  renderBookDeleteDialog: () => React.ReactNode;
  renderRecipeRemoveDialog: () => React.ReactNode;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
  toast: { message: string; tone: "success" | "error" } | null;
}) {
  const [activeRecipeId, setActiveRecipeId] = useState(items[0]?.recipe_id ?? null);
  const [readerMode, setReaderMode] = useState<"book" | "list">("book");
  const [isTocOpen, setIsTocOpen] = useState(false);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.recipe_id === activeRecipeId),
  );
  const activeItem = items[activeIndex] ?? items[0];
  const activeReaderDetailState = activeItem
    ? readerDetailsById[activeItem.recipe_id]
    : undefined;
  const visibleItems = readerMode === "list" ? items : activeItem ? [activeItem] : [];

  useEffect(() => {
    if (!items.some((item) => item.recipe_id === activeRecipeId)) {
      setActiveRecipeId(items[0]?.recipe_id ?? null);
    }
  }, [activeRecipeId, items]);

  const handleModeChange = useCallback((mode: "book" | "list") => {
    setReaderMode(mode);
    if (mode === "list") {
      setIsTocOpen(false);
    }
  }, []);

  const handleSelectRecipe = useCallback((recipeId: string) => {
    setActiveRecipeId(recipeId);
  }, []);

  const handleSelectRecipeFromToc = useCallback(
    (recipeId: string) => {
      handleSelectRecipe(recipeId);
      setIsTocOpen(false);
    },
    [handleSelectRecipe],
  );

  const handlePreviousRecipe = useCallback(() => {
    const previousItem = items[activeIndex - 1];
    if (previousItem) {
      setActiveRecipeId(previousItem.recipe_id);
    }
  }, [activeIndex, items]);

  const handleNextRecipe = useCallback(() => {
    const nextItem = items[activeIndex + 1];
    if (nextItem) {
      setActiveRecipeId(nextItem.recipe_id);
    }
  }, [activeIndex, items]);

  return (
    <div
      className="mobile-recipebook-detail-diary-screen pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden"
      data-testid="recipebook-detail-mobile"
    >
      <MobileRecipeBookAppBar
        backHref={backHref}
        bookName={bookName}
        canManageBook={canManageBook}
        isMenuOpen={bookMenuOpen}
        onDeleteRequest={onDeleteRequest}
        onMenuToggle={onMenuToggle}
        onRenameStart={onRenameStart}
      />
      <div className="flex justify-end px-4 pt-3">
        <MobileRecipeBookModeToggle
          mode={readerMode}
          onModeChange={handleModeChange}
        />
      </div>
      {readerMode === "book" && activeItem ? (
        <MobileRecipeBookBookToolbar
          activeIndex={activeIndex}
          activeTitle={activeItem.title}
          itemCount={items.length}
          onOpenToc={() => setIsTocOpen(true)}
        />
      ) : null}

      <div
        aria-live="polite"
        className="p-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3"
        data-testid="recipebook-detail-list"
      >
        <div className={readerMode === "list" ? "grid gap-4" : undefined}>
          {visibleItems.map((item) => {
            const itemIndex = Math.max(
              0,
              items.findIndex((candidate) => candidate.recipe_id === item.recipe_id),
            );
            const readerDetailState =
              item.recipe_id === activeItem?.recipe_id
                ? activeReaderDetailState
                : readerDetailsById[item.recipe_id];

            return readerMode === "list" ? (
              <MobileRecipeBookListCard
                item={item}
                key={item.recipe_id}
                pageNumber={itemIndex + 1}
                recipeHref={buildRecipeHref(item.recipe_id)}
              />
            ) : (
              <MobileRecipeBookRecipeCard
                canRemove={canRemove}
                item={item}
                key={item.recipe_id}
                onPlannerAdd={() => onPlannerAdd(item)}
                onRemove={() => onRemove(item.recipe_id)}
                onSave={() => onSave(item)}
                pageNumber={itemIndex + 1}
                pageCount={items.length}
                recipeHref={buildRecipeCookHref(item, readerDetailState)}
                readerDetailState={readerDetailState}
                removeLabel={removeLabel}
                removing={removingId === item.recipe_id}
                canGoPrevious={activeIndex > 0}
                canGoNext={activeIndex < items.length - 1}
                onPreviousRecipe={handlePreviousRecipe}
                onNextRecipe={handleNextRecipe}
              />
            );
          })}
        </div>
      </div>
      {isLoadingMore ? (
        <div className="flex justify-center py-4">
          <Skeleton className="h-5 w-32" />
        </div>
      ) : null}
      {hasNext ? <div ref={scrollSentinelRef} className="h-4" /> : null}
      {toast ? (
        <div
          className={[
            "fixed inset-x-4 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-[var(--radius-control)] px-4 py-3 text-center text-[13px] font-extrabold shadow-lg",
            toast.tone === "success"
              ? "bg-[var(--success-soft)] text-[var(--success-strong)]"
              : "bg-[var(--danger-soft)] text-[var(--danger)]",
          ].join(" ")}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
      {bookRenameOpen ? (
        <MobileRecipeBookRenameSheet
          disabled={isSaving}
          errorMessage={errorMessage}
          onCancel={onRenameCancel}
          onConfirm={onRenameConfirm}
          onValueChange={onRenameValueChange}
          value={bookRenameValue}
        />
      ) : null}
      {isTocOpen ? (
        <MobileRecipeBookTocSheet
          activeRecipeId={activeItem?.recipe_id ?? null}
          bookName={bookName}
          items={items}
          onClose={() => setIsTocOpen(false)}
          onSelectRecipe={handleSelectRecipeFromToc}
        />
      ) : null}
      {renderBookDeleteDialog()}
      {renderRecipeRemoveDialog()}
      <Wave1MobileBottomTab
        ariaLabel="레시피북 상세 하단 탭"
        currentTab="mypage"
      />
    </div>
  );
}

function MobileRecipeBookBookToolbar({
  activeIndex,
  activeTitle,
  itemCount,
  onOpenToc,
}: {
  activeIndex: number;
  activeTitle: string;
  itemCount: number;
  onOpenToc: () => void;
}) {
  return (
    <section className="px-4 pt-3" data-testid="recipebook-detail-header">
      <div className="mobile-recipebook-book-toolbar grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-[18px] px-3 py-2.5">
        <button
          aria-haspopup="dialog"
          aria-label="목차 열기"
          className="mobile-recipebook-toc-trigger inline-flex h-11 items-center gap-2 rounded-[14px] px-3 text-[12px] font-bold"
          data-testid="recipebook-mobile-toc-trigger"
          onClick={onOpenToc}
          type="button"
        >
          <span>목차</span>
          <span aria-hidden="true">{activeIndex + 1} / {itemCount}</span>
        </button>
        <p className="truncate text-right text-[12px] font-semibold text-[var(--text-3)]">
          {activeTitle}
        </p>
      </div>
    </section>
  );
}

function MobileRecipeBookAppBar({
  backHref,
  bookName,
  canManageBook,
  isMenuOpen,
  onDeleteRequest,
  onMenuToggle,
  onRenameStart,
}: {
  backHref: string;
  bookName: string;
  canManageBook: boolean;
  isMenuOpen: boolean;
  onDeleteRequest: () => void;
  onMenuToggle: () => void;
  onRenameStart: () => void;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center justify-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <Link
        aria-label="뒤로 가기"
        className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--foreground)]"
        href={backHref}
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.3"
          viewBox="0 0 24 24"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
      <h1 className="max-w-[190px] truncate text-center text-[18px] font-extrabold leading-none text-[var(--brand)] min-[390px]:max-w-[230px]">
        {bookName}
      </h1>
      {canManageBook ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <button
            aria-controls="recipebook-detail-book-menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`${bookName} 옵션 메뉴`}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[18px] font-bold leading-none text-[var(--text-3)]"
            onClick={onMenuToggle}
            type="button"
          >
            ⋯
          </button>
          {isMenuOpen ? (
            <div
              className="absolute right-0 top-full z-40 mt-2 w-36 overflow-hidden rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_8px_22px_var(--shadow-color-panel)]"
              id="recipebook-detail-book-menu"
              role="menu"
            >
              <button
                className="flex w-full items-center px-4 py-3 text-[14px] font-bold text-[var(--foreground)]"
                onClick={onRenameStart}
                role="menuitem"
                type="button"
              >
                이름 변경
              </button>
              <div className="border-t border-[var(--line-strong)]" />
              <button
                className="flex w-full items-center px-4 py-3 text-[14px] font-bold text-[var(--danger)]"
                onClick={onDeleteRequest}
                role="menuitem"
                type="button"
              >
                삭제
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MobileRecipeBookModeToggle({
  mode,
  onModeChange,
}: {
  mode: "book" | "list";
  onModeChange: (mode: "book" | "list") => void;
}) {
  return (
    <div
      aria-label="상세 보기 방식"
      className="mobile-recipebook-detail-mode-toggle grid w-[132px] grid-cols-2 rounded-[16px] p-1"
      role="group"
    >
      <button
        className={mode === "book" ? "is-active" : undefined}
        onClick={() => onModeChange("book")}
        type="button"
      >
        책
      </button>
      <button
        className={mode === "list" ? "is-active" : undefined}
        onClick={() => onModeChange("list")}
        type="button"
      >
        목록
      </button>
    </div>
  );
}

function MobileRecipeBookTocSheet({
  activeRecipeId,
  bookName,
  items,
  onClose,
  onSelectRecipe,
}: {
  activeRecipeId: string | null;
  bookName: string;
  items: RecipeBookRecipeItem[];
  onClose: () => void;
  onSelectRecipe: (recipeId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]">
      <button
        aria-label="목차 닫기"
        className="absolute inset-0"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label={`${bookName} 목차`}
        aria-modal="true"
        className="mobile-recipebook-toc-sheet relative w-full rounded-t-[24px] px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4"
        role="dialog"
      >
        <div className="mobile-toc-head">
          <div>
            <h2>목차</h2>
            <span>{bookName} · {items.length}개 레시피</span>
          </div>
          <button
            aria-label="목차 닫기"
            className="mobile-recipebook-toc-close grid h-11 w-11 place-items-center rounded-full text-[20px] font-bold"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <nav
          className="mobile-toc-list mobile-recipebook-toc-scroll"
          aria-label={`${bookName} 목차`}
        >
          {items.map((item, index) => (
            <button
              aria-current={item.recipe_id === activeRecipeId ? "page" : undefined}
              className={[
                "mobile-toc-row",
                item.recipe_id === activeRecipeId
                  ? "is-active mobile-recipebook-detail-page-button-active"
                  : "mobile-recipebook-detail-page-button",
              ].join(" ")}
              data-testid={`recipebook-mobile-toc-card-${item.recipe_id}`}
              key={item.recipe_id}
              onClick={() => onSelectRecipe(item.recipe_id)}
              type="button"
            >
              <span className="mobile-toc-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mobile-toc-title">{item.title}</span>
              <span className="mobile-toc-page">{index + 1}쪽</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

function MobileRecipeBookRecipeCard({
  canGoNext = false,
  canGoPrevious = false,
  canRemove,
  item,
  onNextRecipe,
  onPlannerAdd,
  pageNumber,
  pageCount,
  recipeHref,
  readerDetailState,
  onRemove,
  onPreviousRecipe,
  onSave,
  removeLabel,
  removing,
}: RecipeItemCardProps & {
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  onNextRecipe?: () => void;
  onPreviousRecipe?: () => void;
  pageCount?: number;
  readerDetailState?: ReaderDetailState;
}) {
  const imageSrc = getRecipeBookItemImage(item);
  const metaItems = [
    typeof item.base_servings === "number" ? `${item.base_servings}인분` : null,
    ...item.tags,
  ].filter((metaItem): metaItem is string => Boolean(metaItem));

  return (
    <article
      className="mobile-recipebook-page-card scroll-mt-16 overflow-hidden rounded-[26px]"
      data-testid={`recipe-item-${item.recipe_id}`}
      id={`recipebook-recipe-${item.recipe_id}`}
    >
      <div className="relative">
        <Image
          alt={item.title}
          className="h-[168px] w-full object-cover"
          height={476}
          src={imageSrc}
          unoptimized
          width={720}
        />
        <span className="mobile-recipebook-detail-page-number absolute bottom-3 left-3 rounded-full px-3 py-1 text-[11px] font-black text-[var(--foreground)]">
          {String(pageNumber ?? 1).padStart(2, "0")}쪽
        </span>
        {canRemove ? (
          <button
            aria-label={`${item.title} ${removeLabel}`}
            className="mobile-recipebook-recipe-remove-icon absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full disabled:opacity-60"
            disabled={removing}
            onClick={onRemove}
            type="button"
          >
            <RecipeBookTrashIcon />
          </button>
        ) : null}
      </div>
      <div className="grid gap-3.5 p-4">
        <div>
          <h2 className="text-[22px] font-bold leading-[1.18] text-[var(--foreground)]">
            {item.title}
          </h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {metaItems.map((metaItem) => (
              <span
                className="mobile-recipebook-detail-meta-badge rounded-full px-2.5 py-1 text-[11px] font-semibold"
                key={metaItem}
              >
                {metaItem}
              </span>
            ))}
          </div>
        </div>
        <div
          className="mobile-recipebook-note-stack grid grid-cols-1 gap-3"
          data-testid={`mobile-recipebook-note-stack-${item.recipe_id}`}
        >
          <section className="mobile-recipebook-detail-note-warm rounded-[18px] p-3">
            <h3 className="text-[12px] font-bold text-[var(--foreground)]">
              재료
            </h3>
            <ReaderIngredientsContent
              detailState={readerDetailState}
              mobile
            />
          </section>
          <section className="mobile-recipebook-detail-note-cool rounded-[18px] p-3">
            <h3 className="text-[12px] font-bold text-[var(--foreground)]">
              만들기
            </h3>
            <ReaderStepsContent
              detailState={readerDetailState}
              mobile
            />
          </section>
        </div>
        {pageCount && pageCount > 1 ? (
          <div
            aria-label="레시피 페이지 이동"
            className="mobile-recipebook-page-nav grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-[16px] p-2"
            data-testid="recipebook-mobile-page-nav"
            role="group"
          >
            <button
              aria-label="이전 레시피"
              className="grid h-11 w-full place-items-center rounded-[12px] text-[22px] font-bold disabled:opacity-45"
              disabled={!canGoPrevious}
              onClick={onPreviousRecipe}
              type="button"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <span className="mobile-recipebook-page-count text-center text-[12px] font-bold">
              {pageNumber ?? 1} / {pageCount}
            </span>
            <button
              aria-label="다음 레시피"
              className="grid h-11 w-full place-items-center rounded-[12px] text-[22px] font-bold disabled:opacity-45"
              disabled={!canGoNext}
              onClick={onNextRecipe}
              type="button"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-[52px_minmax(0,1fr)_52px] gap-2">
          <button
            aria-label="저장하기"
            className="mobile-recipebook-detail-save-button flex h-11 items-center justify-center rounded-[16px] text-[13px] font-bold"
            onClick={onSave}
            type="button"
          >
            <BookmarkIcon />
            <span className="sr-only">저장하기</span>
          </button>
          <Link
            className="mobile-recipebook-detail-cook-button flex h-11 items-center justify-center rounded-[16px] text-[13px] font-bold"
            href={recipeHref}
          >
            요리하기
          </Link>
          <button
            aria-label="플래너에 추가"
            className="mobile-recipebook-detail-calendar-button mobile-recipebook-detail-calendar-button-secondary flex h-11 items-center justify-center rounded-[16px] text-[13px] font-bold"
            onClick={onPlannerAdd}
            type="button"
          >
            <CalendarIcon />
            <span className="sr-only">플래너에 추가</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function MobileRecipeBookListCard({
  item,
  pageNumber,
  recipeHref,
}: Pick<RecipeItemCardProps, "item" | "pageNumber" | "recipeHref">) {
  const imageSrc = getRecipeBookItemImage(item);
  const metaItems = [
    item.tags.length > 0 ? item.tags.join(" · ") : null,
    item.total_duration_text ?? null,
    typeof item.base_servings === "number" ? `${item.base_servings}인분` : null,
  ].filter((metaItem): metaItem is string => Boolean(metaItem));

  return (
    <article
      className="mobile-recipebook-list-card rounded-[22px]"
      data-testid={`recipebook-mobile-list-card-${item.recipe_id}`}
    >
      <Link className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 p-3" href={recipeHref}>
        <Image
          alt={item.title}
          className="h-[86px] w-[86px] rounded-[16px] object-cover"
          height={172}
          src={imageSrc}
          unoptimized
          width={172}
        />
        <div className="grid min-w-0 content-center gap-2">
          <span className="mobile-recipebook-detail-page-number inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold text-[var(--foreground)]">
            {String(pageNumber ?? 1).padStart(2, "0")}쪽
          </span>
          <h2 className="line-clamp-2 text-[17px] font-bold leading-[1.2] text-[var(--foreground)]">
            {item.title}
          </h2>
          {metaItems.length > 0 ? (
            <p className="line-clamp-1 text-[12px] font-medium text-[var(--text-3)]">
              {metaItems.join(" · ")}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

function MobileRecipeBookRenameSheet({
  disabled,
  errorMessage,
  onCancel,
  onConfirm,
  onValueChange,
  value,
}: {
  disabled: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]">
      <div
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_28px_var(--shadow-color-heavy)]"
        role="dialog"
      >
        <h2 className="text-[18px] font-extrabold text-[var(--foreground)]">
          레시피북 이름 변경
        </h2>
        <input
          aria-label="레시피북 이름"
          className="mt-4 h-[var(--control-height-lg)] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-3 text-[15px] font-bold text-[var(--foreground)] outline-none focus:border-[var(--brand)]"
          disabled={disabled}
          maxLength={50}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm();
            if (event.key === "Escape") onCancel();
          }}
          value={value}
        />
        {errorMessage ? (
          <p className="mt-2 text-[13px] font-bold text-[var(--danger)]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="h-[var(--control-height-md)] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)] disabled:opacity-50"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-[var(--control-height-md)] rounded-[var(--radius-control)] bg-[var(--brand)] text-[14px] font-extrabold text-[var(--text-inverse)] disabled:opacity-50"
            disabled={disabled || !value.trim()}
            onClick={onConfirm}
            type="button"
          >
            {disabled ? "저장 중..." : "완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getRecipeThumbColor(title: string) {
  if (title.includes("샐러드")) return "var(--accent-green-soft)";
  if (title.includes("제육") || title.includes("고기")) return "var(--danger-border)";
  if (title.includes("볶음밥") || title.includes("밥")) return "var(--accent-peach)";
  return "var(--surface-subtle)";
}

function getRecipeBookItemImage(item: RecipeBookRecipeItem) {
  return resolveRecipeImage({
    id: item.recipe_id,
    thumbnail_url: item.thumbnail_url,
  });
}

function mergeUniqueRecipeItems(
  currentItems: RecipeBookRecipeItem[],
  nextItems: RecipeBookRecipeItem[],
) {
  const seen = new Set(currentItems.map((item) => item.recipe_id));
  const uniqueNextItems = nextItems.filter((item) => {
    if (seen.has(item.recipe_id)) {
      return false;
    }

    seen.add(item.recipe_id);
    return true;
  });

  return [...currentItems, ...uniqueNextItems];
}

function RecipeBookDetailSkeleton({
  backHref = "/mypage",
  bookName,
  mobile = false,
}: {
  backHref?: string;
  bookName: string;
  mobile?: boolean;
}) {
  if (mobile) {
    return (
      <div
        className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden"
        data-testid="recipebook-detail-mobile-loading"
      >
        <MobileRecipeBookAppBar
          backHref={backHref}
          bookName={bookName}
          canManageBook={false}
          isMenuOpen={false}
          onDeleteRequest={() => {}}
          onMenuToggle={() => {}}
          onRenameStart={() => {}}
        />
        <div className="flex justify-end px-4 pt-3">
          <div className="mobile-recipebook-detail-mode-toggle grid w-[132px] grid-cols-2 gap-1 rounded-[16px] p-1">
            <Skeleton className="h-9 rounded-[12px]" />
            <Skeleton className="h-9 rounded-[12px]" />
          </div>
        </div>
        <section className="px-4 pt-3">
          <div className="mobile-recipebook-book-toolbar grid grid-cols-[86px_minmax(0,1fr)] items-center gap-2 rounded-[18px] px-3 py-2.5">
            <Skeleton className="h-11 rounded-[14px]" />
            <div className="flex justify-end">
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
        </section>
        <div className="p-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-3">
          <div className="mobile-recipebook-page-card overflow-hidden rounded-[26px]">
            <Skeleton className="h-[168px] w-full rounded-none" />
            <div className="grid gap-3.5 p-4">
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="mobile-recipebook-detail-note-warm rounded-[18px] p-3">
                  <Skeleton className="h-4 w-10" />
                  <ReaderSectionSkeleton mobile />
                </div>
                <div className="mobile-recipebook-detail-note-cool rounded-[18px] p-3">
                  <Skeleton className="h-4 w-12" />
                  <ReaderSectionSkeleton mobile />
                </div>
              </div>
              <div
                className="mobile-recipebook-page-nav grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-[16px] p-2"
                data-testid="recipebook-detail-mobile-loading-page-nav"
              >
                <Skeleton className="h-11 rounded-[12px]" />
                <Skeleton className="h-4 w-16 justify-self-center" />
                <Skeleton className="h-11 rounded-[12px]" />
              </div>
              <div className="grid grid-cols-[52px_minmax(0,1fr)_52px] gap-2">
                <Skeleton className="h-11 rounded-[16px]" />
                <Skeleton className="h-11 rounded-[16px]" />
                <Skeleton className="h-11 rounded-[16px]" />
              </div>
            </div>
          </div>
        </div>
        <Wave1MobileBottomTab
          ariaLabel="레시피북 상세 하단 탭"
          currentTab="mypage"
        />
      </div>
    );
  }

  return (
    <div className="pb-32" data-testid="recipebook-detail-skeleton">
      <DetailHeader bookName={bookName} />
      <div className="space-y-2 px-4 pt-4 max-[360px]:space-y-1 max-[360px]:pt-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)]"
          >
            <Skeleton className="h-16 w-16 shrink-0 rounded-[var(--radius-md)]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RecipeItemCardProps {
  item: RecipeBookRecipeItem;
  canRemove: boolean;
  pageNumber?: number;
  recipeHref: string;
  removeLabel: string;
  removing: boolean;
  onPlannerAdd?: () => void;
  onRemove: () => void;
  onSave?: () => void;
}

function RecipeItemCard({
  item,
  canRemove,
  pageNumber,
  recipeHref,
  removeLabel,
  removing,
  onRemove,
}: RecipeItemCardProps) {
  return (
    <div
      className="web-recipebook-detail-card"
      data-testid={`recipe-item-${item.recipe_id}`}
      id={`recipebook-recipe-${item.recipe_id}`}
    >
      <Link href={recipeHref}>
        <WebRecipeCard
          alt={item.title}
          badge={pageNumber ? `${String(pageNumber).padStart(2, "0")}쪽` : undefined}
          imageSrc={getRecipeBookItemImage(item)}
          meta={[
            item.tags.length > 0 ? item.tags.join(" · ") : null,
            item.total_duration_text ?? null,
            typeof item.base_servings === "number" ? `${item.base_servings}인분` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          title={item.title}
        />
      </Link>
      {canRemove ? (
        <button
          aria-label={`${item.title} ${removeLabel}`}
          className="web-recipebook-detail-remove"
          disabled={removing}
          onClick={onRemove}
          type="button"
        >
          {removing ? "처리 중..." : removeLabel}
        </button>
      ) : null}
    </div>
  );
}

function DesktopRecipeBookReader({
  activeIndex,
  activeItem,
  bookName,
  buildRecipeHref,
  buildRecipeCookHref,
  canRemove,
  children,
  items,
  mode,
  onModeChange,
  onPlannerAdd,
  onRemove,
  onSave,
  onSelectRecipe,
  readerDetailsById,
  removeLabel,
  removingId,
}: {
  activeIndex: number;
  activeItem: RecipeBookRecipeItem;
  bookName: string;
  buildRecipeCookHref: (
    item: RecipeBookRecipeItem,
    readerDetailState?: ReaderDetailState,
  ) => string;
  buildRecipeHref: (recipeId: string) => string;
  canRemove: boolean;
  children?: React.ReactNode;
  items: RecipeBookRecipeItem[];
  mode: "book" | "list";
  onModeChange: (mode: "book" | "list") => void;
  onPlannerAdd: (item: RecipeBookRecipeItem) => void;
  onRemove: (recipeId: string) => void;
  onSave: (item: RecipeBookRecipeItem) => void;
  onSelectRecipe: (recipeId: string) => void;
  readerDetailsById: Record<string, ReaderDetailState>;
  removeLabel: string;
  removingId: string | null;
}) {
  const activeReaderDetailState = readerDetailsById[activeItem.recipe_id];
  const activeRecipeCookHref = buildRecipeCookHref(
    activeItem,
    activeReaderDetailState,
  );

  return (
    <div className="web-recipebook-reader">
      <header className="web-recipebook-reader-header">
        <div>
          <h2>{bookName}</h2>
          <p>
            {items.length}개 레시피 · {activeItem.title} ·{" "}
            {String(activeIndex + 1).padStart(2, "0")}쪽
          </p>
        </div>
        <div className="web-recipebook-segmented" aria-label="상세 보기 방식">
          <button
            className={mode === "book" ? "is-active" : undefined}
            onClick={() => onModeChange("book")}
            type="button"
          >
            책
          </button>
          <button
            className={mode === "list" ? "is-active" : undefined}
            onClick={() => onModeChange("list")}
            type="button"
          >
            목록
          </button>
        </div>
      </header>

      <div
        aria-live="polite"
        className={
          mode === "list"
            ? "web-recipebook-reader-content web-recipebook-reader-content-list"
            : "web-recipebook-reader-content"
        }
        data-testid="recipebook-detail-list"
      >
        {mode === "book" ? (
          <div className="web-recipebook-reader-open-book">
            <section className="web-recipebook-reader-page-right">
              <DesktopRecipeBookRecipePage
                canRemove={canRemove}
                item={activeItem}
                onRemove={() => onRemove(activeItem.recipe_id)}
                onPlannerAdd={() => onPlannerAdd(activeItem)}
                onSave={() => onSave(activeItem)}
                pageNumber={activeIndex + 1}
                readerDetailState={activeReaderDetailState}
                recipeHref={activeRecipeCookHref}
                removeLabel={removeLabel}
                removing={removingId === activeItem.recipe_id}
              />
            </section>
          </div>
        ) : null}

        {mode === "book" ? (
        <div className="web-recipebook-page-controls">
          <div
            aria-label="페이지 선택"
            className="web-recipebook-page-dots"
            role="group"
          >
            {items.map((item, index) => (
              <button
                className={index === activeIndex ? "is-active" : undefined}
                key={item.recipe_id}
                onClick={() => {
                  onSelectRecipe(item.recipe_id);
                  onModeChange("book");
                }}
                type="button"
              >
                {String(index + 1).padStart(2, "0")}쪽
              </button>
            ))}
          </div>
          <div className="web-recipebook-reader-actions">
            <button
              className="web-recipebook-secondary-button"
              onClick={() => onSave(activeItem)}
              type="button"
            >
              저장하기
            </button>
            <button
              className="web-recipebook-secondary-button"
              onClick={() => onPlannerAdd(activeItem)}
              type="button"
            >
              플래너에 추가
            </button>
            <Link
              className="web-recipebook-primary-button"
              href={activeRecipeCookHref}
            >
              요리하기
            </Link>
          </div>
        </div>
        ) : null}

        {mode === "list" ? (
          <div className="web-recipebook-list-mode">
            <h3>레시피 목록</h3>
            <div className="web-recipebook-detail-grid">
              {items.map((item, index) => (
                <RecipeItemCard
                  canRemove={canRemove}
                  item={item}
                  key={item.recipe_id}
                  onRemove={() => onRemove(item.recipe_id)}
                  pageNumber={index + 1}
                  recipeHref={buildRecipeHref(item.recipe_id)}
                  removeLabel={removeLabel}
                  removing={removingId === item.recipe_id}
                />
              ))}
            </div>
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}

function DesktopRecipeBookRecipePage({
  canRemove,
  item,
  onRemove,
  onPlannerAdd,
  pageNumber,
  readerDetailState,
  recipeHref,
  removeLabel,
  removing,
  onSave,
}: Pick<
  RecipeItemCardProps,
  | "canRemove"
  | "item"
  | "onPlannerAdd"
  | "onRemove"
  | "onSave"
  | "pageNumber"
  | "recipeHref"
  | "removeLabel"
  | "removing"
> & {
  readerDetailState?: ReaderDetailState;
}) {
  const pageLabel = pageNumber ?? 1;
  const metaItems = [
    typeof item.base_servings === "number" ? `${item.base_servings}인분` : null,
    ...item.tags,
  ].filter((metaItem): metaItem is string => Boolean(metaItem));
  const recipeImageUrl = getRecipeBookItemImage(item);
  const safeRecipeImageUrl = recipeImageUrl.replace(/"/g, "%22");

  return (
    <article
      className="web-recipebook-recipe-page"
      data-testid={`recipe-item-${item.recipe_id}`}
      id={`recipebook-recipe-${item.recipe_id}`}
    >
      <div className="web-recipebook-recipe-hero">
        <span
          aria-label={item.title}
          className="web-recipebook-recipe-image"
          role="img"
          style={{
            backgroundColor: getRecipeThumbColor(item.title),
            backgroundImage: `url("${safeRecipeImageUrl}")`,
          }}
        />
        <span className="web-recipebook-reader-page-number">
          {String(pageLabel).padStart(2, "0")}쪽
        </span>
        {canRemove ? (
          <button
            aria-label={`${item.title} ${removeLabel}`}
            className="web-recipebook-recipe-remove-icon"
            disabled={removing}
            onClick={onRemove}
            type="button"
          >
            <RecipeBookTrashIcon />
          </button>
        ) : null}
      </div>
      <div className="web-recipebook-recipe-copy">
        <div className="web-recipebook-recipe-title-row">
          <div>
            <h2>{item.title}</h2>
            <div className="web-recipebook-reader-meta" aria-label={`${item.title} 정보`}>
              {metaItems.map((metaItem) => (
                <span key={metaItem}>{metaItem}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="web-recipebook-recipe-columns">
          <section className="web-recipebook-note-section">
            <h3>재료</h3>
            <ReaderIngredientsContent detailState={readerDetailState} />
          </section>
          <section className="web-recipebook-note-section">
            <h3>만들기</h3>
            <ReaderStepsContent detailState={readerDetailState} />
          </section>
        </div>
        <div className="web-recipebook-reader-card-actions">
          <button
            className="web-recipebook-reader-card-link"
            onClick={onSave}
            type="button"
          >
            저장하기
          </button>
          <button
            className="web-recipebook-reader-card-link"
            onClick={onPlannerAdd}
            type="button"
          >
            플래너에 추가
          </button>
          <Link className="web-recipebook-reader-card-link" href={recipeHref}>
            요리하기
          </Link>
        </div>
      </div>
    </article>
  );
}

function ReaderIngredientsContent({
  detailState,
  mobile = false,
}: {
  detailState?: ReaderDetailState;
  mobile?: boolean;
}) {
  if (!detailState || detailState.status === "loading") {
    return <ReaderSectionSkeleton mobile={mobile} />;
  }

  if (detailState.status === "error") {
    return (
      <p className={mobile ? "mt-2 text-[12px] font-bold leading-[1.42] text-[var(--danger)]" : "web-recipebook-note-empty"}>
        {detailState.message}
      </p>
    );
  }

  const ingredients = Array.isArray(detailState.data.ingredients)
    ? detailState.data.ingredients
    : [];

  if (ingredients.length === 0) {
    return (
      <p className={mobile ? "mt-2 text-[12px] font-bold leading-[1.42] text-[var(--text-3)]" : "web-recipebook-note-empty"}>
        작성된 재료가 없어요.
      </p>
    );
  }

  return (
    <ul className={mobile ? "mobile-recipebook-note-list" : "web-recipebook-note-list"}>
      {ingredients.slice(0, mobile ? 4 : 8).map((ingredient) => (
        <li
          className={mobile ? "mobile-recipebook-note-row" : "web-recipebook-note-row"}
          data-testid={`reader-ingredient-${ingredient.id}`}
          key={ingredient.id}
        >
          <span
            aria-hidden="true"
            className={mobile ? "mobile-recipebook-note-dot" : "web-recipebook-note-dot"}
            data-testid={`reader-ingredient-marker-${ingredient.id}`}
          />
          <span>{formatIngredientLine(ingredient)}</span>
        </li>
      ))}
    </ul>
  );
}

function ReaderStepsContent({
  detailState,
  mobile = false,
}: {
  detailState?: ReaderDetailState;
  mobile?: boolean;
}) {
  if (!detailState || detailState.status === "loading") {
    return <ReaderSectionSkeleton mobile={mobile} />;
  }

  if (detailState.status === "error") {
    return (
      <p className={mobile ? "mt-2 text-[12px] font-bold leading-[1.42] text-[var(--danger)]" : "web-recipebook-note-empty"}>
        {detailState.message}
      </p>
    );
  }

  const steps = Array.isArray(detailState.data.steps)
    ? detailState.data.steps
    : [];

  if (steps.length === 0) {
    return (
      <p className={mobile ? "mt-2 text-[12px] font-bold leading-[1.42] text-[var(--text-3)]" : "web-recipebook-note-empty"}>
        작성된 만들기가 없어요.
      </p>
    );
  }

  return (
    <ol className={mobile ? "mobile-recipebook-note-list" : "web-recipebook-note-list"}>
      {steps.slice(0, mobile ? 3 : 6).map((step, index) => (
        <li
          className={mobile ? "mobile-recipebook-note-row" : "web-recipebook-note-row"}
          data-testid={`reader-step-${step.id}`}
          key={step.id}
        >
          <span
            className={
              mobile ? "mobile-recipebook-step-number" : "web-recipebook-step-number"
            }
          >
            {step.step_number ?? index + 1}
          </span>
          <span>{step.instruction}</span>
        </li>
      ))}
    </ol>
  );
}

function ReaderSectionSkeleton({ mobile }: { mobile: boolean }) {
  if (mobile) {
    return (
      <div className="mt-2 grid gap-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-8/12" />
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-8/12" />
    </div>
  );
}

function formatIngredientLine(ingredient: RecipeIngredient) {
  if (ingredient.display_text) {
    return ingredient.display_text;
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return `${ingredient.standard_name} 적당량`;
  }

  const amount = typeof ingredient.amount === "number" ? ingredient.amount : null;
  const quantity = amount === null ? "" : `${amount}${ingredient.unit ?? ""}`;

  return [ingredient.standard_name, quantity].filter(Boolean).join(" ");
}

function BookmarkIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="15"
      viewBox="0 0 24 24"
      width="15"
    >
      <path
        d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.5-6 3.5v-16Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <path
        d="M7 2.5v3M17 2.5v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function RecipeBookTrashIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      viewBox="0 0 24 24"
      width="18"
    >
      <path
        d="M3.75 6.25h16.5M9.25 6.25V4.4c0-.88.72-1.6 1.6-1.6h2.3c.88 0 1.6.72 1.6 1.6v1.85M18.25 6.25l-.72 13.1a2 2 0 0 1-2 1.9H8.47a2 2 0 0 1-2-1.9L5.75 6.25M10 10.25v6.25M14 10.25v6.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
