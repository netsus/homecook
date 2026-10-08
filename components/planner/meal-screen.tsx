"use client";

import { AppBackButton } from "@/components/shared/app-back-button";

import { PlannerTaskSheet } from "@/components/planner/planner-task-sheet";
import { PlannedMealCard } from "@/components/planner/planned-meal-card";
import { formatPlannerNutritionValue, plannerAiEstimateNotice } from "@/lib/planner/planner-nutrition-presentation";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { MealAddOptionsSheet } from "@/components/planner/meal-add-options-sheet";
import type {
  MealAddPickerMode,
  MealAddRouteMode,
} from "@/components/planner/meal-add-options-sheet";
import { MealAddPickerFlow } from "@/components/planner/meal-add-picker-flow";
import { ProductPlannerEntryCard } from "@/components/planner/product-planner-entry-card";
import { usePlannerNutritionSummary } from "@/components/planner/use-planner-nutrition-summary";
import { ModalHeader } from "@/components/shared/modal-header";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { AllPantryCompletionModal } from "@/components/shopping/all-pantry-completion-modal";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
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
} from "@/components/web";
import { createCookingSession, createSnapshotV2CookingSession, isCookingApiError } from "@/lib/api/cooking";
import { getCookingSessionCookModeHref } from "@/lib/cooking/session-version-dispatch";
import {
  deleteMeal,
  fetchMeals,
  isMealApiError,
  updateMealServings,
} from "@/lib/api/meal";
import { createShoppingList, isShoppingApiError } from "@/lib/api/shopping";
import { emitAppActionNotification } from "@/lib/app-action-notifications";
import {
  deleteProductPlannerEntry,
  isProductPlannerEntryApiError,
  updateProductPlannerEntryQuantity,
} from "@/lib/api/product-planner-entry";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { formatKoreaCompactDate, formatKoreaDate } from "@/lib/korean-date";
import { buildReturnHref } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import {
  buildCompatibleFoodProductUnits,
  formatProductPlannerEntryErrorMessage,
  formatProductUnit,
  mergeMealScreenEntries,
} from "@/lib/planner/product-planner-entry-presentation";
import {
  clearProductPlannerReturnContext,
  readProductPlannerReturnContext,
  saveProductPlannerReturnContext,
} from "@/lib/planner/product-planner-return-context";
import type { MealListItemData } from "@/types/meal";
import type { RecipeSnapshotUiMode } from "@/types/recipe";
import type {
  MealProductPlannerEntryData,
  ProductPlannerEntryQuantity,
} from "@/types/product-planner-entry";
import type {
  ShoppingListAllPantryCompletionSummary,
  ShoppingListAllPantrySummary,
  ShoppingListCreateData,
} from "@/types/shopping";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ScreenState = "loading" | "ready" | "empty" | "error";

interface ModalState {
  type: "serving-change" | "delete";
  mealId: string;
  pendingServings?: number;
}

export interface MealScreenProps {
  planDate: string;
  columnId: string;
  slotName: string;
  initialAuthenticated: boolean;
  initialMealNutrition?: PlannerMealNutritionViewMap;
  recipeSnapshotUiMode?: RecipeSnapshotUiMode;
}

// Status data preserved for logic; visual badges removed per Wave1 port.

function formatDateLong(planDate: string) {
  return formatKoreaDate(planDate, {
    month: "long",
    day: "numeric",
  });
}

function formatDateShort(planDate: string) {
  return formatKoreaCompactDate(planDate);
}

function buildProductEntryNextPath(
  planDate: string,
  columnId: string,
  slotName: string,
  entryId: string,
  action: "edit" | "delete",
  quantity?: ProductPlannerEntryQuantity,
) {
  const params = new URLSearchParams();
  if (slotName) params.set("slot", slotName);
  params.set("productAction", action);
  params.set("productEntryId", entryId);
  if (quantity) {
    params.set("productAmount", String(quantity.amount));
    params.set("productUnit", quantity.unit);
  }
  return `/planner/${planDate}/${columnId}?${params.toString()}`;
}

const PRODUCT_ENTRY_RETURN_QUERY_KEYS = [
  "productAction",
  "productEntryId",
  "productAmount",
  "productUnit",
] as const;

function buildProductEntryReturnClearedPath(
  planDate: string,
  columnId: string,
  searchParams: { toString(): string },
) {
  const params = new URLSearchParams(searchParams.toString());
  const hasProductReturnQuery = PRODUCT_ENTRY_RETURN_QUERY_KEYS.some((key) => params.has(key));
  if (!hasProductReturnQuery) return null;
  for (const key of PRODUCT_ENTRY_RETURN_QUERY_KEYS) params.delete(key);
  const query = params.toString();
  return `/planner/${planDate}/${columnId}${query ? `?${query}` : ""}`;
}

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  titleFull: string;
  titleShort: string;
  onBack: () => void;
  onAddMeal: () => void;
  canAdd: boolean;
}

function AppBar({ titleFull, titleShort, onBack, onAddMeal, canAdd }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line-strong)] bg-[var(--surface)]" data-testid="meal-screen-header">
      <div className="flex min-h-[var(--control-height-xl)] items-center gap-2 px-4 py-2.5">
        <AppBackButton onClick={onBack} />
        <h1
          aria-label={titleFull}
          className="min-w-0 flex-1 truncate text-center text-[18px] font-semibold leading-[1.3] text-[var(--foreground)]"
        >
          {/* Full title on ≥361px, short title on narrow */}
          <span className="hidden [@media(min-width:361px)]:inline">{titleFull}</span>
          <span className="[@media(min-width:361px)]:hidden">{titleShort}</span>
        </h1>
        <button aria-label="식사 추가" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--ui-slate-300)] bg-[var(--surface)] text-[var(--brand)] shadow-sm hover:bg-[var(--surface-fill)] disabled:opacity-40" data-testid="meal-screen-add-cta" disabled={!canAdd} onClick={onAddMeal} type="button"><PlusIcon /></button>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 py-4" aria-busy="true" aria-label="식사 목록 불러오는 중" data-testid="meal-screen-loading-skeleton">
      {[0, 1].map((index) => (
        <article key={index} className="border-b border-[var(--line)] pb-5" data-testid="meal-screen-loading-card">
          <div className="flex gap-3">
            <Skeleton className="h-14 w-14 shrink-0 rounded-xl" data-testid="meal-screen-loading-thumb" />
            <div className="flex-1 space-y-3"><Skeleton className="h-5 w-36 max-w-full" /><Skeleton className="h-4 w-20" /></div>
          </div>
          <Skeleton className="mt-4 h-11 w-full rounded-xl" data-testid="meal-screen-loading-action" />
        </article>
      ))}
    </div>
  );
}

function isAllPantryCompletion(
  result: ShoppingListCreateData,
): result is ShoppingListAllPantryCompletionSummary {
  return "completed_without_list" in result && result.completed_without_list === true;
}

function isAllPantryShoppingList(
  result: ShoppingListCreateData,
): result is ShoppingListAllPantrySummary {
  return (
    "all_items_in_pantry" in result &&
    result.all_items_in_pantry === true &&
    typeof result.id === "string"
  );
}

function MealWebConfirmDialog({
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  testId,
  title,
  titleId,
}: {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  testId: string;
  title: string;
  titleId: string;
}) {
  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog aria-labelledby={titleId} className="web-confirm-dialog" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id={titleId}>{title}</WebDialogTitle>
          <WebIconButton aria-label="닫기" onClick={onCancel}>
            <CloseIcon />
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-confirm-body">
            <span
              aria-hidden="true"
              className="web-confirm-icon"
            >
              ?
            </span>
            <p className="web-confirm-copy">{description}</p>
          </div>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            data-testid={testId}
            onClick={onConfirm}
          >
            {confirmLabel}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

// ─── Center modal backdrop + container ───────────────────────────────────────

interface CenterModalProps {
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  labelledBy?: string;
}

function CenterModal({ children, initialFocusRef, onClose, labelledBy }: CenterModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogBoundary({ dialogRef, initialFocusRef, onClose });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      ref={dialogRef}
      tabIndex={-1}
    >
      {/* backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--overlay-40)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* content */}
      <div
        className="relative w-full max-w-sm rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_var(--shadow-color-strong)] lg:rounded-[var(--radius-sheet)] lg:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex justify-center lg:hidden">
          <span className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MealScreen({
  planDate,
  columnId,
  slotName,
  initialAuthenticated,
  initialMealNutrition = {},
  recipeSnapshotUiMode = "legacy_v1",
}: MealScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appReturn = useAppReturn({ fallback: `/planner?${new URLSearchParams({ date: planDate })}` });
  const isDesktopViewport = useDesktopViewport();

  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [meals, setMeals] = useState<MealListItemData[]>([]);
  const [productEntries, setProductEntries] = useState<MealProductPlannerEntryData[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictErrors, setConflictErrors] = useState<Record<string, string>>({});
  const [deletedMealId, setDeletedMealId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [pendingMealIds, setPendingMealIds] = useState<Set<string>>(new Set());
  const [pendingProductIds, setPendingProductIds] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<{
    entry: MealProductPlannerEntryData;
    amount: string;
    unit: ProductPlannerEntryQuantity["unit"];
    error: string | null;
  } | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<MealProductPlannerEntryData | null>(null);
  const [deleteProductError, setDeleteProductError] = useState<string | null>(null);
  const [authReturnPath, setAuthReturnPath] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const restoredProductContextRef = useRef(false);
  const pendingProductEditIdsRef = useRef<Set<string>>(new Set());
  const pendingProductDeleteIdsRef = useRef<Set<string>>(new Set());
  const pendingCookingMealIdsRef = useRef<Set<string>>(new Set());
  const pendingShoppingMealIdsRef = useRef<Set<string>>(new Set());
  const productEditInputRef = useRef<HTMLInputElement>(null);
  const [mealAddSheetOpen, setMealAddSheetOpen] = useState(false);
  const [mealAddPickerMode, setMealAddPickerMode] =
    useState<MealAddPickerMode | null>(null);
  const [allPantryCompletion, setAllPantryCompletion] =
    useState<ShoppingListAllPantryCompletionSummary | ShoppingListAllPantrySummary | null>(
      null,
    );
  const handleNutritionUnauthorized = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (slotName) params.set("slot", slotName);
    setAuthReturnPath(`/planner/${planDate}/${columnId}?${params}`);
    setAuthState("unauthorized");
  }, [columnId, planDate, searchParams, slotName]);
  const nutritionRequest = usePlannerNutritionSummary({
    enabled: authState === "authenticated",
    endDate: planDate,
    onUnauthorized: handleNutritionUnauthorized,
    startDate: planDate,
  });

  // ── Auth setup (identical pattern to PlannerWeekScreen) ──────────────────
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
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        if (!mounted) {
          return;
        }
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
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  // ── Meal loading ─────────────────────────────────────────────────────────
  const loadMeals = useCallback(async () => {
    setScreenState("loading");
    setErrorMessage(null);
    try {
      const data = await fetchMeals(planDate, columnId);
      setMeals(data.items);
      setProductEntries(data.product_entries ?? []);
      setScreenState(
        data.items.length === 0 && (data.product_entries ?? []).length === 0
          ? "empty"
          : "ready",
      );
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setErrorMessage(
        isMealApiError(error) ? error.message : "식사 목록을 불러오지 못했어요.",
      );
      setScreenState("error");
    }
  }, [planDate, columnId]);

  useEffect(() => {
    if (authState !== "authenticated") {
      return;
    }
    void loadMeals();
  }, [authState, loadMeals]);

  // ── Sync screenState when meals list changes ──────────────────────────────
  useEffect(() => {
    if (screenState === "ready" || screenState === "empty") {
      setScreenState(
        meals.length === 0 && productEntries.length === 0 ? "empty" : "ready",
      );
    }
  }, [meals, productEntries]); // eslint-disable-line react-hooks/exhaustive-deps

  const mergedEntries = useMemo(
    () => mergeMealScreenEntries(meals, productEntries),
    [meals, productEntries],
  );
  const displayedMeals = useMemo(
    () => mergedEntries.filter((entry) => entry.entry_type === "recipe").map((entry) => entry.recipe),
    [mergedEntries],
  );
  const displayedProductEntries = useMemo(
    () => mergedEntries.filter((entry) => entry.entry_type === "product").map((entry) => entry.product),
    [mergedEntries],
  );

  useEffect(() => {
    if (authState !== "authenticated" || restoredProductContextRef.current || screenState !== "ready") return;
    const stored = readProductPlannerReturnContext();
    const storedEntry = stored?.kind === "meal-entry" &&
      stored.planDate === planDate && stored.columnId === columnId && stored.slotName === slotName
      ? stored
      : null;
    const fallbackAction = searchParams.get("productAction");
    const action = storedEntry?.action ?? (fallbackAction === "edit" || fallbackAction === "delete" ? fallbackAction : null);
    const entryId = storedEntry?.entryId ?? searchParams.get("productEntryId");
    if (!action || !entryId) return;
    restoredProductContextRef.current = true;
    const entry = displayedProductEntries.find((item) => item.id === entryId);
    if (!entry) {
      clearProductPlannerReturnContext();
      return;
    }
    if (action === "delete") {
      setDeleteProductError(null);
      setDeletingProduct(entry);
      return;
    }
    const amount = storedEntry?.quantityAmount ?? searchParams.get("productAmount") ?? String(entry.quantity.amount);
    const unit = storedEntry?.quantityUnit ?? searchParams.get("productUnit") ?? entry.quantity.unit;
    const compatible = buildCompatibleFoodProductUnits(entry);
    setEditingProduct({
      entry,
      amount,
      unit: compatible.includes(unit as ProductPlannerEntryQuantity["unit"])
        ? unit as ProductPlannerEntryQuantity["unit"]
        : entry.quantity.unit,
      error: null,
    });
  }, [authState, columnId, displayedProductEntries, planDate, screenState, searchParams, slotName]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clearConflictError(mealId: string) {
    setConflictErrors((prev) => {
      const next = { ...prev };
      delete next[mealId];
      return next;
    });
  }

  function setConflictError(mealId: string) {
    setConflictErrors((prev) => ({
      ...prev,
      [mealId]: "변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요.",
    }));
  }

  function setMealActionError(mealId: string, message: string) {
    setConflictErrors((prev) => ({
      ...prev,
      [mealId]: message,
    }));
  }

  function showSuccess(message: string, title = "완료") {
    setFeedback({ message, tone: "success" });
    emitAppActionNotification({ message, title });
  }

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  function addPending(mealId: string) {
    setPendingMealIds((prev) => new Set([...prev, mealId]));
  }

  function removePending(mealId: string) {
    setPendingMealIds((prev) => {
      const next = new Set(prev);
      next.delete(mealId);
      return next;
    });
  }

  // ── API actions ───────────────────────────────────────────────────────────
  async function applyServingChange(mealId: string, newServings: number) {
    addPending(mealId);
    clearConflictError(mealId);
    try {
      const updated = await updateMealServings(mealId, newServings);
      setMeals((prev) =>
        prev.map((meal) =>
          meal.id === mealId
            ? { ...meal, planned_servings: updated.planned_servings, status: updated.status }
            : meal,
        ),
      );
      void nutritionRequest.retry();
      router.refresh();
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setConflictError(mealId);
    } finally {
      removePending(mealId);
    }
  }

  async function applyDelete(mealId: string) {
    addPending(mealId);
    clearConflictError(mealId);
    try {
      await deleteMeal(mealId);
      setDeletedMealId(mealId);
      showSuccess("요리계획을 삭제했어요.", "요리계획");
      router.replace(`/planner?date=${planDate}`);
      setMeals((prev) => prev.filter((meal) => meal.id !== mealId));
      void nutritionRequest.retry();
    } catch (error) {
      if (isMealApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setConflictError(mealId);
    } finally {
      removePending(mealId);
    }
  }

  async function startMealCooking(meal: MealListItemData) {
    if (
      meal.status !== "shopping_done"
      || pendingCookingMealIdsRef.current.has(meal.id)
    ) {
      return;
    }

    pendingCookingMealIdsRef.current.add(meal.id);
    addPending(meal.id);
    clearConflictError(meal.id);

    try {
      let session:
        | Awaited<ReturnType<typeof createSnapshotV2CookingSession>>
        | Awaited<ReturnType<typeof createCookingSession>>;
      let sessionContractVersion: RecipeSnapshotUiMode = recipeSnapshotUiMode;
      if (recipeSnapshotUiMode === "snapshot_v2") {
        try {
          session = await createSnapshotV2CookingSession({
            mode: "planner",
            meal_ids: [meal.id],
            expected_meal_revisions: {
              [meal.id]: meal.revision,
            },
          });
        } catch (snapshotError) {
          if (
            !isCookingApiError(snapshotError)
            || snapshotError.code !== "SNAPSHOT_V2_CREATION_DISABLED"
          ) {
            throw snapshotError;
          }
          session = await createCookingSession({
            recipe_id: meal.recipe_id,
            meal_ids: [meal.id],
            cooking_servings: meal.planned_servings,
          });
          sessionContractVersion = "legacy_v1";
        }
      } else {
        session = await createCookingSession({
          recipe_id: meal.recipe_id,
          meal_ids: [meal.id],
          cooking_servings: meal.planned_servings,
        });
      }
      router.push(
        buildReturnHref(getCookingSessionCookModeHref({ session_id: session.session_id, contract_version: sessionContractVersion }), {
          returnTo: currentMealPath,
        }),
      );
    } catch (error) {
      if (isCookingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }

      setMealActionError(
        meal.id,
        isCookingApiError(error)
          ? error.message
          : "요리 세션을 만들지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      pendingCookingMealIdsRef.current.delete(meal.id);
      removePending(meal.id);
    }
  }

  async function createShoppingForMeal(meal: MealListItemData) {
    const openShoppingList = (listId: string) => router.push(
      buildReturnHref(`/shopping/lists/${listId}`, {
        returnTo: currentMealPath,
      }),
    );
    if (meal.shopping_list_id) {
      openShoppingList(meal.shopping_list_id);
      return;
    }
    if (pendingShoppingMealIdsRef.current.has(meal.id)) return;
    if (meal.status !== "registered") {
      setMealActionError(
        meal.id,
        "이미 장보기나 요리 흐름에 들어간 식사는 새 장보기 목록으로 만들 수 없어요.",
      );
      return;
    }

    pendingShoppingMealIdsRef.current.add(meal.id);
    addPending(meal.id);
    clearConflictError(meal.id);

    try {
      const list = await createShoppingList({
        complete_without_list: false,
        meal_configs: [
          {
            meal_id: meal.id,
            shopping_servings: meal.planned_servings,
          },
        ],
      });

      if (isAllPantryShoppingList(list) || isAllPantryCompletion(list)) {
        setAllPantryCompletion(list);
        showSuccess("장보기 준비가 완료됐어요.", "장보기");
        await loadMeals();
        return;
      }

      showSuccess("장보기 목록을 만들었어요.", "장보기");
      router.push(
        buildReturnHref(`/shopping/lists/${list.id}`, {
          returnTo: currentMealPath,
        }),
      );
    } catch (error) {
      if (isShoppingApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }

      if (isShoppingApiError(error) && error.status === 409) {
        try {
          const latest = await fetchMeals(planDate, columnId);
          const existing = latest.items.find((item) => item.id === meal.id)?.shopping_list_id;
          if (existing) {
            openShoppingList(existing);
            return;
          }
        } catch {
          // Keep the original conflict visible if the current list cannot be read.
        }
      }

      setMealActionError(
        meal.id,
        isShoppingApiError(error) && error.status === 409
          ? "이미 다른 장보기 리스트에 포함된 식사예요."
          : isShoppingApiError(error)
            ? error.message
            : "장보기 목록을 만들지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      pendingShoppingMealIdsRef.current.delete(meal.id);
      removePending(meal.id);
    }
  }

  // ── Interaction handlers ──────────────────────────────────────────────────
  function handleStepperTap(meal: MealListItemData, delta: number) {
    const newServings = meal.planned_servings + delta;
    if (newServings < 1) {
      return;
    }
    if (meal.status === "shopping_done" || meal.status === "cook_done") {
      setModal({ type: "serving-change", mealId: meal.id, pendingServings: newServings });
      return;
    }
    void applyServingChange(meal.id, newServings);
  }

  function handleDeleteTap(mealId: string) {
    setModal({ type: "delete", mealId });
  }

  function handleModalCancel() {
    setModal(null);
  }

  function handleServingChangeConfirm() {
    if (!modal || modal.type !== "serving-change" || modal.pendingServings === undefined) {
      return;
    }
    const { mealId, pendingServings } = modal;
    setModal(null);
    void applyServingChange(mealId, pendingServings);
  }

  function handleDeleteConfirm() {
    if (!modal || modal.type !== "delete") {
      return;
    }
    const { mealId } = modal;
    setModal(null);
    void applyDelete(mealId);
  }

  function openProductQuantityEdit(entry: MealProductPlannerEntryData) {
    setEditingProduct({
      entry,
      amount: String(entry.quantity.amount),
      unit: entry.quantity.unit,
      error: null,
    });
  }

  function closeProductQuantityEdit() {
    if (editingProduct && pendingProductEditIdsRef.current.has(editingProduct.entry.id)) return;
    clearProductQuantityEditReturnState();
    setEditingProduct(null);
  }

  function clearProductQuantityEditReturnState() {
    clearProductPlannerReturnContext();
    setAuthReturnPath(null);
    const nextPath = buildProductEntryReturnClearedPath(planDate, columnId, searchParams);
    if (nextPath) router.replace(nextPath);
  }

  function openProductDelete(entry: MealProductPlannerEntryData) {
    setDeleteProductError(null);
    setDeletingProduct(entry);
  }

  function closeProductDelete() {
    if (deletingProduct && pendingProductDeleteIdsRef.current.has(deletingProduct.id)) return;
    clearProductPlannerReturnContext();
    setDeleteProductError(null);
    setDeletingProduct(null);
  }

  async function handleProductQuantityConfirm() {
    if (!editingProduct) return;
    const amount = Number(editingProduct.amount);
    if (
      editingProduct.amount.trim() === "" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setEditingProduct((current) =>
        current ? { ...current, error: "수량은 0보다 큰 숫자로 입력해 주세요." } : null,
      );
      return;
    }

    const entryId = editingProduct.entry.id;
    if (pendingProductEditIdsRef.current.has(entryId)) return;
    pendingProductEditIdsRef.current.add(entryId);
    setPendingProductIds((current) => new Set([...current, entryId]));
    try {
      const updated = await updateProductPlannerEntryQuantity(entryId, {
        quantity: { amount, unit: editingProduct.unit },
      });
      setProductEntries((current) =>
        current.map((entry) => (entry.id === entryId ? updated : entry)),
      );
      void nutritionRequest.retry();
      clearProductQuantityEditReturnState();
      setEditingProduct(null);
    } catch (caught) {
      if (isProductPlannerEntryApiError(caught) && caught.status === 401) {
        const context = {
          version: 1 as const,
          kind: "meal-entry" as const,
          planDate,
          columnId,
          slotName,
          entryId,
          action: "edit" as const,
          quantityAmount: editingProduct.amount,
          quantityUnit: editingProduct.unit,
        };
        saveProductPlannerReturnContext(context);
        setAuthReturnPath(buildProductEntryNextPath(
          planDate,
          columnId,
          slotName,
          entryId,
          "edit",
          { amount, unit: editingProduct.unit },
        ));
        setEditingProduct(null);
        setAuthState("unauthorized");
        return;
      }
      const message = isProductPlannerEntryApiError(caught)
        ? formatProductPlannerEntryErrorMessage(caught)
        : "완제품 수량을 바꾸지 못했어요.";
      setEditingProduct((current) =>
        current ? { ...current, error: message } : null,
      );
    } finally {
      pendingProductEditIdsRef.current.delete(entryId);
      setPendingProductIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
    }
  }

  async function handleProductDeleteConfirm() {
    if (!deletingProduct) return;
    const entryId = deletingProduct.id;
    if (pendingProductDeleteIdsRef.current.has(entryId)) return;
    pendingProductDeleteIdsRef.current.add(entryId);
    setDeleteProductError(null);
    setPendingProductIds((current) => new Set([...current, entryId]));
    try {
      await deleteProductPlannerEntry(entryId);
      setProductEntries((current) => current.filter((entry) => entry.id !== entryId));
      void nutritionRequest.retry();
      clearProductPlannerReturnContext();
      setAuthReturnPath(null);
      setDeletingProduct(null);
    } catch (caught) {
      if (isProductPlannerEntryApiError(caught) && caught.status === 401) {
        saveProductPlannerReturnContext({
          version: 1,
          kind: "meal-entry",
          planDate,
          columnId,
          slotName,
          entryId,
          action: "delete",
        });
        setAuthReturnPath(buildProductEntryNextPath(planDate, columnId, slotName, entryId, "delete"));
        setDeletingProduct(null);
        setAuthState("unauthorized");
        return;
      }
      const message = isProductPlannerEntryApiError(caught)
        ? caught.message
        : "완제품 계획을 삭제하지 못했어요.";
      setDeleteProductError(message);
    } finally {
      pendingProductDeleteIdsRef.current.delete(entryId);
      setPendingProductIds((current) => {
        const next = new Set(current);
        next.delete(entryId);
        return next;
      });
    }
  }

  function openMealAddSheet() {
    setMealAddSheetOpen(true);
    setMealAddPickerMode(null);
  }

  function closeMealAddSheet() {
    setMealAddPickerMode(null);
    setMealAddSheetOpen(false);
  }

  function openMealAddPicker(mode: MealAddPickerMode) {
    setMealAddPickerMode(mode);
  }

  function closeMealAddPicker() {
    setMealAddPickerMode(null);
  }

  async function handleMealAddComplete() {
    setMealAddPickerMode(null);
    setMealAddSheetOpen(false);
    // After adding from one recipe's detail, reveal the whole meal, including
    // the new recipe, without losing the date or the original return context.
    if (searchParams.get("mealId")) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("mealId");
      const query = params.toString();
      router.replace(`/planner/${planDate}/${columnId}${query ? `?${query}` : ""}`, { scroll: false });
    }
    await loadMeals();
    void nutritionRequest.retry();
    showSuccess("요리계획에 추가됐어요.", "요리계획");
  }

  function handleAllPantryCompletionClose() {
    setAllPantryCompletion(null);
  }

  function handleAllPantryCompletionGoPlanner() {
    setAllPantryCompletion(null);
    router.push(`/planner?date=${planDate}`);
  }

  function handleAllPantryCompletionOpenList() {
    if (!allPantryCompletion || typeof allPantryCompletion.id !== "string") {
      handleAllPantryCompletionClose();
      return;
    }

    const listId = allPantryCompletion.id;
    setAllPantryCompletion(null);
    router.push(
      buildReturnHref(`/shopping/lists/${listId}`, {
        returnTo: currentMealPath,
      }),
    );
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const titleFull = slotName
    ? `${formatDateLong(planDate)} · ${slotName}`
    : formatDateLong(planDate);
  const titleShort = slotName
    ? `${formatDateShort(planDate)} · ${slotName}`
    : formatDateShort(planDate);
  const currentColumnNutrition = useMemo(
    () =>
      nutritionRequest.data?.days
        .find((day) => day.plan_date === planDate)
        ?.columns.find((column) => column.column_id === columnId)?.nutrition ??
      null,
    [columnId, nutritionRequest.data, planDate],
  );
  const nutritionStatus = nutritionRequest.status;
  const selectedMealId = searchParams.get("mealId");
  const selectedMeal = displayedMeals.find((meal) => meal.id === selectedMealId);
  const currentMealParams = new URLSearchParams(searchParams.toString());
  if (slotName) currentMealParams.set("slot", slotName);
  const currentMealPath = `/planner/${planDate}/${columnId}${currentMealParams.size ? `?${currentMealParams}` : ""}`;
  const nextPath = authReturnPath ?? currentMealPath;
  function openPlannedMeal(meal: MealListItemData) {
    const params = new URLSearchParams(searchParams.toString());
    if (slotName) params.set("slot", slotName);
    params.set("mealId", meal.id);
    params.set("returnTo", currentMealPath);
    router.push(`/planner/${planDate}/${columnId}?${params}`);
  }
  function openPlannedRecipe(meal: MealListItemData) {
    router.push(buildReturnHref(`/meal/${meal.id}/recipe`, { returnTo: currentMealPath }));
  }
  function onMealAction(meal: MealListItemData) {
    if (meal.status === "cook_done") {
      router.push(buildReturnHref("/leftovers", { returnTo: currentMealPath }));
    } else if (meal.status === "shopping_done") {
      void startMealCooking(meal);
    } else {
      void createShoppingForMeal(meal);
    }
  }
  const mealAddParams = new URLSearchParams({
    columnId,
    date: planDate,
  });
  if (slotName) {
    mealAddParams.set("slot", slotName);
  }
  const mealAddQuery = mealAddParams.toString();
  const mealAddTargetLabel = `${formatDateShort(planDate)}${slotName ? ` ${slotName}` : ""}`;
  function getMealAddRouteHref(mode: MealAddRouteMode) {
    const targetPath =
      mode === "product"
        ? `/menu-add?${mealAddQuery}&source=product`
        : `/menu/add/${mode}?${mealAddQuery}`;

    return buildReturnHref(targetPath, {
      returnTo: currentMealPath,
    });
  }
  const isLoading = authState === "checking" || screenState === "loading";
  const navigateToPlanner = useCallback(() => {
    const destination = new URL(appReturn.href, "http://homecook.local");
    if (destination.pathname === "/planner" && !destination.searchParams.get("date")) {
      destination.searchParams.set("date", planDate);
      router.replace(`${destination.pathname}${destination.search}${destination.hash}`);
      return;
    }
    appReturn.goBack();
  }, [appReturn, planDate, router]);

  // ── Unauthorized gate ─────────────────────────────────────────────────────
  if (authState === "unauthorized") {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--surface-fill)] lg:bg-[var(--background)]"

      >
        <AppBar
          titleFull={titleFull}
          titleShort={titleShort}
          onBack={navigateToPlanner}
          onAddMeal={openMealAddSheet}
          canAdd={false}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
          <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_var(--shadow-color-subtle)]">
            <p className="text-base font-semibold text-[var(--foreground)]">
              식사 목록을 보려면 로그인이 필요해요.
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-3)]">
              로그인하면 이 화면으로 돌아와요.
            </p>
          </div>
          <div data-next-path={nextPath} data-testid="meal-auth-gate-login">
            <SocialLoginButtons nextPath={nextPath} />
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-[var(--surface)]" data-testid="planned-meal-page">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          <AppBar titleFull={selectedMealId ? "계획한 요리" : titleFull} titleShort={selectedMealId ? "계획한 요리" : titleShort} onBack={navigateToPlanner} onAddMeal={openMealAddSheet} canAdd={authState === "authenticated"} />
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4" data-testid="meal-screen-scroll-area">
            {selectedMealId ? <p className="text-sm font-normal text-[var(--text-2)]">{titleFull}</p> : null}
            {!selectedMealId ? <details className="rounded-xl bg-[var(--surface-fill)] px-4 py-3" data-testid="meal-compact-nutrition">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium"><span>계획한 전체 분량</span><span className="font-normal tabular-nums">{currentColumnNutrition ? formatPlannerNutritionValue("energy_kcal", currentColumnNutrition.values.energy_kcal) : nutritionStatus === "loading" ? <Skeleton className="h-5 w-24" /> : "영양 정보 없음"}</span><span aria-hidden="true">⌄</span></summary>
              {currentColumnNutrition ? <dl className="mt-3 grid grid-cols-3 gap-3 text-sm font-normal">{([['carbohydrate_g', '탄수화물'], ['protein_g', '단백질'], ['fat_g', '지방']] as const).map(([code, label]) => <div key={code}><dt className="text-[var(--text-2)]">{label}</dt><dd className="mt-1">{formatPlannerNutritionValue(code, currentColumnNutrition.values[code])}</dd></div>)}</dl> : nutritionRequest.error ? <button className="min-h-11 text-sm text-[var(--brand)]" onClick={() => void nutritionRequest.retry()} type="button">영양 다시 확인</button> : null}
            </details> : null}
            {!selectedMealId && currentColumnNutrition?.warnings.includes("AI_NUTRITION_ESTIMATE_USED") ? <p className="mt-2 text-xs text-[var(--brand-primary-text)]">{plannerAiEstimateNotice(currentColumnNutrition.values, true)}</p> : null}
            {isLoading ? <LoadingSkeleton /> : null}
            {screenState === "error" ? <div className="py-12 text-center" data-testid="meal-screen-error"><p>{errorMessage ?? "식사 목록을 불러오지 못했어요."}</p><button className="mt-3 min-h-11 px-4 text-[var(--brand)]" onClick={() => void loadMeals()} type="button">다시 시도</button></div> : null}
            {!isLoading && screenState !== "error" && selectedMealId && !selectedMeal ? <div className="py-12 text-center"><p>{deletedMealId === selectedMealId ? "요리계획을 삭제했어요." : "이 날짜에 해당 계획이 없어요."}</p><button className="mt-3 min-h-11 text-[var(--brand)]" onClick={navigateToPlanner} type="button">요리계획으로 돌아가기</button></div> : null}
            {screenState === "empty" && !selectedMealId ? <div className="py-12 text-center" data-testid="meal-screen-empty"><p>이 끼니에 등록된 식사가 없어요.</p><button className="mt-3 min-h-11 px-4 font-medium text-[var(--brand)]" onClick={openMealAddSheet} type="button">식사 추가하기</button></div> : null}
            {screenState === "ready" ? (selectedMealId ? selectedMeal ? [selectedMeal] : [] : displayedMeals).map((meal) => <PlannedMealCard key={meal.id} meal={meal} detailed={Boolean(selectedMealId)} nutrition={initialMealNutrition[meal.id]} conflictError={conflictErrors[meal.id] ?? null} isPending={pendingMealIds.has(meal.id)} onOpen={() => openPlannedMeal(meal)} onRecipe={() => openPlannedRecipe(meal)} onDelete={() => handleDeleteTap(meal.id)} onStepDown={() => handleStepperTap(meal, -1)} onStepUp={() => handleStepperTap(meal, 1)} onAction={() => onMealAction(meal)} onShopping={() => void createShoppingForMeal(meal)} />) : null}
            {screenState === "ready" && !selectedMealId ? displayedProductEntries.map((entry) => <ProductPlannerEntryCard entry={entry} isPending={pendingProductIds.has(entry.id)} key={`product:${entry.id}`} onDelete={() => openProductDelete(entry)} onEditQuantity={() => openProductQuantityEdit(entry)} />) : null}
          </main>
        </div>
      </div>

      {mealAddSheetOpen && !mealAddPickerMode ? (
        <MealAddOptionsSheet
          onClose={closeMealAddSheet}
          onPickerSelect={openMealAddPicker}
          routeHrefFor={getMealAddRouteHref}
          targetLabel={mealAddTargetLabel}
          testId="meal-screen-meal-add-sheet"
          title="식사 추가"
        />
      ) : null}

      {mealAddSheetOpen && mealAddPickerMode ? (
        <MealAddPickerFlow
          columnId={columnId}
          entryMode={mealAddPickerMode}
          key={`${planDate}-${columnId}-${mealAddPickerMode}`}
          onClose={closeMealAddPicker}
          onComplete={handleMealAddComplete}
          planDate={planDate}
          slotName={slotName}
        />
      ) : null}

      {allPantryCompletion ? (
        <AllPantryCompletionModal
          completion={allPantryCompletion}
          mealCount={1}
          onClose={handleAllPantryCompletionClose}
          onGoPlanner={handleAllPantryCompletionGoPlanner}
          onOpenShoppingList={handleAllPantryCompletionOpenList}
        />
      ) : null}

      {editingProduct ? (
        <CenterModal initialFocusRef={productEditInputRef} labelledBy="product-quantity-title" onClose={closeProductQuantityEdit}>
          <ModalHeader
            closeDisabled={pendingProductIds.has(editingProduct.entry.id)}
            onClose={closeProductQuantityEdit}
            title="완제품 수량 변경"
            titleId="product-quantity-title"
          />
          <p className="mt-2 text-sm text-[var(--text-2)]">
            {editingProduct.entry.product_name}의 저장된 영양 기준에 맞는 단위만 선택할 수 있어요.
          </p>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_112px] gap-2">
            <label className="grid gap-1 text-xs font-medium text-[var(--text-2)]">
              수량
              <input
                aria-label="완제품 변경 수량"
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none"
                disabled={pendingProductIds.has(editingProduct.entry.id)}
                inputMode="decimal"
                min={editingProduct.unit === "g" || editingProduct.unit === "ml" ? "1" : "0.01"}
                onChange={(event) =>
                  setEditingProduct((current) =>
                    current ? { ...current, amount: event.target.value, error: null } : null,
                  )
                }
                step={editingProduct.unit === "g" || editingProduct.unit === "ml" ? "1" : "any"}
                ref={productEditInputRef}
                type="number"
                value={editingProduct.amount}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-[var(--text-2)]">
              단위
              <select
                aria-label="완제품 변경 수량 단위"
                className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base outline-none"
                disabled={pendingProductIds.has(editingProduct.entry.id)}
                onChange={(event) =>
                  setEditingProduct((current) =>
                    current
                      ? {
                          ...current,
                          unit: event.target.value as ProductPlannerEntryQuantity["unit"],
                          error: null,
                        }
                      : null,
                  )
                }
                value={editingProduct.unit}
              >
                {buildCompatibleFoodProductUnits(editingProduct.entry).map((unit) => (
                  <option key={unit} value={unit}>{formatProductUnit(unit)}</option>
                ))}
              </select>
            </label>
          </div>
          {editingProduct.error ? (
            <p className="mt-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger)]" role="alert">
              {editingProduct.error}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] font-medium disabled:opacity-50" disabled={pendingProductIds.has(editingProduct.entry.id)} onClick={closeProductQuantityEdit} type="button">취소</button>
            <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand)] font-medium text-[var(--text-inverse)] disabled:opacity-50" disabled={pendingProductIds.has(editingProduct.entry.id)} onClick={() => void handleProductQuantityConfirm()} type="button">수량 변경</button>
          </div>
        </CenterModal>
      ) : null}

      {deletingProduct ? (
        <CenterModal labelledBy="product-delete-title" onClose={closeProductDelete}>
          <ModalHeader
            onClose={closeProductDelete}
            title="완제품 계획 삭제"
            titleId="product-delete-title"
          />
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {deletingProduct.product_name}의 이 플래너 항목만 삭제할까요? 레시피 식사와 등록된 완제품 원본은 삭제되지 않아요.
          </p>
          {deleteProductError ? (
            <p className="mt-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger)]" role="alert">
              {deleteProductError}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] font-medium disabled:opacity-50" disabled={pendingProductIds.has(deletingProduct.id)} onClick={closeProductDelete} type="button">취소</button>
            <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--danger)] font-medium text-[var(--text-inverse)] disabled:opacity-50" data-testid="product-delete-confirm" disabled={pendingProductIds.has(deletingProduct.id)} onClick={() => void handleProductDeleteConfirm()} type="button">삭제</button>
          </div>
        </CenterModal>
      ) : null}

      {/* Serving-change confirmation modal */}
      {modal?.type === "serving-change" ? (
        isDesktopViewport ? (
          <MealWebConfirmDialog
            confirmLabel="변경하기"
            description="이미 진행된 식사예요. 인분을 바꾸면 장보기/요리 흐름을 다시 진행해야 할 수 있어요."
            onCancel={handleModalCancel}
            onConfirm={handleServingChangeConfirm}
            testId="serving-change-confirm"
            title="인분 변경"
            titleId="serving-change-title"
          />
        ) : (
          <CenterModal labelledBy="serving-change-title" onClose={handleModalCancel}>
            <ModalHeader
              title="인분 변경"
              titleId="serving-change-title"
              onClose={handleModalCancel}
            />
            <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
              이미 진행된 식사예요. 인분을 바꾸면 장보기/요리 흐름을 다시 진행해야 할 수 있어요.
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                className="flex-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-alpha-60)] py-3.5 text-sm font-semibold text-[var(--foreground)]"
                onClick={handleModalCancel}
                type="button"
              >
                취소
              </button>
              <button
                className="flex-[2] rounded-[var(--radius-card)] bg-[var(--brand)] py-3.5 text-sm font-medium text-[var(--text-inverse)]"
                data-testid="serving-change-confirm"
                onClick={handleServingChangeConfirm}
                type="button"
              >
                변경하기
              </button>
            </div>
          </CenterModal>
        )
      ) : null}

      {/* One deletion sheet across desktop and mobile, matching meal-log deletion. */}
      {modal?.type === "delete" ? (
        <PlannerTaskSheet
          ariaLabelledBy="delete-confirm-title"
          title={[formatDateLong(planDate), slotName].filter(Boolean).join(" ")}
          onClose={handleModalCancel}
          closeDisabled={pendingMealIds.has(modal.mealId)}
          bodyClassName="space-y-5 pb-6"
        >
          <h3 className="text-xl font-medium">{meals.find((meal) => meal.id === modal.mealId)?.recipe_title ?? "선택한 요리"}</h3>
          <p className="text-sm text-[var(--text-2)]">{meals.find((meal) => meal.id === modal.mealId)?.planned_servings}인분</p>
          <div className="grid grid-cols-2 gap-3">
            <button className="min-h-12 rounded-xl border font-medium" disabled={pendingMealIds.has(modal.mealId)} onClick={handleModalCancel} type="button">취소</button>
            <button className="min-h-12 rounded-xl bg-[var(--danger-strong)] px-4 font-medium text-white disabled:opacity-50" data-testid="delete-confirm" disabled={pendingMealIds.has(modal.mealId)} onClick={handleDeleteConfirm} type="button">삭제</button>
          </div>
        </PlannerTaskSheet>
      ) : null}
      {feedback ? (
        <AppFeedbackToast
          message={feedback.message}
          position="mobileTop"
          tone={feedback.tone}
        />
      ) : null}
    </>
  );
}
