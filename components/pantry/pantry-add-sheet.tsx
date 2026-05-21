"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getPantryEmoji,
  WAVE1_PANTRY_CATEGORY_ORDER,
} from "@/components/pantry/pantry-mobile-visuals";
import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
  WebTabButton,
  WebTabs,
} from "@/components/web";
import { addPantryItems, fetchIngredients } from "@/lib/api/pantry";
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
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingSet = useRef(new Set(existingIngredientIds));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isMobileViewport = useIsMobileViewport();

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    ingredients.forEach((item) => categorySet.add(item.category));
    return Array.from(categorySet).sort();
  }, [ingredients]);

  const visibleIngredients = useMemo(() => {
    return ingredients.filter((ingredient) => {
      const matchesCategory =
        !activeCategory || ingredient.category === activeCategory;

      return matchesCategory;
    });
  }, [activeCategory, ingredients]);

  const visibleSheetState =
    sheetState === "ready" && visibleIngredients.length === 0
      ? "empty"
      : sheetState;

  const selectedIngredients = useMemo(
    () => ingredients.filter((ingredient) => selectedIds.has(ingredient.id)),
    [ingredients, selectedIds],
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
    },
    [],
  );

  const handleToggle = useCallback((ingredientId: string) => {
    setErrorMessage(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) {
        next.delete(ingredientId);
      } else {
        next.add(ingredientId);
      }
      return next;
    });
  }, []);

  const removeSelectedIngredient = useCallback((ingredientId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
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
              <p className="text-[13px] font-bold text-[#C92A2A]" role="alert">
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
            <input
              aria-label="재료명 검색"
              className="h-[38px] w-full rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white px-3 text-[14px] font-medium text-[#212529] placeholder:text-[#868E96] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="재료 검색"
              type="text"
              value={searchQuery}
            />

            <div className="scrollbar-hide mt-3 flex gap-1.5 overflow-x-auto" role="tablist">
              <MobileCategoryChip
                active={!activeCategory}
                label="전체"
                onClick={() => handleCategoryChange(null)}
              />
              {WAVE1_PANTRY_CATEGORY_ORDER.map((category) => (
                <MobileCategoryChip
                  active={activeCategory === category}
                  key={category}
                  label={category}
                  onClick={() => handleCategoryChange(category)}
                />
              ))}
            </div>
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
            <p className="text-sm font-semibold text-[#212529]">
              재료 목록을 불러오지 못했어요
            </p>
            <button
              className="mt-4 h-10 rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-[13px] font-extrabold text-white"
              onClick={() => void loadIngredients(debouncedQuery)}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : visibleSheetState === "empty" ? (
          <p className="py-8 text-center text-[13px] font-medium text-[#868E96]">
            검색 결과가 없어요
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
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
                    "flex min-h-[54px] items-center gap-2 rounded-[var(--radius-card)] border px-3 text-left disabled:opacity-60",
                    isExisting
                      ? "border-[#DEE2E6] bg-[#F8F9FA] opacity-60 grayscale"
                      : isChecked
                        ? "border-[var(--brand)] bg-[var(--brand-soft)]"
                        : "border-[#DEE2E6] bg-white",
                  ].join(" ")}
                  data-owned={isExisting ? "true" : undefined}
                  disabled={isExisting}
                  key={ingredient.id}
                  onClick={() => handleToggle(ingredient.id)}
                  role="checkbox"
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[#F8F9FA] text-[18px]",
                      isExisting ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    {getPantryEmoji(ingredient.standard_name, ingredient.category)}
                  </span>
                  <span
                    className={[
                      "min-w-0 flex-1 truncate text-[13px] font-extrabold",
                      isExisting ? "text-[#868E96]" : "text-[#212529]",
                    ].join(" ")}
                  >
                    {ingredient.standard_name}
                  </span>
                  {isExisting ? (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#495057]">
                      보유중
                    </span>
                  ) : isChecked ? (
                    <span className="shrink-0 text-[15px] font-extrabold text-[var(--brand)]">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
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
        <span className="sr-only" id="pantry-add-sheet-title-a11y">
          재료 추가
        </span>
        <WebDialogHeader>
          <div>
            <WebDialogTitle>팬트리에 재료 추가</WebDialogTitle>
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
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="재료명 검색"
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="재료 검색"
              type="text"
              value={searchQuery}
            />
          </label>

          <WebTabs className="web-pantry-modal-tabs" role="tablist">
            <WebTabButton
              active={!activeCategory}
              onClick={() => handleCategoryChange(null)}
            >
              전체
            </WebTabButton>
            {categories.map((category) => (
              <WebTabButton
                active={activeCategory === category}
                key={category}
                onClick={() =>
                  handleCategoryChange(
                    activeCategory === category ? null : category,
                  )
                }
              >
                {category}
              </WebTabButton>
            ))}
          </WebTabs>

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
                      onClick={() => handleToggle(ingredient.id)}
                      role="checkbox"
                      type="button"
                    >
                      <span aria-hidden="true">
                        {getPantryEmoji(
                          ingredient.standard_name,
                          ingredient.category,
                        )}
                      </span>
                      <strong>{ingredient.standard_name}</strong>
                      <small>{isExisting ? "보유중" : ingredient.category}</small>
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
                ? `+ ${selectedIds.size}개 추가`
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
        "h-[31px] shrink-0 rounded-full border px-3 text-[12px] font-extrabold leading-none",
        active
          ? "border-[var(--brand)] bg-white text-[var(--brand)]"
          : "border-[#DEE2E6] bg-white text-[#495057]",
      ].join(" ")}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}
