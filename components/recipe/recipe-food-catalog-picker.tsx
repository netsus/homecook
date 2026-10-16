"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchFoodCatalogSearch, fetchFoodCatalogSource, isFoodCatalogSearchApiError, type FoodCatalogProductData, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { fetchPantryList, isPantryApiError } from "@/lib/api/pantry";
import type { PantryProductItem } from "@/types/pantry";
import { formatKoreaDate } from "@/lib/korean-date";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { useSoftKeyboardOpen } from "@/components/shared/use-soft-keyboard-open";
import { useDialogViewport } from "@/components/shared/use-dialog-viewport";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import type { ManualRecipeIngredientInput, RecipeIngredientQuantityContext } from "@/types/recipe";
import { FOOD_PRODUCT_BASIS_UNITS } from "@/types/food-product";
import type { RecipeIngredientIdentity } from "@/lib/recipe-ingredient-source";
import { recipeIngredientGroupKey } from "@/lib/recipe-editor-ingredients";

export type RecipeProductSelectionContexts = Record<string, FoodCatalogProductData>;
export type RecipeQuantitySelectionContexts = Record<string, RecipeIngredientQuantityContext>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function productUnavailableReason(item: FoodCatalogProductData) {
  if (!UUID_PATTERN.test(item.id) || !UUID_PATTERN.test(item.nutrition_version_id)) return "제품 정보를 확인할 수 없어요";
  if (item.source_type === "manual" && (!item.recipe_ingredient_id || !UUID_PATTERN.test(item.recipe_ingredient_id))) return "재료 연결 정보를 확인할 수 없어요";
  if (!Number.isFinite(item.nutrition.basis.amount) || item.nutrition.basis.amount <= 0
    || !FOOD_PRODUCT_BASIS_UNITS.includes(item.nutrition.basis.unit)) return "영양 기준량·단위를 확인할 수 없어요";
  if (Object.values(item.nutrition.values).some((value) => [value.amount, value.known_amount].some((amount) =>
    amount !== null && (!Number.isFinite(amount) || amount < 0)))) return "영양 정보를 확인할 수 없어요";
  return null;
}

function itemKey(item: FoodCatalogSearchItem) { return `${item.type}:${item.id}${item.type === "food_product" ? `:${item.nutrition_version_id}` : ""}`; }
function itemName(item: FoodCatalogSearchItem) {
  return item.type === "ingredient" ? item.standard_name : [item.brand, item.name].filter(Boolean).join(" · ");
}
function basisLabel(item: FoodCatalogProductData) {
  const unit = item.nutrition.basis.unit;
  return `${item.nutrition.basis.amount}${unit === "serving" ? "회분" : unit === "package" ? "포장" : unit}`;
}
function energyLabel(item: FoodCatalogProductData) {
  const value = item.nutrition.values.energy_kcal;
  return value?.amount !== null && value?.amount !== undefined ? `${value.amount}kcal`
    : value?.known_amount !== null && value?.known_amount !== undefined ? `확인분 ${value.known_amount}kcal · 일부 미확인` : "열량 미확인";
}
function pantryLabel(item: PantryProductItem, index: number) {
  const date = formatKoreaDate(item.created_at, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `보유 정보 ${index + 1}${date ? ` · 팬트리 등록 ${date}` : " · 등록일 미확인"}`;
}

function searchErrorMessage(error: unknown) {
  if (isFoodCatalogSearchApiError(error) && error.status === 503) {
    return "지금은 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
  return error instanceof Error ? error.message : "검색 결과를 불러오지 못했어요.";
}

export function recipeIngredientFromCatalog(item: FoodCatalogSearchItem, sortOrder: number): ManualRecipeIngredientInput | null {
  let ingredientId: string | null;
  let amount: number | null;
  let unit: string;

  if (item.type === "ingredient") {
    ingredientId = item.id;
    amount = null;
    unit = item.recipe_quantity_context?.raw_default_unit || item.quantity_options?.default_unit || item.default_unit || "g";
  } else {
    if (productUnavailableReason(item)) return null;
    ingredientId = item.source_type === "manual" ? item.recipe_ingredient_id ?? null : null;
    amount = null;
    unit = item.nutrition.basis.unit;
  }

  const name = itemName(item);
  const ingredient: ManualRecipeIngredientInput = {
    source_kind: item.type,
    row_key: crypto.randomUUID(),
    ingredient_id: ingredientId,
    standard_name: name, amount, unit, ingredient_type: "QUANT", scalable: true,
    display_text: amount === null ? name : `${name} ${amount}${unit}`, sort_order: sortOrder,
  };

  if (item.type === "food_product") {
    ingredient.food_product_id = item.id;
    ingredient.food_product_nutrition_version_id = item.nutrition_version_id;
  }

  return ingredient;
}

export function RecipeFoodCatalogPicker({ onAdd, onClose, single = false, excludedIngredientIds = [], excludedIngredients = [], componentLabel = null,
  replacementIngredient, replacementProduct, initialSource = "catalog", onRequireLogin }: {
  onAdd: (items: ManualRecipeIngredientInput[], products?: RecipeProductSelectionContexts, quantities?: RecipeQuantitySelectionContexts) => void;
  onClose: () => void;
  single?: boolean;
  excludedIngredientIds?: string[];
  excludedIngredients?: readonly (RecipeIngredientIdentity & { component_label?: string | null })[];
  componentLabel?: string | null;
  replacementIngredient?: RecipeIngredientIdentity;
  replacementProduct?: FoodCatalogProductData;
  initialSource?: "catalog" | "pantry";
  onRequireLogin?: () => void | string;
}) {
  const [source, setSource] = useState(initialSource);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<FoodCatalogSearchItem[]>([]);
  const [selected, setSelected] = useState<FoodCatalogSearchItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [pantryItems, setPantryItems] = useState<PantryProductItem[]>([]);
  const [pantryDetails, setPantryDetails] = useState<Record<string, FoodCatalogProductData>>({});
  const [selectionLabels, setSelectionLabels] = useState<Record<string, string>>({});
  const [selectionPantryIds, setSelectionPantryIds] = useState<Record<string, string>>({});
  const [confirmingSelection, setConfirmingSelection] = useState(false);
  const [pantryLoadingId, setPantryLoadingId] = useState<string | null>(null);
  const [pantryUnauthorized, setPantryUnauthorized] = useState(false);
  const matchingReplacement = replacementProduct?.id === replacementIngredient?.food_product_id ? replacementProduct : undefined;
  const [baseline, setBaseline] = useState<FoodCatalogProductData | null>(matchingReplacement?.nutrition_version_id === replacementIngredient?.food_product_nutrition_version_id ? matchingReplacement ?? null : null);
  const [approvedRepresentativeId, setApprovedRepresentativeId] = useState<string | null>(matchingReplacement?.recipe_ingredient_id ?? null);
  const selectionController = useRef<AbortController | null>(null);
  const requestRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewportStyle = useDialogViewport();
  const isDesktop = useDesktopViewport();
  const keyboardOpen = useSoftKeyboardOpen();
  useDialogBoundary({ active: true, dialogRef, initialFocusRef: isDesktop ? searchRef : dialogRef, onClose });

  useEffect(() => () => { ++requestRef.current; selectionController.current?.abort(); }, []);

  useEffect(() => {
    if (!replacementIngredient?.food_product_id || matchingReplacement) return;
    const controller = new AbortController();
    void fetchFoodCatalogSource("food_product", replacementIngredient.food_product_id, controller.signal).then(item => {
      if (controller.signal.aborted || item?.type !== "food_product") return;
      setApprovedRepresentativeId(item.recipe_ingredient_id ?? null);
      if (item.nutrition_version_id === replacementIngredient.food_product_nutrition_version_id) setBaseline(item);
    }).catch(() => { /* A current catalog record never substitutes for missing fixed-version evidence. */ });
    return () => controller.abort();
  }, [replacementIngredient, matchingReplacement]);

  useEffect(() => {
    const request = ++requestRef.current;
    setItems([]); setCursor(null); setHasNext(false); setLoading(true); setError(null);
    setPantryItems([]); setPantryUnauthorized(false);
    selectionController.current?.abort(); setPantryLoadingId(null); setConfirmingSelection(false);
    const controller = new AbortController();
    // An IME can keep the final syllable composing after typing has paused.
    // Search the visible value without changing the input or ending composition.
    const timer = window.setTimeout(() => {
      if (source === "pantry") {
        void fetchPantryList({ q: query.trim() }).then(result => {
          if (request !== requestRef.current || controller.signal.aborted) return;
          if (!Array.isArray(result.product_items) || !result.product_items.every(item => item
            && UUID_PATTERN.test(item.id) && UUID_PATTERN.test(item.food_product_id) && UUID_PATTERN.test(item.food_product_nutrition_version_id)
            && typeof item.name === "string" && (item.brand === null || typeof item.brand === "string") && typeof item.created_at === "string")) throw new Error("Invalid pantry response");
          setPantryItems(result.product_items);
          const original = replacementIngredient?.food_product_id ? result.product_items.find(item => item.food_product_id === replacementIngredient.food_product_id
            && item.food_product_nutrition_version_id === replacementIngredient.food_product_nutrition_version_id) : undefined;
          if (original && !matchingReplacement) {
            void fetchFoodCatalogSource("food_product", original.food_product_id, controller.signal, { pantryItemId: original.id }).then(item => {
              if (request !== requestRef.current || controller.signal.aborted || item?.type !== "food_product"
                || item.nutrition_version_id !== original.food_product_nutrition_version_id) return;
              setBaseline(item); setApprovedRepresentativeId(item.recipe_ingredient_id ?? null);
            }).catch(() => { /* Missing old-version proof stays missing. */ });
          }
        }).catch((reason: unknown) => {
          if (request !== requestRef.current || controller.signal.aborted) return;
          if (isPantryApiError(reason) && reason.status === 401) setPantryUnauthorized(true);
          else setError("내 팬트리 제품을 불러오지 못했어요. 다시 확인해 주세요.");
        }).finally(() => { if (request === requestRef.current && !controller.signal.aborted) setLoading(false); });
        return;
      }
      void fetchFoodCatalogSearch({ q: query, types: ["ingredient", "food_product"], signal: controller.signal })
        .then((result) => {
          if (request !== requestRef.current || controller.signal.aborted) return;
          setItems(result.items); setCursor(result.next_cursor); setHasNext(result.has_next);
        }).catch((reason: unknown) => {
          if (request !== requestRef.current || controller.signal.aborted) return;
          setError(searchErrorMessage(reason));
        }).finally(() => {
          if (request === requestRef.current && !controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, retry, source, replacementIngredient, matchingReplacement]);

  function toggleSelection(item: FoodCatalogSearchItem, pantryId?: string) {
    const checked = selected.some(row => itemKey(row) === itemKey(item));
    setSelected(current => checked ? current.filter(row => itemKey(row) !== itemKey(item))
      : single ? [item] : [...current.filter(row => row.type !== item.type || row.id !== item.id), item]);
    setSelectionPantryIds(current => { const next = { ...current }; if (pantryId && !checked) next[itemKey(item)] = pantryId; else delete next[itemKey(item)]; return next; });
    if (!pantryId) setSelectionLabels(current => { const next = { ...current }; delete next[itemKey(item)]; return next; });
  }
  async function selectPantryItem(pantry: PantryProductItem, label: string) {
    if (pantryLoadingId) return;
    const selectedItem = selected.find(item => item.type === "food_product" && item.id === pantry.food_product_id
      && item.nutrition_version_id === pantry.food_product_nutrition_version_id);
    if (selectedItem) { toggleSelection(selectedItem); return; }
    const controller = new AbortController(); selectionController.current = controller;
    setPantryLoadingId(pantry.id); setError(null); setPantryUnauthorized(false);
    try {
      const item = await fetchFoodCatalogSource("food_product", pantry.food_product_id, controller.signal, { pantryItemId: pantry.id });
      if (controller.signal.aborted) return;
      if (item?.type !== "food_product" || item.id !== pantry.food_product_id || item.nutrition_version_id !== pantry.food_product_nutrition_version_id) {
        setError("보유 항목의 제품·고정 정보를 확인하지 못했어요. 팬트리를 다시 불러와 주세요."); return;
      }
      setPantryDetails(current => ({ ...current, [pantry.id]: item }));
      const unavailable = productUnavailableReason(item);
      if (unavailable) { setError(unavailable); return; }
      setSelectionLabels(current => ({ ...current, [itemKey(item)]: label }));
      toggleSelection(item, pantry.id);
      if (item.id === replacementIngredient?.food_product_id && item.nutrition_version_id === replacementIngredient.food_product_nutrition_version_id) setBaseline(item);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (isFoodCatalogSearchApiError(reason) && reason.status === 401) setPantryUnauthorized(true);
      else setError(isFoodCatalogSearchApiError(reason) && reason.status === 404
        ? "이 보유 항목을 확인할 수 없어요. 팬트리를 다시 불러와 주세요." : "보유 항목의 고정된 영양정보를 불러오지 못했어요.");
    } finally { if (!controller.signal.aborted) setPantryLoadingId(null); }
  }

  async function confirmSelection() {
    if (pantryLoadingId || confirmingSelection) return;
    const controller = new AbortController(); selectionController.current = controller;
    setConfirmingSelection(true); setError(null);
    try {
      for (const item of selected) {
        const pantryId = selectionPantryIds[itemKey(item)];
        if (item.type !== "food_product" || !pantryId) continue;
        const current = await fetchFoodCatalogSource("food_product", item.id, controller.signal, { pantryItemId: pantryId });
        if (controller.signal.aborted) return;
        if (current?.type !== "food_product" || current.nutrition_version_id !== item.nutrition_version_id || productUnavailableReason(current)) {
          setError("보유 항목의 고정 정보를 다시 확인할 수 없어요. 원래 재료는 유지했어요."); return;
        }
      }
      const inputs: ManualRecipeIngredientInput[] = [];
      const products: RecipeProductSelectionContexts = {};
      const quantities: RecipeQuantitySelectionContexts = {};
      const identities = new Set<string>();
      for (const [index, item] of selected.entries()) {
        const input = recipeIngredientFromCatalog(item, index + 1);
        if (!input) return;
        const identity = recipeIngredientGroupKey({ ...input, component_label: componentLabel });
        if (identities.has(identity)) { setError("같은 구성의 같은 재료는 하나만 선택해 주세요."); return; }
        identities.add(identity); inputs.push(input);
        if (input.row_key) {
          if (item.type === "food_product") {
            products[input.row_key] = item;
            if (item.quantity_input_ready === true) quantities[input.row_key] = {
              ready: true, context_sha256: item.quantity_context_sha256,
              product: { id: item.id, nutrition_version_id: item.nutrition_version_id,
                basis_relations: item.basis_relations, basis_unit: item.nutrition.basis.unit },
            };
          } else if (item.recipe_quantity_context?.ready) quantities[input.row_key] = item.recipe_quantity_context;
          else if (item.quantity_options) quantities[input.row_key] = { ready: true,
            context_sha256: item.quantity_context_sha256, options: item.quantity_options };
        }
      }
      if (Object.keys(quantities).length) onAdd(inputs, products, quantities);
      else onAdd(inputs, products);
      onClose();
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (isFoodCatalogSearchApiError(reason) && reason.status === 401) setPantryUnauthorized(true);
      else setError("보유 항목을 다시 확인하지 못했어요. 원래 재료는 유지했으니 다시 시도해 주세요.");
    } finally { if (!controller.signal.aborted) setConfirmingSelection(false); }
  }

  async function loadMore() {
    if (!cursor || loading) return;
    const request = ++requestRef.current;
    setLoading(true); setError(null);
    try {
      const result = await fetchFoodCatalogSearch({ q: query, types: ["ingredient", "food_product"], cursor });
      if (request !== requestRef.current) return;
      setItems((current) => [...current, ...result.items]);
      setCursor(result.next_cursor); setHasNext(result.has_next);
    } catch (reason) {
      if (request === requestRef.current) setError(searchErrorMessage(reason));
    } finally { if (request === requestRef.current) setLoading(false); }
  }

  return <div className="ingredient-search-backdrop z-[160] bg-black/40" style={viewportStyle} onClick={onClose}>
    <div aria-label="제품·재료 선택" aria-modal="true" role="dialog" ref={dialogRef} tabIndex={-1}
      className="ingredient-search-panel flex flex-col bg-[var(--surface)] p-4" onClick={(event) => event.stopPropagation()}>
      <div className="flex shrink-0 items-center justify-between gap-3"><h2 className="text-lg font-extrabold">제품·재료 선택</h2><button type="button" className="min-h-11 px-3" onClick={onClose}>닫기</button></div>
      <div aria-label="선택할 곳" className="mt-3 flex shrink-0 gap-2">
        <button aria-pressed={source === "catalog"} className="min-h-11 flex-1 whitespace-nowrap rounded-xl border px-2 text-sm font-bold" onClick={() => setSource("catalog")} type="button">검색에서 선택</button>
        <button aria-pressed={source === "pantry"} className="min-h-11 flex-1 whitespace-nowrap rounded-xl border px-2 text-sm font-bold" onClick={() => setSource("pantry")} type="button">내 팬트리에서 선택</button>
      </div>
      <label className="mt-3 shrink-0 text-sm font-bold"><span className="sr-only">제품·재료 검색</span><input ref={searchRef} type="search" value={query}
        onChange={(event) => { ++requestRef.current; setQuery(event.target.value); }}
        placeholder={source === "pantry" ? "내 팬트리 제품 이름" : "두부, 브랜드 제품 이름"} className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base font-normal" /></label>
      <div aria-label="제품·재료 검색 결과" className="ingredient-search-results min-h-0 flex-1 overflow-y-auto">
        {source === "pantry" ? <><p className="py-3 text-xs leading-5 text-[var(--text-2)]">보유 항목에 고정된 정보를 선택해요. 현재 판매 제품의 영양정보로 자동 바꾸지 않아요. 팬트리 항목은 여기서 소진하지 않아요.</p>
          <ul className="divide-y divide-[var(--line)]">{pantryItems.map((pantry, index) => {
            const detail = pantryDetails[pantry.id];
            const label = pantryLabel(pantry, index);
            const name = [pantry.brand, pantry.name].filter(Boolean).join(" · ");
            const checked = selected.some(item => item.type === "food_product" && item.id === pantry.food_product_id && item.nutrition_version_id === pantry.food_product_nutrition_version_id);
            const alreadyAdded = excludedIngredients.some(row => recipeIngredientGroupKey(row) === recipeIngredientGroupKey({ ingredient_id: null, food_product_id: pantry.food_product_id, component_label: componentLabel }));
            const unavailable = detail ? productUnavailableReason(detail) : null;
            const sameProduct = replacementIngredient?.food_product_id === pantry.food_product_id;
            const sameVersion = sameProduct && replacementIngredient?.food_product_nutrition_version_id === pantry.food_product_nutrition_version_id;
            const substitute = !sameProduct && detail?.recipe_ingredient_id && detail.recipe_ingredient_id === approvedRepresentativeId;
            return <li key={pantry.id}><label className="flex min-h-14 gap-3 py-3"><input aria-label={`${name} · ${label}`} checked={checked}
              disabled={alreadyAdded || Boolean(unavailable) || Boolean(pantryLoadingId)} onChange={() => void selectPantryItem(pantry, label)} type="checkbox" />
              <span className="min-w-0"><span className="block text-sm font-bold">{name}</span><span className="block text-xs">{label}</span>
                <span className="block text-xs text-[var(--text-2)]">{sameVersion ? "원래 제품과 같은 고정 정보" : sameProduct ? "같은 제품의 다른 고정 정보" : substitute ? "승인된 재료 연결의 대체 후보" : "다른 제품 · 고정 정보 확인 후 선택"}</span>
                {detail && !unavailable ? <span className="block text-xs">기준 {basisLabel(detail)} · {energyLabel(detail)}</span> : null}
                {alreadyAdded || unavailable ? <span className="block text-xs text-[var(--danger)]">{unavailable ?? "이미 추가한 재료예요"}</span> : null}
              </span></label></li>;
          })}</ul></> : <ul className="divide-y divide-[var(--line)]">{items.map((item) => {
          const unavailable = item.type === "food_product" ? productUnavailableReason(item) : null;
          const identity = { ingredient_id: item.type === "ingredient" ? item.id : null, food_product_id: item.type === "food_product" ? item.id : null, component_label: componentLabel };
          const alreadyAdded = (item.type === "ingredient" && excludedIngredientIds.includes(item.id))
            || excludedIngredients.some((row) => recipeIngredientGroupKey(row) === recipeIngredientGroupKey(identity));
          const disabled = Boolean(unavailable) || alreadyAdded;
          const checked = selected.some((row) => itemKey(row) === itemKey(item));
          return <li key={itemKey(item)}><label className={`flex min-h-14 items-center gap-3 py-3 ${disabled ? "text-[var(--text-3)]" : ""}`}>
            <input type="checkbox" checked={checked} disabled={disabled} aria-label={itemName(item)} onChange={() => toggleSelection(item)} />
            <span><span className="block text-sm font-bold">{itemName(item)}</span><span className="block text-xs">{item.type === "ingredient" ? "재료" : item.source_type === "manual" ? "사용자 등록 제품" : "공공 제품"}{unavailable ? ` · ${unavailable}` : alreadyAdded ? " · 이미 추가한 재료예요" : ""}</span>
              {item.type === "food_product" && !unavailable ? <span className="block text-xs text-[var(--text-2)]">영양 기준 {item.nutrition.basis.amount}{item.nutrition.basis.unit === "serving" ? "회분" : item.nutrition.basis.unit === "package" ? "포장" : item.nutrition.basis.unit} · 사용량은 추가 후 입력해 주세요.{item.nutrition.calculation_status !== "complete" ? " 영양정보가 일부 미확인 상태예요." : ""}</span> : null}
            </span>
          </label></li>;
        })}</ul>}
        {single && selected[0]?.type === "food_product" ? <div aria-label="선택할 제품의 영양 기준" className="my-3 rounded-xl bg-[var(--surface-fill)] p-3 text-sm leading-6">
          <p className="font-bold">선택한 고정 정보: {basisLabel(selected[0])} · {energyLabel(selected[0])}</p>
          {replacementIngredient?.food_product_id ? <p>{baseline ? `기존 고정 정보: ${basisLabel(baseline)} · ${energyLabel(baseline)}` : "기존 고정 영양정보를 확인하지 못했어요. 현재 검색 정보를 기존 값으로 대신하지 않아요."}</p> : null}
          <p>다른 제품이나 영양정보로 바꾸면 사용량을 다시 입력하고 저장 전 영양을 확인해 주세요. 선택만으로 저장되지는 않아요.</p>
        </div> : null}
        {loading ? <p role="status" className="py-4 text-sm">검색 중…</p> : null}
        {pantryLoadingId ? <p role="status" className="py-3 text-sm">보유 항목의 고정 정보를 확인하는 중…</p> : null}
        {pantryUnauthorized ? <div role="alert" className="py-3 text-sm">내 팬트리는 로그인 후 선택할 수 있어요. 입력 내용은 그대로 유지돼요.
          {onRequireLogin ? <button className="ml-2 min-h-11 underline" onClick={() => { const message = onRequireLogin(); if (typeof message === "string") setError(message); }} type="button">로그인하고 이어서 선택</button> : null}
          <button className="ml-2 min-h-11 underline" onClick={() => setRetry(value => value + 1)} type="button">다시 확인</button>
        </div> : null}
        {error ? <div role="alert" className="py-3 text-sm text-[var(--danger)]">{error}<button type="button" className="ml-2 min-h-11 underline" onClick={() => cursor ? void loadMore() : setRetry((value) => value + 1)}>다시 시도</button></div> : null}
        {!loading && !error && !pantryUnauthorized && (source === "pantry" ? pantryItems.length === 0 : items.length === 0) ? <p className="py-5 text-sm">{source === "pantry" ? "내 팬트리에 선택할 제품이 없어요. 검색에서도 제품을 고를 수 있어요." : "검색 결과가 없어요. 다른 이름으로 찾아보세요."}</p> : null}
        {hasNext ? <button type="button" disabled={loading} onClick={() => void loadMore()} className="min-h-11 w-full text-sm font-bold">검색 결과 더 보기</button> : null}
      </div>
      {selected.length && !keyboardOpen ? <div aria-label="선택한 재료" className="mt-3 flex shrink-0 gap-2 overflow-x-auto">{selected.map((item) => <button key={itemKey(item)} type="button" aria-label={`${itemName(item)} 선택 해제`} className="min-h-11 max-w-[75%] shrink-0 truncate rounded-full bg-[var(--surface-fill)] px-3 text-sm" onClick={() => setSelected((current) => current.filter((row) => itemKey(row) !== itemKey(item)))}>{itemName(item)}{selectionLabels[itemKey(item)] ? ` · ${selectionLabels[itemKey(item)]}` : ""} ×</button>)}</div> : null}
      {!keyboardOpen ? <button type="button" disabled={!selected.length || Boolean(pantryLoadingId) || confirmingSelection || pantryUnauthorized} className="mt-3 min-h-11 shrink-0 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 font-bold text-[var(--text-inverse)] disabled:opacity-40" onClick={() => void confirmSelection()}>{confirmingSelection ? "고정 정보 다시 확인 중…" : single ? "이 재료로 교체" : `선택한 재료 ${selected.length}개 추가`}</button> : null}
    </div>
  </div>;
}
