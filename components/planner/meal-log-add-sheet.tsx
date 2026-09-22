"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { fetchFoodCatalogSearch, fetchFoodCatalogSource, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { fetchCookedBatches, type CookedBatchListData } from "@/lib/api/cooking";
import { fetchMealLogRecent, isMealLogApiError } from "@/lib/api/meal-log";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { formatProductUnit } from "@/lib/planner/product-planner-entry-presentation";
import type { CookedBatchProjection } from "@/types/cooking";
import type { MealLogColumn, MealLogRecentItem, MealLogSourceType } from "@/types/meal-log";

type SourceTab = "cooked" | "catalog";

const SOURCE_TABS: Array<{ id: SourceTab; label: string }> = [
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
  onSave: (selection: MealLogSourceSelection, columnId: string, date: string) => Promise<void>;
  onUnauthorized: (selection: MealLogSourceSelection | null, columnId: string) => void;
}

const DEPLETED_LABELS: Record<string, string> = {
  consumed: "다 먹음",
  discarded: "모두 버림",
  mixed: "먹음·버림으로 소진",
  consumed_unweighed: "무게 없이 다 먹음",
  discarded_unweighed: "무게 없이 모두 버림",
  mixed_unweighed: "무게 없이 먹고 버림",
};

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

function batchNutritionLabel(status: CookedBatchProjection["nutrition_calculation_status"]) {
  if (status === "complete") return "영양 계산 완료";
  if (status === "partial") return "영양 일부 정보 없음";
  return "영양 정보 준비 중";
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
  return (batch.weight_status === null && batch.batch_status === null)
    || (batch.weight_status === "known"
      && batch.batch_status === "available"
      && (batch.remaining_weight_g ?? 0) > 0);
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
  onSave,
  onUnauthorized,
}: MealLogAddSheetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const restoredCookedBatchId = initialSelection?.type === "cooked_batch"
    ? initialSelection.id
    : null;
  const [tab, setTab] = useState<SourceTab>(
    initialSelection?.type === "cooked_batch" ? "cooked" : initialSelection ? "catalog" : "cooked",
  );
  const columnId = initialColumnId;
  const [targetDate, setTargetDate] = useState(date);
  const [targetColumnId, setTargetColumnId] = useState(initialColumnId);
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
  const [query, setQuery] = useState("");
  const catalogRequestRef = useRef(0);
  const catalogAbortRef = useRef<AbortController | null>(null);
  const [selection, setSelection] = useState<MealLogSourceSelection | null>(initialSelection ?? null);
  const [restoredSourcePending, setRestoredSourcePending] = useState(Boolean(initialSelection));
  const [suggestionConfirmed, setSuggestionConfirmed] = useState(initialSuggestionConfirmed);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"batch" | "catalog" | "recent" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingRecentId, setCheckingRecentId] = useState<string | null>(null);
  const [unavailableRecentBatchIds, setUnavailableRecentBatchIds] = useState<Set<string>>(new Set());
  const selectionRequestRef = useRef(0);
  const restoredSelectionPending = restoredSourcePending
    && selection?.type === initialSelection?.type
    && selection?.id === initialSelection?.id;

  useDialogBoundary({
    closeOnEscape: !saving,
    dialogRef,
    initialFocusRef: closeRef,
    onClose,
  });
  useEffect(() => {
    if (!error) return;
    requestAnimationFrame(() => errorRef.current?.focus());
  }, [error]);
  useEffect(() => () => { selectionRequestRef.current += 1; }, []);

  useEffect(() => {
    let active = true;
    const restorationRequest = selectionRequestRef.current;
    setLoading(true);
    Promise.all([
      fetchMealLogRecent(),
      fetchCookedBatches({ availability: "all", limit: 20 }),
    ])
      .then(async ([recentData, batchData]) => {
        if (!active) return;
        setRecent(recentData.items);
        setRecentCursor(recentData.next_cursor);
        setRecentHasNext(recentData.has_next);
        setBatches(batchData.items);
        setBatchCursor(batchData.next_cursor);
        setBatchHasNext(batchData.has_next);
        if (restoredCookedBatchId) {
          const batch = await findCookedBatch(batchData, restoredCookedBatchId, () => active);
          if (!active) return;
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
          if (!active || restorationRequest !== selectionRequestRef.current) return;
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
        if (!active) return;
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
        if (active) {
          setLoading(false);
          setRestoredSourcePending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [columnId, initialSelection, onUnauthorized, restoredCookedBatchId]);

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
    if (tab !== "catalog") return;
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;
    const controller = new AbortController();
    catalogAbortRef.current = controller;
    const timer = window.setTimeout(() => {
      setCatalogSearching(true);
      setError(null);
      void fetchFoodCatalogSearch({
        q: normalizedQuery,
        signal: controller.signal,
        types: ["food_product", "ingredient"],
      })
        .then((result) => {
          if (controller.signal.aborted || requestId !== catalogRequestRef.current) return;
          setCatalog(result.items);
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
    if (!recentHasNext || !recentCursor || loadingMore) return;
    setLoadingMore("recent");
    setError(null);
    try {
      const result = await fetchMealLogRecent({ cursor: recentCursor });
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
    if (!batchHasNext || !batchCursor || loadingMore) return;
    setLoadingMore("batch");
    setError(null);
    try {
      const result = await fetchCookedBatches({ availability: "all", cursor: batchCursor, limit: 20 });
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
      setTargetDate(date);
      setTargetColumnId(initialColumnId);
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
      || !mutationEnabled
      || !columnId
      || restoredSelectionPending
      || selection.amount <= 0
      || !suggestionConfirmed
      || (selection.maxAmount !== undefined && selection.amount > selection.maxAmount)
      || !selection.unit.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        selection,
        selection.type === "cooked_batch" ? targetColumnId : columnId,
        selection.type === "cooked_batch" ? targetDate : date,
      );
    } catch (reason) {
      if (isMealLogApiError(reason) && reason.status === 401) {
        onUnauthorized(selection, columnId);
        return;
      }
      setError(reason instanceof Error ? reason.message : "식사 기록을 저장하지 못했어요.");
      setSaving(false);
    }
  }

  const recentSection = (
    <div className="mt-5">
      <h3 className="text-sm font-extrabold">최근·자주 먹은 음식</h3>
      <ul className="mt-2 divide-y divide-[var(--line-strong)]">
        {recent.filter((item) => (item.source.type === "cooked_batch") === (tab === "cooked")).map((item) => {
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
                onClick={() => void chooseRecent(item)}
                type="button"
              >
                <span className="block font-bold">{item.display_name}</span>
                <span className="block text-xs text-[var(--text-2)]">{item.display_brand ? `${item.display_brand} · ` : ""}{recentSourceLabel(item.source.type)} · 최근 {item.last_quantity.amount}{quantityUnitLabel(item.last_quantity.unit)} · {item.frequency}회 기록</span>
              </button>
              {unavailable ? <p className="px-3 pb-3 text-xs text-[var(--text-2)]">현재 추가할 수 없는 음식이에요. 요리한 음식 탭에서 상태를 확인해 주세요.</p>
                : checkingRecentId === item.source.id ? <p aria-live="polite" className="px-3 pb-3 text-xs text-[var(--text-2)]">음식의 현재 정보를 확인하고 있어요…</p>
                  : item.source.type === "cooked_batch" && !batch ? <p className="px-3 pb-3 text-xs text-[var(--text-2)]">선택하면 현재 남은 양을 확인해요.</p> : null}
            </li>
          );
        })}
      </ul>
      {recentHasNext ? (
        <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-bold" disabled={loadingMore !== null} onClick={() => void loadMoreRecent()} type="button">
          {loadingMore === "recent" ? "불러오는 중…" : "최근 음식 더 불러오기"}
        </button>
      ) : null}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--foreground-alpha-40)] lg:items-center lg:p-6">
      <div
        aria-label="먹은 음식 추가"
        aria-modal="true"
        className="fixed inset-0 flex h-[100dvh] max-h-[100dvh] w-full flex-col bg-[var(--surface)] outline-none lg:static lg:h-auto lg:min-h-0 lg:max-w-xl lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line-strong)]"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line-strong)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold">먹은 음식 추가</h2>
            <p className="text-xs text-[var(--text-2)]">
              {dateLabel(date)} · {selectedColumn?.name ?? "끼니 선택"}
            </p>
          </div>
          <button
            className="min-h-11 min-w-11 rounded-full px-3 font-bold outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            disabled={saving}
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            닫기
          </button>
        </header>

        <div aria-label="음식 출처 선택" className="grid grid-cols-2 gap-1 border-b border-[var(--line-strong)] p-2" role="tablist">
          {SOURCE_TABS.map(({ id, label }, index) => (
            <button
              aria-controls={`meal-log-source-${id}`}
              aria-selected={tab === id}
              className={`min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-bold ${tab === id ? "bg-[var(--brand-soft)] text-[var(--brand-primary-text)]" : "text-[var(--text-2)]"}`}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scroll-padding-bottom:10rem]">
          {error ? <p className="mb-3 rounded-[var(--radius-control)] border border-[var(--danger)] p-3 text-sm" ref={errorRef} role="alert" tabIndex={-1}>{error}</p> : null}
          {loading ? <p aria-busy="true" className="py-8 text-center text-sm text-[var(--text-2)]">불러오는 중…</p> : null}

          {tab === "cooked" ? (
            <section aria-labelledby="meal-log-source-cooked-tab" id="meal-log-source-cooked" role="tabpanel">
              {recentSection}
              <h3 className="mt-5 text-sm font-extrabold">요리한 음식 전체</h3>
              <ul className="divide-y divide-[var(--line-strong)]">
                {batches.map((batch) => {
                  const selectable = batch.weight_status === "known"
                    && batch.batch_status === "available"
                    && (batch.remaining_weight_g ?? 0) > 0;
                  const legacySelectable = batch.weight_status === null && batch.batch_status === null;
                  const weightEligible = batch.weight_status === "missing"
                    && batch.batch_status === "available"
                    && batch.revision !== null;
                  const state = batch.weight_status === null || batch.batch_status === null
                    ? "이전 기록 · 중량 상태를 확인할 수 없음"
                    : batch.batch_status === "depleted"
                      ? DEPLETED_LABELS[batch.depleted_reason ?? ""] ?? "소진됨"
                      : batch.weight_status === "missing"
                        ? "무게 입력 필요 · g 식사 기록 저장 불가"
                        : batch.weight_status === "unrecoverable"
                          ? "원래 무게 확인 불가 · g 식사 기록 저장 불가"
                          : `남은 양 ${batch.remaining_weight_g}g`;
                  return (
                    <li className="py-3" key={batch.id}>
                      {selectable || legacySelectable ? (
                        <button
                          className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                          onClick={() => {
                            cancelPendingSelection();
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
                            setTargetDate(date);
                            setTargetColumnId(initialColumnId);
                            setSuggestionConfirmed(true);
                          }}
                          type="button"
                        >
                          <Image alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius-card)] object-cover" height={48} src={resolveRecipeImage({ id: batch.recipe_id, thumbnail_url: batch.recipe_thumbnail_url })} unoptimized width={48} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold">{batch.recipe_title}</span>
                            <span className="mt-1 block text-xs text-[var(--text-2)]">{cookedDateLabel(batch.cooked_at)} 조리 · {legacySelectable ? "이전 요리" : `남은 양 ${batch.remaining_weight_g}g`}</span>
                          </span>
                          <span className="shrink-0 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 py-2 font-bold text-[var(--text-inverse)]">추가</span>
                        </button>
                      ) : (
                        <div className="px-3 py-2 text-[var(--text-2)]">
                          <span className="block font-bold">{batch.recipe_title}</span>
                          <span className="mt-1 block text-xs">
                            {cookedDateLabel(batch.cooked_at)} 조리 · {batch.finished_weight_g === null ? "완성 무게 확인 불가" : `완성 ${batch.finished_weight_g}g`} · {batchNutritionLabel(batch.nutrition_calculation_status)}
                          </span>
                          <span className="mt-1 block text-xs">{state}</span>
                          {batch.weight_status === null || batch.batch_status === null ? (
                            <><span className="mt-1 block text-xs">이전 기록이라 중량과 잔량 상태를 추정하지 않아요.</span><span className="mt-1 block text-xs">영양 상태를 확인할 수 없음</span></>
                          ) : null}
                        </div>
                      )}
                      {weightEligible ? (
                        <Link aria-label={`${batch.recipe_title} 완성 중량 입력`} className="mt-2 flex min-h-11 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 text-sm font-bold" href="/leftovers">
                          완성 중량 입력
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {batchHasNext ? (
                <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-bold" disabled={loadingMore !== null} onClick={() => void loadMoreBatches()} type="button">
                  {loadingMore === "batch" ? "불러오는 중…" : "요리한 음식 더 불러오기"}
                </button>
              ) : null}
              {!loading && batches.length === 0 ? <p className="py-8 text-center text-sm text-[var(--text-2)]">표시할 요리한 음식이 없어요.</p> : null}
            </section>
          ) : (
            <section aria-labelledby="meal-log-source-catalog-tab" id="meal-log-source-catalog" role="tabpanel">
              <div>
                <label className="min-w-0 flex-1 text-sm font-bold">
                  제품·재료 검색
                  <input
                    className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal"
                    onChange={(event) => { cancelPendingSelection(); setQuery(event.target.value); }}
                    onCompositionStart={cancelPendingSelection}
                    onCompositionEnd={(event) => setQuery(event.currentTarget.value)}
                    placeholder="입력하면 바로 검색돼요"
                    type="search"
                    value={query}
                  />
                </label>
                {catalogSearching ? <p aria-live="polite" className="mt-2 text-xs text-[var(--text-2)]">검색 중…</p> : null}
              </div>
              {query.trim() === "" && catalog.length === 0 ? (
                recentSection
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-[var(--line-strong)]">
                    {catalog.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <button className="min-h-11 w-full px-3 py-3 text-left" onClick={() => chooseCatalog(item)} type="button">
                          <span className="block font-bold">{sourceName(item)}</span>
                          <span className="block text-xs text-[var(--text-2)]">{sourceBrand(item) ? `${sourceBrand(item)} · ` : ""}{catalogSourceLabel(item)}{item.type === "ingredient" ? ` · 기본 단위 ${sourceUnit(item)}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {catalogHasNext ? (
                    <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-bold" disabled={loadingMore !== null} onClick={() => void loadMoreCatalog()} type="button">
                      {loadingMore === "catalog" ? "불러오는 중…" : "제품·재료 더 불러오기"}
                    </button>
                  ) : null}
                </>
              )}
            </section>
          )}
        </div>

        {selection ? (
          <footer className="border-t border-[var(--line-strong)] bg-[var(--surface)] px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
            <p className="font-bold">{selection.name}</p>
            <p className="mt-1 text-sm text-[var(--text-2)]">{selection.unit === "g" ? "먹은 양을 g(그램) 단위로 입력해 주세요." : `먹은 양은 ${quantityUnitLabel(selection.unit)} 기준이에요. g 입력은 정확한 환산 정보가 있는 음식만 지원해요.`}</p>
            {selection.type === "cooked_batch" ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-sm font-bold">먹은 날짜<input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onChange={(event) => setTargetDate(event.target.value)} type="date" value={targetDate} /></label>
                <label className="text-sm font-bold">끼니<select className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" onChange={(event) => setTargetColumnId(event.target.value)} value={targetColumnId}>{columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></label>
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm font-bold">실제 양
                <input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" max={selection.maxAmount} min="0.01" onBlur={() => setSuggestionConfirmed(true)} onChange={(event) => { setSelection({ ...selection, amount: Number(event.target.value) }); setSuggestionConfirmed(true); }} step="any" type="number" value={selection.amount} />
              </label>
              <label className="text-sm font-bold">단위
                {(selection.unitOptions?.length ?? 0) > 1 ? (
                  <select className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-normal" onChange={(event) => { const unit = event.target.value; const amount = convertSelectionAmount(selection, unit); if (amount === null || !Number.isFinite(amount)) { setError("이 단위로 바꿀 수 있는 환산 정보가 없어요."); return; } setSelection({ ...selection, amount, unit }); setSuggestionConfirmed(true); }} value={selection.unit}>
                    {selection.unitOptions?.map((unit) => <option key={unit} value={unit}>{quantityUnitLabel(unit)}</option>)}
                  </select>
                ) : (
                  <input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 font-normal" readOnly value={quantityUnitLabel(selection.unit)} />
                )}
              </label>
            </div>
            {!suggestionConfirmed ? <p className="mt-2 text-sm font-bold">제안된 양을 확인해 주세요.</p> : null}
            {selection.maxAmount !== undefined && selection.amount > selection.maxAmount ? (
              <p className="mt-2 text-sm font-bold text-[var(--danger-strong)]" role="alert">남은 양 {selection.maxAmount}g 이하로 입력해 주세요.</p>
            ) : null}
            <div className="mt-3 grid gap-2 min-[360px]:grid-cols-2">
              <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 font-bold text-[var(--text-inverse)] disabled:opacity-50" disabled={!mutationEnabled || saving || restoredSelectionPending || !suggestionConfirmed || selection.amount <= 0 || (selection.maxAmount !== undefined && selection.amount > selection.maxAmount) || !selection.unit.trim() || (selection.type === "cooked_batch" && (!targetDate || !targetColumnId))} onClick={() => void submit()} type="button">{saving ? "저장 중…" : "기록 저장"}</button>
              <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold" disabled={saving} onClick={onClose} type="button">취소</button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
