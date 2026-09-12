"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { PantryAddSheet } from "@/components/pantry/pantry-add-sheet";
import { PantryBundlePicker } from "@/components/pantry/pantry-bundle-picker";
import { PantryIngredientVisual } from "@/components/pantry/pantry-ingredient-visual";
import { PantryMobileScreen } from "@/components/pantry/pantry-mobile-screen";
import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import type { PlannerAddSheetState } from "@/components/recipe/planner-add-sheet";
import { AppBottomSheet, AppModalFooterActions } from "@/components/shared/app-overlay";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
import { ContentState } from "@/components/shared/content-state";
import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import {
  WebButton,
  WebCard,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
  WebShell,
  WebSkeleton,
  WebTabButton,
  WebTabs,
  WebToolbar,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  deletePantryItems,
  fetchPantryList,
  isPantryApiError,
} from "@/lib/api/pantry";
import { createMealSafe } from "@/lib/api/meal";
import { fetchPlannerColumns } from "@/lib/api/planner";
import {
  getIngredientGroupFilterValue,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
  ingredientMatchesCategoryGroup,
} from "@/lib/ingredient-categories";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  PantryDisplayItem,
  PantryItem,
  PantryProductItem,
} from "@/types/pantry";
import type { PlannerColumnData } from "@/types/planner";
import type { PantryMatchRecipeItem } from "@/types/recipe";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";
const TOAST_DURATION_MS = 3000;
const GUEST_PANTRY_ITEMS: PantryItem[] = [
  { id: "guest-onion", ingredient_id: "guest-onion", standard_name: "양파", category: "채소", category_group_code: "vegetable_mushroom", created_at: "2026-09-12T00:00:00Z" },
  { id: "guest-green-onion", ingredient_id: "guest-green-onion", standard_name: "대파", category: "채소", category_group_code: "vegetable_mushroom", created_at: "2026-09-12T00:00:01Z" },
  { id: "guest-potato", ingredient_id: "guest-potato", standard_name: "감자", category: "채소", category_group_code: "vegetable_mushroom", created_at: "2026-09-12T00:00:02Z" },
  { id: "guest-garlic", ingredient_id: "guest-garlic", standard_name: "마늘", category: "조미료", category_group_code: "seasoning_condiment", created_at: "2026-09-12T00:00:03Z" },
  { id: "guest-egg", ingredient_id: "guest-egg", standard_name: "계란", category: "단백질", category_group_code: "protein", created_at: "2026-09-12T00:00:04Z" },
  { id: "guest-pork", ingredient_id: "guest-pork", standard_name: "돼지고기", category: "단백질", category_group_code: "protein", created_at: "2026-09-12T00:00:05Z" },
];

export interface PantryScreenProps {
  initialAuthenticated?: boolean;
}

export function PantryScreen({
  initialAuthenticated = false,
}: PantryScreenProps) {
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [authGeneration, setAuthGeneration] = useState(0);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [items, setItems] = useState<PantryItem[]>([]);
  const [productItems, setProductItems] = useState<PantryProductItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showGuestLoginGate, setShowGuestLoginGate] = useState(false);
  const [showBundlePicker, setShowBundlePicker] = useState(false);
  const [showPantryRecommendations, setShowPantryRecommendations] = useState(false);
  const [plannerAddTarget, setPlannerAddTarget] = useState<PantryMatchRecipeItem | null>(null);
  const [isPlannerAddSheetOpen, setIsPlannerAddSheetOpen] = useState(false);
  const [plannerAddSheetState, setPlannerAddSheetState] =
    useState<PlannerAddSheetState>("loading-columns");
  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(2);
  const [plannerAddError, setPlannerAddError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pantryRequestSequenceRef = useRef(0);
  const isMobileViewport = useIsMobileViewport();
  const isGuestPreview = authState === "unauthorized";
  const visiblePantryItems = isGuestPreview ? GUEST_PANTRY_ITEMS : items;
  const visibleProductItems = isGuestPreview ? [] : productItems;

  const allDisplayItems = useMemo(
    () =>
      [
        ...visiblePantryItems.map(toIngredientDisplayItem),
        ...visibleProductItems.map(toProductDisplayItem),
      ].sort(comparePantryDisplayItems),
    [visiblePantryItems, visibleProductItems],
  );

  const searchedItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim();

    if (!normalizedQuery) {
      return allDisplayItems;
    }

    return allDisplayItems.filter(
      (item) =>
        item.standard_name.includes(normalizedQuery) ||
        item.detail_text?.includes(normalizedQuery),
    );
  }, [allDisplayItems, searchQuery]);

  const categories = useMemo(() => {
    return INGREDIENT_CATEGORY_GROUP_OPTIONS.filter(
      (category) => category.category_group_code,
    );
  }, []);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of searchedItems) {
      const groupCode = item.category_group_code;
      if (groupCode) {
        counts.set(groupCode, (counts.get(groupCode) ?? 0) + 1);
      }
    }

    return counts;
  }, [searchedItems]);

  const displayItems = useMemo(() => {
    if (!activeCategory) return searchedItems;
    return searchedItems.filter((item) =>
      ingredientMatchesCategoryGroup(item, activeCategory),
    );
  }, [searchedItems, activeCategory]);

  const displayItemGroups = useMemo(() => {
    const groupOptions = activeCategory
      ? categories.filter((category) => category.value === activeCategory)
      : categories;

    const ingredientGroups = groupOptions
      .map((category) => {
        const groupItems = displayItems.filter(
          (item) =>
            item.item_type === "ingredient" &&
            ingredientMatchesCategoryGroup(item, category.value),
        );

        return {
          key: category.value,
          label: category.label,
          items: groupItems,
        };
      })
      .filter((group) => group.items.length > 0);

    const productGroup =
      activeCategory === null
        ? [
            {
              key: "food_product",
              label: "제품",
              items: displayItems.filter(
                (item) => item.item_type === "food_product",
              ),
            },
          ].filter((group) => group.items.length > 0)
        : [];

    return [...ingredientGroups, ...productGroup];
  }, [activeCategory, categories, displayItems]);

  const selectableIngredientIds = useMemo(
    () =>
      displayItems.flatMap((item) =>
        item.ingredient_id ? [item.ingredient_id] : [],
      ),
    [displayItems],
  );
  const isAllVisibleSelected =
    selectableIngredientIds.length > 0 &&
    selectableIngredientIds.every((ingredientId) => selectedIds.has(ingredientId));

  const buildSelectableDates = useCallback((): string[] => {
    const dates: string[] = [];
    const base = new Date();

    for (let i = 0; i < 14; i += 1) {
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

  const mobileDisplayItems = useMemo(
    () => displayItems,
    [displayItems],
  );

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const applyAuthSession = useCallback((session: Session | null) => {
    pantryRequestSequenceRef.current += 1;
    setItems([]);
    setProductItems([]);
    setViewState("loading");
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    setShowAddSheet(false);
    setShowGuestLoginGate(false);
    setShowBundlePicker(false);
    setShowPantryRecommendations(false);
    setPlannerAddTarget(null);
    setIsPlannerAddSheetOpen(false);
    setAuthGeneration((current) => current + 1);
    setAuthState(session ? "authenticated" : "unauthorized");
  }, []);

  const loadItems = useCallback(
    async () => {
      const requestSequence = pantryRequestSequenceRef.current + 1;
      pantryRequestSequenceRef.current = requestSequence;

      try {
        const result = await fetchPantryList();

        if (requestSequence !== pantryRequestSequenceRef.current) {
          return;
        }

        setItems(result.items);
        setProductItems(result.product_items ?? []);
        setViewState("ready");
      } catch (error) {
        if (requestSequence !== pantryRequestSequenceRef.current) {
          return;
        }

        if (isPantryApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }
        setViewState("error");
      }
    },
    [],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
    },
    [],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleCategoryChange = useCallback(
    (category: string | null) => {
      setActiveCategory(category);
    },
    [],
  );

  const handleSelectToggle = useCallback((ingredientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) {
        next.delete(ingredientId);
      } else {
        next.add(ingredientId);
      }
      return next;
    });
  }, []);

  const handleSelectAllVisibleToggle = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (
        selectableIngredientIds.length > 0 &&
        selectableIngredientIds.every((ingredientId) => next.has(ingredientId))
      ) {
        selectableIngredientIds.forEach((ingredientId) => next.delete(ingredientId));
        return next;
      }

      selectableIngredientIds.forEach((ingredientId) => next.add(ingredientId));
      return next;
    });
  }, [selectableIngredientIds]);

  const handleRequestSingleDelete = useCallback((ingredientId: string) => {
    setSelectedIds(new Set([ingredientId]));
    setShowDeleteConfirm(true);
  }, []);

  const handleExitSelectMode = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    try {
      const result = await deletePantryItems(Array.from(selectedIds));
      showToast(`${result.removed}개 재료가 삭제됐어요`, "success");
      setItems((prev) => prev.filter((item) => !selectedIds.has(item.ingredient_id)));
      handleExitSelectMode();
    } catch {
      showToast("삭제에 실패했어요. 다시 시도해 주세요", "error");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [selectedIds, showToast, handleExitSelectMode]);

  const handleAddComplete = useCallback(
    (addedCount: number) => {
      if (addedCount > 0) {
        showToast(`${addedCount}개 재료가 팬트리에 추가됐어요`, "success");
      }
      void loadItems();
    },
    [showToast, loadItems],
  );

  const handleBundleAddComplete = useCallback(
    (addedCount: number) => {
      if (addedCount > 0) {
        showToast(`${addedCount}개 재료를 팬트리에 추가했어요`, "success");
      }
      void loadItems();
    },
    [showToast, loadItems],
  );

  const loadPlannerColumns = useCallback(async () => {
    setPlannerAddSheetState("loading-columns");
    setPlannerAddError(null);

    try {
      const data = await fetchPlannerColumns();
      setPlannerColumns(data.columns);
      setSelectedPlanColumnId((current) => {
        if (current && data.columns.some((column) => column.id === current)) {
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
  }, []);

  const openPlannerAddSheetForRecommendation = useCallback(
    async (recipe: PantryMatchRecipeItem) => {
      setPlannerAddTarget(recipe);
      setIsPlannerAddSheetOpen(true);
      setPlannerAddError(null);
      setSelectedPlanDate(selectableDates[0] ?? "");
      setPlannerServings(2);

      await loadPlannerColumns();
    },
    [loadPlannerColumns, selectableDates],
  );

  const closePlannerAddSheet = useCallback(() => {
    if (plannerAddSheetState === "submitting") {
      return;
    }

    setIsPlannerAddSheetOpen(false);
    setPlannerAddError(null);
    setPlannerAddTarget(null);
  }, [plannerAddSheetState]);

  const handlePlannerAddSubmit = useCallback(async () => {
    if (
      !plannerAddTarget ||
      !selectedPlanColumnId ||
      !selectedPlanDate ||
      plannerAddSheetState !== "ready"
    ) {
      return;
    }

    setPlannerAddSheetState("submitting");
    setPlannerAddError(null);

    const response = await createMealSafe({
      recipe_id: plannerAddTarget.id,
      plan_date: selectedPlanDate,
      column_id: selectedPlanColumnId,
      planned_servings: plannerServings,
    });

    if (!response.success) {
      setPlannerAddError(response.error?.message ?? "플래너 추가에 실패했어요. 다시 시도해 주세요.");
      setPlannerAddSheetState("ready");
      return;
    }

    const [, planMonth, planDay] = selectedPlanDate.split("-").map(Number);
    const dateLabel = `${planMonth}월 ${planDay}일`;
    const columnName =
      plannerColumns.find((column) => column.id === selectedPlanColumnId)?.name ??
      "선택한 끼니";

    setIsPlannerAddSheetOpen(false);
    setPlannerAddTarget(null);
    setShowPantryRecommendations(false);
    setPlannerAddSheetState("ready");
    showToast(`${dateLabel} ${columnName}에 추가됐어요`, "success");
  }, [
    plannerAddSheetState,
    plannerAddTarget,
    plannerColumns,
    plannerServings,
    selectedPlanColumnId,
    selectedPlanDate,
    showToast,
  ]);

  // Auth check effect
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
          applyAuthSession(session);
        },
      );

      return () => {
        pantryRequestSequenceRef.current += 1;
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
        applyAuthSession(result.data.session);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        applyAuthSession(session);
      },
    );

    return () => {
      pantryRequestSequenceRef.current += 1;
      subscription.unsubscribe();
    };
  }, [applyAuthSession, initialAuthenticated]);

  // Load items on auth
  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }

    void loadItems();
  }, [authGeneration, authState, loadItems]);

  // --- Render states ---

  if (authState === "checking") {
    if (!isMobileViewport) {
      return <PantryDesktopLoadingShell />;
    }

    return (
      <>
        <ContentState
          className="md:px-7"
          description="로그인 상태를 확인하고 있어요."
          tone="loading"
          title="잠시만 기다려 주세요"
        />
        <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
      </>
    );
  }

  if (viewState === "error") {
    return (
      <>
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            팬트리를 불러올 수 없어요
          </h2>
          <button
            className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--surface)]"
            onClick={() => {
              setViewState("loading");
              void loadItems();
            }}
            type="button"
          >
            다시 시도
          </button>
        </div>
        {isMobileViewport ? (
          <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
        ) : null}
      </>
    );
  }

  const isPantryLoading = !isGuestPreview && viewState === "loading";
  const isEmpty =
    !isPantryLoading && allDisplayItems.length === 0 && !searchQuery && !activeCategory;
  const isSearchEmpty =
    !isPantryLoading && displayItems.length === 0 && (searchQuery || activeCategory);
  const overlayNodes = (
    <>
      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-[var(--overlay-40)] p-4 lg:items-center lg:justify-center"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-[var(--radius-xl)] bg-[var(--panel)] p-5 shadow-[var(--shadow-3)] lg:rounded-[var(--radius-xl)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-1 lg:hidden">
              <div className="h-1 w-9 rounded-[var(--radius-badge)] bg-[var(--line)]" />
            </div>
            <div className="flex items-start justify-between gap-3 pt-3">
              <h3 className="text-lg font-bold text-[var(--foreground)]">
                재료를 삭제할까요?
              </h3>
              <button
                aria-label="닫기"
                className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                ✕
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              삭제하면 장보기 목록에서 자동 제외되지 않아요
            </p>
            <div className="mt-5 flex gap-3">
              <button
                className="flex min-h-[var(--control-height-md)] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface)] text-sm font-semibold text-[var(--foreground)]"
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="flex min-h-[var(--control-height-md)] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--danger)] text-sm font-semibold text-[var(--text-inverse)] disabled:opacity-50"
                disabled={isDeleting}
                onClick={() => void handleDeleteConfirm()}
                type="button"
              >
                {isDeleting ? "삭제 중..." : `삭제 (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <AppFeedbackToast
          message={toast.message}
          position="mobileTop"
          tone={toast.tone}
        />
      )}

      {/* Add sheet */}
      {showAddSheet && (
        <PantryAddSheet
          existingIngredientIds={visiblePantryItems.map((item) => item.ingredient_id)}
          existingProductItems={visibleProductItems.map((item) => ({
            food_product_id: item.food_product_id,
            food_product_nutrition_version_id:
              item.food_product_nutrition_version_id,
          }))}
          onAdd={handleAddComplete}
          onClose={() => setShowAddSheet(false)}
          onRequireAuth={isGuestPreview ? () => {
            setShowAddSheet(false);
            setShowGuestLoginGate(true);
          } : undefined}
        />
      )}

      {showGuestLoginGate ? (
        <PantryGuestLoginGate
          isMobileViewport={isMobileViewport}
          onClose={() => setShowGuestLoginGate(false)}
        />
      ) : null}

      {/* Bundle picker */}
      {showBundlePicker && (
        <PantryBundlePicker
          onAdd={handleBundleAddComplete}
          onClose={() => setShowBundlePicker(false)}
        />
      )}

      {showPantryRecommendations ? (
        isMobileViewport ? (
          <AppBottomSheet
            ariaLabelledBy="pantry-recommendation-title-mobile"
            bodyClassName="px-4 pb-[calc(20px+env(safe-area-inset-bottom))]"
            description="팬트리에 있는 재료로 만들기 쉬운 레시피를 골라보세요."
            onClose={() => setShowPantryRecommendations(false)}
            panelClassName="max-w-[520px]"
            title="팬트리 추천"
          >
            <PantryMatchPicker
              isCreating={false}
              onClose={() => setShowPantryRecommendations(false)}
              onRecipeSelect={(recipe) => void openPlannerAddSheetForRecommendation(recipe)}
              onServingsCancel={() => undefined}
              onServingsConfirm={() => undefined}
              presentation="sheet"
              selectedRecipe={null}
            />
          </AppBottomSheet>
        ) : (
          <WebModal onBackdropClick={() => setShowPantryRecommendations(false)}>
            <WebDialog aria-labelledby="pantry-recommendation-title-desktop" size="wide">
              <WebDialogHeader>
                <div>
                  <WebDialogTitle id="pantry-recommendation-title-desktop">
                    팬트리 추천
                  </WebDialogTitle>
                  <p className="web-modal-copy">
                    팬트리에 있는 재료로 만들기 쉬운 레시피를 골라보세요.
                  </p>
                </div>
                <button
                  aria-label="닫기"
                  className="web-modal-close"
                  onClick={() => setShowPantryRecommendations(false)}
                  type="button"
                >
                  ×
                </button>
              </WebDialogHeader>
              <WebDialogBody>
                <PantryMatchPicker
                  isCreating={false}
                  onClose={() => setShowPantryRecommendations(false)}
                  onRecipeSelect={(recipe) => void openPlannerAddSheetForRecommendation(recipe)}
                  onServingsCancel={() => undefined}
                  onServingsConfirm={() => undefined}
                  presentation="web"
                  selectedRecipe={null}
                />
              </WebDialogBody>
            </WebDialog>
          </WebModal>
        )
      ) : null}

      <PlannerAddSheet
        columns={plannerColumns}
        errorMessage={plannerAddError}
        isOpen={isPlannerAddSheetOpen}
        onChangeServings={setPlannerServings}
        onClose={closePlannerAddSheet}
        onRetryLoad={loadPlannerColumns}
        onSelectColumn={setSelectedPlanColumnId}
        onSelectDate={setSelectedPlanDate}
        onSubmit={handlePlannerAddSubmit}
        recipePreview={
          plannerAddTarget
            ? {
                background: "var(--brand-soft)",
                emoji: "🧊",
                imageSrc: resolveRecipeImage(plannerAddTarget),
                meta: "팬트리 추천 · 기본 2인분",
                title: plannerAddTarget.title,
              }
            : undefined
        }
        selectableDates={selectableDates}
        selectedColumnId={selectedPlanColumnId}
        selectedDate={selectedPlanDate}
        servings={plannerServings}
        sheetState={plannerAddSheetState}
        variant="recipe-detail"
      />
    </>
  );

  if (isMobileViewport) {
    return (
      <>
        <PantryMobileScreen
          activeCategory={activeCategory}
          displayItems={mobileDisplayItems}
          isGuestPreview={isGuestPreview}
          isLoading={isPantryLoading}
          isSelectMode={isSelectMode}
          items={allDisplayItems}
          onCategoryChange={handleCategoryChange}
          onClearSearch={handleClearSearch}
          onExitSelectMode={handleExitSelectMode}
          onOpenAddSheet={() => setShowAddSheet(true)}
          onOpenBundlePicker={() => isGuestPreview ? setShowGuestLoginGate(true) : setShowBundlePicker(true)}
          onOpenRecommendations={() => isGuestPreview ? setShowGuestLoginGate(true) : setShowPantryRecommendations(true)}
          onRequestDelete={() => setShowDeleteConfirm(true)}
          onRequestSingleDelete={handleRequestSingleDelete}
          onSearchChange={handleSearch}
          onSelectAllToggle={handleSelectAllVisibleToggle}
          onSelectToggle={handleSelectToggle}
          onStartSelectMode={() => {
            if (!isGuestPreview) setIsSelectMode(true);
          }}
          searchQuery={searchQuery}
          selectedIds={selectedIds}
          isAllVisibleSelected={isAllVisibleSelected}
        />
        {overlayNodes}
      </>
    );
  }

  return (
    <>
      <WebShell className="web-pantry-shell">
        <WebTopNav
          activeId="pantry"
          rightSlot={<ProfileSummaryButton autoLoad isAuthenticated={!isGuestPreview} variant="web" />}
        />
        <div className="web-screen web-pantry-screen">
          <header className="web-pantry-head">
            <div>
              <p className="web-menu-add-eyebrow">팬트리</p>
              <h1>{isGuestPreview ? `팬트리 미리보기 ${allDisplayItems.length}개` : isPantryLoading ? "나의 팬트리" : `나의 팬트리 ${allDisplayItems.length}개`}</h1>
              <p>
                {isGuestPreview
                  ? "로그인 전 예시예요. 로그인하면 내 재료로 바뀌어요."
                  : "팬트리에 있는 재료는 장보기에서 자동 제외돼요."}
              </p>
            </div>
            <div className="web-pantry-actions">
              <WebButton
                aria-label="팬트리 추천"
                onClick={() => isGuestPreview ? setShowGuestLoginGate(true) : setShowPantryRecommendations(true)}
                variant="secondary"
              >
                팬트리 추천
              </WebButton>
              <WebButton
                aria-label="묶음으로 추가"
                onClick={() => isGuestPreview ? setShowGuestLoginGate(true) : setShowBundlePicker(true)}
                variant="secondary"
              >
                묶음 추가
              </WebButton>
              <WebButton
                aria-label="재료 추가하기"
                onClick={() => setShowAddSheet(true)}
              >
                + 재료 추가
              </WebButton>
            </div>
          </header>

          <WebCard className="web-pantry-board">
            <WebTabs role="tablist">
              <WebTabButton
                active={!activeCategory}
                aria-label="전체"
                onClick={() => handleCategoryChange(null)}
              >
                전체 {isPantryLoading ? null : <span>{searchedItems.length}</span>}
              </WebTabButton>
              {categories.map((category) => (
                <WebTabButton
                  active={activeCategory === category.value}
                  aria-label={category.label}
                  key={category.value}
                  onClick={() => handleCategoryChange(category.value)}
                >
                  {category.label}{" "}
                  {isPantryLoading ? null : (
                    <span>{categoryCounts.get(category.value) ?? 0}</span>
                  )}
                </WebTabButton>
              ))}
            </WebTabs>

            <WebToolbar className="web-pantry-toolbar">
              <label className="web-picker-search web-pantry-search">
                <SearchGlyph className="h-5 w-5" />
                <input
                  aria-label="팬트리 재료 검색"
                  onChange={(event) => handleSearch(event.target.value)}
                  placeholder="재료 검색"
                  role="searchbox"
                  type="text"
                  value={searchQuery}
                />
                {searchQuery ? (
                  <button
                    aria-label="검색어 지우기"
                    className="web-pantry-search-clear"
                    onClick={handleClearSearch}
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </label>

              <div className="web-pantry-toolbar-actions">
                <span className="sr-only" aria-live="polite">
                  {displayItems.length}개 재료 표시
                </span>
                {isSelectMode ? (
                  <>
                    <span className="web-pantry-selected-count">
                      {selectedIds.size}개 선택됨
                    </span>
                    <button
                      aria-checked={isAllVisibleSelected}
                      className="web-pantry-select-all"
                      disabled={selectableIngredientIds.length === 0}
                      onClick={handleSelectAllVisibleToggle}
                      role="checkbox"
                      type="button"
                    >
                      <span aria-hidden="true">{isAllVisibleSelected ? "✓" : ""}</span>
                      전체선택
                    </button>
                    <WebButton
                      className="web-pantry-edit-button"
                      onClick={handleExitSelectMode}
                      variant="tertiary"
                    >
                      취소
                    </WebButton>
                    <button
                      className="web-pantry-danger-button"
                      disabled={selectedIds.size === 0}
                      onClick={() => setShowDeleteConfirm(true)}
                      type="button"
                    >
                      제거하기
                    </button>
                  </>
                ) : (
                  <WebButton
                    className="web-pantry-edit-button"
                    disabled={
                      isGuestPreview || isPantryLoading || selectableIngredientIds.length === 0
                    }
                    onClick={() => setIsSelectMode(true)}
                    variant="tertiary"
                  >
                    편집
                  </WebButton>
                )}
              </div>
            </WebToolbar>

            {isPantryLoading ? (
              <WebPantryInlineLoading />
            ) : isEmpty ? (
              <div className="web-pantry-empty">
                <span aria-hidden="true">🥗</span>
                <h2>아직 등록한 재료가 없어요</h2>
                <p>재료를 추가하면 장보기 때 이미 있는 재료를 자동 제외해요.</p>
                <WebButton
                  aria-label="재료 추가하기"
                  onClick={() => setShowAddSheet(true)}
                >
                  + 재료 추가
                </WebButton>
              </div>
            ) : isSearchEmpty ? (
              <div className="web-pantry-empty">
                <span aria-hidden="true">⌕</span>
                <h2>
                  {searchQuery
                    ? `"${searchQuery}"에 해당하는 재료가 없어요`
                    : "해당 카테고리의 재료가 없어요"}
                </h2>
                {searchQuery ? (
                  <WebButton onClick={handleClearSearch} variant="secondary">
                    검색어 지우기
                  </WebButton>
                ) : null}
              </div>
            ) : (
              <div className="web-pantry-category-list">
                {displayItemGroups.map((group) => (
                  <section
                    className="web-pantry-category-section"
                    data-testid={`web-pantry-category-section-${group.key}`}
                    key={group.key}
                  >
                    <div className="web-pantry-category-head">
                      <h2>{group.label}</h2>
                      <span>{group.items.length}개</span>
                    </div>
                    <div className="web-pantry-grid">
                      {group.items.map((item) => {
                        const ingredientId = item.ingredient_id;
                        const isSelectable = ingredientId !== null;
                        const isSelected =
                          ingredientId !== null && selectedIds.has(ingredientId);
                        const testId = ingredientId ?? item.id;
                        const cardContent = (
                          <>
                            {isSelectMode && isSelectable ? (
                              <span className="web-pantry-check" aria-hidden="true">
                                {isSelected ? "✓" : ""}
                              </span>
                            ) : null}
                            <PantryIngredientVisual
                              category={item.category}
                              className="web-pantry-emoji"
                              name={item.standard_name}
                            />
                            <span
                              className="web-pantry-card-copy"
                              data-testid={`web-pantry-card-copy-${testId}`}
                            >
                              <strong>{item.standard_name}</strong>
                              {item.detail_text ? (
                                <small>{item.detail_text}</small>
                              ) : null}
                            </span>
                          </>
                        );

                        return isSelectMode && isSelectable ? (
                          <button
                            aria-checked={isSelected}
                            aria-label={`${item.standard_name} 선택`}
                            className={[
                              "web-pantry-card",
                              "web-pantry-card-selectable",
                              isSelected ? "web-pantry-card-selected" : "",
                            ].join(" ")}
                            data-testid={`web-pantry-card-${testId}`}
                            key={item.id}
                            onClick={() => handleSelectToggle(ingredientId)}
                            role="checkbox"
                            type="button"
                          >
                            {cardContent}
                          </button>
                        ) : (
                          <article
                            aria-label={displayItemAccessibleLabel(item)}
                            className="web-pantry-card"
                            data-testid={`web-pantry-card-${testId}`}
                            key={item.id}
                          >
                            {cardContent}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </WebCard>
        </div>
      </WebShell>
      {overlayNodes}
    </>
  );
}

function PantryGuestLoginGate({
  isMobileViewport,
  onClose,
}: {
  isMobileViewport: boolean;
  onClose: () => void;
}) {
  const login = () => {
    window.location.assign("/login?next=%2Fpantry");
  };
  const description = "로그인하면 선택한 재료를 내 팬트리에 추가할 수 있어요.";

  if (isMobileViewport) {
    return (
      <AppBottomSheet
        ariaLabelledBy="pantry-guest-login-title-mobile"
        footer={
          <AppModalFooterActions
            confirmLabel="로그인"
            onCancel={onClose}
            onConfirm={login}
          />
        }
        onClose={onClose}
        panelClassName="max-w-md"
        title="로그인이 필요한 작업이에요"
      >
        <p className="text-[14px] font-medium leading-6 text-[var(--wave1-text-2)]">
          {description}
        </p>
      </AppBottomSheet>
    );
  }

  return (
    <WebModal onBackdropClick={onClose}>
      <WebDialog aria-labelledby="pantry-guest-login-title-desktop" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="pantry-guest-login-title-desktop">
            로그인이 필요한 작업이에요
          </WebDialogTitle>
          <button
            aria-label="닫기"
            className="web-modal-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </WebDialogHeader>
        <WebDialogBody>
          <p className="text-[14px] font-medium leading-6 text-[var(--web-text-2)]">
            {description}
          </p>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onClose} variant="tertiary">취소</WebButton>
          <WebButton onClick={login}>로그인</WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function toIngredientDisplayItem(item: PantryItem): PantryDisplayItem {
  return {
    category: item.category,
    category_group_code:
      item.category_group_code ??
      getIngredientGroupFilterValue({
        category: item.category,
        categoryCode: item.category_code,
      }),
    category_code: item.category_code,
    category_label: item.category_label,
    created_at: item.created_at,
    detail_text: null,
    food_product_id: null,
    food_product_nutrition_version_id: null,
    id: item.id,
    ingredient_id: item.ingredient_id,
    item_type: "ingredient",
    standard_name: item.standard_name,
  };
}

function toProductDisplayItem(item: PantryProductItem): PantryDisplayItem {
  return {
    category: "제품",
    category_group_code: null,
    category_code: null,
    category_label: "제품",
    created_at: item.created_at,
    detail_text: `${item.brand ?? "브랜드 없음"} · 영양 버전 ${item.food_product_nutrition_version_id}`,
    food_product_id: item.food_product_id,
    food_product_nutrition_version_id:
      item.food_product_nutrition_version_id,
    id: item.id,
    ingredient_id: null,
    item_type: "food_product",
    standard_name: item.name,
  };
}

function displayItemAccessibleLabel(item: PantryDisplayItem) {
  if (item.detail_text) {
    return `${item.standard_name} · ${item.detail_text}`;
  }

  return `${item.standard_name} 재료`;
}

function comparePantryDisplayItems(
  left: PantryDisplayItem,
  right: PantryDisplayItem,
) {
  const categoryCompare = left.category.localeCompare(right.category, "ko");
  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  return left.standard_name.localeCompare(right.standard_name, "ko");
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
      viewBox="0 0 24 24"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

function WebPantryInlineLoading() {
  return (
    <div
      className="web-pantry-category-list"
      data-testid="web-pantry-inline-loading"
      role="status"
    >
      <section className="web-pantry-category-section">
        <div className="web-pantry-category-head">
          <WebSkeleton height={18} width={88} />
          <WebSkeleton height={16} width={32} />
        </div>
        <div className="web-pantry-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <WebSkeleton height={84} key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PantryDesktopLoadingShell() {
  return (
    <WebShell className="web-pantry-shell">
      <WebTopNav activeId="pantry" />
      <div className="web-screen web-pantry-screen" data-testid="pantry-skeleton">
        <header className="web-pantry-head">
          <div>
            <WebSkeleton height={14} width={72} />
            <div className="mt-3">
              <WebSkeleton height={40} width={180} />
            </div>
            <div className="mt-3">
              <WebSkeleton height={18} width={360} />
            </div>
          </div>
          <div className="web-pantry-actions">
            <WebSkeleton height={40} width={104} />
            <WebSkeleton height={40} width={112} />
          </div>
        </header>

        <WebCard className="web-pantry-board">
          <div className="web-pantry-loading-tabs">
            {[80, 88, 88, 88].map((width, index) => (
              <WebSkeleton height={44} key={index} width={width} />
            ))}
          </div>
          <WebToolbar className="web-pantry-toolbar">
            <WebSkeleton height={44} width="min(440px, 100%)" />
            <div className="web-pantry-toolbar-actions">
              <WebSkeleton height={36} width={128} />
              <WebSkeleton height={36} width={72} />
            </div>
          </WebToolbar>
          <div className="web-pantry-grid">
            {Array.from({ length: 10 }).map((_, index) => (
              <WebSkeleton height={84} key={index} />
            ))}
          </div>
        </WebCard>
      </div>
    </WebShell>
  );
}
