"use client";

import { COOKED_BATCH_CHANGED_EVENT, readChangedCookedBatchId } from "@/lib/cooked-batch-events";
import { Skeleton } from "@/components/ui/skeleton";

import { fetchMealLogNutritionPreview } from "@/lib/api/meal-log-preview";
import { MealLogMacroBar } from "@/components/planner/meal-log-nutrition-chart";
import { formatMealLogNumber, MEAL_LOG_MACROS } from "@/lib/planner/meal-log-nutrition-presentation";
import type { MealLogNutritionEvidence } from "@/types/meal-log";

import { DecimalInput } from "@/components/shared/decimal-input";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDialogViewport } from "@/components/shared/use-dialog-viewport";
import { useBackdropDismiss } from "@/components/shared/use-backdrop-dismiss";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { fetchFoodCatalogSearch, fetchFoodCatalogSource, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { fetchCookedBatches, type CookedBatchListData } from "@/lib/api/cooking";
import { fetchMealLogRecent, isMealLogApiError } from "@/lib/api/meal-log";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { formatProductUnit } from "@/lib/planner/product-planner-entry-presentation";
import type { CookedBatchProjection } from "@/types/cooking";
import type { MealLogColumn, MealLogRecentItem, MealLogSourceType } from "@/types/meal-log";

type SourceTab = "recent" | "cooked" | "catalog";

const SOURCE_TABS: Array<{ id: SourceTab; label: string }> = [
  { id: "recent", label: "최근" },
  { id: "cooked", label: "요리한 음식" },
  { id: "catalog", label: "제품·재료" },
];

export interface MealLogSourceSelection {
  type: MealLogSourceType;
  id: string;
  name: string;
  brand: string | null;
  amount: number;
  maxAmount?: number;
  unit: string;
  unitOptions?: string[];
  basisUnit?: string;
  basisRelations?: Array<{
    from: { amount: number; unit: string };
    to: { amount: number; unit: string };
  }>;
}

interface MealLogAddSheetProps {
  columns: MealLogColumn[];
  date: string;
  initialColumnId: string;
  initialSelection?: MealLogSourceSelection;
  initialSuggestionConfirmed?: boolean;
  mutationEnabled?: boolean;
  onClose: () => void;
  returnFocusTarget?: () => HTMLElement | null;
  onSave: (selection: MealLogSourceSelection, columnId: string, date: string) => Promise<void>;
  onUnauthorized: (selection: MealLogSourceSelection | null, columnId: string, date?: string) => void;
}


function dateLabel(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function cookedDateLabel(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function sourceName(item: FoodCatalogSearchItem) {
  return item.type === "ingredient" ? item.standard_name : item.name;
}

function sourceBrand(item: FoodCatalogSearchItem) {
  return item.type === "ingredient" ? null : item.brand;
}

function quantityUnitLabel(unit: string) {
  return unit === "serving" || unit === "package" || unit === "g" || unit === "ml"
    ? formatProductUnit(unit)
    : unit;
}

function sourceUnit(item: FoodCatalogSearchItem) {
  if (item.type === "ingredient") {
    return "g";
  }
  return item.nutrition.basis.unit;
}

function sourceUnitOptions(item: FoodCatalogSearchItem) {
  if (item.type === "ingredient") return ["g", "kg"];
  return [...new Set([
    item.nutrition.basis.unit,
    ...item.basis_relations
      .filter((relation) => relation.from.amount > 0 && relation.to.amount > 0
        && Number.isFinite(relation.from.amount) && Number.isFinite(relation.to.amount)
        && (relation.from.unit === item.nutrition.basis.unit || relation.to.unit === item.nutrition.basis.unit))
      .flatMap((relation) => [relation.from.unit, relation.to.unit]),
  ])];
}

function convertSelectionAmount(selection: MealLogSourceSelection, nextUnit: string) {
  if (selection.unit === nextUnit) return selection.amount;
  if (selection.unit === "g" && nextUnit === "kg") return selection.amount / 1_000;
  if (selection.unit === "kg" && nextUnit === "g") return selection.amount * 1_000;
  const basisUnit = selection.basisUnit;
  if (!basisUnit) return null;
  const factorToBasis = (unit: string) => {
    if (unit === basisUnit) return 1;
    const relation = selection.basisRelations?.find((candidate) =>
      (candidate.from.unit === unit && candidate.to.unit === basisUnit)
      || (candidate.to.unit === unit && candidate.from.unit === basisUnit));
    if (!relation) return null;
    return relation.from.unit === unit
      ? relation.to.amount / relation.from.amount
      : relation.from.amount / relation.to.amount;
  };
  const currentFactor = factorToBasis(selection.unit);
  const nextFactor = factorToBasis(nextUnit);
  return currentFactor === null || nextFactor === null
    ? null
    : selection.amount * currentFactor / nextFactor;
}

function recentSourceLabel(type: MealLogSourceType) {
  if (type === "cooked_batch") return "요리한 음식";
  return type === "food_product" ? "제품" : "재료";
}

function catalogSourceLabel(item: FoodCatalogSearchItem) {
  if (item.type === "ingredient") return "재료";
  if (item.source_type === "public_dataset") return "제품 · 공공 영양DB";
  return item.visibility === "public" ? "제품 · 사용자 등록" : "제품 · 비공개 보관";
}

function isUnauthorized(error: unknown) {
  return error instanceof Error
    && "status" in error
    && (error as Error & { status: unknown }).status === 401;
}

function isAvailableCookedBatch(batch: CookedBatchProjection) {
  return batch.status !== "eaten" && ((batch.weight_status === null && batch.batch_status === null)
    || (batch.weight_status === "known"
      && batch.batch_status === "available"
      && (batch.remaining_weight_g ?? 0) > 0));
}

async function findCookedBatch(
  firstPage: CookedBatchListData,
  batchId: string,
  isActive: () => boolean,
) {
  let page = firstPage;
  const visitedCursors = new Set<string>();

  while (isActive()) {
    const batch = page.items.find((item) => item.id === batchId);
    if (batch) return batch;
    if (!page.has_next || !page.next_cursor || visitedCursors.has(page.next_cursor)) return null;

    const cursor = page.next_cursor;
    visitedCursors.add(cursor);
    page = await fetchCookedBatches({ availability: "all", cursor, limit: 20 });
  }
  return null;
}

async function findRecentCatalogSource(item: MealLogRecentItem, isActive: () => boolean) {
  if (item.source.type === "cooked_batch") return null;
  const source = await fetchFoodCatalogSource(item.source.type, item.source.id);
  return isActive() ? source : null;
}

export function MealLogAddSheet({
  columns,
  date,
  initialColumnId,
  initialSelection,
  initialSuggestionConfirmed = true,
  mutationEnabled = true,
  onClose,
  returnFocusTarget,
  onSave,
  onUnauthorized,
}: MealLogAddSheetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const viewportStyle = useDialogViewport();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const restoredCookedBatchId = initialSelection?.type === "cooked_batch"
    ? initialSelection.id
    : null;
  const [tab, setTab] = useState<SourceTab>(
    initialSelection?.type === "cooked_batch" ? "cooked" : initialSelection ? "catalog" : "recent",
  );
  const columnId = initialColumnId;
  const [recent, setRecent] = useState<MealLogRecentItem[]>([]);
  const [recentCursor, setRecentCursor] = useState<string | null>(null);
  const [recentHasNext, setRecentHasNext] = useState(false);
  const [batches, setBatches] = useState<CookedBatchProjection[]>([]);
  const [batchCursor, setBatchCursor] = useState<string | null>(null);
  const [batchHasNext, setBatchHasNext] = useState(false);
  const [catalog, setCatalog] = useState<FoodCatalogSearchItem[]>([]);
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null);
  const [catalogHasNext, setCatalogHasNext] = useState(false);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [catalogLoadedQuery, setCatalogLoadedQuery] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const catalogRequestRef = useRef(0);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<MealLogSourceSelection | null>(initialSelection ?? null);
  const [amountStep, setAmountStep] = useState(Boolean(initialSelection));
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const sourceScrollRef = useRef<HTMLDivElement>(null);
  const sourceScrollTop = useRef(0);
  const [inputEdited, setInputEdited] = useState(false);
  useEffect(() => {
    if (selection?.id) setAmountStep(true);
  }, [selection?.id, selection?.type]);
  useEffect(() => {
    const scroll = sourceScrollRef.current;
    if (!scroll) return;
    if (amountStep) { headingRef.current?.focus({ preventScroll: true }); sourceScrollTop.current = scroll.scrollTop; scroll.scrollTop = 0; }
    else scroll.scrollTop = sourceScrollTop.current;
  }, [amountStep]);
  const [amount, setAmount] = useState<number | null>(initialSelection?.amount ?? null);
  useLayoutEffect(() => setAmount(selection?.amount ?? null), [selection?.id, selection?.type, selection?.unit, selection?.amount]);
  const [preview, setPreview] = useState<MealLogNutritionEvidence | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewRetry, setPreviewRetry] = useState(0);
  const previewSourceType = selection?.type;
  const previewSourceId = selection?.id;
  const previewUnit = selection?.unit;
  useEffect(() => {
    setPreview(null);
    setPreviewError(false);
    if (!amountStep || !previewSourceType || !previewSourceId || !previewUnit || amount === null || !Number.isFinite(amount) || amount < 0.01) {
      setPreviewLoading(false);
      return;
    }
    const controller = new AbortController();
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void fetchMealLogNutritionPreview({ source: { type: previewSourceType, id: previewSourceId }, quantity: { amount, unit: previewUnit } }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setPreview(result.nutrition); })
        .catch(() => { if (!controller.signal.aborted) setPreviewError(true); })
        .finally(() => { if (!controller.signal.aborted) setPreviewLoading(false); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [amount, amountStep, previewSourceId, previewSourceType, previewUnit, previewRetry]);
  const amountInvalid = amount === null || !Number.isFinite(amount) || amount < 0.01;
  const [restoredSourcePending, setRestoredSourcePending] = useState(Boolean(initialSelection));
  const [suggestionConfirmed, setSuggestionConfirmed] = useState(initialSuggestionConfirmed);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"batch" | "catalog" | "recent" | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingRecentId, setCheckingRecentId] = useState<string | null>(null);
  const [unavailableRecentBatchIds, setUnavailableRecentBatchIds] = useState<Set<string>>(new Set());
  const selectionRequestRef = useRef(0);
  const batchGeneration = useRef(0);
  const [batchRefresh, setBatchRefresh] = useState(0);
  useEffect(() => {
    const changed = (event: Event) => {
      const id = readChangedCookedBatchId(event);
      if (!id) return;
      ++batchGeneration.current;
      ++selectionRequestRef.current;
      setCheckingRecentId(null);
      setSelection(current => current?.type === "cooked_batch" && current.id === id ? null : current);
      setBatches(current => current.filter(batch => batch.id !== id));
      setUnavailableRecentBatchIds(current => new Set(current).add(id));
      setBatchRefresh(current => current + 1);
    };
    window.addEventListener(COOKED_BATCH_CHANGED_EVENT, changed);
    return () => window.removeEventListener(COOKED_BATCH_CHANGED_EVENT, changed);
  }, []);
  const restoredSelectionPending = restoredSourcePending
    && selection?.type === initialSelection?.type
    && selection?.id === initialSelection?.id;

  const requestClose = () => {
    if (saving) return;
    if (selection && (inputEdited || amount !== selection.amount)) {
      setDiscardConfirm(true);
    } else onClose();
  };

  const backdropDismiss = useBackdropDismiss(requestClose);

  const { setReturnFocusTarget } = useDialogBoundary({
    closeOnEscape: !saving,
    dialogRef,
    initialFocusRef: closeRef,
    onClose: requestClose,
  });
  useEffect(() => { if (returnFocusTarget) setReturnFocusTarget(returnFocusTarget); }, [returnFocusTarget, setReturnFocusTarget]);
  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);
  useEffect(() => () => { selectionRequestRef.current += 1; }, []);

  useEffect(() => {
    let active = true;
    const generation = batchGeneration.current;
    const isCurrent = () => active && generation === batchGeneration.current;
    const restorationRequest = selectionRequestRef.current;
    setLoading(true);
    Promise.all([
      fetchMealLogRecent(),
      fetchCookedBatches({ availability: "all", limit: 20 }),
    ])
      .then(async ([recentData, batchData]) => {
        if (!isCurrent()) return;
        setRecent(recentData.items);
        setRecentCursor(recentData.next_cursor);
        setRecentHasNext(recentData.has_next);
        setBatches(batchData.items);
        setUnavailableRecentBatchIds(current => {
          const next = new Set(current);
          for (const batch of batchData.items) {
            if (isAvailableCookedBatch(batch)) next.delete(batch.id);
            else if (batch.status === "eaten" || batch.batch_status === "depleted") next.add(batch.id);
          }
          return next;
        });
        setBatchCursor(batchData.next_cursor);
        setBatchHasNext(batchData.has_next);
        if (restoredCookedBatchId) {
          const batch = await findCookedBatch(batchData, restoredCookedBatchId, isCurrent);
          if (!isCurrent()) return;
          setSelection((current) => {
            if (current?.type !== "cooked_batch" || current.id !== restoredCookedBatchId) return current;
            if (!batch || !isAvailableCookedBatch(batch)) return null;
            return {
              ...current,
              brand: null,
              maxAmount: batch.remaining_weight_g ?? undefined,
              name: batch.recipe_title,
              unit: "g",
            };
          });
        } else if (initialSelection && initialSelection.type !== "cooked_batch") {
          const source = await fetchFoodCatalogSource(
            initialSelection.type, initialSelection.id,
          );
          if (!isCurrent() || restorationRequest !== selectionRequestRef.current) return;
          if (!source || !sourceUnitOptions(source).includes(initialSelection.unit)) {
            setSelection(null);
            setError("이 음식의 현재 정보나 단위를 확인할 수 없어요. 제품·재료 검색에서 다시 선택해 주세요.");
          } else {
            setSelection((current) => current?.id === initialSelection.id && current.type === initialSelection.type
              ? { ...current, name: sourceName(source), brand: sourceBrand(source), unitOptions: sourceUnitOptions(source),
                  basisRelations: source.type === "food_product" ? source.basis_relations : undefined,
                  basisUnit: source.type === "food_product" ? source.nutrition.basis.unit : undefined }
              : current);
          }
        }
      })
      .catch((reason: unknown) => {
        if (!isCurrent()) return;
        if (initialSelection && restorationRequest === selectionRequestRef.current) {
          setSelection((current) => current?.type === initialSelection.type
            && current.id === initialSelection.id ? null : current);
        }
        if (isUnauthorized(reason)) {
          onUnauthorized(initialSelection ?? null, columnId);
          return;
        }
        setError(reason instanceof Error ? reason.message : "음식 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (isCurrent()) {
          setLoading(false);
          setRestoredSourcePending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [batchRefresh, columnId, initialSelection, onUnauthorized, restoredCookedBatchId]);

  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === columnId),
    [columnId, columns],
  );

  useEffect(() => {
    const requestId = ++catalogRequestRef.current;
    catalogAbortRef.current?.abort();
    setCatalog([]);
    setCatalogCursor(null);
    setCatalogHasNext(false);
    setCatalogSearching(false);
    setCatalogLoadedQuery(null);
    if (tab !== "catalog") return;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    setCatalogSearching(true);
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      setError(null);
      void fetchFoodCatalogSearch({
        q: normalizedQuery,
        signal: controller.signal,
        types: ["food_product", "ingredient"],
      })
        .then((result) => {
          if (controller.signal.aborted || requestId !== catalogRequestRef.current) return;
          setCatalog(result.items);
          setCatalogLoadedQuery(normalizedQuery);
          setCatalogCursor(result.next_cursor);
          setCatalogHasNext(result.has_next);
        })
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          if (isUnauthorized(reason)) {
            onUnauthorized(null, columnId);
            return;
          }
          setError(reason instanceof Error ? reason.message : "제품·재료를 검색하지 못했어요.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setCatalogSearching(false);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      catalogAbortRef.current?.abort();
      catalogRequestRef.current += 1;
    };
  }, [columnId, onUnauthorized, query, tab]);

  async function loadMoreRecent() {
    const generation = batchGeneration.current;
    if (!recentHasNext || !recentCursor || loadingMore) return;
    setLoadingMore("recent");
    setError(null);
    try {
      const result = await fetchMealLogRecent({ cursor: recentCursor });
      if (generation !== batchGeneration.current) return;
      setRecent((current) => [...current, ...result.items]);
      setRecentCursor(result.next_cursor);
      setRecentHasNext(result.has_next);
    } catch (reason) {
      if (isUnauthorized(reason)) {
        onUnauthorized(selection, columnId);
        return;
      }
      setError(reason instanceof Error ? reason.message : "최근 음식을 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(null);
    }
  }

  async function loadMoreBatches() {
    const generation = batchGeneration.current;
    if (!batchHasNext || !batchCursor || loadingMore) return;
    setLoadingMore("batch");
    setError(null);
    try {
      const result = await fetchCookedBatches({ availability: "all", cursor: batchCursor, limit: 20 });
      if (generation !== batchGeneration.current) return;
      setBatches((current) => [...new Map([...current, ...result.items].map((batch) => [batch.id, batch])).values()]);
      setBatchCursor(result.next_cursor);
      setBatchHasNext(result.has_next);
    } catch (reason) {
      if (isUnauthorized(reason)) {
        onUnauthorized(selection, columnId);
        return;
      }
      setError(reason instanceof Error ? reason.message : "요리한 음식을 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(null);
    }
  }

  async function loadMoreCatalog() {
    if (!catalogHasNext || !catalogCursor || loadingMore) return;
    const requestId = catalogRequestRef.current;
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    setLoadingMore("catalog");
    setError(null);
    try {
      const result = await fetchFoodCatalogSearch({
        cursor: catalogCursor,
        q: query,
        signal: controller.signal,
        types: ["food_product", "ingredient"],
      });
      if (controller.signal.aborted || requestId !== catalogRequestRef.current) return;
      setCatalog((current) => [...current, ...result.items]);
      setCatalogCursor(result.next_cursor);
      setCatalogHasNext(result.has_next);
    } catch (reason) {
      if (controller.signal.aborted || requestId !== catalogRequestRef.current) return;
      if (isUnauthorized(reason)) {
        onUnauthorized(selection, columnId);
        return;
      }
      setError(reason instanceof Error ? reason.message : "제품·재료를 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(null);
    }
  }

  function cancelPendingSelection() {
    selectionRequestRef.current += 1;
    setCheckingRecentId(null);
  }

  async function chooseRecent(item: MealLogRecentItem) {
    cancelPendingSelection();
    const requestId = selectionRequestRef.current;
    setSelection(null);
    setError(null);
    if (item.source.type !== "cooked_batch") {
      setCheckingRecentId(item.source.id);
      try {
        const source = await findRecentCatalogSource(item, () => requestId === selectionRequestRef.current);
        if (requestId !== selectionRequestRef.current) return;
        if (!source) {
          setError("이 음식의 현재 정보를 확인할 수 없어요. 제품·재료 검색에서 다시 찾아 주세요.");
          return;
        }
        const unitOptions = sourceUnitOptions(source);
        if (!unitOptions.includes(item.last_quantity.unit)) {
          setError("이전 기록의 단위는 현재 사용할 수 없어요. 제품·재료 검색에서 음식을 골라 먹은 양을 다시 입력해 주세요.");
          return;
        }
        setSelection({
          amount: item.last_quantity.amount,
          brand: sourceBrand(source),
          id: source.id,
          name: sourceName(source),
          type: source.type,
          unit: item.last_quantity.unit,
          unitOptions,
          basisRelations: source.type === "food_product" ? source.basis_relations : undefined,
          basisUnit: source.type === "food_product" ? source.nutrition.basis.unit : undefined,
        });
        setSuggestionConfirmed(false);
      } catch (reason) {
        if (requestId !== selectionRequestRef.current) return;
        if (isUnauthorized(reason)) onUnauthorized(null, columnId);
        else setError(reason instanceof Error ? reason.message : "음식의 현재 정보를 확인하지 못했어요. 다시 선택해 주세요.");
      } finally {
        if (requestId === selectionRequestRef.current) setCheckingRecentId(null);
      }
      return;
    }
    let matchingBatch = item.source.type === "cooked_batch"
      ? batches.find((batch) => batch.id === item.source.id)
      : null;
    if (item.source.type === "cooked_batch") {
      if (item.last_quantity.unit !== "g") return;
      if (!matchingBatch) {
        setSelection(null);
        setCheckingRecentId(item.source.id);
        setError(null);
        try {
          matchingBatch = await findCookedBatch(
            { items: batches, has_next: batchHasNext, next_cursor: batchCursor },
            item.source.id,
            () => requestId === selectionRequestRef.current,
          );
          if (requestId !== selectionRequestRef.current) return;
          if (matchingBatch) {
            const foundBatch = matchingBatch;
            setBatches((current) => current.some((batch) => batch.id === foundBatch.id) ? current : [...current, foundBatch]);
          }
        } catch (reason) {
          if (requestId !== selectionRequestRef.current) return;
          if (isUnauthorized(reason)) onUnauthorized(null, columnId);
          else setError(reason instanceof Error ? reason.message : "요리한 음식의 현재 상태를 확인하지 못했어요. 다시 선택해 주세요.");
          return;
        } finally {
          if (requestId === selectionRequestRef.current) setCheckingRecentId(null);
        }
      }
      if (!matchingBatch || !isAvailableCookedBatch(matchingBatch)) {
        setUnavailableRecentBatchIds((current) => new Set(current).add(item.source.id));
        setError("이 음식은 현재 추가할 수 없어요. 요리한 음식 탭에서 상태를 확인해 주세요.");
        return;
      }
    }
    setSelection({
      amount: item.last_quantity.amount,
      brand: item.display_brand,
      id: item.source.id,
      maxAmount: matchingBatch?.remaining_weight_g ?? undefined,
      name: item.display_name,
      type: item.source.type,
      unit: item.last_quantity.unit,
      unitOptions: [item.last_quantity.unit],
    });
    setSuggestionConfirmed(false);
  }

  function chooseCatalog(item: FoodCatalogSearchItem) {
    setAmountStep(true);
    cancelPendingSelection();
    setSelection({
      amount: item.type === "food_product" ? item.nutrition.basis.amount : 1,
      brand: sourceBrand(item),
      id: item.id,
      name: sourceName(item),
      type: item.type,
      unit: sourceUnit(item),
      unitOptions: sourceUnitOptions(item),
      basisRelations: item.type === "food_product" ? item.basis_relations : undefined,
      basisUnit: item.type === "food_product" ? item.nutrition.basis.unit : undefined,
    });
    setSuggestionConfirmed(true);
  }

  async function submit() {
    if (!selection
      || savingRef.current
      || saving
      || amount === null
      || !mutationEnabled
      || !columnId
      || restoredSelectionPending
      || amountInvalid
      || !suggestionConfirmed
      || (selection.maxAmount !== undefined && (amount ?? 0) > selection.maxAmount)
      || !selection.unit.trim()) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        { ...selection, amount },
        columnId,
        date,
      );
    } catch (reason) {
      if (isMealLogApiError(reason) && reason.status === 401) {
        onUnauthorized({ ...selection, amount }, columnId, date);
        return;
      }
      setError(reason instanceof Error ? reason.message : "식사 기록을 저장하지 못했어요.");
      savingRef.current = false;
      setSaving(false);
    }
  }

  const visibleRecent = recent.filter((item) => {
    if (item.source.type !== "cooked_batch") return true;
    const batch = batches.find((row) => row.id === item.source.id);
    return !unavailableRecentBatchIds.has(item.source.id) && batch?.status !== "eaten" && batch?.batch_status !== "depleted";
  });
  const recentSection = visibleRecent.length > 0 || recentHasNext ? (
    <div className="mt-5">
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {visibleRecent.map((item) => {
          const batch = item.source.type === "cooked_batch" ? batches.find((row) => row.id === item.source.id) : null;
          const unavailable = item.source.type === "cooked_batch" && (
            item.last_quantity.unit !== "g"
            || unavailableRecentBatchIds.has(item.source.id)
            || Boolean(batch && !isAvailableCookedBatch(batch))
          );
          return (
            <li key={`${item.source.type}-${item.source.id}`}>
              <button
                className="min-h-11 w-full px-3 py-3 text-left disabled:text-[var(--text-3)]"
                disabled={unavailable || checkingRecentId !== null}
                onClick={() => { setAmountStep(true); void chooseRecent(item); }}
                type="button"
              >
                <span className="block truncate font-medium" title={item.display_name}>{item.display_name}</span>
                <span className="block text-xs text-[var(--text-2)]">{item.display_brand ? `${item.display_brand} · ` : ""}{recentSourceLabel(item.source.type)} · 최근 {item.last_quantity.amount}{quantityUnitLabel(item.last_quantity.unit)} · {item.frequency}회 기록</span>
              </button>
              {unavailable ? <p className="px-3 pb-3 text-xs text-[var(--text-2)]">현재 추가할 수 없는 음식이에요. 요리한 음식 탭에서 상태를 확인해 주세요.</p>
                : checkingRecentId === item.source.id ? <p aria-live="polite" className="px-3 pb-3 text-xs text-[var(--text-2)]">음식의 현재 정보를 확인하고 있어요…</p>
                  : null}
            </li>
          );
        })}
      </ul>
      {recentHasNext ? (
        <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-medium" disabled={loadingMore !== null} onClick={() => void loadMoreRecent()} type="button">
          {loadingMore === "recent" ? "불러오는 중…" : "최근 음식 더 불러오기"}
        </button>
      ) : null}
    </div>
  ) : null;

  return createPortal(
    <div className="fixed inset-x-0 z-[70] flex items-end justify-center overflow-hidden bg-[var(--overlay-40)] lg:items-center lg:p-6"
      {...backdropDismiss}
      style={{ ...viewportStyle, top: "var(--dialog-viewport-top, 0px)", height: "var(--dialog-viewport-height, 100dvh)" }}>
      <div
        aria-label="먹은 음식 추가"
        aria-modal="true"
        className="planner-task-sheet relative flex h-[78dvh] max-h-[calc(var(--dialog-viewport-height,100dvh)-32px)] min-h-0 w-full max-w-xl flex-col rounded-t-[var(--radius-sheet)] bg-[var(--surface)] outline-none lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line-strong)] [&_input]:text-base [&_select]:text-base"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--line-strong)]" />
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line-strong)] px-4 py-3">
          {amountStep && selection && !discardConfirm ? <button aria-label="음식 선택으로 돌아가기" disabled={saving} className="min-h-11 min-w-11 text-xl" onClick={() => { setAmountStep(false); setError(null); }} type="button">‹</button> : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold outline-none" ref={headingRef} tabIndex={-1}>{discardConfirm ? "변경사항을 버릴까요?" : `${dateLabel(date)} ${selectedColumn?.name ?? "끼니 선택"}`}</h2>
          </div>
          <button
            className="min-h-11 min-w-11 rounded-full px-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            disabled={saving}
            onClick={requestClose}
            ref={closeRef}
            type="button"
          >
            닫기
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(20px+env(safe-area-inset-bottom))]" data-testid="meal-log-source-scroll" ref={sourceScrollRef}>
        {discardConfirm ? <div className="space-y-3 p-4"><button className="min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--brand)] font-medium text-white" onClick={() => setDiscardConfirm(false)} type="button">계속 편집</button><button className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-medium" onClick={onClose} type="button">변경사항 버리기</button></div> : <>
        {error ? <p className="mx-4 mb-3 rounded-[var(--radius-control)] border border-[var(--danger)] p-3 text-sm" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
        {!(amountStep && selection) ? <>
        <div aria-label="음식 출처 선택" className="grid shrink-0 grid-cols-3 gap-1 border-b border-[var(--line-strong)] p-2" role="tablist">
          {SOURCE_TABS.map(({ id, label }, index) => (
            <button
              aria-controls={`meal-log-source-${id}`}
              aria-selected={tab === id}
              className={`min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-medium ${tab === id ? "bg-[var(--brand-soft)] text-[var(--brand-primary-text)]" : "text-[var(--text-2)]"}`}
              id={`meal-log-source-${id}-tab`}
              key={id}
              onClick={() => {
                cancelPendingSelection();
                setTab(id);
                setSelection(null);
                setSuggestionConfirmed(true);
              }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? SOURCE_TABS.length - 1
                    : (index + (event.key === "ArrowLeft" ? -1 : 1) + SOURCE_TABS.length) % SOURCE_TABS.length;
                const next = SOURCE_TABS[nextIndex]!.id;
                cancelPendingSelection();
                setTab(next);
                setSelection(null);
                setSuggestionConfirmed(true);
                requestAnimationFrame(() => document.getElementById(`meal-log-source-${next}-tab`)?.focus());
              }}
              role="tab"
              tabIndex={tab === id ? 0 : -1}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "catalog" ? (
          <div className="shrink-0 border-b border-[var(--line)] px-4 py-3">
            <label className="block text-sm font-medium">
              <span className="sr-only">제품·재료 검색</span>
              <input
                className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 text-base font-normal"
                onChange={(event) => { cancelPendingSelection(); setQuery(event.target.value); }}
                onCompositionStart={cancelPendingSelection}
                onCompositionEnd={(event) => setQuery(event.currentTarget.value)}
                placeholder="제품·재료 이름을 입력해 주세요"
                type="search"
                value={query}
              />
            </label>
          </div>
        ) : null}
        <div className="px-4 py-4">
          {loading && tab !== "catalog" ? <div aria-busy="true" aria-label="음식 목록 불러오는 중" className="space-y-3 py-4" role="status"><Skeleton className="h-16" /><Skeleton className="h-16" /></div> : null}

          {tab === "recent" ? <section aria-labelledby="meal-log-source-recent-tab" id="meal-log-source-recent" role="tabpanel">{recentSection}{!loading && visibleRecent.length === 0 && !recentHasNext ? <p className="py-8 text-center text-sm text-[var(--text-2)]">최근 기록한 음식이 없어요.</p> : null}<button className="mt-3 min-h-11 w-full text-[var(--brand)]" onClick={() => setTab("cooked")} type="button">요리한 음식 전체 보기</button></section> : tab === "cooked" ? (
            <section aria-labelledby="meal-log-source-cooked-tab" id="meal-log-source-cooked" role="tabpanel">
              <h3 className="mt-5 text-sm font-semibold">요리한 음식 전체</h3>
              <ul className="divide-y divide-[var(--line-strong)]">
                {batches.filter(batch => batch.status !== "eaten" && batch.batch_status !== "depleted").map((batch) => {
                  const selectable = batch.weight_status === "known"
                    && batch.batch_status === "available"
                    && (batch.remaining_weight_g ?? 0) > 0;
                  const legacySelectable = batch.status !== "eaten" && batch.weight_status === null && batch.batch_status === null;
                  const weightEligible = batch.weight_status === "missing"
                    && batch.batch_status === "available"
                    && batch.revision !== null;
                  return (
                    <li className="py-3" key={batch.id}>
                      {selectable || legacySelectable ? (
                        <button
                          className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                          onClick={() => {
                            cancelPendingSelection();
                            setAmountStep(true);
                            setSelection({
                              amount: Math.min(100, batch.remaining_weight_g ?? 100),
                              brand: null,
                              id: batch.id,
                              maxAmount: batch.remaining_weight_g ?? undefined,
                              name: batch.recipe_title,
                              type: "cooked_batch",
                              unit: "g",
                              unitOptions: ["g"],
                            });
                            setSuggestionConfirmed(true);
                          }}
                          type="button"
                        >
                          <Image alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius-card)] object-cover" height={48} src={resolveRecipeImage({ id: batch.recipe_id, thumbnail_url: batch.recipe_thumbnail_url })} unoptimized width={48} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium" title={batch.recipe_title}>{batch.recipe_title}</span>
                            <span className="mt-1 block text-xs text-[var(--text-2)]">{cookedDateLabel(batch.cooked_at)} 조리 · {legacySelectable ? "이전 요리" : `남은 양 ${Math.round(batch.remaining_weight_g ?? 0).toLocaleString("ko-KR")}g`}</span>
                          </span>
                          <span className="shrink-0 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 font-medium text-[var(--text-inverse)]">추가</span>
                        </button>
                      ) : (
                        <div className="px-3 py-2 text-[var(--text-2)]">
                          <span className="block truncate font-medium" title={batch.recipe_title}>{batch.recipe_title}</span>
                          <span className="mt-1 block text-xs">{cookedDateLabel(batch.cooked_at)} 조리 · {weightEligible ? "무게 입력 필요" : "무게 확인 불가"}</span>
                        </div>
                      )}
                      {weightEligible ? (
                        <Link aria-label={`${batch.recipe_title} 완성 중량 입력`} className="mt-2 flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 text-sm font-medium" href="/leftovers">
                          완성 중량 입력
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {batchHasNext ? (
                <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-medium" disabled={loadingMore !== null} onClick={() => void loadMoreBatches()} type="button">
                  {loadingMore === "batch" ? "불러오는 중…" : "요리한 음식 더 불러오기"}
                </button>
              ) : null}
              {!loading && batches.length === 0 ? <p className="py-8 text-center text-sm text-[var(--text-2)]">표시할 요리한 음식이 없어요.</p> : null}
            </section>
          ) : (
            <section aria-labelledby="meal-log-source-catalog-tab" id="meal-log-source-catalog" role="tabpanel">
              {catalogSearching ? (
                <div aria-label="제품·재료 검색 중" aria-busy="true" className="space-y-3" role="status">
                  {[0, 1, 2].map(index => <div aria-hidden="true" className="h-16 animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" key={index} />)}
                </div>
              ) : null}
              {!catalogSearching && !error && catalogLoadedQuery === query.trim() && catalog.length === 0 ? (
                <p className="py-5 text-sm text-[var(--text-2)]" role="status">검색 결과가 없어요. 다른 제품·재료 이름으로 찾아보세요.</p>
              ) : null}
              {catalog.length > 0 ? (
                <>
                  <ul className="mt-4 divide-y divide-[var(--line-strong)]">
                    {catalog.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <button className="min-h-11 w-full px-3 py-3 text-left" onClick={() => chooseCatalog(item)} type="button">
                          <span className="block truncate font-medium" title={sourceName(item)}>{sourceName(item)}</span>
                          <span className="block text-xs text-[var(--text-2)]">{sourceBrand(item) ? `${sourceBrand(item)} · ` : ""}{catalogSourceLabel(item)}{item.type === "ingredient" ? ` · 기본 단위 ${sourceUnit(item)}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {catalogHasNext ? (
                    <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-medium" disabled={loadingMore !== null} onClick={() => void loadMoreCatalog()} type="button">
                      {loadingMore === "catalog" ? "불러오는 중…" : "제품·재료 더 불러오기"}
                    </button>
                  ) : null}
                </>
              ) : null}
            </section>
          )}
        </div>

        </> : null}
        {amountStep && selection ? (
          <section className="shrink-0 border-t border-[var(--line-strong)] bg-[var(--surface)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
            <p className="truncate font-medium" title={selection.name}>{selection.name}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm font-medium">먹은 양
                <DecimalInput onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  void submit();
                }} key={`${selection.type}:${selection.id}:${selection.unit}`} disabled={saving} className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" max={selection.maxAmount} min="0.01" onBlur={() => setSuggestionConfirmed(true)} onValueChange={(value) => { setInputEdited(true); setAmount(value); setSuggestionConfirmed(true); }} step="any" value={amount} />
              </label>
              <label className="text-sm font-medium">단위
                {(selection.unitOptions?.length ?? 0) > 1 ? (
                  <select disabled={saving || amountInvalid} className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" onChange={(event) => { if (amount === null) return; setInputEdited(true); const unit = event.target.value; const nextAmount = convertSelectionAmount({ ...selection, amount }, unit); if (nextAmount === null || !Number.isFinite(nextAmount)) { setError("이 단위로 바꿀 수 있는 환산 정보가 없어요."); return; } setSelection({ ...selection, amount: nextAmount, unit }); setSuggestionConfirmed(true); }} value={selection.unit}>
                    {selection.unitOptions?.map((unit) => <option key={unit} value={unit}>{quantityUnitLabel(unit)}</option>)}
                  </select>
                ) : (
                  <input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 font-normal" readOnly value={quantityUnitLabel(selection.unit)} />
                )}
              </label>
            </div>
            {previewLoading ? <div aria-label="영양 미리보기 불러오는 중" className="mt-5 space-y-3" role="status"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4" /></div> : null}
            {preview ? <section aria-label="입력한 양의 영양 미리보기" className="my-5 space-y-3"><div className="flex items-center justify-between text-sm"><span>{amount}{quantityUnitLabel(selection.unit)} 기준</span><span className="text-xl">{formatMealLogNumber(preview.calories_kcal)}{preview.calories_kcal !== null ? " kcal" : ""}</span></div><MealLogMacroBar nutrition={preview} thin /><dl className="flex justify-between gap-3 text-sm">{MEAL_LOG_MACROS.map(macro => <div key={macro.key} className="flex gap-1"><dt aria-label={macro.label}>{macro.short}</dt><dd>{formatMealLogNumber(preview[macro.key])}{preview[macro.key] !== null ? "g" : ""}</dd></div>)}</dl></section> : null}
            {previewError ? <div className="mt-4 flex items-center justify-between gap-2 text-sm"><span>영양 미리보기를 불러오지 못했어요.</span><button className="min-h-11 shrink-0 text-[var(--brand)]" onClick={() => setPreviewRetry(current => current + 1)} type="button">다시 확인</button></div> : null}
            {selection.maxAmount !== undefined && !amountInvalid && (amount ?? 0) <= selection.maxAmount ? <div className="mt-4 flex items-center justify-between text-sm"><span>기록 후 남을 양</span><span>{Math.round(selection.maxAmount - (amount ?? 0)).toLocaleString("ko-KR")}g</span></div> : null}
            {selection.maxAmount !== undefined ? <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)]" disabled={saving} onClick={() => { setInputEdited(true); setAmount(selection.maxAmount!); setSuggestionConfirmed(true); }} type="button">남은 양 전부</button> : null}
            {!suggestionConfirmed ? <p className="mt-2 text-sm font-medium">제안된 양을 확인해 주세요.</p> : null}
            {selection.maxAmount !== undefined && (amount ?? 0) > selection.maxAmount ? (
              <p className="mt-2 text-sm font-medium text-[var(--danger-strong)]" role="alert">남은 양 {selection.maxAmount}g 이하로 입력해 주세요.</p>
            ) : null}
            <div className="mt-3 grid gap-2 min-[360px]:grid-cols-2">
              <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 font-medium text-[var(--text-inverse)] disabled:opacity-50" disabled={!mutationEnabled || saving || restoredSelectionPending || !suggestionConfirmed || amountInvalid || (selection.maxAmount !== undefined && (amount ?? 0) > selection.maxAmount) || !selection.unit.trim() || (selection.type === "cooked_batch" && (!date || !columnId))} onClick={() => void submit()} type="button">{saving ? "저장 중…" : "기록 저장"}</button>
              <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-medium" disabled={saving} onClick={requestClose} type="button">취소</button>
            </div>
          </section>
        ) : null}
        </>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
