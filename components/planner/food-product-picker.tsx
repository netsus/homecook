"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FoodProductCreateForm } from "@/components/planner/food-product-create-form";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import {
  deleteFoodProduct,
  fetchFoodProducts,
  isFoodProductApiError,
  reportFoodProduct,
} from "@/lib/api/food-product";
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
  getFoodProductComparisonQuantity,
  getFoodProductCoreNutritionLines,
} from "@/lib/planner/product-planner-entry-presentation";
import {
  clearProductPlannerReturnContext,
  readProductPlannerReturnContext,
  saveProductPlannerReturnContext,
  type FoodProductDraftContext,
  type ProductPlannerReturnContext,
} from "@/lib/planner/product-planner-return-context";
import type {
  FoodProductBasisUnit,
  FoodProductData,
  FoodProductListSource,
  FoodProductReportReason,
} from "@/types/food-product";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

const PAGE_LIMIT = 20;
type ListState = "loading" | "ready" | "empty" | "error";
type CreateExitTarget = "picker" | "close";

const REPORT_REASON_OPTIONS: Array<{
  value: FoodProductReportReason;
  label: string;
}> = [
  { value: "spam", label: "스팸·광고예요" },
  { value: "incorrect_nutrition", label: "영양 정보가 달라요" },
  { value: "duplicate", label: "중복 제품이에요" },
  { value: "rights", label: "권리 침해가 있어요" },
  { value: "unsafe", label: "안전 문제가 있어요" },
  { value: "other", label: "기타" },
];

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
  if (product.source_type === "public_dataset") return "공공 영양DB";
  return product.visibility === "public" ? "사용자 등록" : "비공개 보관";
}

function getDefaultQuantityState(product: FoodProductData) {
  const comparisonQuantity = getFoodProductComparisonQuantity(product);
  if (comparisonQuantity) {
    return {
      amount: String(comparisonQuantity.amount),
      unit: comparisonQuantity.unit,
    };
  }
  return {
    amount: String(product.nutrition.basis.amount),
    unit: product.nutrition.basis.unit,
  };
}

function canEditProduct(product: FoodProductData) {
  return product.source_type === "manual" && product.editable;
}

function canReportProduct(product: FoodProductData) {
  return product.source_type === "manual" && product.visibility === "public" && !product.editable;
}

function safePositiveAmount(value: string) {
  const amount = Number(value);
  return value.trim() !== "" && Number.isFinite(amount) && amount > 0 ? amount : null;
}

function buildPickerNextPath({
  columnId,
  planDate,
  productId,
  productAction,
  quantityAmount,
  quantityUnit,
  query,
  source,
  slotName,
}: {
  columnId: string;
  planDate: string;
  productId: string | null;
  productAction?: "edit" | null;
  quantityAmount: string;
  quantityUnit: FoodProductBasisUnit | null;
  query: string;
  source: FoodProductListSource;
  slotName: string;
}) {
  const params = new URLSearchParams({ source: "product" });
  if (planDate) params.set("date", planDate);
  if (columnId) params.set("columnId", columnId);
  if (slotName) params.set("slot", slotName);
  if (query.trim()) params.set("productQuery", query.trim());
  if (source !== "all") params.set("productSourceFilter", source);
  if (productId) params.set("productId", productId);
  if (productAction) params.set("productAction", productAction);
  if (quantityAmount) params.set("productAmount", quantityAmount);
  if (quantityUnit) params.set("productUnit", quantityUnit);
  return `/menu-add?${params.toString()}`;
}

function beginLoginReturn(context: ProductPlannerReturnContext, nextPath: string) {
  saveProductPlannerReturnContext(context);
  document.cookie = createPostAuthNextCookie(nextPath);
  window.location.assign(`/login?next=${encodeURIComponent(nextPath)}`);
}

async function fetchProductPagesUntil(
  query: string,
  source: FoodProductListSource,
  productId: string | null,
) {
  let page = await fetchFoodProducts({ q: query, source, limit: PAGE_LIMIT });
  let items = appendUniqueProducts([], page.items);
  let pageCount = 1;
  while (
    productId &&
    !items.some((product) => product.id === productId) &&
    page.has_next &&
    page.next_cursor &&
    pageCount < 50
  ) {
    page = await fetchFoodProducts({
      q: query,
      source,
      cursor: page.next_cursor,
      limit: PAGE_LIMIT,
    });
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

function ProductBasisLabel({ product }: { product: FoodProductData }) {
  const comparisonQuantity = getFoodProductComparisonQuantity(product);
  if (comparisonQuantity) {
    return (
      <span className="mt-2 block text-xs font-semibold text-[var(--brand-primary-text)]">
        {comparisonQuantity.amount}
        {formatProductUnit(comparisonQuantity.unit)} 기준
      </span>
    );
  }

  return (
    <>
      <span className="mt-2 block text-xs font-semibold text-[var(--brand-primary-text)]">
        기준 {product.nutrition.basis.amount}
        {formatProductUnit(product.nutrition.basis.unit)}
      </span>
      <span className="mt-1 block text-[11px] text-[var(--text-3)]">100g/100mL 비교 불가</span>
    </>
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
  const restoredEditContext = createReturn?.action === "edit" ? createReturn : null;
  const [query, setQuery] = useState(pickerReturn?.query ?? createReturn?.query ?? initialQuery);
  const [selectedSource, setSelectedSource] = useState<FoodProductListSource>(
    pickerReturn?.source ?? createReturn?.source ?? "all",
  );
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
  const [isCreating, setIsCreating] = useState(Boolean(createReturn && !restoredEditContext));
  const [editingProduct, setEditingProduct] = useState<FoodProductData | null>(null);
  const [createDirty, setCreateDirty] = useState(Boolean(createReturn));
  const [createExitTarget, setCreateExitTarget] = useState<CreateExitTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FoodProductData | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [reportTarget, setReportTarget] = useState<FoodProductData | null>(null);
  const [reportReason, setReportReason] = useState<FoodProductReportReason>("incorrect_nutrition");
  const [reportDetail, setReportDetail] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const generationRef = useRef(0);
  const queryRef = useRef(query);
  const selectedProductIdRef = useRef<string | null>(selectedProduct?.id ?? null);
  const restoreProductIdRef = useRef(pickerReturn?.productId ?? initialProductId);
  const restoreEditProductIdRef = useRef<string | null>(restoredEditContext?.productId ?? null);
  const quantityAmountRef = useRef(quantityAmount);
  const quantityUnitRef = useRef(quantityUnit);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const createShellRef = useRef<HTMLElement>(null);
  const discardDialogRef = useRef<HTMLDivElement>(null);
  const discardContinueRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const reportDialogRef = useRef<HTMLDivElement>(null);
  const reportFirstReasonRef = useRef<HTMLInputElement>(null);
  const actionFocusRef = useRef<HTMLButtonElement | null>(null);
  queryRef.current = query;
  selectedProductIdRef.current = selectedProduct?.id ?? null;
  quantityAmountRef.current = quantityAmount;
  quantityUnitRef.current = quantityUnit;

  const beginPickerLoginReturn = useCallback((activeQuery: string, productId?: string | null) => {
    const selectedId = productId ?? selectedProductIdRef.current ?? restoreProductIdRef.current;
    const nextPath = buildPickerNextPath({
      columnId,
      planDate,
      productId: selectedId,
      quantityAmount: quantityAmountRef.current,
      quantityUnit: quantityUnitRef.current,
      query: activeQuery,
      source: selectedSource,
      slotName,
    });
    beginLoginReturn({
      version: 1,
      kind: "picker",
      planDate,
      columnId,
      slotName,
      query: activeQuery,
      source: selectedSource,
      productId: selectedId,
      quantityAmount: quantityAmountRef.current,
      quantityUnit: quantityUnitRef.current,
    }, nextPath);
  }, [columnId, planDate, selectedSource, slotName]);

  const loadFirstPage = useCallback(async (
    activeQuery: string,
    source: FoodProductListSource,
    generation: number,
  ) => {
    setListState("loading");
    setListError(null);
    setItems([]);
    setNextCursor(null);
    setHasNext(false);
    try {
      const restoreTargetId = restoreEditProductIdRef.current ?? restoreProductIdRef.current;
      const data = await fetchProductPagesUntil(activeQuery, source, restoreTargetId);
      if (generationRef.current !== generation) return;
      setItems(data.items);
      setNextCursor(data.next_cursor);
      setHasNext(data.has_next);
      setListState(data.items.length === 0 ? "empty" : "ready");
      if (restoreEditProductIdRef.current) {
        const restoredEditProduct = data.items.find(
          (product) => product.id === restoreEditProductIdRef.current,
        );
        restoreEditProductIdRef.current = null;
        if (restoredEditProduct) {
          setSelectedProduct(restoredEditProduct);
          setEditingProduct(restoredEditProduct);
        } else {
          setEntryError("수정하려던 완제품을 더 이상 찾을 수 없어요. 다시 선택해 주세요.");
        }
      }
      if (restoreProductIdRef.current) {
        const restored = data.items.find((product) => product.id === restoreProductIdRef.current);
        restoreProductIdRef.current = null;
        if (restored) setSelectedProduct(restored);
        else setEntryError("선택했던 완제품을 더 이상 찾을 수 없어요. 다시 선택해 주세요.");
      }
    } catch (caught) {
      if (generationRef.current !== generation) return;
      if (isFoodProductApiError(caught) && caught.status === 401) {
        beginPickerLoginReturn(activeQuery);
        return;
      }
      setListState("error");
      setListError(isFoodProductApiError(caught) ? caught.message : "완제품 목록을 불러오지 못했어요.");
    }
  }, [beginPickerLoginReturn]);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    void loadFirstPage(query, selectedSource, generation);
  }, [loadFirstPage, query, reloadKey, selectedSource]);

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
      const data = await fetchFoodProducts({
        q: query,
        source: selectedSource,
        cursor: nextCursor,
        limit: PAGE_LIMIT,
      });
      if (generationRef.current !== generation) return;
      setItems((current) => appendUniqueProducts(current, data.items));
      setNextCursor(data.next_cursor);
      setHasNext(data.has_next);
    } catch (caught) {
      if (generationRef.current === generation) {
        if (isFoodProductApiError(caught) && caught.status === 401) {
          beginPickerLoginReturn(query);
          return;
        }
        setListError(isFoodProductApiError(caught) ? caught.message : "다음 완제품을 불러오지 못했어요.");
      }
    } finally {
      if (generationRef.current === generation) setIsLoadingMore(false);
    }
  };

  const handleSelect = (product: FoodProductData) => {
    const defaults = getDefaultQuantityState(product);
    setSelectedProduct(product);
    setQuantityAmount(defaults.amount);
    setQuantityUnit(
      buildCompatibleFoodProductUnits(product).includes(defaults.unit)
        ? defaults.unit
        : buildCompatibleFoodProductUnits(product)[0] ?? product.nutrition.basis.unit,
    );
    setEntryError(null);
    setHasNutritionConflict(false);
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
          quantityUnit, query, source: selectedSource, slotName,
        });
        beginLoginReturn({
          version: 1, kind: "picker", planDate, columnId, slotName, query, source: selectedSource,
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
      const data = await fetchProductPagesUntil(refreshQuery, selectedSource, productId);
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
      if (isFoodProductApiError(caught) && caught.status === 401) {
        beginPickerLoginReturn(refreshQuery, productId);
        return;
      }
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

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  const closeReportDialog = useCallback(() => {
    setReportTarget(null);
    setReportError(null);
  }, []);

  useDialogBoundary({
    active: Boolean(deleteTarget),
    dialogRef: deleteDialogRef,
    initialFocusRef: deleteCancelRef,
    onClose: closeDeleteDialog,
  });

  useDialogBoundary({
    active: Boolean(reportTarget),
    dialogRef: reportDialogRef,
    initialFocusRef: reportFirstReasonRef,
    onClose: closeReportDialog,
  });

  const handleCreateUnauthorized = (draft: FoodProductDraftContext) => {
    const nextPath = buildPickerNextPath({
      columnId,
      planDate,
      productId: editingProduct?.id ?? null,
      productAction: editingProduct ? "edit" : null,
      quantityAmount: "",
      quantityUnit: null,
      query,
      source: selectedSource,
      slotName,
    });
    beginLoginReturn({
      version: 1,
      kind: "create",
      planDate,
      columnId,
      slotName,
      query,
      source: selectedSource,
      draft,
      ...(editingProduct ? { productId: editingProduct.id, action: "edit" as const } : {}),
    }, nextPath);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    setIsDeletingProduct(true);
    try {
      await deleteFoodProduct(deleteTarget.id);
      setItems((current) => current.filter((item) => item.id !== deleteTarget.id));
      if (selectedProduct?.id === deleteTarget.id) {
        setSelectedProduct(null);
        setQuantityUnit(null);
      }
      setDeleteTarget(null);
      setDeleteError(null);
      searchInputRef.current?.focus();
    } catch (caught) {
      if (isFoodProductApiError(caught) && caught.status === 401) {
        beginPickerLoginReturn(query, deleteTarget.id);
        return;
      }
      setDeleteError(isFoodProductApiError(caught) ? caught.message : "완제품을 삭제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const handleReportSubmit = async () => {
    if (!reportTarget) return;
    setReportError(null);
    setIsReporting(true);
    try {
      await reportFoodProduct(reportTarget.id, {
        reason_code: reportReason,
        detail_text: reportDetail.trim() || null,
      });
      setReportFeedback("신고했어요.");
      setReportTarget(null);
      setReportError(null);
      setReportDetail("");
    } catch (caught) {
      if (isFoodProductApiError(caught) && caught.status === 401) {
        beginPickerLoginReturn(query, reportTarget.id);
        return;
      }
      if (isFoodProductApiError(caught) && caught.code === "PRODUCT_ALREADY_REPORTED") {
        setReportError("이미 신고한 제품이에요.");
        return;
      }
      if (isFoodProductApiError(caught) && caught.code === "PRODUCT_REPORT_NOT_ALLOWED") {
        setReportError("이 제품은 지금 신고할 수 없어요.");
        return;
      }
      if (isFoodProductApiError(caught) && caught.code === "FORBIDDEN") {
        setReportError("내가 등록한 제품은 신고할 수 없어요.");
        return;
      }
      setReportError(isFoodProductApiError(caught) ? caught.message : "신고를 보내지 못했어요. 다시 시도해 주세요.");
    } finally {
      setIsReporting(false);
    }
  };

  if (isCreating || editingProduct) {
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
            <h2 className="text-xl font-extrabold text-[var(--foreground)]" id="food-product-create-title">
              {editingProduct ? "사용자 등록 제품 수정" : "완제품 직접 등록"}
            </h2>
          </div>
          <button className="min-h-11 min-w-11 rounded-full text-xl text-[var(--text-2)]" onClick={() => {
            if (editingProduct) {
              clearProductPlannerReturnContext();
              setEditingProduct(null);
              setCreateDirty(false);
              return;
            }
            requestCreateExit("close");
          }} type="button" aria-label="완제품 등록 닫기">×</button>
        </div>
        <FoodProductCreateForm
          initialDraft={createReturn?.draft}
          onCancel={() => {
            if (editingProduct) {
              clearProductPlannerReturnContext();
              setEditingProduct(null);
              setCreateDirty(false);
              return;
            }
            requestCreateExit("picker");
          }}
          product={editingProduct}
          onCreated={(product) => {
            const nextSource = selectedSource === "public_dataset" ? "manual" : selectedSource;
            clearProductPlannerReturnContext();
            if (nextSource !== selectedSource) {
              setQuery(product.name);
            }
            setItems((current) =>
              nextSource === selectedSource ? appendUniqueProducts([product], current) : [product]
            );
            if (nextSource !== selectedSource) {
              setSelectedSource(nextSource);
            }
            handleSelect(product);
            setCreateDirty(false);
            setCreateExitTarget(null);
            setIsCreating(false);
            setListState("ready");
          }}
          onDirtyChange={setCreateDirty}
          onUnauthorized={handleCreateUnauthorized}
          onUpdated={(product) => {
            clearProductPlannerReturnContext();
            setItems((current) => current.map((item) => item.id === product.id ? product : item));
            if (selectedProduct?.id === product.id) {
              setSelectedProduct(product);
            }
            setEditingProduct(null);
            setCreateDirty(false);
          }}
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
      className="relative mx-auto flex h-[calc(100dvh-2rem)] max-h-[760px] min-h-0 w-full max-w-3xl flex-col overflow-hidden"
      data-testid="food-product-picker"
      onKeyDownCapture={(event) => {
        if (event.key !== "Escape") return;
        if (deleteTarget || reportTarget) return;
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

      <div aria-label="완제품 출처 필터" className="mt-3 flex shrink-0 flex-wrap gap-2" role="group">
        {[
          { value: "all" as const, label: "전체" },
          { value: "public_dataset" as const, label: "공공 영양DB" },
          { value: "manual" as const, label: "사용자 등록" },
        ].map((filter) => {
          const selected = selectedSource === filter.value;
          return (
            <button
              aria-pressed={selected}
              className={[
                "min-h-11 rounded-full border px-4 text-sm font-bold",
                selected
                  ? "border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] text-[var(--brand-primary-text)]"
                  : "border-[var(--line)] bg-[var(--surface-fill)] text-[var(--text-2)]",
              ].join(" ")}
              key={filter.value}
              onClick={() => {
                restoreProductIdRef.current = null;
                setSelectedSource(filter.value);
                setSelectedProduct(null);
                setEntryError(null);
                setHasNutritionConflict(false);
              }}
              type="button"
            >
              {filter.label}
            </button>
          );
        })}
      </div>

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
            <p className="mt-1 text-xs text-[var(--text-3)]">포장지의 영양정보로 사용자 등록 완제품을 만들 수 있어요.</p>
            <button className="mt-4 min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-4 text-sm font-extrabold text-[var(--foreground)]" onClick={() => { setCreateDirty(false); setIsCreating(true); }} type="button">새 완제품 등록</button>
          </div>
        ) : null}

        {listState === "ready" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {items.map((product) => {
              const selected = selectedProduct?.id === product.id;
              const comparisonQuantity = getFoodProductComparisonQuantity(product);
              return (
                <div
                  className={[
                    "min-h-[76px] rounded-[var(--radius-card)] border p-3 text-left transition",
                    selected
                      ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] shadow-[0_0_0_1px_var(--brand-primary)]"
                      : "border-[var(--line)] bg-[var(--surface)]",
                  ].join(" ")}
                  key={product.id}
                >
                  <button
                    aria-pressed={selected}
                    aria-label={`${product.name} 선택`}
                    className="w-full text-left"
                    onClick={() => handleSelect(product)}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold text-[var(--foreground)]">{product.name}</span>
                        {product.brand ? <span className="mt-0.5 block truncate text-xs text-[var(--text-3)]">{product.brand}</span> : null}
                      </span>
                      <span className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2 py-1 text-xs font-bold text-[var(--text-2)]">{productOriginLabel(product)}</span>
                    </span>
                    <ProductBasisLabel product={product} />
                    {product.nutrition.label_basis_text ? (
                      <span className="mt-1 block text-[11px] text-[var(--text-3)]">라벨 {product.nutrition.label_basis_text}</span>
                    ) : null}
                    <ProductNutritionSummary product={product} quantity={comparisonQuantity ?? undefined} />
                  </button>
                  {canEditProduct(product) || canReportProduct(product) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canEditProduct(product) ? (
                        <>
                          <button
                            className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--foreground)]"
                            aria-label={`${product.name} 수정`}
                            onClick={(event) => {
                              event.stopPropagation();
                              actionFocusRef.current = event.currentTarget;
                              clearProductPlannerReturnContext();
                              setEditingProduct(product);
                              setCreateDirty(false);
                            }}
                            type="button"
                          >
                            수정
                          </button>
                          <button
                            className="min-h-11 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 text-xs font-bold text-[var(--danger)]"
                            aria-label={`${product.name} 삭제`}
                            onClick={(event) => {
                              event.stopPropagation();
                              actionFocusRef.current = event.currentTarget;
                              setDeleteError(null);
                              setDeleteTarget(product);
                            }}
                            type="button"
                          >
                            삭제
                          </button>
                        </>
                      ) : null}
                      {canReportProduct(product) ? (
                        <button
                          className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-xs font-bold text-[var(--foreground)]"
                          aria-label={`${product.name} 신고`}
                          onClick={(event) => {
                            event.stopPropagation();
                            actionFocusRef.current = event.currentTarget;
                            setReportError(null);
                            setReportDetail("");
                            setReportReason("incorrect_nutrition");
                            setReportTarget(product);
                          }}
                          type="button"
                        >
                          신고
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {listState === "ready" && hasNext ? (
          <button className="mt-3 min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-sm font-bold disabled:opacity-50" disabled={isLoadingMore} onClick={() => void handleLoadMore()} type="button">{isLoadingMore ? "불러오는 중…" : "완제품 더 불러오기"}</button>
        ) : null}
        {listState === "ready" && listError ? <p className="mt-2 text-sm font-semibold text-[var(--danger)]" role="alert">{listError}</p> : null}
        {reportFeedback ? <p className="mt-2 text-sm font-semibold text-[var(--brand-primary-text)]" role="status">{reportFeedback}</p> : null}

        {selectedProduct ? (
          <div className="mt-3 rounded-[var(--radius-card)] border border-[var(--brand-primary-border)] bg-[var(--brand-primary-soft)] p-4" data-testid="food-product-selection-summary">
            <p className="text-sm font-extrabold text-[var(--foreground)]">{selectedProduct.name} 수량</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">표시 기준과 직접 연결된 단위만 선택할 수 있어요.</p>
            <ProductNutritionSummary product={selectedProduct} quantity={selectedAmount && quantityUnit ? { amount: selectedAmount, unit: quantityUnit } : undefined} />
          </div>
        ) : null}
      </div>

      {selectedProduct ? (
        <div className="sticky bottom-0 z-10 mt-3 shrink-0 border-t border-[var(--brand-primary-border)] bg-[var(--surface)] px-1 pb-[max(4px,env(safe-area-inset-bottom))] pt-3" data-testid="food-product-quantity-step">
          <p className="text-sm font-extrabold text-[var(--foreground)]">{selectedProduct.name} 수량</p>
          <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">표시 기준과 직접 연결된 단위만 선택할 수 있어요.</p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(96px,0.7fr)] gap-2">
            <label className="grid gap-1 text-xs font-bold text-[var(--text-2)]">
              수량
              <input aria-label="완제품 수량" className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none" disabled={isSubmitting} inputMode="decimal" min="0.01" onChange={(event) => { setQuantityAmount(event.target.value); setEntryError(null); setHasNutritionConflict(false); }} ref={quantityInputRef} step={quantityUnit === "g" || quantityUnit === "ml" ? "1" : "any"} type="number" value={quantityAmount} />
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

      {deleteTarget ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--overlay-40)] p-4" onClick={closeDeleteDialog}>
          <div
            aria-describedby="food-product-delete-description"
            aria-labelledby="food-product-delete-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            ref={deleteDialogRef}
            role="alertdialog"
            tabIndex={-1}
          >
            <h3 className="text-lg font-extrabold text-[var(--foreground)]" id="food-product-delete-title">&quot;{deleteTarget.name}&quot; 제품을 삭제할까요?</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-2)]" id="food-product-delete-description">삭제 전까지 카드와 식단 화면은 그대로 유지돼요. 기존 식단에 저장된 영양 정보는 바뀌지 않아요.</p>
            {deleteError ? <p className="mt-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger)]" role="alert">{deleteError}</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--foreground)]" disabled={isDeletingProduct} onClick={closeDeleteDialog} ref={deleteCancelRef} type="button">취소</button>
              <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--danger)] px-3 text-sm font-bold text-[var(--text-inverse)] disabled:opacity-50" disabled={isDeletingProduct} onClick={() => void handleDeleteConfirm()} type="button">{isDeletingProduct ? "삭제 중…" : "삭제"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {reportTarget ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--overlay-40)] p-4" onClick={closeReportDialog}>
          <div
            aria-describedby="food-product-report-description"
            aria-labelledby="food-product-report-title"
            aria-modal="true"
            className="w-full max-w-md rounded-[var(--radius-card)] bg-[var(--surface)] p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            ref={reportDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <h3 className="text-lg font-extrabold text-[var(--foreground)]" id="food-product-report-title">&quot;{reportTarget.name}&quot; 제품 신고</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-2)]" id="food-product-report-description">사유를 선택하면 검토 대상에 추가돼요. 등록자와 다른 사용자의 기존 식단 기록은 바로 바뀌지 않아요.</p>
            <div className="mt-4 grid gap-2">
              {REPORT_REASON_OPTIONS.map((reason) => (
                <label className="flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-sm font-medium text-[var(--foreground)]" key={reason.value}>
                  <input checked={reportReason === reason.value} name="food-product-report-reason" onChange={() => setReportReason(reason.value)} ref={reason.value === REPORT_REASON_OPTIONS[0]?.value ? reportFirstReasonRef : undefined} type="radio" value={reason.value} />
                  <span>{reason.label}</span>
                </label>
              ))}
            </div>
            <label className="mt-4 grid gap-1.5 text-xs font-bold text-[var(--text-2)]">
              상세 설명 <span className="font-normal text-[var(--text-3)]">선택</span>
              <textarea className="min-h-24 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm outline-none" onChange={(event) => setReportDetail(event.target.value)} value={reportDetail} />
            </label>
            {reportError ? <p className="mt-3 rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--danger)]" role="alert">{reportError}</p> : null}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button className="min-h-11 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--foreground)]" disabled={isReporting} onClick={closeReportDialog} type="button">취소</button>
              <button className="min-h-11 rounded-[var(--radius-control)] bg-[var(--brand-primary)] px-3 text-sm font-bold text-[var(--foreground)] disabled:opacity-50" disabled={isReporting} onClick={() => void handleReportSubmit()} type="button">{isReporting ? "신고 중…" : "신고 보내기"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
