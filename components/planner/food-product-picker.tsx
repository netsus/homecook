"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FoodProductCreateForm } from "@/components/planner/food-product-create-form";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { fetchFoodProducts, isFoodProductApiError } from "@/lib/api/food-product";
import {
  createProductPlannerEntry,
  isProductPlannerEntryApiError,
} from "@/lib/api/product-planner-entry";
import { createPostAuthNextCookie } from "@/lib/auth/post-auth-next";
import {
  buildCompatibleFoodProductUnits,
  formatFoodProductExpectedEnergy,
  formatProductPlannerEntryErrorMessage,
  formatProductUnit,
  getFoodProductCoreNutritionLines,
} from "@/lib/planner/product-planner-entry-presentation";
import {
  clearProductPlannerReturnContext,
  readProductPlannerReturnContext,
  saveProductPlannerReturnContext,
  type FoodProductDraftContext,
  type ProductPlannerReturnContext,
} from "@/lib/planner/product-planner-return-context";
import type { FoodProductBasisUnit, FoodProductData } from "@/types/food-product";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

const PAGE_LIMIT = 20;
type ListState = "loading" | "ready" | "empty" | "error";
type CreateExitTarget = "picker" | "close";

function appendUniqueProducts(current: FoodProductData[], incoming: FoodProductData[]) {
  const next = [...current];
  const seen = new Set(current.map((product) => product.id));
  for (const product of incoming) {
    if (!seen.has(product.id)) {
      seen.add(product.id);
      next.push(product);
    }
  }
  return next;
}

function productOriginLabel(product: FoodProductData) {
  return product.visibility === "public" ? "공공 데이터" : "내가 등록";
}

function safePositiveAmount(value: string) {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount) && amount > 0 ? amount : null;
}

function buildPickerNextPath({
  columnId,
  planDate,
  productId,
  quantityAmount,
  quantityUnit,
  query,
  slotName,
}: {
  columnId: string;
  planDate: string;
  productId: string | null;
  quantityAmount: string;
  quantityUnit: FoodProductBasisUnit | null;
  query: string;
  slotName: string;
}) {
  const params = new URLSearchParams({ source: "product" });
  if (planDate) params.set("date", planDate);
  if (columnId) params.set("columnId", columnId);
  if (slotName) params.set("slot", slotName);
  if (query.trim()) params.set("productQuery", query.trim());
  if (productId) params.set("productId", productId);
  if (quantityAmount) params.set("productAmount", quantityAmount);
  if (quantityUnit) params.set("productUnit", quantityUnit);
  return `/menu-add?${params.toString()}`;
}

async function fetchProductPagesUntil(query: string, productId: string | null) {
  let page = await fetchFoodProducts({ q: query, limit: PAGE_LIMIT });
  let items = appendUniqueProducts([], page.items);
  let pageCount = 1;
  while (
    productId &&
    !items.some((product) => product.id === productId) &&
    page.has_next &&
    page.next_cursor &&
    pageCount < 50
  ) {
    page = await fetchFoodProducts({ q: query, cursor: page.next_cursor, limit: PAGE_LIMIT });
    items = appendUniqueProducts(items, page.items);
    pageCount += 1;
  }
  return { ...page, items };
}

function ProductNutritionSummary({
  product,
  quantity,
}: {
  product: FoodProductData;
  quantity?: { amount: number; unit: FoodProductBasisUnit };
}) {
  return (
    <span className="mt-2 block text-xs leading-5 text-[var(--text-2)]">
      <span className="block font-extrabold text-[var(--brand-primary-text)]">
        {formatFoodProductExpectedEnergy(product, quantity)}
      </span>
      <span className="block">
        {getFoodProductCoreNutritionLines(product, quantity).join(" · ")}
      </span>
    </span>
  );
}

export function FoodProductPicker({
  columnId,
  initialProductId = null,
  initialQuantityAmount = "1",
  initialQuantityUnit = null,
  initialQuery = "",
  onClose,
  onComplete,
  planDate,
  slotName,
}: {
  columnId: string;
  initialProductId?: string | null;
  initialQuantityAmount?: string;
  initialQuantityUnit?: FoodProductBasisUnit | null;
  initialQuery?: string;
  onClose: () => void;
  onComplete: (entry: ProductPlannerEntryData) => void | Promise<void>;
  planDate: string;
  slotName: string;
}) {
  const [returnContext] = useState(() => readProductPlannerReturnContext());
  const scopedContext = returnContext &&
    returnContext.planDate === planDate &&
    returnContext.columnId === columnId &&
    returnContext.slotName === slotName
    ? returnContext
    : null;
  const pickerReturn = scopedContext?.kind === "picker" ? scopedContext : null;
  const createReturn = scopedContext?.kind === "create" ? scopedContext : null;
  const [query, setQuery] = useState(pickerReturn?.query ?? createReturn?.query ?? initialQuery);
  const [items, setItems] = useState<FoodProductData[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<FoodProductData | null>(null);
  const [quantityAmount, setQuantityAmount] = useState(pickerReturn?.quantityAmount ?? initialQuantityAmount);
  const [quantityUnit, setQuantityUnit] = useState<FoodProductBasisUnit | null>(pickerReturn?.quantityUnit ?? initialQuantityUnit);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingSelection, setIsRefreshingSelection] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  const [hasNutritionConflict, setHasNutritionConflict] = useState(false);
  const [isCreating, setIsCreating] = useState(Boolean(createReturn));
  const [createDirty, setCreateDirty] = useState(Boolean(createReturn));
  const [createExitTarget, setCreateExitTarget] = useState<CreateExitTarget | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const generationRef = useRef(0);
  const queryRef = useRef(query);
  const selectedProductIdRef = useRef<string | null>(selectedProduct?.id ?? null);
  const restoreProductIdRef = useRef(pickerReturn?.productId ?? initialProductId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const createShellRef = useRef<HTMLElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const discardContinueRef = useRef<HTMLButtonElement>(null);
  queryRef.current = query;
  selectedProductIdRef.current = selectedProduct?.id ?? null;

  const loadFirstPage = useCallback(async (activeQuery: string, generation: number) => {
    setListState("loading");
    setListError(null);
    setItems([]);
    setNextCursor(null);
    setHasNext(false);
    try {
      const data = await fetchProductPagesUntil(activeQuery, restoreProductIdRef.current);
      if (generationRef.current !== generation) return;
      setItems(data.items);
      setNextCursor(data.next_cursor);
      setHasNext(data.has_next);
      setListState(data.items.length === 0 ? "empty" : "ready");
      if (restoreProductIdRef.current) {
        const restored = data.items.find((product) => product.id === restoreProductIdRef.current);
        restoreProductIdRef.current = null;
        if (restored) setSelectedProduct(restored);
        else setEntryError("선택했던 완제품을 더 이상 찾을 수 없어요. 다시 선택해 주세요.");
      }
    } catch (caught) {
      if (generationRef.current !== generation) return;
      setListState("error");
      setListError(isFoodProductApiError(caught) ? caught.message : "완제품 목록을 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    void loadFirstPage(query, generation);
  }, [loadFirstPage, query, reloadKey]);

  useEffect(() => {
    if (!isCreating) searchInputRef.current?.focus();
  }, [isCreating]);

  const compatibleUnits = useMemo(
    () => selectedProduct ? buildCompatibleFoodProductUnits(selectedProduct) : [],
    [selectedProduct],
  );

  useEffect(() => {
    if (!selectedProduct) return;
    if (!quantityUnit || !compatibleUnits.includes(quantityUnit)) {
      setQuantityUnit(compatibleUnits[0] ?? selectedProduct.nutrition.basis.unit);
    }
  }, [compatibleUnits, quantityUnit, selectedProduct]);

  useEffect(() => {
    if (selectedProduct) quantityInputRef.current?.focus();
  }, [selectedProduct]);

  const handleLoadMore = async () => {
    if (!hasNext || !nextCursor || isLoadingMore) return;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    setListError(null);
    try {
      const data = await fetchFoodProducts({ q: query, cursor: nextCursor, limit: PAGE_LIMIT });
      if (generationRef.current !== generation) return;
      setItems((current) => appendUniqueProducts(current, data.items));
      setNextCursor(data.next_cursor);
      setHasNext(data.has_next);
    } catch (caught) {
      if (generationRef.current === generation) {
        setListError(isFoodProductApiError(caught) ? caught.message : "다음 완제품을 불러오지 못했어요.");
      }
    } finally {
      if (generationRef.current === generation) setIsLoadingMore(false);
    }
  };

  const handleSelect = (product: FoodProductData) => {
    setSelectedProduct(product);
    setQuantityAmount("1");
    setQuantityUnit(buildCompatibleFoodProductUnits(product)[0] ?? product.nutrition.basis.unit);
    setEntryError(null);
    setHasNutritionConflict(false);
  };

  const beginLoginReturn = (context: ProductPlannerReturnContext, nextPath: string) => {
    saveProductPlannerReturnContext(context);
    document.cookie = createPostAuthNextCookie(nextPath);
    window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
  };

  const handleSubmit = async () => {
    const amount = safePositiveAmount(quantityAmount);
    if (!selectedProduct || !quantityUnit) {
      setEntryError("추가할 완제품을 선택해 주세요.");
      return;
    }
    if (amount === null) {
      setEntryError("수량은 0보다 큰 숫자로 입력해 주세요.");
      quantityInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setEntryError(null);
    try {
      const entry = await createProductPlannerEntry({
        product_id: selectedProduct.id,
        plan_date: planDate,
        column_id: columnId,
        quantity: { amount, unit: quantityUnit },
      });
      clearProductPlannerReturnContext();
      await onComplete(entry);
    } catch (caught) {
      if (!isProductPlannerEntryApiError(caught)) {
        setEntryError("완제품을 플래너에 추가하지 못했어요.");
        return;
      }
      if (caught.status === 401) {
        const nextPath = buildPickerNextPath({
          columnId, planDate, productId: selectedProduct.id, quantityAmount,
          quantityUnit, query, slotName,
        });
        beginLoginReturn({
          version: 1, kind: "picker", planDate, columnId, slotName, query,
          productId: selectedProduct.id, quantityAmount, quantityUnit,
        }, nextPath);
        return;
      }
      if (caught.code === "PRODUCT_DELETED") {
        setItems((current) => current.filter((item) => item.id !== selectedProduct.id));
        setSelectedProduct(null);
        setQuantityUnit(null);
      } else if (caught.code === "NUTRITION_VERSION_CONFLICT") {
        setHasNutritionConflict(true);
      }
      setEntryError(formatProductPlannerEntryErrorMessage(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshSelectedProduct = async () => {
    if (!selectedProduct || isRefreshingSelection) return;
    const generation = generationRef.current;
    const refreshQuery = query;
    const productId = selectedProduct.id;
    const isCurrentRefresh = () =>
      generationRef.current === generation &&
      queryRef.current === refreshQuery &&
      selectedProductIdRef.current === productId;
    setIsRefreshingSelection(true);
    try {
      const data = await fetchProductPagesUntil(refreshQuery, productId);
      if (!isCurrentRefresh()) return;
      const refreshed = data.items.find((product) => product.id === productId);
      if (!refreshed) {
        setItems((current) => current.filter((item) => item.id !== productId));
        setSelectedProduct(null);
        setQuantityUnit(null);
        setEntryError("완제품이 삭제되었거나 더 이상 사용할 수 없어요. 다시 선택해 주세요.");
        return;
      }
      setItems(data.items);
      setSelectedProduct(refreshed);
      setEntryError(null);
      setHasNutritionConflict(false);
    } catch (caught) {
      if (!isCurrentRefresh()) return;
      setEntryError(isFoodProductApiError(caught) ? caught.message : "최신 영양정보를 불러오지 못했어요.");
    } finally {
      setIsRefreshingSelection(false);
    }
  };

  const finishCreateExit = (target: CreateExitTarget) => {
    setCreateDirty(false);
    setCreateExitTarget(null);
    if (target === "close") onClose();
    else setIsCreating(false);
  };

  const requestCreateExit = (target: CreateExitTarget) => {
    if (createDirty) {
      setCreateExitTarget(target);
      return;
    }
    finishCreateExit(target);
  };

  const continueCreating = () => {
    setCreateExitTarget(null);
    requestAnimationFrame(() => {
      createShellRef.current?.querySelector<HTMLElement>("form input")?.focus();
    });
  };

  useDialogBoundary({
    active: Boolean(createExitTarget),
    dialogRef: discardDialogRef,
    initialFocusRef: discardContinueRef,
    onClose: continueCreating,
  });

  const handleCreateUnauthorized = (draft: FoodProductDraftContext) => {
    const nextPath = buildPickerNextPath({
      columnId, planDate, productId: null, quantityAmount: "", quantityUnit: null,
      query, slotName,
    });
    beginLoginReturn({
      version: 1, kind: "create", planDate, columnId, slotName, query, draft,
    }, nextPath);
  };

  if (isCreating) {
    return (
      <section
        aria-labelledby="food-product-create-title"
        className="relative mx-auto flex h-[calc(100dvh-2rem)] max-h-[760px] w-full max-w-3xl flex-col overflow-hidden bg-[var(--surface)] lg:h-[calc(100dvh-17rem)]"
        data-testid="food-product-create-shell"
        ref={createShellRef}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          if (createExitTarget) {
            continueCreating();
            return;
          }
          requestCreateExit("picker");
        }}
      >
        <div className="sticky top-0 z-10 mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--surface)] pb-3">
          <div>
            <p className="text-xs font-extrabold text-[var(--brand-primary-text)]">FOOD PRODUCT CREATE</p>
            <h2 className="text-xl font-extrabold text-[var(--foreground)]" id="food-product-create-title">완제품 직접 등록</h2>
          </div>
          <button className="min-h-11 min-w-11 rounded-full text-xl text-[var(--text-2)]" onClick={() => requestCreateExit("close")} type="button" aria-label="완제품 등록 닫기">×</button>
        </div>
        <FoodProductCreateForm
          initialDraft={createReturn?.draft}
          onCancel={() => requestCreateExit("picker")}
          onCreated={(product) => {
            clearProductPlannerReturnContext();
            setItems((current) => appendUniqueProducts([product], current));
            handleSelect(product);
            setCreateDirty(false);
            setCreateExitTarget(null);
            setIsCreating(false);
            setListState("ready");
          }}
          onDirtyChange={setCreateDirty}
          onUnauthorized={handleCreateUnauthorized}
        />
        {createExitTarget ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--overlay-40)] p-4">
            <div
              aria-labelledby="food-product-discard-title"
              aria-modal="true"
              className="w-full max-w-sm rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-5 shadow-xl"
              ref={discardDialogRef}
              role="dialog"
              tabIndex={-1}
            >
              <h3 className="text-lg font-extrabold text-[var(--foreground)]" id="food-product-discard-title">작성 중인 완제품 정보 버리기</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">입력한 내용은 저장되지 않아요. 그래도 나갈까요?</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--foreground)]" onClick={continueCreating} ref={discardContinueRef} type="button">계속 작성</button>
                <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--danger)] px-3 text-sm font-bold text-[var(--text-inverse)]" onClick={() => finishCreateExit(createExitTarget)} type="button">버리고 나가기</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  const selectedAmount = safePositiveAmount(quantityAmount);
  return (
    <section
      aria-labelledby="food-product-picker-title"
      className="mx-auto flex h-[calc(100dvh-2rem)] max-h-[760px] min-h-0 w-full max-w-3xl flex-col overflow-hidden"
      data-testid="food-product-picker"
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-[var(--brand-primary-text)]">FOOD PRODUCT PICKER</p>
          <h2 className="text-xl font-extrabold text-[var(--foreground)]" id="food-product-picker-title">완제품 추가</h2>
          <p className="mt-1 text-xs text-[var(--text-3)]">{planDate} · {slotName}</p>
        </div>
        <button aria-label="완제품 선택 닫기" className="min-h-11 min-w-11 rounded-full text-xl text-[var(--text-2)]" onClick={onClose} type="button">×</button>
      </div>

      <label className="relative block shrink-0">
        <span className="sr-only">완제품 검색</span>
        <input
          aria-label="완제품 검색"
          className="min-h-12 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-4 text-sm outline-none focus:border-[var(--brand-primary)]"
          onChange={(event) => {
            restoreProductIdRef.current = null;
            setQuery(event.target.value);
            setSelectedProduct(null);
            setEntryError(null);
            setHasNutritionConflict(false);
          }}
          placeholder="제품명 또는 브랜드 검색"
          ref={searchInputRef}
          role="searchbox"
          type="search"
          value={query}
        />
      </label>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1" data-testid="food-product-result-scroll">
        {listState === "loading" ? (
          <div className="grid gap-2" aria-label="완제품 목록 불러오는 중">
            {[0, 1, 2].map((item) => <div className="h-[76px] animate-pulse rounded-[var(--radius-card)] bg-[var(--surface-fill)]" key={item} />)}
          </div>
        ) : null}

        {listState === "error" ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-center">
            <p className="text-sm font-semibold text-[var(--danger)]" role="alert">{listError}</p>
            <button className="mt-3 min-h-11 rounded-[var(--radius-control)] bg-[var(--surface)] px-4 text-sm font-bold" onClick={() => setReloadKey((current) => current + 1)} type="button">다시 불러오기</button>
          </div>
        ) : null}

        {listState === "empty" ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface-fill)] p-5 text-center">
            <p className="text-sm font-bold text-[var(--foreground)]">검색 결과가 없어요</p>
            <p className="mt-1 text-xs text-[var(--text-3)]">포장지의 영양정보로 내 완제품을 등록할 수 있어요.</p>
            <button className="mt-4 min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-[var(--foreground)]" onClick={() => { setCreateDirty(false); setIsCreating(true); }} type="button">새 완제품 등록</button>
          </div>
        ) : null}

        {listState === "ready" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((product) => {
              const selected = selectedProduct?.id === product.id;
              return (
                <button
                  aria-pressed={selected}
                  className={[
                    "min-h-[76px] rounded-[var(--radius-card)] border p-3 text-left transition",
                    selected
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] shadow-[0_0_0_1px_var(--brand-primary)]"
                      : "border-[var(--line)] bg-[var(--surface)]",
                  ].join(" ")}
                  key={product.id}
                  onClick={() => handleSelect(product)}
                  type="button"
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-[var(--foreground)]">{product.name}</span>
                      {product.brand ? <span className="mt-0.5 block truncate text-xs text-[var(--text-3)]">{product.brand}</span> : null}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2 py-1 text-[10px] font-bold text-[var(--text-2)]">{productOriginLabel(product)}</span>
                  </span>
                  <span className="mt-2 block text-xs font-semibold text-[var(--brand-primary-text)]">기준 {product.nutrition.basis.amount}{formatProductUnit(product.nutrition.basis.unit)}</span>
                  <ProductNutritionSummary product={product} />
                </button>
              );
            })}
          </div>
        ) : null}

        {listState === "ready" && hasNext ? (
          <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-sm font-bold disabled:opacity-50" disabled={isLoadingMore} onClick={() => void handleLoadMore()} type="button">{isLoadingMore ? "불러오는 중…" : "완제품 더 불러오기"}</button>
        ) : null}
        {listState === "ready" && listError ? <p className="mt-2 text-sm font-semibold text-[var(--danger)]" role="alert">{listError}</p> : null}
        {listState === "ready" ? (
          <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-dashed border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-sm font-extrabold text-[var(--foreground)]" onClick={() => { setCreateDirty(false); setIsCreating(true); }} type="button">목록에 없나요? 새 완제품 등록</button>
        ) : null}
      </div>

      {selectedProduct ? (
        <div className="mt-3 max-h-[46dvh] shrink-0 overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] p-4" data-testid="food-product-quantity-step">
          <p className="text-sm font-extrabold text-[var(--foreground)]">{selectedProduct.name} 수량</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">표시 기준과 직접 연결된 단위만 선택할 수 있어요.</p>
          <ProductNutritionSummary product={selectedProduct} quantity={selectedAmount && quantityUnit ? { amount: selectedAmount, unit: quantityUnit } : undefined} />
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(96px,0.7fr)] gap-2">
            <label className="grid gap-1 text-xs font-bold text-[var(--text-2)]">
              수량
              <input aria-label="완제품 수량" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none" disabled={isSubmitting} inputMode="decimal" min="0.01" onChange={(event) => { setQuantityAmount(event.target.value); setEntryError(null); setHasNutritionConflict(false); }} ref={quantityInputRef} step="any" type="number" value={quantityAmount} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-[var(--text-2)]">
              단위
              <select aria-label="완제품 수량 단위" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none" disabled={isSubmitting} onChange={(event) => { setQuantityUnit(event.target.value as FoodProductBasisUnit); setEntryError(null); setHasNutritionConflict(false); }} value={quantityUnit ?? ""}>
                {compatibleUnits.map((unit) => <option key={unit} value={unit}>{formatProductUnit(unit)}</option>)}
              </select>
            </label>
          </div>
          {entryError ? <p className="mt-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger)]" role="alert">{entryError}</p> : null}
          {hasNutritionConflict ? (
            <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--brand-primary)] bg-[var(--surface)] px-4 text-sm font-extrabold text-[var(--brand-primary-text)] disabled:opacity-50" disabled={isRefreshingSelection} onClick={() => void refreshSelectedProduct()} type="button">
              {isRefreshingSelection ? "최신 영양정보 확인 중…" : "최신 영양정보로 새로고침"}
            </button>
          ) : null}
          <button className="mt-3 min-h-12 w-full rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-[var(--foreground)] disabled:opacity-50" disabled={isSubmitting} onClick={() => void handleSubmit()} type="button">{isSubmitting ? "플래너에 추가 중…" : `${slotName || "플래너"}에 완제품 추가`}</button>
        </div>
      ) : null}
    </section>
  );
}
