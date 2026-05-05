"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ModalHeader } from "@/components/shared/modal-header";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { Button } from "@/components/ui/button";
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

      return "";
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="flex h-[min(90vh,44rem)] w-full max-w-2xl flex-col rounded-t-[20px] bg-[var(--surface)] shadow-[var(--shadow-3)] sm:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="border-b border-[var(--line)] px-5 pb-4 pt-5">
          <ModalHeader title="재료 추가" onClose={onClose} />
          <label className="mt-4 flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] px-4">
            <span className="visually-hidden">재료명으로 검색</span>
            <input
              className="w-full bg-transparent py-3 text-base outline-none placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="재료 검색"
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

        <div className="border-t border-[var(--line)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="space-y-3" data-testid="ingredient-editor">
            {addedIngredientLabels.length > 0 ? (
              <div
                className="max-h-20 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-fill)] p-2"
                data-testid="added-ingredient-chips"
              >
                <div className="flex flex-wrap gap-2">
                  {addedIngredientLabels.map((label, index) => (
                    <span
                      className="rounded-[var(--radius-full)] bg-[var(--olive)] px-3 py-1.5 text-sm font-bold text-white shadow-[var(--shadow-1)]"
                      key={`${label}-${index}`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[var(--radius-sm)] bg-[var(--surface-fill)] p-2.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate rounded-[var(--radius-full)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--foreground)]">
                  {selectedIngredient?.standard_name ?? "재료를 선택해주세요"}
                </span>
                <input
                  aria-invalid={!isAmountValid}
                  aria-label="수량"
                  className="h-10 w-16 shrink-0 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] px-2 text-center text-base font-semibold"
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="수량"
                  type="number"
                  value={amount}
                />
                <div
                  aria-label="단위"
                  className="flex shrink-0 gap-1 rounded-[var(--radius-full)] bg-[var(--surface)] p-1"
                  role="group"
                >
                  {COOKING_UNIT_OPTIONS.map((option) => (
                    <button
                      aria-pressed={unit === option}
                      className={[
                        "h-9 min-w-10 shrink-0 rounded-[var(--radius-full)] border px-2 text-base font-bold transition",
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
                <button
                  aria-label="선택한 재료 추가"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-full)] bg-[var(--olive)] text-xl font-black leading-none text-white shadow-[var(--shadow-1)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[var(--line)] disabled:text-[var(--muted)] disabled:shadow-none"
                  disabled={!canAddIngredient}
                  onClick={handleAdd}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>

            <p
              className="min-h-5 text-sm text-[var(--muted)]"
              role={selectedIngredient && !canAddIngredient ? "alert" : undefined}
            >
              {helperMessage}
            </p>
          </div>

          <div className="mt-4">
            <Button fullWidth variant="neutral" onClick={onClose}>
              완료
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
