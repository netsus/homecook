"use client";

import React, { useRef, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { getPantryEmoji } from "@/components/pantry/pantry-mobile-visuals";
import {
  getIngredientCategoryGroupLabel,
  getIngredientGroupDisplayLabel,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
} from "@/lib/ingredient-categories";
import type { PantryItem } from "@/types/pantry";

interface PantryMobileScreenProps {
  activeCategory: string | null;
  displayItems: PantryItem[];
  isAllVisibleSelected: boolean;
  isSelectMode: boolean;
  items: PantryItem[];
  searchQuery: string;
  selectedIds: Set<string>;
  onCategoryChange: (category: string | null) => void;
  onClearSearch: () => void;
  onExitSelectMode: () => void;
  onOpenAddSheet: () => void;
  onOpenBundlePicker: () => void;
  onOpenRecommendations: () => void;
  onRequestDelete: () => void;
  onRequestSingleDelete: (ingredientId: string) => void;
  onSearchChange: (value: string) => void;
  onSelectAllToggle: () => void;
  onSelectToggle: (ingredientId: string) => void;
  onStartSelectMode: () => void;
}

export function PantryMobileScreen({
  activeCategory,
  displayItems,
  isAllVisibleSelected,
  isSelectMode,
  items,
  searchQuery,
  selectedIds,
  onCategoryChange,
  onClearSearch,
  onExitSelectMode,
  onOpenAddSheet,
  onOpenBundlePicker,
  onOpenRecommendations,
  onRequestDelete,
  onRequestSingleDelete,
  onSearchChange,
  onSelectAllToggle,
  onSelectToggle,
  onStartSelectMode,
}: PantryMobileScreenProps) {
  const [swipedIngredientId, setSwipedIngredientId] = useState<string | null>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const isEmpty = items.length === 0 && !searchQuery && !activeCategory;
  const isSearchEmpty = displayItems.length === 0 && (searchQuery || activeCategory);
  const sectionGroups = groupPantryItems(displayItems);
  const categoryRail = getCategoryRail();

  return (
    <div className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden">
      <div className="relative flex h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4" style={{ borderBottomWidth: "0.5px" }}>
        <h1 className="text-[18px] font-bold leading-none text-[var(--brand)]">
          팬트리
        </h1>
        {isSelectMode ? (
          <button
            aria-label="편집 취소"
            className="absolute right-[18px] top-1/2 flex h-9 min-w-[58px] -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[13px] font-extrabold text-[var(--text-2)]"
            onClick={onExitSelectMode}
            type="button"
          >
            취소
          </button>
        ) : null}
      </div>

      <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 pb-5 pt-4">
        <p className="mb-1 text-[13px] font-medium leading-[1.35] text-[var(--text-3)]">
          냉장고에 있는 재료
        </p>
        <div className="mb-5 flex items-baseline gap-1.5">
          <span className="text-[32px] font-extrabold leading-none">
            {items.length}
          </span>
          <span className="text-[16px] font-bold leading-none text-[var(--text-3)]">
            개
          </span>
        </div>
        <p className="-mt-3 mb-4 text-[13px] font-medium leading-[1.45] text-[var(--text-3)]">
          팬트리에 있는 재료는 장보기에서 자동 제외돼요.
        </p>

        <div className="grid grid-cols-3 gap-2">
          <button
            className="h-11 rounded-[var(--radius-control)] border-0 bg-[var(--brand)] px-2 text-[13px] font-extrabold text-[var(--text-inverse)]"
            onClick={onOpenRecommendations}
            type="button"
          >
            팬트리 추천
          </button>
          <button
            className="h-11 rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--brand-soft)] px-2 text-[13px] font-extrabold text-[var(--brand)]"
            onClick={onOpenAddSheet}
            type="button"
          >
            재료 추가
          </button>
          <button
            aria-label="묶음으로 추가"
            className="h-11 rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--brand-soft)] px-2 text-[13px] font-extrabold text-[var(--brand)]"
            onClick={onOpenBundlePicker}
            type="button"
          >
            묶음 추가
          </button>
        </div>
      </section>

      <section className="sticky top-0 z-20 border-b border-[var(--line-strong)] bg-[var(--surface-fill)] px-4 pt-3">
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1" role="tablist">
          <CategoryChip
            active={!activeCategory}
            label="전체"
            onClick={() => onCategoryChange(null)}
          />
          {categoryRail.map((category) => (
            <CategoryChip
              active={activeCategory === category.value}
              key={category.value}
              label={category.label}
              onClick={() => onCategoryChange(category.value)}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 py-2" data-testid="pantry-mobile-filter-toolbar">
          <label className="app-field-search relative flex h-[var(--control-height-md)] min-w-0 flex-1 items-center rounded-[var(--radius-sheet)] border border-[var(--line)] bg-[var(--surface)] px-3">
            <SearchIcon className="mr-2 h-[18px] w-[18px] shrink-0 text-[var(--text-3)]" />
            <input
              aria-label="팬트리 재료 검색"
              className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium text-[var(--foreground)] placeholder:text-[var(--text-3)] focus:outline-none focus:ring-0"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="재료 검색"
              role="searchbox"
              type="search"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                aria-label="검색어 지우기"
                className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-[var(--text-3)]"
                onClick={onClearSearch}
                type="button"
              >
                ×
              </button>
            )}
          </label>
          {isSelectMode ? (
            <button
              aria-checked={isAllVisibleSelected}
              className="inline-flex h-[var(--control-height-md)] shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[12px] font-extrabold text-[var(--text-2)] disabled:opacity-50"
              disabled={displayItems.length === 0}
              onClick={onSelectAllToggle}
              role="checkbox"
              type="button"
            >
              <span
                aria-hidden="true"
                className={[
                  "flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border text-[11px] font-black",
                  isAllVisibleSelected
                    ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]"
                    : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent",
                ].join(" ")}
              >
                ✓
              </span>
              전체선택
            </button>
          ) : (
            <button
              className="h-[var(--control-height-md)] shrink-0 rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 text-[13px] font-extrabold text-[var(--brand)]"
              onClick={onStartSelectMode}
              type="button"
            >
              편집
            </button>
          )}
        </div>
      </section>

      <main className="px-4 pb-4 pt-[26px]">
        {isEmpty ? (
          <MobileEmptyState
            onOpenAddSheet={onOpenAddSheet}
            onOpenBundlePicker={onOpenBundlePicker}
            onOpenRecommendations={onOpenRecommendations}
          />
        ) : isSearchEmpty ? (
          <MobileSearchEmptyState
            activeCategoryLabel={getIngredientCategoryGroupLabel(activeCategory)}
            onClearSearch={onClearSearch}
            searchQuery={searchQuery}
          />
        ) : (
          <div className="space-y-[18px]">
            {sectionGroups.map((group) => (
              <section key={group.category}>
                <h2 className="px-1 pb-[10px] text-[13px] font-extrabold leading-[1.3] text-[var(--text-2)]">
                  {group.category}
                </h2>
                <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]">
                  {group.items.map((item, index) => {
                    const selected = selectedIds.has(item.ingredient_id);

                    return (
                      <div className="relative overflow-hidden" key={item.id}>
                        {!isSelectMode ? (
                          <button
                            aria-label={`${item.standard_name} 삭제`}
                            className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center bg-[var(--danger)] text-[13px] font-extrabold text-[var(--text-inverse)]"
                            onClick={() => onRequestSingleDelete(item.ingredient_id)}
                            type="button"
                          >
                            삭제
                          </button>
                        ) : null}
                        <button
                          aria-checked={isSelectMode ? selected : undefined}
                          aria-label={
                            isSelectMode ? `${item.standard_name} 선택` : undefined
                          }
                          className={[
                            "relative flex min-h-[61px] w-full items-center bg-[var(--surface)] px-4 text-left transition-transform duration-150",
                            index > 0 ? "border-t border-[var(--surface-subtle)]" : "",
                            isSelectMode ? "cursor-pointer" : "cursor-default",
                          ].join(" ")}
                          onClick={
                            isSelectMode
                              ? () => onSelectToggle(item.ingredient_id)
                              : undefined
                          }
                          onPointerDown={
                            isSelectMode
                              ? undefined
                              : (event) => {
                                  pointerStartXRef.current = event.clientX;
                                }
                          }
                          onPointerUp={
                            isSelectMode
                              ? undefined
                              : (event) => {
                                  const startX = pointerStartXRef.current;
                                  pointerStartXRef.current = null;

                                  if (startX === null) {
                                    return;
                                  }

                                  const deltaX = event.clientX - startX;

                                  if (deltaX < -44) {
                                    setSwipedIngredientId(item.ingredient_id);
                                    return;
                                  }

                                  if (deltaX > 20 || swipedIngredientId !== item.ingredient_id) {
                                    setSwipedIngredientId(null);
                                  }
                                }
                          }
                          role={isSelectMode ? "checkbox" : undefined}
                          style={
                            !isSelectMode && swipedIngredientId === item.ingredient_id
                              ? { transform: "translateX(-76px)" }
                              : undefined
                          }
                          type="button"
                        >
                          {isSelectMode && (
                            <span
                              aria-hidden="true"
                              className={[
                                "mr-2 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[13px] font-bold",
                                selected
                                  ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]"
                                  : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent",
                              ].join(" ")}
                            >
                              ✓
                            </span>
                          )}
                          <span
                            aria-hidden="true"
                            className="mr-3 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--surface-fill)] text-[20px]"
                          >
                            {getPantryEmoji(item.standard_name, item.category)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold leading-[1.35] text-[var(--foreground)]">
                            {item.standard_name}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {isSelectMode && selectedIds.size > 0 && (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(112px+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4"
          data-testid="pantry-delete-action-bar"
        >
          <span className="rounded-full bg-[var(--surface-alpha-95)] px-3 py-1 text-[12px] font-extrabold text-[var(--danger)] shadow-[0_2px_8px_var(--shadow-color-medium)]">
            {selectedIds.size}개 선택됨
          </span>
          <button
            className="pointer-events-auto h-[46px] rounded-full bg-[var(--danger)] px-6 text-[14px] font-extrabold text-[var(--text-inverse)] shadow-[0_8px_18px_var(--danger-border)]"
            onClick={onRequestDelete}
            type="button"
          >
            제거하기
          </button>
        </div>
      )}

      <Wave1MobileBottomTab ariaLabel="팬트리 하단 탭" currentTab="pantry" />
    </div>
  );
}

function CategoryChip({
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

function MobileEmptyState({
  onOpenAddSheet,
  onOpenBundlePicker,
  onOpenRecommendations,
}: {
  onOpenAddSheet: () => void;
  onOpenBundlePicker: () => void;
  onOpenRecommendations: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-10 text-center">
      <p className="text-[16px] font-extrabold text-[var(--foreground)]">
        아직 등록한 재료가 없어요
      </p>
      <p className="mt-2 text-[13px] font-medium leading-5 text-[var(--text-3)]">
        재료를 추가하면 장보기 때 이미 있는 재료를 자동 제외해요
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          className="col-span-2 h-10 rounded-[var(--radius-control)] border-0 bg-[var(--brand)] text-[13px] font-extrabold text-[var(--text-inverse)]"
          onClick={onOpenRecommendations}
          type="button"
        >
          팬트리 추천
        </button>
        <button
          className="h-10 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[13px] font-extrabold text-[var(--text-2)]"
          onClick={onOpenAddSheet}
          type="button"
        >
          재료 추가
        </button>
        <button
          aria-label="묶음으로 추가"
          className="h-10 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[13px] font-extrabold text-[var(--text-2)]"
          onClick={onOpenBundlePicker}
          type="button"
        >
          묶음 추가
        </button>
      </div>
    </div>
  );
}

function MobileSearchEmptyState({
  activeCategoryLabel,
  onClearSearch,
  searchQuery,
}: {
  activeCategoryLabel: string | null;
  onClearSearch: () => void;
  searchQuery: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-6 py-10 text-center">
      <p className="text-[15px] font-bold text-[var(--text-3)]">
        {searchQuery
          ? `"${searchQuery}"에 해당하는 재료가 없어요`
          : `${activeCategoryLabel ?? "선택한"} 재료가 없어요`}
      </p>
      {searchQuery && (
        <button
          className="mt-4 h-10 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 text-[13px] font-extrabold text-[var(--text-2)]"
          onClick={onClearSearch}
          type="button"
        >
          검색어 지우기
        </button>
      )}
    </div>
  );
}

function groupPantryItems(items: PantryItem[]) {
  const groups = new Map<string, PantryItem[]>();

  items.forEach((item) => {
    const category = getIngredientGroupDisplayLabel(item);
    const current = groups.get(category) ?? [];
    current.push(item);
    groups.set(category, current);
  });

  const knownCategories = INGREDIENT_CATEGORY_GROUP_OPTIONS
    .filter((category) => category.category_group_code)
    .map((category) => category.label)
    .filter((category) => groups.has(category));
  const knownCategorySet = new Set<string>(knownCategories);
  const extraCategories = Array.from(groups.keys())
    .filter((category) => !knownCategorySet.has(category))
    .sort((left, right) => left.localeCompare(right, "ko"));
  const categories = [...knownCategories, ...extraCategories];

  return categories.map((category) => ({
    category,
    items: groups.get(category) ?? [],
  }));
}

function getCategoryRail() {
  return INGREDIENT_CATEGORY_GROUP_OPTIONS.filter(
    (category) => category.category_group_code,
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
