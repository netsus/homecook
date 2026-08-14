"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";

import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { fetchFoodCatalogSearch, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { fetchCookedBatches } from "@/lib/api/cooking";
import { fetchMealLogRecent } from "@/lib/api/meal-log";
import type { CookedBatchProjection } from "@/types/cooking";
import type { MealLogColumn, MealLogRecentItem, MealLogSourceType } from "@/types/meal-log";

type SourceTab = "cooked" | "catalog";

export interface MealLogSourceSelection {
  type: MealLogSourceType;
  id: string;
  name: string;
  brand: string | null;
  amount: number;
  maxAmount?: number;
  unit: string;
}

interface MealLogAddSheetProps {
  columns: MealLogColumn[];
  date: string;
  initialColumnId: string;
  onClose: () => void;
  onSave: (selection: MealLogSourceSelection, columnId: string) => Promise<void>;
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

function sourceUnit(item: FoodCatalogSearchItem) {
  return item.type === "ingredient" ? item.default_unit : item.nutrition.basis.unit;
}

export function MealLogAddSheet({
  columns,
  date,
  initialColumnId,
  onClose,
  onSave,
}: MealLogAddSheetProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const [tab, setTab] = useState<SourceTab>("cooked");
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
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<MealLogSourceSelection | null>(null);
  const [suggestionConfirmed, setSuggestionConfirmed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"batch" | "catalog" | "recent" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      fetchMealLogRecent(),
      fetchCookedBatches({ availability: "all", limit: 20 }),
    ])
      .then(([recentData, batchData]) => {
        if (!active) return;
        setRecent(recentData.items);
        setRecentCursor(recentData.next_cursor);
        setRecentHasNext(recentData.has_next);
        setBatches(batchData.items);
        setBatchCursor(batchData.next_cursor);
        setBatchHasNext(batchData.has_next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "음식 목록을 불러오지 못했어요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedColumn = useMemo(
    () => columns.find((column) => column.id === columnId),
    [columnId, columns],
  );

  async function searchCatalog(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFoodCatalogSearch({
        q: query,
        types: ["food_product", "ingredient"],
      });
      setCatalog(result.items);
      setCatalogCursor(result.next_cursor);
      setCatalogHasNext(result.has_next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "제품·재료를 검색하지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

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
      setBatches((current) => [...current, ...result.items]);
      setBatchCursor(result.next_cursor);
      setBatchHasNext(result.has_next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "요리한 음식을 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(null);
    }
  }

  async function loadMoreCatalog() {
    if (!catalogHasNext || !catalogCursor || loadingMore) return;
    setLoadingMore("catalog");
    setError(null);
    try {
      const result = await fetchFoodCatalogSearch({
        cursor: catalogCursor,
        q: query,
        types: ["food_product", "ingredient"],
      });
      setCatalog((current) => [...current, ...result.items]);
      setCatalogCursor(result.next_cursor);
      setCatalogHasNext(result.has_next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "제품·재료를 더 불러오지 못했어요.");
    } finally {
      setLoadingMore(null);
    }
  }

  function chooseRecent(item: MealLogRecentItem) {
    const matchingBatch = item.source.type === "cooked_batch"
      ? batches.find((batch) => batch.id === item.source.id)
      : null;
    if (item.source.type === "cooked_batch"
      && (!matchingBatch
        || matchingBatch.weight_status !== "known"
        || matchingBatch.batch_status !== "available"
        || (matchingBatch.remaining_weight_g ?? 0) <= 0
        || item.last_quantity.unit !== "g")) return;
    setSelection({
      amount: item.last_quantity.amount,
      brand: item.display_brand,
      id: item.source.id,
      maxAmount: matchingBatch?.remaining_weight_g ?? undefined,
      name: item.display_name,
      type: item.source.type,
      unit: item.last_quantity.unit,
    });
    setSuggestionConfirmed(false);
  }

  function chooseCatalog(item: FoodCatalogSearchItem) {
    setSelection({
      amount: item.type === "food_product" ? item.nutrition.basis.amount : 1,
      brand: sourceBrand(item),
      id: item.id,
      name: sourceName(item),
      type: item.type,
      unit: sourceUnit(item),
    });
    setSuggestionConfirmed(true);
  }

  async function submit() {
    if (!selection
      || !columnId
      || selection.amount <= 0
      || !suggestionConfirmed
      || (selection.maxAmount !== undefined && selection.amount > selection.maxAmount)
      || !selection.unit.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(selection, columnId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "식사 기록을 저장하지 못했어요.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--foreground-alpha-40)] lg:items-center lg:p-6">
      <div
        aria-label="먹은 음식 추가"
        aria-modal="true"
        className="flex max-h-[100dvh] min-h-[85dvh] w-full max-w-xl flex-col bg-[var(--surface)] outline-none lg:min-h-0 lg:rounded-[var(--radius-card)] lg:border lg:border-[var(--line-strong)]"
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
          {([
            ["cooked", "요리한 음식"],
            ["catalog", "제품·재료"],
          ] as const).map(([id, label]) => (
            <button
              aria-controls={`meal-log-source-${id}`}
              aria-selected={tab === id}
              className={`min-h-11 rounded-[var(--radius-control)] px-3 text-sm font-bold ${tab === id ? "bg-[var(--brand-soft)] text-[var(--brand-primary-text)]" : "text-[var(--text-2)]"}`}
              id={`meal-log-source-${id}-tab`}
              key={id}
              onClick={() => {
                setTab(id);
                setSelection(null);
                setSuggestionConfirmed(true);
              }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "ArrowLeft" || event.key === "Home" ? "cooked" : "catalog";
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
              <ul className="divide-y divide-[var(--line-strong)]">
                {batches.map((batch) => {
                  const selectable = batch.weight_status === "known"
                    && batch.batch_status === "available"
                    && (batch.remaining_weight_g ?? 0) > 0;
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
                      {selectable ? (
                        <button
                          className="min-h-11 w-full rounded-[var(--radius-control)] px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                          onClick={() => {
                            setSelection({
                              amount: Math.min(100, batch.remaining_weight_g ?? 100),
                              brand: null,
                              id: batch.id,
                              maxAmount: batch.remaining_weight_g ?? undefined,
                              name: batch.recipe_title,
                              type: "cooked_batch",
                              unit: "g",
                            });
                            setSuggestionConfirmed(true);
                          }}
                          type="button"
                        >
                          <span className="block font-bold">{batch.recipe_title}</span>
                          <span className="mt-1 block text-xs text-[var(--text-2)]">
                            {cookedDateLabel(batch.cooked_at)} 조리 · {batch.finished_weight_g === null ? "완성 무게 확인 불가" : `완성 ${batch.finished_weight_g}g`} · {batchNutritionLabel(batch.nutrition_calculation_status)}
                          </span>
                          <span className="mt-1 block text-xs text-[var(--text-2)]">{state}</span>
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
              <form className="flex gap-2" onSubmit={searchCatalog}>
                <label className="min-w-0 flex-1 text-sm font-bold">
                  제품·재료 검색
                  <input
                    className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal"
                    onChange={(event) => setQuery(event.target.value)}
                    value={query}
                  />
                </label>
                <button className="mt-6 min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 font-bold text-[var(--text-inverse)]" type="submit">검색</button>
              </form>
              {query.trim() === "" && catalog.length === 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-extrabold">최근·자주 먹은 음식</h3>
                  <ul className="mt-2 divide-y divide-[var(--line-strong)]">
                    {recent.map((item) => (
                      <li key={`${item.source.type}-${item.source.id}`}>
                        <button
                          className="min-h-11 w-full px-3 py-3 text-left disabled:text-[var(--text-3)]"
                          disabled={item.source.type === "cooked_batch" && !batches.some((batch) => batch.id === item.source.id && batch.weight_status === "known" && batch.batch_status === "available" && (batch.remaining_weight_g ?? 0) > 0 && item.last_quantity.unit === "g")}
                          onClick={() => chooseRecent(item)}
                          type="button"
                        >
                          <span className="block font-bold">{item.display_name}</span>
                          <span className="block text-xs text-[var(--text-2)]">최근 {item.last_quantity.amount}{item.last_quantity.unit} · {item.frequency}회 기록</span>
                        </button>
                        {item.source.type === "cooked_batch" && !batches.some((batch) => batch.id === item.source.id && batch.weight_status === "known" && batch.batch_status === "available" && (batch.remaining_weight_g ?? 0) > 0 && item.last_quantity.unit === "g") ? (
                          <p className="px-3 pb-3 text-xs text-[var(--text-2)]">현재 중량·잔량 상태를 확인할 수 없어 저장할 수 없어요.</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {recentHasNext ? (
                    <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] font-bold" disabled={loadingMore !== null} onClick={() => void loadMoreRecent()} type="button">
                      {loadingMore === "recent" ? "불러오는 중…" : "최근 음식 더 불러오기"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-[var(--line-strong)]">
                    {catalog.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <button className="min-h-11 w-full px-3 py-3 text-left" onClick={() => chooseCatalog(item)} type="button">
                          <span className="block font-bold">{sourceName(item)}</span>
                          <span className="block text-xs text-[var(--text-2)]">{sourceBrand(item) ? `${sourceBrand(item)} · ` : ""}{item.type === "ingredient" ? `재료 · 기본 단위 제안 ${item.default_unit}` : "제품"}</span>
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
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-sm font-bold">실제 양
                <input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" max={selection.maxAmount} min="0.01" onBlur={() => setSuggestionConfirmed(true)} onChange={(event) => { setSelection({ ...selection, amount: Number(event.target.value) }); setSuggestionConfirmed(true); }} step="any" type="number" value={selection.amount} />
              </label>
              <label className="text-sm font-bold">단위
                <input className="mt-1 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 font-normal" onBlur={() => setSuggestionConfirmed(true)} onChange={(event) => { setSelection({ ...selection, unit: event.target.value }); setSuggestionConfirmed(true); }} value={selection.unit} />
              </label>
            </div>
            {!suggestionConfirmed ? <p className="mt-2 text-sm font-bold">제안된 양을 확인해 주세요.</p> : null}
            {selection.maxAmount !== undefined && selection.amount > selection.maxAmount ? (
              <p className="mt-2 text-sm font-bold text-[var(--danger-strong)]" role="alert">남은 양 {selection.maxAmount}g 이하로 입력해 주세요.</p>
            ) : null}
            <div className="mt-3 grid gap-2 min-[360px]:grid-cols-2">
              <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary-text)] px-4 font-bold text-[var(--text-inverse)] disabled:opacity-50" disabled={saving || !suggestionConfirmed || selection.amount <= 0 || (selection.maxAmount !== undefined && selection.amount > selection.maxAmount) || !selection.unit.trim()} onClick={() => void submit()} type="button">{saving ? "저장 중…" : "기록 저장"}</button>
              <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold" disabled={saving} onClick={onClose} type="button">취소</button>
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
