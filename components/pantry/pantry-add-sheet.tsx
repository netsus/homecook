"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PantryIngredientVisual } from "@/components/pantry/pantry-ingredient-visual";
import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebChip,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
} from "@/components/web";
import { addPantryItems, fetchIngredients } from "@/lib/api/pantry";
import {
  getIngredientGroupDisplayLabel,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
  ingredientMatchesCategoryGroup,
} from "@/lib/ingredient-categories";
import type { IngredientItem } from "@/types/recipe";

const SEARCH_DEBOUNCE_MS = 300;
type SheetState = "loading" | "error" | "empty" | "ready";

interface PantryAddSheetProps {
  existingIngredientIds: string[];
  onAdd: (addedCount: number) => void;
  onClose: () => void;
}

export function PantryAddSheet({
  existingIngredientIds,
  onAdd,
  onClose,
}: PantryAddSheetProps) {
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [sheetState, setSheetState] = useState<SheetState>("loading");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedIngredientById, setSelectedIngredientById] = useState<
    Map<string, IngredientItem>
  >(new Map());
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingSet = useRef(new Set(existingIngredientIds));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isMobileViewport = useIsMobileViewport();

  const categories = useMemo(() => {
    return INGREDIENT_CATEGORY_GROUP_OPTIONS.filter(
      (category) => category.category_group_code,
    );
  }, []);

  const hasSearchQuery =
    searchQuery.trim().length > 0 || debouncedQuery.trim().length > 0;
  const isAllCategoryActive = !activeCategory || hasSearchQuery;

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((ingredient) => {
      if (hasSearchQuery) {
        return true;
      }

      const matchesCategory =
        !activeCategory || ingredientMatchesCategoryGroup(ingredient, activeCategory);

      return matchesCategory;
    });
  }, [activeCategory, hasSearchQuery, ingredients]);

  const visibleSheetState =
    sheetState === "ready" && visibleIngredients.length === 0
      ? "empty"
      : sheetState;

  const selectedIngredients = useMemo(
    () =>
      Array.from(selectedIds)
        .map((ingredientId) => selectedIngredientById.get(ingredientId))
        .filter((ingredient): ingredient is IngredientItem => Boolean(ingredient)),
    [selectedIds, selectedIngredientById],
  );
  const visibleIngredientGroups = useMemo(
    () => groupIngredientsByCategory(visibleIngredients),
    [visibleIngredients],
  );

  const loadIngredients = useCallback(async (query?: string) => {
    setSheetState("loading");
    try {
      const result = await fetchIngredients({
        q: query?.trim() || undefined,
      });
      setIngredients(result.items);
      setSheetState(result.items.length === 0 ? "empty" : "ready");
    } catch {
      setIngredients([]);
      setSheetState("error");
    }
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);
      if (value.trim().length > 0) {
        setActiveCategory(null);
      }

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      searchTimerRef.current = setTimeout(() => {
        setDebouncedQuery(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [],
  );

  const handleCategoryChange = useCallback(
    (category: string | null) => {
      setActiveCategory(category);
      if (category && searchQuery.trim().length > 0) {
        setSearchQuery("");
        setDebouncedQuery("");
        if (searchTimerRef.current) {
          clearTimeout(searchTimerRef.current);
        }
      }
    },
    [searchQuery],
  );

  const handleToggle = useCallback(
    (ingredient: IngredientItem) => {
      const shouldRemove = selectedIds.has(ingredient.id);
      setErrorMessage(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (shouldRemove) {
          next.delete(ingredient.id);
        } else {
          next.add(ingredient.id);
        }
        return next;
      });
      setSelectedIngredientById((prev) => {
        const next = new Map(prev);
        if (shouldRemove) {
          next.delete(ingredient.id);
        } else {
          next.set(ingredient.id, ingredient);
        }
        return next;
      });
    },
    [selectedIds],
  );

  const removeSelectedIngredient = useCallback((ingredientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(ingredientId);
      return next;
    });
    setSelectedIngredientById((prev) => {
      const next = new Map(prev);
      next.delete(ingredientId);
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    if (selectedIds.size === 0) return;

    setIsAdding(true);
    setErrorMessage(null);
    try {
      const result = await addPantryItems(Array.from(selectedIds));
      onAdd(result.added);
      onClose();
    } catch {
      setErrorMessage("추가에 실패했어요. 다시 시도해 주세요.");
      setIsAdding(false);
    }
  }, [selectedIds, onAdd, onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    void loadIngredients(debouncedQuery);
  }, [debouncedQuery, loadIngredients]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (isMobileViewport) {
    return (
      <AppBottomSheet
        ariaLabelledBy="pantry-add-sheet-title-mobile"
        bodyClassName="px-4 py-4"
        closeButtonRef={closeButtonRef}
        description="팬트리에 추가할 재료를 검색하세요"
        footer={
          <div className="space-y-2">
            {errorMessage ? (
              <p className="text-[13px] font-bold text-[var(--danger-strong)]" role="alert">
                {errorMessage}
              </p>
            ) : null}
            <AppModalFooterActions
              confirmDisabled={selectedIds.size === 0 || isAdding}
              confirmLabel={
                isAdding
                  ? "추가 중..."
                  : selectedIds.size > 0
                    ? `팬트리에 추가 (${selectedIds.size})`
                    : "재료 선택"
              }
              onCancel={onClose}
              onConfirm={() => void handleAdd()}
            />
          </div>
        }
        headerSlot={
          <>
            <div className="relative">
              <span
                aria-hidden="true"
                className="absolute left-3 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-[var(--text-3)]"
                data-testid="pantry-add-mobile-search-icon"
              >
                <SearchGlyph className="h-5 w-5" />
              </span>
              <input
                aria-label="재료명 검색"
                className="h-[38px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] pl-10 pr-3 text-[14px] font-medium text-[var(--foreground)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="재료 검색"
                type="text"
                value={searchQuery}
              />
            </div>

            <div className="scrollbar-hide mt-3 flex gap-1.5 overflow-x-auto" role="tablist">
              <MobileCategoryChip
                active={isAllCategoryActive}
                label="전체"
                onClick={() => handleCategoryChange(null)}
              />
              {categories.map((category) => (
                <MobileCategoryChip
                  active={!hasSearchQuery && activeCategory === category.value}
                  key={category.value}
                  label={category.label}
                  onClick={() => handleCategoryChange(category.value)}
                />
              ))}
            </div>
            {selectedIngredients.length > 0 ? (
              <div
                className="scrollbar-hide mt-3 flex gap-1.5 overflow-x-auto"
                data-testid="pantry-add-selected-ingredients"
              >
                {selectedIngredients.map((ingredient) => (
                  <button
                    aria-label={`${ingredient.standard_name} 선택 해제`}
                    className="shrink-0 rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[12px] font-extrabold text-[var(--brand)]"
                    key={ingredient.id}
                    onClick={() => removeSelectedIngredient(ingredient.id)}
                    type="button"
                  >
                    {ingredient.standard_name} ×
                  </button>
                ))}
              </div>
            ) : null}
          </>
        }
        onClose={onClose}
        title="재료 추가"
      >
        {visibleSheetState === "loading" ? (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <Skeleton className="w-full" height={54} key={item} rounded="lg" />
            ))}
          </div>
        ) : visibleSheetState === "error" ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              재료 목록을 불러오지 못했어요
            </p>
            <button
              className="mt-4 h-10 rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-[13px] font-extrabold text-[var(--text-inverse)]"
              onClick={() => void loadIngredients(debouncedQuery)}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : visibleSheetState === "empty" ? (
          <p className="py-8 text-center text-[13px] font-medium text-[var(--text-3)]">
            검색 결과가 없어요
          </p>
        ) : (
          <div className="space-y-4">
            {visibleIngredientGroups.map((group) => (
              <section key={group.category}>
                <h3 className="mb-2 px-0.5 text-[13px] font-extrabold text-[var(--text-2)]">
                  {group.category}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map((ingredient) => {
                    const isExisting = existingSet.current.has(ingredient.id);
                    const isChecked = selectedIds.has(ingredient.id);

                    return (
                      <button
                        aria-checked={isChecked}
                        aria-label={
                          isExisting
                            ? `${ingredient.standard_name} 보유중`
                            : ingredient.standard_name
                        }
                        className={[
                          "flex min-h-[54px] items-center gap-2 rounded-[var(--radius-card)] border px-3 text-left disabled:opacity-60",
                          isExisting
                            ? "border-[var(--line-strong)] bg-[var(--surface-fill)] opacity-60 grayscale"
                            : isChecked
                              ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                              : "border-[var(--line-strong)] bg-[var(--surface)]",
                        ].join(" ")}
                        data-owned={isExisting ? "true" : undefined}
                        disabled={isExisting}
                        key={ingredient.id}
                        onClick={() => handleToggle(ingredient)}
                        role="checkbox"
                        type="button"
                      >
                        <PantryIngredientVisual
                          category={ingredient.category}
                          className={[
                            "flex h-[30px] w-[30px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[18px]",
                            isExisting ? "opacity-70" : "",
                          ].join(" ")}
                          imageClassName="h-full w-full object-contain"
                          name={ingredient.standard_name}
                          sizes="60px"
                        />
                        <span
                          className={[
                            "min-w-0 flex-1 truncate text-[13px] font-extrabold",
                            isExisting ? "text-[var(--text-3)]" : "text-[var(--foreground)]",
                          ].join(" ")}
                        >
                          {ingredient.standard_name}
                        </span>
                        {isChecked ? (
                          <span className="shrink-0 text-[15px] font-extrabold text-[var(--brand)]">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </AppBottomSheet>
    );
  }

  return (
    <WebModal onBackdropClick={onClose}>
      <WebDialog
        aria-labelledby="pantry-add-sheet-title-a11y"
        className="web-pantry-add-dialog"
        size="wide"
      >
        <WebDialogHeader>
          <div>
            <WebDialogTitle id="pantry-add-sheet-title-a11y">재료 추가</WebDialogTitle>
            <p className="web-modal-copy">
              팬트리에 추가할 재료를 검색하세요
            </p>
          </div>
          <button
            aria-label="닫기"
            className="web-modal-close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </WebDialogHeader>

        <WebDialogBody>
          <label className="web-picker-search">
            <SearchGlyph className="h-5 w-5" />
            <input
              aria-label="재료명 검색"
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="재료 검색"
              type="text"
              value={searchQuery}
            />
          </label>

          <div
            aria-label="카테고리 선택"
            className="web-modal-chip-rail web-pantry-modal-chip-rail"
          >
            <WebChip
              active={isAllCategoryActive}
              onClick={() => handleCategoryChange(null)}
            >
              전체
            </WebChip>
            {categories.map((category) => (
              <WebChip
                active={!hasSearchQuery && activeCategory === category.value}
                key={category.value}
                onClick={() => handleCategoryChange(category.value)}
              >
                {category.label}
              </WebChip>
            ))}
          </div>

          <div className="web-ingredient-editor" data-testid="pantry-add-selected-ingredients">
            <div className="web-ingredient-added" aria-live="polite">
              {selectedIngredients.length > 0 ? (
                selectedIngredients.map((ingredient) => (
                  <button
                    aria-label={`${ingredient.standard_name} 선택 해제`}
                    className="web-ingredient-pill"
                    key={ingredient.id}
                    onClick={() => removeSelectedIngredient(ingredient.id)}
                    type="button"
                  >
                    <span>{ingredient.standard_name}</span>
                    <span aria-hidden="true" className="web-ingredient-pill-remove">
                      ×
                    </span>
                  </button>
                ))
              ) : (
                <span className="web-ingredient-empty">선택한 재료가 없어요</span>
              )}
            </div>
          </div>

          <div className="web-ingredient-list-region" data-testid="pantry-add-list-region">
            {visibleSheetState === "loading" ? (
              <div className="web-ingredient-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((item) => (
                  <Skeleton className="w-full" height={70} key={item} rounded="md" />
                ))}
              </div>
            ) : visibleSheetState === "error" ? (
              <div className="web-modal-panel web-modal-panel-error">
                <p className="web-modal-copy">재료 목록을 불러오지 못했어요</p>
                <WebButton
                  onClick={() => void loadIngredients(debouncedQuery)}
                  size="sm"
                >
                  다시 시도
                </WebButton>
              </div>
            ) : visibleSheetState === "empty" ? (
              <div className="web-modal-panel">
                <p className="web-modal-copy">검색 결과가 없어요</p>
              </div>
            ) : (
              <div className="web-ingredient-grid">
                {visibleIngredients.map((ingredient) => {
                  const isExisting = existingSet.current.has(ingredient.id);
                  const isChecked = selectedIds.has(ingredient.id);

                  return (
                    <button
                      aria-checked={isChecked}
                      aria-label={
                        isExisting
                          ? `${ingredient.standard_name} 보유중`
                          : ingredient.standard_name
                      }
                      className={[
                        "web-ingredient-cell",
                        isChecked ? "web-ingredient-cell-selected" : "",
                        isExisting
                          ? "web-pantry-ingredient-existing opacity-60 grayscale"
                          : "",
                      ].join(" ")}
                      data-owned={isExisting ? "true" : undefined}
                      disabled={isExisting}
                      key={ingredient.id}
                      onClick={() => handleToggle(ingredient)}
                      role="checkbox"
                      title={ingredient.standard_name}
                      type="button"
                    >
                      <PantryIngredientVisual
                        category={ingredient.category}
                        className="web-ingredient-cell-visual"
                        name={ingredient.standard_name}
                        sizes="80px"
                      />
                      <strong>{ingredient.standard_name}</strong>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </WebDialogBody>

        <WebDialogFooter>
          {errorMessage ? (
            <p className="web-modal-footer-note" role="alert">
              {errorMessage}
            </p>
          ) : null}
          <WebButton onClick={onClose} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            aria-label={
              selectedIds.size > 0
                ? `팬트리에 추가 (${selectedIds.size})`
                : undefined
            }
            disabled={selectedIds.size === 0 || isAdding}
            onClick={() => void handleAdd()}
          >
            {isAdding
              ? "추가 중..."
              : selectedIds.size > 0
                ? `팬트리에 추가 (${selectedIds.size})`
                : "재료 선택"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function MobileCategoryChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={[
        "h-9 shrink-0 border-b-2 px-2 text-[13px] font-extrabold leading-none",
        active
          ? "border-[var(--brand)] text-[var(--brand)]"
          : "border-transparent text-[var(--text-3)]",
      ].join(" ")}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function groupIngredientsByCategory(items: IngredientItem[]) {
  const groups = new Map<string, IngredientItem[]>();

  for (const item of items) {
    const category = getIngredientGroupDisplayLabel(item);
    const current = groups.get(category) ?? [];
    current.push(item);
    groups.set(category, current);
  }

  const knownCategories = INGREDIENT_CATEGORY_GROUP_OPTIONS
    .filter((category) => category.category_group_code)
    .map((category) => category.label)
    .filter((category) => groups.has(category));
  const knownCategorySet = new Set<string>(knownCategories);
  const extraCategories = Array.from(groups.keys())
    .filter((category) => !knownCategorySet.has(category))
    .sort((left, right) => left.localeCompare(right, "ko"));

  return [...knownCategories, ...extraCategories].map((category) => ({
    category,
    items: groups.get(category) ?? [],
  }));
}

function SearchGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
      viewBox="0 0 24 24"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}
