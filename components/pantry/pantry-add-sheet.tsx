"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModalHeader } from "@/components/shared/modal-header";
import { Skeleton } from "@/components/ui/skeleton";
import { addPantryItems, fetchIngredients } from "@/lib/api/pantry";
import type { IngredientItem } from "@/types/recipe";

const SEARCH_DEBOUNCE_MS = 300;

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
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingSet = useRef(new Set(existingIngredientIds));
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const categories = React.useMemo(() => {
    const categorySet = new Set<string>();
    ingredients.forEach((item) => categorySet.add(item.category));
    return Array.from(categorySet).sort();
  }, [ingredients]);

  const loadIngredients = useCallback(
    async (query?: string, category?: string | null) => {
      setIsLoading(true);
      try {
        const result = await fetchIngredients({
          q: query || undefined,
          category: category || undefined,
        });
        setIngredients(result.items);
      } catch {
        setIngredients([]);
      } finally {
        setIsLoading(false);
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        aria-label="재료 추가"
        aria-modal="true"
        className="flex w-full max-h-[85vh] flex-col rounded-t-[var(--radius-xl)] bg-[var(--panel)] shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3">
          <ModalHeader
            closeButtonRef={closeButtonRef}
            description="팬트리에 추가할 재료를 검색하세요"
            onClose={onClose}
            title="재료 추가"
            titleId="pantry-add-sheet-title"
          />
        </div>

        {/* Search */}
        <div className="px-5 pt-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              🔍
            </span>
            <input
              aria-label="재료명 검색"
              className="w-full rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="재료명 입력"
              type="text"
              value={searchQuery}
            />
          </div>
        </div>

        {/* Category rail */}
        <div className="scrollbar-hide flex gap-2 overflow-x-auto px-5 pt-3">
          {categories.map((category) => (
            <button
              aria-selected={activeCategory === category}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                activeCategory === category
                  ? "bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] font-semibold text-[var(--olive)]"
                  : "bg-[var(--surface-fill)] text-[var(--text-2)]"
              }`}
              key={category}
              onClick={() => handleCategoryChange(activeCategory === category ? null : category)}
              role="tab"
              type="button"
            >
              {category}
            </button>
          ))}
        </div>

        {/* Ingredient list */}
        <div className="flex-1 overflow-y-auto px-5 py-3" style={{ overscrollBehavior: "contain" }}>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton className="w-full" height={44} key={i} rounded="md" />
              ))}
            </div>
          ) : ingredients.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">
              검색 결과가 없어요
            </p>
          ) : (
            <div className="space-y-0.5">
              {ingredients.map((ingredient) => {
                const isExisting = existingSet.current.has(ingredient.id);
                const isChecked = selectedIds.has(ingredient.id);

                return (
                  <button
                    aria-checked={isChecked}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left transition hover:bg-[var(--surface-fill)]"
                    disabled={isExisting}
                    key={ingredient.id}
                    onClick={() => handleToggle(ingredient.id)}
                    role="checkbox"
                    type="button"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        isExisting
                          ? "border-[var(--line)] bg-[var(--surface-fill)] text-[var(--text-4)]"
                          : isChecked
                            ? "border-[var(--olive)] bg-[var(--olive)] text-white"
                            : "border-[var(--line)] bg-[var(--surface)]"
                      }`}
                    >
                      {(isChecked || isExisting) && "✓"}
                    </span>
                    <span
                      className={`flex-1 truncate text-sm ${
                        isExisting ? "text-[var(--text-3)]" : "text-[var(--foreground)]"
                      }`}
                    >
                      {ingredient.standard_name}
                    </span>
                    {isExisting && (
                      <span className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2 py-0.5 text-xs text-[var(--text-3)]">
                        보유 중
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="border-t border-[var(--line)] px-5 py-3">
          {errorMessage && (
            <p className="mb-2 text-sm font-medium text-[var(--brand-deep)]" role="alert">
              {errorMessage}
            </p>
          )}
          <button
            aria-disabled={selectedIds.size === 0 || isAdding}
            className={`flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius-md)] text-base font-semibold transition ${
              selectedIds.size > 0 && !isAdding
                ? "bg-[var(--brand)] text-[var(--surface)]"
                : "pointer-events-none bg-[var(--surface-fill)] text-[var(--text-4)]"
            }`}
            disabled={selectedIds.size === 0 || isAdding}
            onClick={() => void handleAdd()}
            type="button"
          >
            {isAdding
              ? "추가 중..."
              : selectedIds.size > 0
                ? `팬트리에 추가 (${selectedIds.size})`
                : "추가할 재료를 선택해 주세요"}
          </button>
        </div>
      </div>
    </div>
  );
}
