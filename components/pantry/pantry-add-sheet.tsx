"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPantryEmoji,
  WAVE1_PANTRY_CATEGORY_ORDER,
} from "@/components/pantry/pantry-mobile-visuals";
import { ModalHeader } from "@/components/shared/modal-header";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/40"
        onClick={onClose}
      >
        <div
          aria-label="재료 추가"
          aria-modal="true"
          className="flex max-h-[88vh] w-full flex-col rounded-t-[20px] bg-white text-[#212529] shadow-[0_-8px_24px_rgba(0,0,0,0.16)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="border-b border-[#DEE2E6] px-5 pb-2 pt-[18px]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[18px] font-extrabold leading-none [font-family:var(--font-jua),-apple-system,sans-serif]">
                재료 추가
              </h2>
              <button
                aria-label="닫기"
                className="flex h-8 w-8 items-center justify-center text-[#868E96]"
                onClick={onClose}
                ref={closeButtonRef}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>

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
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            style={{ overscrollBehavior: "contain" }}
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
                      aria-label={ingredient.standard_name}
                      className={[
                        "flex min-h-[54px] items-center gap-2 rounded-xl border px-3 text-left",
                        isExisting
                          ? "border-[#E9ECEF] bg-[#F8F9FA]/65 opacity-[0.55]"
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
                        <span className="shrink-0 text-[10px] font-extrabold text-[#ADB5BD]">
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
          </div>

          <div className="flex gap-2 border-t border-[#DEE2E6] bg-white px-4 py-4">
            <button
              className="h-12 w-[78px] shrink-0 rounded-[8px] bg-[#F8F9FA] text-[14px] font-extrabold text-[#212529]"
              onClick={onClose}
              type="button"
            >
              취소
            </button>
            <button
              aria-disabled={selectedIds.size === 0 || isAdding}
              className={[
                "h-12 min-w-0 flex-1 rounded-[8px] text-[14px] font-extrabold",
                selectedIds.size > 0 && !isAdding
                  ? "bg-[#2AC1BC] text-white"
                  : "pointer-events-none bg-[#DEE2E6] text-[#ADB5BD]",
              ].join(" ")}
              disabled={selectedIds.size === 0 || isAdding}
              onClick={() => void handleAdd()}
              type="button"
            >
              {isAdding
                ? "추가 중..."
                : selectedIds.size > 0
                  ? `팬트리에 추가 (${selectedIds.size})`
                  : "재료 선택"}
            </button>
          </div>

          {errorMessage && (
            <p
              className="px-4 pb-3 text-[13px] font-bold text-[#C92A2A]"
              role="alert"
            >
              {errorMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        aria-label="재료 추가"
        aria-modal="true"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-[var(--radius-xl)] bg-[var(--panel)] shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
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
          {sheetState === "loading" ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton className="w-full" height={44} key={i} rounded="md" />
              ))}
            </div>
          ) : sheetState === "error" ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                재료 목록을 불러오지 못했어요
              </p>
              <button
                className="mt-4 flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--surface)]"
                onClick={() => void loadIngredients(searchQuery, activeCategory)}
                type="button"
              >
                다시 시도
              </button>
            </div>
          ) : sheetState === "empty" ? (
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

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
