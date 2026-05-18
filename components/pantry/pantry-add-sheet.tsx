"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

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
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingSet = useRef(new Set(existingIngredientIds));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isMobileViewport = useIsMobileViewport();

  const categories = React.useMemo(() => {
    const categorySet = new Set<string>();
    ingredients.forEach((item) => categorySet.add(item.category));
    return Array.from(categorySet).sort();
  }, [ingredients]);

  const loadIngredients = useCallback(
    async (query?: string, category?: string | null) => {
      setSheetState("loading");
      try {
        const result = await fetchIngredients({
          q: query || undefined,
          category: category || undefined,
        });
        setIngredients(result.items);
        setSheetState(result.items.length === 0 ? "empty" : "ready");
      } catch {
        setIngredients([]);
        setSheetState("error");
      }
    },
    [],
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchQuery(value);

      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }

      searchTimerRef.current = setTimeout(() => {
        void loadIngredients(value, activeCategory);
      }, SEARCH_DEBOUNCE_MS);
    },
    [activeCategory, loadIngredients],
  );

  const handleCategoryChange = useCallback(
    (category: string | null) => {
      setActiveCategory(category);
      void loadIngredients(searchQuery, category);
    },
    [loadIngredients, searchQuery],
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
    void loadIngredients();
    closeButtonRef.current?.focus();
  }, [loadIngredients]);

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

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

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
              className="h-[38px] w-full rounded-md border border-[#DEE2E6] bg-white px-3 text-[14px] font-medium text-[#212529] placeholder:text-[#868E96] focus:outline-none focus:ring-2 focus:ring-[#2AC1BC]"
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
        {sheetState === "loading" ? (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
              <Skeleton className="w-full" height={54} key={item} rounded="lg" />
            ))}
          </div>
        ) : sheetState === "error" ? (
          <div className="flex flex-col items-center py-8 text-center">
            <p className="text-sm font-semibold text-[#212529]">
              재료 목록을 불러오지 못했어요
            </p>
            <button
              className="mt-4 h-10 rounded-[10px] bg-[#2AC1BC] px-5 text-[13px] font-extrabold text-white"
              onClick={() => void loadIngredients(searchQuery, activeCategory)}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : sheetState === "empty" ? (
          <p className="py-8 text-center text-[13px] font-medium text-[#868E96]">
            검색 결과가 없어요
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {ingredients.map((ingredient) => {
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
                    "flex min-h-[54px] items-center gap-2 rounded-xl border px-3 text-left disabled:opacity-100",
                    isExisting
                      ? "border-[#DEE2E6] bg-[#F8F9FA]"
                      : isChecked
                        ? "border-[#2AC1BC] bg-[#E8FAF8]"
                        : "border-[#DEE2E6] bg-white",
                  ].join(" ")}
                  disabled={isExisting}
                  key={ingredient.id}
                  onClick={() => handleToggle(ingredient.id)}
                  role="checkbox"
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-[#F8F9FA] text-[18px]"
                  >
                    {getPantryEmoji(ingredient.standard_name, ingredient.category)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-[#212529]">
                    {ingredient.standard_name}
                  </span>
                  {isExisting ? (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-[#495057]">
                      보유중
                    </span>
                  ) : isChecked ? (
                    <span className="shrink-0 text-[15px] font-extrabold text-[#2AC1BC]">
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

          {sheetState === "loading" ? (
            <div className="web-ingredient-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((item) => (
                <Skeleton className="w-full" height={70} key={item} rounded="md" />
              ))}
            </div>
          ) : sheetState === "error" ? (
            <div className="web-modal-panel web-modal-panel-error">
              <p className="web-modal-copy">재료 목록을 불러오지 못했어요</p>
              <WebButton
                onClick={() => void loadIngredients(searchQuery, activeCategory)}
                size="sm"
              >
                다시 시도
              </WebButton>
            </div>
          ) : sheetState === "empty" ? (
            <div className="web-modal-panel">
              <p className="web-modal-copy">검색 결과가 없어요</p>
            </div>
          ) : (
            <div className="web-ingredient-grid">
              {ingredients.map((ingredient) => {
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
                      isExisting ? "web-pantry-ingredient-existing" : "",
                    ].join(" ")}
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
          ? "border-[#2AC1BC] bg-white text-[#2AC1BC]"
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
