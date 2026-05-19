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
import type {
  IngredientItem,
  ManualRecipeIngredientInput,
} from "@/types/recipe";

type IngredientListState = "loading" | "ready" | "empty" | "error";

interface RecipeIngredientAddModalProps {
  onClose: () => void;
  onAdd: (ingredients: ManualRecipeIngredientInput[]) => void;
}

const DEFAULT_INGREDIENT_AMOUNT = 100;
const DEFAULT_INGREDIENT_UNIT = "g";

function buildIngredientInput(
  ingredient: IngredientItem,
  sortOrder: number,
): ManualRecipeIngredientInput {
  return {
    ingredient_id: ingredient.id,
    standard_name: ingredient.standard_name,
    ingredient_type: "QUANT",
    amount: DEFAULT_INGREDIENT_AMOUNT,
    unit: DEFAULT_INGREDIENT_UNIT,
    scalable: true,
    display_text: `${ingredient.standard_name} ${DEFAULT_INGREDIENT_AMOUNT}${DEFAULT_INGREDIENT_UNIT}`,
    sort_order: sortOrder,
  };
}

export function RecipeIngredientAddModal({
  onClose,
  onAdd,
}: RecipeIngredientAddModalProps) {
  const [selectedIngredients, setSelectedIngredients] = useState<
    IngredientItem[]
  >([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(
    ALL_INGREDIENT_CATEGORY,
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

  const canAddIngredient = selectedIngredients.length > 0;

  const helperMessage = useMemo(() => {
    if (selectedIngredients.length === 0) {
      return "재료만 먼저 선택해주세요. 수량과 단위는 다음 화면에서 입력해요.";
    }

    return `${selectedIngredients.length}개 선택됨. 완료하면 본문 재료 목록에 추가돼요.`;
  }, [selectedIngredients.length]);

  const toggleIngredient = (ingredient: IngredientItem) => {
    setSelectedIngredients((current) => {
      if (current.some((item) => item.id === ingredient.id)) {
        return current.filter((item) => item.id !== ingredient.id);
      }

      return [...current, ingredient];
    });
  };

  const handleAdd = () => {
    if (!canAddIngredient) return;

    onAdd(
      selectedIngredients.map((ingredient, index) =>
        buildIngredientInput(ingredient, index + 1),
      ),
    );
    onClose();
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
              <p className="web-modal-copy">재료를 고르고 수량은 본문에서 입력해요</p>
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
                  const isSelected = selectedIngredients.some(
                    (item) => item.id === ingredient.id,
                  );

                  return (
                    <li key={ingredient.id}>
                      <button
                        aria-pressed={isSelected}
                        className={[
                          "web-ingredient-cell",
                          isSelected ? "web-ingredient-cell-selected" : "",
                        ].join(" ")}
                        onClick={() => toggleIngredient(ingredient)}
                        type="button"
                      >
                        <span className="web-ingredient-cell-mark" aria-hidden="true">
                          {isSelected ? "✓" : "+"}
                        </span>
                        <span>{ingredient.standard_name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="web-ingredient-editor" data-testid="ingredient-editor">
              {selectedIngredients.length > 0 ? (
                <div className="web-ingredient-added" data-testid="added-ingredient-chips">
                  {selectedIngredients.map((ingredient) => (
                    <span key={ingredient.id}>{ingredient.standard_name}</span>
                  ))}
                </div>
              ) : null}

              <p className="web-modal-footer-note">{helperMessage}</p>
            </div>
          </WebDialogBody>
          <WebDialogFooter>
            <span className="web-modal-footer-note">
              {selectedIngredients.length}개 선택됨
            </span>
            <WebButton disabled={!canAddIngredient} onClick={handleAdd}>
              선택한 재료 {selectedIngredients.length}개 추가
            </WebButton>
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
        className="flex h-[90dvh] max-h-[44rem] w-full max-w-2xl flex-col rounded-t-[var(--radius-sheet)] bg-[var(--surface)] shadow-[var(--shadow-3)] sm:rounded-[var(--radius-sheet)]"
        onClick={(event) => event.stopPropagation()}
        aria-labelledby="mobile-ingredient-picker-title"
        role="dialog"
      >
        <div className="border-b border-[var(--line)] px-5 pb-3 pt-4">
          <ModalHeader
            title="재료 추가"
            titleId="mobile-ingredient-picker-title"
            onClose={onClose}
          />
          <label className="mt-4 flex min-h-[var(--control-height-md)] items-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4">
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
                  className="min-h-[var(--control-height-md)] animate-pulse rounded-[var(--radius-full)] border border-[var(--line)] bg-[var(--surface-fill)]"
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
            <ul className="flex flex-wrap gap-2">
              {ingredients.map((ingredient) => {
                const isSelected = selectedIngredients.some(
                  (item) => item.id === ingredient.id,
                );

                return (
                  <li className="contents" key={ingredient.id}>
                    <button
                      aria-pressed={isSelected}
                      className={[
                        "inline-flex min-h-10 max-w-[12rem] items-center rounded-[var(--radius-full)] border px-4 py-2 text-sm font-semibold transition",
                        isSelected
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
                          : "border-[var(--line)] bg-[var(--surface-fill)] text-[var(--foreground)] hover:bg-[var(--surface)]",
                      ].join(" ")}
                      onClick={() => toggleIngredient(ingredient)}
                      type="button"
                    >
                      <span>{ingredient.standard_name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-[var(--line)] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="space-y-3" data-testid="ingredient-editor">
            {selectedIngredients.length > 0 ? (
              <div
                className="max-h-20 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] p-2"
                data-testid="added-ingredient-chips"
              >
                <div className="flex flex-wrap gap-2">
                  {selectedIngredients.map((ingredient) => (
                    <span
                      className="rounded-[var(--radius-sm)] bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-white shadow-[var(--shadow-1)]"
                      key={ingredient.id}
                    >
                      {ingredient.standard_name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="min-h-5 text-sm text-[var(--muted)]">{helperMessage}</p>
          </div>

          <div className="mt-4">
            <Button
              disabled={!canAddIngredient}
              fullWidth
              size="sm"
              variant="neutral"
              onClick={handleAdd}
            >
              선택한 재료 {selectedIngredients.length}개 추가
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
