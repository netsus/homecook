"use client";

import React, { useEffect, useRef, useState } from "react";
import { fetchFoodCatalogSearch, isFoodCatalogSearchApiError, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { useSoftKeyboardOpen } from "@/components/shared/use-soft-keyboard-open";
import { useDialogViewport } from "@/components/shared/use-dialog-viewport";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import type { ManualRecipeIngredientInput } from "@/types/recipe";

function itemKey(item: FoodCatalogSearchItem) { return `${item.type}:${item.id}`; }
function itemName(item: FoodCatalogSearchItem) {
  return item.type === "ingredient" ? item.standard_name : [item.brand, item.name].filter(Boolean).join(" · ");
}

function searchErrorMessage(error: unknown) {
  if (isFoodCatalogSearchApiError(error) && error.status === 503) {
    return "지금은 검색을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
  return error instanceof Error ? error.message : "검색 결과를 불러오지 못했어요.";
}

export function recipeIngredientFromCatalog(item: FoodCatalogSearchItem, sortOrder: number): ManualRecipeIngredientInput | null {
  if (item.type === "food_product" && !item.recipe_ingredient_id) return null;
  const amount = item.type === "ingredient" ? 100 : item.nutrition.basis.amount;
  const unit = item.type === "ingredient" ? "g" : item.nutrition.basis.unit;
  const name = itemName(item);
  return {
    ingredient_id: item.type === "ingredient" ? item.id : item.recipe_ingredient_id!,
    standard_name: name, amount, unit, ingredient_type: "QUANT", scalable: true,
    display_text: `${name} ${amount}${unit}`, sort_order: sortOrder,
    ...(item.type === "food_product" ? {
      food_product_id: item.id, food_product_nutrition_version_id: item.nutrition_version_id,
    } : {}),
  };
}

export function RecipeFoodCatalogPicker({ onAdd, onClose, single = false, excludedIngredientIds = [] }: {
  onAdd: (items: ManualRecipeIngredientInput[]) => void; onClose: () => void; single?: boolean; excludedIngredientIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<FoodCatalogSearchItem[]>([]);
  const [selected, setSelected] = useState<FoodCatalogSearchItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const requestRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewportStyle = useDialogViewport();
  const isDesktop = useDesktopViewport();
  const keyboardOpen = useSoftKeyboardOpen();
  useDialogBoundary({ active: true, dialogRef, initialFocusRef: isDesktop ? searchRef : dialogRef, onClose });

  useEffect(() => () => { ++requestRef.current; }, []);

  useEffect(() => {
    const request = ++requestRef.current;
    setItems([]); setCursor(null); setHasNext(false); setLoading(true); setError(null);
    const controller = new AbortController();
    // An IME can keep the final syllable composing after typing has paused.
    // Search the visible value without changing the input or ending composition.
    const timer = window.setTimeout(() => {
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
  }, [query, retry]);

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
      <label className="mt-3 shrink-0 text-sm font-bold"><span className="sr-only">제품·재료 검색</span><input ref={searchRef} type="search" value={query}
        onChange={(event) => { ++requestRef.current; setQuery(event.target.value); }}
        placeholder="두부, 브랜드 제품 이름" className="h-11 w-full rounded-[var(--radius-control)] border border-[var(--line)] px-3 text-base font-normal" /></label>
      <div aria-label="제품·재료 검색 결과" className="ingredient-search-results min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-[var(--line)]">{items.map((item) => {
          const unlinked = item.type === "food_product" && !item.recipe_ingredient_id;
          const alreadyAdded = excludedIngredientIds.includes(item.type === "ingredient" ? item.id : item.recipe_ingredient_id ?? "");
          const disabled = unlinked || alreadyAdded;
          const checked = selected.some((row) => itemKey(row) === itemKey(item));
          return <li key={itemKey(item)}><label className={`flex min-h-14 items-center gap-3 py-3 ${disabled ? "text-[var(--text-3)]" : ""}`}>
            <input type="checkbox" checked={checked} disabled={disabled} aria-label={itemName(item)} onChange={() => setSelected((current) => checked ? current.filter((row) => itemKey(row) !== itemKey(item)) : single ? [item] : [...current, item])} />
            <span><span className="block text-sm font-bold">{itemName(item)}</span><span className="block text-xs">{item.type === "ingredient" ? "재료" : item.source_type === "manual" ? "사용자 등록 제품" : "공공 제품"}{unlinked ? " · 아직 레시피 재료로 사용할 수 없어요" : alreadyAdded ? " · 이미 추가한 재료예요" : ""}</span></span>
          </label></li>;
        })}</ul>
        {loading ? <p role="status" className="py-4 text-sm">검색 중…</p> : null}
        {error ? <div role="alert" className="py-3 text-sm text-[var(--danger)]">{error}<button type="button" className="ml-2 min-h-11 underline" onClick={() => cursor ? void loadMore() : setRetry((value) => value + 1)}>다시 시도</button></div> : null}
        {!loading && !error && items.length === 0 ? <p className="py-5 text-sm">검색 결과가 없어요. 다른 이름으로 찾아보세요.</p> : null}
        {hasNext ? <button type="button" disabled={loading} onClick={() => void loadMore()} className="min-h-11 w-full text-sm font-bold">검색 결과 더 보기</button> : null}
      </div>
      {selected.length && !keyboardOpen ? <div aria-label="선택한 재료" className="mt-3 flex shrink-0 gap-2 overflow-x-auto">{selected.map((item) => <button key={itemKey(item)} type="button" aria-label={`${itemName(item)} 선택 해제`} className="min-h-11 max-w-[75%] shrink-0 truncate rounded-full bg-[var(--surface-fill)] px-3 text-sm" onClick={() => setSelected((current) => current.filter((row) => itemKey(row) !== itemKey(item)))}>{itemName(item)} ×</button>)}</div> : null}
      {!keyboardOpen ? <button type="button" disabled={!selected.length} className="mt-3 min-h-11 shrink-0 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 font-bold text-[var(--text-inverse)] disabled:opacity-40" onClick={() => {
        const inputs = selected.map((item, index) => recipeIngredientFromCatalog(item, index + 1));
        if (inputs.some((item) => !item)) return;
        if (new Set(inputs.map((item) => item!.ingredient_id)).size !== inputs.length) { setError("같은 재료에 해당하는 항목은 하나만 선택해 주세요."); return; }
        onAdd(inputs as ManualRecipeIngredientInput[]); onClose();
      }}>{single ? "이 재료로 교체" : `선택한 재료 ${selected.length}개 추가`}</button> : null}
    </div>
  </div>;
}
