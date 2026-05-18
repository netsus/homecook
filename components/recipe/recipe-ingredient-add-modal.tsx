"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ModalHeader } from "@/components/shared/modal-header";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Button } from "@/components/ui/button";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebEmptyState,
  WebModal,
  WebSkeleton,
  WebTabButton,
  WebTabs,
} from "@/components/web";
import { fetchIngredients } from "@/lib/api/ingredients";
import {
  ALL_INGREDIENT_CATEGORY,
  INGREDIENT_CATEGORY_OPTIONS,
} from "@/lib/ingredient-categories";
import { COOKING_UNIT_OPTIONS } from "@/lib/recipe-units";
import type {
  IngredientItem,
  ManualRecipeIngredientInput,
} from "@/types/recipe";

type IngredientListState = "loading" | "ready" | "empty" | "error";

interface RecipeIngredientAddModalProps {
  onClose: () => void;
  onAdd: (ingredient: ManualRecipeIngredientInput) => void;
}

export function RecipeIngredientAddModal({
  onClose,
  onAdd,
}: RecipeIngredientAddModalProps) {
  const [selectedIngredient, setSelectedIngredient] =
    useState<IngredientItem | null>(null);
  const [amount, setAmount] = useState("100");
  const [unit, setUnit] = useState("g");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(
    ALL_INGREDIENT_CATEGORY,
  );
  const [addedIngredientLabels, setAddedIngredientLabels] = useState<string[]>(
    [],
  );
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [listState, setListState] = useState<IngredientListState>("loading");
  const requestIdRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isDesktopViewport = useDesktopViewport();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    let isStale = false;

    async function loadIngredients() {
      setListState("loading");

      const response = await fetchIngredients({
        q: debouncedQuery.trim() || undefined,
        category:
          activeCategory === ALL_INGREDIENT_CATEGORY
            ? undefined
            : activeCategory,
      });

      if (isStale || currentRequestId !== requestIdRef.current) {
        return;
      }

      if (!response.success || !response.data) {
        setIngredients([]);
        setListState("error");
        return;
      }

      setIngredients(response.data.items);
      setListState(response.data.items.length > 0 ? "ready" : "empty");
    }

    void loadIngredients();

    return () => {
      isStale = true;
    };
  }, [activeCategory, debouncedQuery]);

  const parsedAmount = Number.parseFloat(amount);
  const trimmedUnit = unit.trim();
  const isAmountValid = !Number.isNaN(parsedAmount) && parsedAmount > 0;
  const isUnitValid = (COOKING_UNIT_OPTIONS as readonly string[]).includes(
    trimmedUnit,
  );
  const canAddIngredient =
    Boolean(selectedIngredient) && isAmountValid && isUnitValid;

  const helperMessage = useMemo(() => {
    if (!selectedIngredient) {
      if (addedIngredientLabels.length > 0) {
        return `${addedIngredientLabels.length}개 추가됨. 다음 재료를 선택하거나 완료를 눌러주세요.`;
      }

      return "재료를 선택한 뒤 수량과 단위를 확인해주세요.";
    }

    if (!isAmountValid) {
      return "0보다 큰 수량이 필요해요.";
    }

    return "";
  }, [addedIngredientLabels.length, isAmountValid, selectedIngredient]);

  const handleAdd = () => {
    if (!selectedIngredient || !canAddIngredient) return;
    const displayText = `${selectedIngredient.standard_name} ${amount.trim()}${trimmedUnit}`;

    onAdd({
      ingredient_id: selectedIngredient.id,
      standard_name: selectedIngredient.standard_name,
      ingredient_type: "QUANT",
      amount: parsedAmount,
      unit: trimmedUnit,
      scalable: true,
      display_text: displayText,
      sort_order: 0,
    });
    setAddedIngredientLabels((current) => [...current, displayText]);
    setSelectedIngredient(null);
    setAmount("100");
    setUnit("g");
  };

  if (isDesktopViewport) {
    return (
      <WebModal onBackdropClick={onClose}>
        <WebDialog
          aria-labelledby="ingredient-picker-title"
          className="web-ingredient-dialog"
          size="wide"
        >
          <WebDialogHeader>
            <div>
              <WebDialogTitle id="ingredient-picker-title">재료 추가</WebDialogTitle>
              <p className="web-modal-copy">재료를 선택하고 수량과 단위를 정해요</p>
            </div>
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
            <label className="web-picker-search">
              <span aria-hidden="true">⌕</span>
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="재료 검색"
                ref={searchInputRef}
                value={query}
              />
            </label>
            <WebTabs className="web-picker-tabs" role="tablist">
              {INGREDIENT_CATEGORY_OPTIONS.map((category) => (
                <WebTabButton
                  active={activeCategory === category}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                >
                  {category}
                </WebTabButton>
              ))}
            </WebTabs>

            {listState === "loading" ? (
              <div className="web-ingredient-grid" aria-busy="true">
                {Array.from({ length: 15 }).map((_, index) => (
                  <WebSkeleton className="h-16" key={index} />
                ))}
              </div>
            ) : null}

            {listState === "error" ? (
              <WebEmptyState
                description="잠시 후 다시 열어주세요."
                icon="!"
                title="재료 목록을 불러오지 못했어요"
              />
            ) : null}

            {listState === "empty" ? (
              <WebEmptyState
                description="검색어를 바꾸거나 다른 카테고리를 선택해보세요."
                icon="⌕"
                title="검색 결과가 없어요"
              />
            ) : null}

            {listState === "ready" ? (
              <ul className="web-ingredient-grid">
                {ingredients.map((ingredient) => {
                  const isSelected = selectedIngredient?.id === ingredient.id;

                  return (
                    <li key={ingredient.id}>
                      <button
                        aria-pressed={isSelected}
                        className={[
                          "web-ingredient-cell",
                          isSelected ? "web-ingredient-cell-selected" : "",
                        ].join(" ")}
                        onClick={() => setSelectedIngredient(ingredient)}
                        type="button"
                      >
                        <span aria-hidden="true">🥬</span>
                        <span>{ingredient.standard_name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="web-ingredient-editor" data-testid="ingredient-editor">
              {addedIngredientLabels.length > 0 ? (
                <div className="web-ingredient-added" data-testid="added-ingredient-chips">
                  {addedIngredientLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
              ) : null}

              {selectedIngredient ? (
                <div className="web-ingredient-selected">
                  <span>{selectedIngredient.standard_name}</span>
                  <input
                    aria-invalid={!isAmountValid}
                    aria-label="수량"
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="수량"
                    type="number"
                    value={amount}
                  />
                  <div aria-label="단위" className="web-ingredient-units" role="group">
                    {COOKING_UNIT_OPTIONS.map((option) => (
                      <button
                        aria-pressed={unit === option}
                        className={unit === option ? "active" : ""}
                        key={option}
                        onClick={() => setUnit(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <WebButton
                    disabled={!canAddIngredient}
                    onClick={handleAdd}
                    size="sm"
                  >
                    선택 재료 추가
                  </WebButton>
                </div>
              ) : null}

              <p
                className="web-modal-footer-note"
                role={selectedIngredient && !canAddIngredient ? "alert" : undefined}
              >
                {helperMessage}
              </p>
            </div>
          </WebDialogBody>
          <WebDialogFooter>
            <span className="web-modal-footer-note">
              {addedIngredientLabels.length}개 추가됨
            </span>
            <WebButton onClick={onClose}>완료</WebButton>
          </WebDialogFooter>
        </WebDialog>
      </WebModal>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="flex h-[90dvh] max-h-[44rem] w-full max-w-2xl flex-col rounded-t-[20px] bg-[var(--surface)] shadow-[var(--shadow-3)] sm:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="border-b border-[var(--line)] px-5 pb-3 pt-4">
          <ModalHeader title="재료 추가" onClose={onClose} />
          <label className="mt-4 flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4">
            <span className="visually-hidden">재료명으로 검색</span>
            <input
              autoFocus
              className="w-full bg-transparent py-3 text-base outline-none placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="재료 검색"
              ref={searchInputRef}
              value={query}
            />
          </label>
          <div className="mt-3">
            <SelectionChipRail
              ariaLabel="카테고리 선택"
              chips={INGREDIENT_CATEGORY_OPTIONS.map((category) => ({
                value: category,
                label: category,
              }))}
              onSelect={setActiveCategory}
              selectedValue={activeCategory}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {listState === "loading" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  className="min-h-11 animate-pulse rounded-[var(--radius-full)] border border-[var(--line)] bg-[var(--surface-fill)]"
                  key={index}
                />
              ))}
            </div>
          ) : null}

          {listState === "error" ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              재료 목록을 불러오지 못했어요.
            </p>
          ) : null}

          {listState === "empty" ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              검색 결과가 없어요
            </p>
          ) : null}

          {listState === "ready" ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {ingredients.map((ingredient) => {
                const isSelected = selectedIngredient?.id === ingredient.id;

                return (
                  <li key={ingredient.id}>
                    <label
                      className={[
                        "flex min-h-11 cursor-pointer items-center rounded-[var(--radius-full)] border px-4 py-2 text-sm font-semibold transition",
                        isSelected
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                          : "border-[var(--line)] bg-[var(--surface-fill)] text-[var(--foreground)] hover:bg-[var(--surface)]",
                      ].join(" ")}
                    >
                      <input
                        checked={isSelected}
                        className="visually-hidden"
                        onChange={() => setSelectedIngredient(ingredient)}
                        type="radio"
                      />
                      <span>{ingredient.standard_name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-[var(--line)] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="space-y-3" data-testid="ingredient-editor">
            {addedIngredientLabels.length > 0 ? (
              <div
                className="max-h-20 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] p-2"
                data-testid="added-ingredient-chips"
              >
                <div className="flex flex-wrap gap-2">
                  {addedIngredientLabels.map((label, index) => (
                    <span
                      className="rounded-[var(--radius-sm)] bg-[var(--olive)] px-3 py-1.5 text-sm font-semibold text-white shadow-[var(--shadow-1)]"
                      key={`${label}-${index}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedIngredient ? (
              <div className="rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-[var(--text-2)]">
                    선택 재료
                  </p>
                  <span className="block min-h-10 w-full truncate rounded-[var(--radius-sm)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
                    {selectedIngredient.standard_name}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input
                    aria-invalid={!isAmountValid}
                    aria-label="수량"
                    className="h-11 w-full rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-3 text-center text-base font-semibold"
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="수량"
                    type="number"
                    value={amount}
                  />
                  <div
                    aria-label="단위"
                    className="flex shrink-0 flex-wrap gap-1 rounded-[var(--radius-sm)] bg-[var(--surface)] p-1"
                    role="group"
                  >
                    {COOKING_UNIT_OPTIONS.map((option) => (
                      <button
                        aria-pressed={unit === option}
                        className={[
                          "h-9 min-w-10 shrink-0 rounded-[var(--radius-sm)] border px-2 text-base font-semibold transition",
                          unit === option
                            ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                            : "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)]",
                        ].join(" ")}
                        key={option}
                        onClick={() => setUnit(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  aria-label="선택한 재료 추가"
                  className="mt-3 flex h-11 w-full shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--olive)] text-base font-semibold leading-none text-white shadow-[var(--shadow-1)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted)] disabled:shadow-none"
                  disabled={!canAddIngredient}
                  onClick={handleAdd}
                  type="button"
                >
                  추가
                </button>
              </div>
            ) : null}

            <p
              className="min-h-5 text-sm text-[var(--muted)]"
              role={selectedIngredient && !canAddIngredient ? "alert" : undefined}
            >
              {helperMessage}
            </p>
          </div>

          <div className="mt-4">
            <Button fullWidth size="sm" variant="neutral" onClick={onClose}>
              완료
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
