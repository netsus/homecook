"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ContentState } from "@/components/shared/content-state";
import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import {
  WebButton,
  WebChip,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
  WebSkeleton,
  WebIconButton,
} from "@/components/web";
import { fetchIngredients } from "@/lib/api/ingredients";
import {
  ALL_INGREDIENT_CATEGORY,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
  ingredientMatchesCategoryGroup,
} from "@/lib/ingredient-categories";
import type {
  IngredientItem,
  ManualRecipeIngredientInput,
} from "@/types/recipe";

type IngredientListState = "loading" | "ready" | "empty" | "error";

interface RecipeIngredientAddModalProps {
  onClose: () => void;
  onAdd: (ingredients: ManualRecipeIngredientInput[]) => void;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  presentation?: "auto" | "web" | "app";
}

const DEFAULT_INGREDIENT_AMOUNT = 100;
const DEFAULT_INGREDIENT_UNIT = "g";
const INGREDIENT_ADD_DESCRIPTION = "재료를 골라 추가해요";

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

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
  emptyActionLabel,
  onEmptyAction,
  presentation = "auto",
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isDesktopViewport = useDesktopViewport();
  const isWebPresentation =
    presentation === "web" || (presentation === "auto" && isDesktopViewport);
  const requestCategory =
    !isWebPresentation && activeCategory !== ALL_INGREDIENT_CATEGORY
      ? activeCategory
      : undefined;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    let isStale = false;

    async function loadIngredients() {
      setListState("loading");

      const response = await fetchIngredients({
        q: debouncedQuery.trim() || undefined,
        category_group_code: requestCategory,
      });

      if (isStale) {
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
  }, [debouncedQuery, requestCategory]);

  const canAddIngredient = selectedIngredients.length > 0;

  const selectedIngredientIds = useMemo(
    () => new Set(selectedIngredients.map((ingredient) => ingredient.id)),
    [selectedIngredients],
  );

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((ingredient) => {
      const matchesCategory =
        activeCategory === ALL_INGREDIENT_CATEGORY ||
        ingredientMatchesCategoryGroup(ingredient, activeCategory);

      return matchesCategory;
    });
  }, [activeCategory, ingredients]);

  const visibleListState =
    listState === "ready" && visibleIngredients.length === 0
      ? "empty"
      : listState;

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

  if (isWebPresentation) {
    return (
      <WebModal onBackdropClick={onClose}>
        <WebDialog
          aria-labelledby="ingredient-picker-title"
          size="narrow"
        >
          <WebDialogHeader>
            <div>
              <WebDialogTitle id="ingredient-picker-title">재료로 검색</WebDialogTitle>
              <p className="web-modal-copy">{INGREDIENT_ADD_DESCRIPTION}</p>
            </div>
            <WebIconButton
              aria-label="닫기"
              onClick={onClose}
            >
              <CloseIcon />
            </WebIconButton>
          </WebDialogHeader>
          <WebDialogBody>
            <label className="web-modal-search">
              <span className="visually-hidden">재료명으로 검색</span>
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                placeholder="재료명으로 검색"
                ref={searchInputRef}
                value={query}
              />
            </label>

            <div className="web-modal-chip-rail mt-4">
              {INGREDIENT_CATEGORY_GROUP_OPTIONS.map((category) => (
                <WebChip
                  active={activeCategory === category.value}
                  key={category.value}
                  onClick={() => setActiveCategory(category.value)}
                >
                  {category.label}
                </WebChip>
              ))}
            </div>

            <div className="mt-5" data-testid="ingredient-list-region">
              {visibleListState === "loading" ? (
                <div className="web-ingredient-modal-grid" aria-busy="true">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <WebSkeleton
                      className="h-[var(--control-height-md)] rounded-full"
                      key={index}
                    />
                  ))}
                </div>
              ) : null}

              {visibleListState === "error" ? (
                <div className="web-modal-panel web-modal-panel-error">
                  <p className="web-modal-copy">
                    재료 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                  </p>
                </div>
              ) : null}

              {visibleListState === "empty" ? (
                <div className="web-modal-panel">
                  <h2 className="web-state-title">검색 결과가 없어요</h2>
                  <p className="web-modal-copy mt-2">
                    다른 재료명으로 검색하거나 카테고리를 바꿔보세요.
                  </p>
                </div>
              ) : null}
              {visibleListState === "empty" && onEmptyAction && emptyActionLabel ? (
                <div className="mt-4 flex justify-center">
                  <WebButton onClick={onEmptyAction} variant="secondary">
                    {emptyActionLabel}
                  </WebButton>
                </div>
              ) : null}

              {visibleListState === "ready" ? (
                <ul className="web-ingredient-modal-grid">
                  {visibleIngredients.map((ingredient) => {
                    const isSelected = selectedIngredientIds.has(ingredient.id);

                    return (
                      <li key={ingredient.id}>
                        <label
                          className={[
                            "web-ingredient-option",
                            "web-ingredient-option-card",
                            isSelected ? "web-ingredient-option-active" : "",
                          ].join(" ")}
                        >
                          <input
                            checked={isSelected}
                            className="visually-hidden"
                            onChange={() => toggleIngredient(ingredient)}
                            type="checkbox"
                          />
                          <span>{ingredient.standard_name}</span>
                          {isSelected ? <CheckIcon /> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </WebDialogBody>
          <WebDialogFooter>
            <WebButton
              disabled={selectedIngredients.length === 0}
              onClick={() => setSelectedIngredients([])}
              variant="tertiary"
            >
              초기화
            </WebButton>
            <WebButton disabled={!canAddIngredient} onClick={handleAdd}>
              선택한 재료 {selectedIngredients.length}개 추가
            </WebButton>
          </WebDialogFooter>
        </WebDialog>
      </WebModal>
    );
  }

  return (
    <AppBottomSheet
      ariaLabelledBy="mobile-ingredient-picker-title"
      description={INGREDIENT_ADD_DESCRIPTION}
      footer={
        <AppModalFooterActions
          cancelDisabled={selectedIngredients.length === 0}
          cancelLabel="초기화"
          confirmDisabled={!canAddIngredient}
          confirmLabel={`선택한 재료 ${selectedIngredients.length}개 추가`}
          onCancel={() => setSelectedIngredients([])}
          onConfirm={handleAdd}
        />
      }
      headerSlot={
        <>
          <label className="app-field-search mt-3 flex min-h-[var(--control-height-md)] items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[var(--shadow-1)] md:mt-4">
            <span className="visually-hidden">재료명으로 검색</span>
            <input
              autoFocus
              className="w-full bg-transparent py-3 outline-none placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="재료명으로 검색"
              ref={searchInputRef}
              value={query}
            />
          </label>
          <div className="mt-3 md:mt-4 md:flex-wrap md:overflow-visible md:pb-0">
              <SelectionChipRail
                ariaLabel="카테고리 선택"
                chips={INGREDIENT_CATEGORY_GROUP_OPTIONS.map((category) => ({
                  value: category.value,
                  label: category.label,
                }))}
                onSelect={setActiveCategory}
              selectedValue={activeCategory}
            />
          </div>
        </>
      }
      onClose={onClose}
      title="재료로 검색"
    >
      <div data-testid="ingredient-editor" className="sr-only" />
      {visibleListState === "loading" ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              className="min-h-[54px] animate-pulse rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-fill)]"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {visibleListState === "error" ? (
        <ContentState
          className="min-h-[240px] flex items-center justify-center"
          description="잠시 후 다시 열어주세요."
          eyebrow="재료 동기화 오류"
          tone="error"
          title="재료 목록을 불러오지 못했어요"
          variant="subtle"
        />
      ) : null}

      {visibleListState === "empty" ? (
        <ContentState
          actionLabel={emptyActionLabel}
          className="min-h-[240px] flex items-center justify-center"
          description="다른 재료명으로 검색하거나 카테고리를 바꿔보세요."
          eyebrow="검색 결과 없음"
          onAction={onEmptyAction}
          tone="empty"
          title="검색 결과가 없어요"
          variant="subtle"
        />
      ) : null}

      {visibleListState === "ready" ? (
        <ul className="grid grid-cols-2 gap-2">
          {visibleIngredients.map((ingredient) => {
            const isSelected = selectedIngredientIds.has(ingredient.id);

            return (
              <li key={ingredient.id}>
                <label
                  className={`relative flex min-h-[54px] cursor-pointer items-center justify-center rounded-[var(--radius-card)] border px-3 py-2 text-center text-[15px] font-semibold transition ${
                    isSelected
                      ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--foreground)]"
                      : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--foreground)]"
                  }`}
                >
                  <input
                    checked={isSelected}
                    className="visually-hidden"
                    onChange={() => toggleIngredient(ingredient)}
                    type="checkbox"
                  />
                  <span className="min-w-0 truncate">{ingredient.standard_name}</span>
                  {isSelected ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-3 text-[15px] font-bold text-[var(--brand)]"
                    >
                      ✓
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </AppBottomSheet>
  );
}
