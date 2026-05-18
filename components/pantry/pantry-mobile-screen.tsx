"use client";

import React from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  getPantryEmoji,
  sortWave1PantryCategories,
  WAVE1_PANTRY_CATEGORY_ORDER,
  WAVE1_PANTRY_REFERENCE_TOTAL,
} from "@/components/pantry/pantry-mobile-visuals";
import type { PantryItem } from "@/types/pantry";

interface PantryMobileScreenProps {
  activeCategory: string | null;
  displayItems: PantryItem[];
  isSelectMode: boolean;
  items: PantryItem[];
  searchQuery: string;
  selectedIds: Set<string>;
  onCategoryChange: (category: string | null) => void;
  onClearSearch: () => void;
  onExitSelectMode: () => void;
  onOpenAddSheet: () => void;
  onOpenBundlePicker: () => void;
  onRequestDelete: () => void;
  onSearchChange: (value: string) => void;
  onSelectToggle: (ingredientId: string) => void;
  onStartSelectMode: () => void;
}

export function PantryMobileScreen({
  activeCategory,
  displayItems,
  isSelectMode,
  items,
  searchQuery,
  selectedIds,
  onCategoryChange,
  onClearSearch,
  onExitSelectMode,
  onOpenAddSheet,
  onOpenBundlePicker,
  onRequestDelete,
  onSearchChange,
  onSelectToggle,
  onStartSelectMode,
}: PantryMobileScreenProps) {
  const isEmpty = items.length === 0 && !searchQuery && !activeCategory;
  const isSearchEmpty = displayItems.length === 0 && (searchQuery || activeCategory);
  const sectionGroups = groupPantryItems(displayItems);
  const categoryRail = getCategoryRail(items);

  return (
    <div className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden">
      <div className="relative flex h-[52px] items-center justify-center border-b border-[#DEE2E6] bg-white px-4">
        <h1 className="text-[18px] font-extrabold leading-none">
          팬트리
        </h1>
        <button
          aria-label={isSelectMode ? "편집 취소" : "팬트리 편집"}
          className={[
            "absolute right-[18px] top-1/2 flex h-[28px] min-w-[42px] -translate-y-1/2 items-center justify-center rounded-full border px-[10px] text-[11px] font-extrabold",
            isSelectMode
              ? "border-[#DEE2E6] bg-[#F8F9FA] text-[#495057]"
              : "border-[#DEE2E6] bg-[#F8F9FA] text-[#495057]",
          ].join(" ")}
          onClick={isSelectMode ? onExitSelectMode : onStartSelectMode}
          type="button"
        >
          {isSelectMode ? "취소" : "편집"}
        </button>
      </div>

      <section className="border-b border-[#DEE2E6] bg-white px-5 pb-5 pt-4">
        <p className="mb-1 text-[13px] font-medium leading-[1.35] text-[#868E96]">
          냉장고에 있는 재료
        </p>
        <div className="mb-5 flex items-baseline gap-1.5">
          <span className="text-[32px] font-extrabold leading-none">
            {items.length}
          </span>
          <span className="text-[16px] font-bold leading-none text-[#868E96]">
            / {WAVE1_PANTRY_REFERENCE_TOTAL}개
          </span>
        </div>

        <div className="relative mb-3">
          <SearchIcon className="absolute left-[17px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#868E96]" />
          <input
            aria-label="팬트리 재료 검색"
            className="h-11 w-full rounded-[20px] border-0 bg-[#F8F9FA] pl-[46px] pr-10 text-[14px] font-medium text-[#212529] placeholder:text-[#868E96] focus:outline-none focus:ring-2 focus:ring-[#2AC1BC]"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="재료 검색"
            role="searchbox"
            type="search"
            value={searchQuery}
          />
          {searchQuery && (
            <button
              aria-label="검색어 지우기"
              className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[14px] font-bold text-[#868E96]"
              onClick={onClearSearch}
              type="button"
            >
              ×
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            className="h-10 rounded-[10px] border-0 bg-[#2AC1BC] text-[13px] font-extrabold text-white"
            onClick={onOpenAddSheet}
            type="button"
          >
            재료 추가
          </button>
          <button
            aria-label="묶음으로 추가"
            className="h-10 rounded-[10px] border border-[#DEE2E6] bg-white text-[13px] font-extrabold text-[#495057]"
            onClick={onOpenBundlePicker}
            type="button"
          >
            묶음 추가
          </button>
        </div>
      </section>

      <section className="px-4 pt-3">
        <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1" role="tablist">
          <CategoryChip
            active={!activeCategory}
            label="전체"
            onClick={() => onCategoryChange(null)}
          />
          {categoryRail.map((category) => (
            <CategoryChip
              active={activeCategory === category}
              key={category}
              label={category}
              onClick={() => onCategoryChange(category)}
            />
          ))}
        </div>
      </section>

      <main className="px-4 pb-4 pt-[26px]">
        {isEmpty ? (
          <MobileEmptyState
            onOpenAddSheet={onOpenAddSheet}
            onOpenBundlePicker={onOpenBundlePicker}
          />
        ) : isSearchEmpty ? (
          <MobileSearchEmptyState
            activeCategory={activeCategory}
            onClearSearch={onClearSearch}
            searchQuery={searchQuery}
          />
        ) : (
          <div className="space-y-[18px]">
            {sectionGroups.map((group) => (
              <section key={group.category}>
                <h2 className="px-1 pb-[10px] text-[13px] font-extrabold leading-[1.3] text-[#495057]">
                  {group.category}
                </h2>
                <div className="overflow-hidden rounded-xl border border-[#DEE2E6] bg-white">
                  {group.items.map((item, index) => {
                    const selected = selectedIds.has(item.ingredient_id);

                    return (
                      <button
                        aria-checked={isSelectMode ? selected : undefined}
                        aria-label={
                          isSelectMode ? `${item.standard_name} 선택` : undefined
                        }
                        className={[
                          "flex min-h-[61px] w-full items-center px-4 text-left",
                          index > 0 ? "border-t border-[#F1F3F5]" : "",
                          isSelectMode ? "cursor-pointer" : "cursor-default",
                        ].join(" ")}
                        key={item.id}
                        onClick={
                          isSelectMode
                            ? () => onSelectToggle(item.ingredient_id)
                            : undefined
                        }
                        role={isSelectMode ? "checkbox" : undefined}
                        type="button"
                      >
                        {isSelectMode && (
                          <span
                            aria-hidden="true"
                            className={[
                              "mr-2 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[13px] font-bold",
                              selected
                                ? "border-[#2AC1BC] bg-[#2AC1BC] text-white"
                                : "border-[#DEE2E6] bg-white text-transparent",
                            ].join(" ")}
                          >
                            ✓
                          </span>
                        )}
                        <span
                          aria-hidden="true"
                          className="mr-3 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl bg-[#F8F9FA] text-[20px]"
                        >
                          {getPantryEmoji(item.standard_name, item.category)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold leading-[1.35] text-[#212529]">
                          {item.standard_name}
                        </span>
                      </button>
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
          <span className="rounded-full bg-white/95 px-3 py-1 text-[12px] font-extrabold text-[#FF6B6B] shadow-[0_2px_8px_rgba(0,0,0,0.10)]">
            {selectedIds.size}개 선택됨
          </span>
          <button
            className="pointer-events-auto h-[46px] rounded-full bg-[#FF6B6B] px-6 text-[14px] font-extrabold text-white shadow-[0_8px_18px_rgba(255,107,107,0.30)]"
            onClick={onRequestDelete}
            type="button"
          >
            제거하기 ({selectedIds.size})
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

function MobileEmptyState({
  onOpenAddSheet,
  onOpenBundlePicker,
}: {
  onOpenAddSheet: () => void;
  onOpenBundlePicker: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#DEE2E6] bg-white px-6 py-10 text-center">
      <p className="text-[16px] font-extrabold text-[#212529]">
        아직 등록한 재료가 없어요
      </p>
      <p className="mt-2 text-[13px] font-medium leading-5 text-[#868E96]">
        재료를 추가하면 장보기 때 이미 있는 재료를 자동 제외해요
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          className="h-10 rounded-[10px] bg-[#2AC1BC] text-[13px] font-extrabold text-white"
          onClick={onOpenAddSheet}
          type="button"
        >
          재료 추가
        </button>
        <button
          aria-label="묶음으로 추가"
          className="h-10 rounded-[10px] border border-[#DEE2E6] bg-white text-[13px] font-extrabold text-[#495057]"
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
  activeCategory,
  onClearSearch,
  searchQuery,
}: {
  activeCategory: string | null;
  onClearSearch: () => void;
  searchQuery: string;
}) {
  return (
    <div className="rounded-xl border border-[#DEE2E6] bg-white px-6 py-10 text-center">
      <p className="text-[15px] font-bold text-[#868E96]">
        {searchQuery
          ? `"${searchQuery}"에 해당하는 재료가 없어요`
          : `${activeCategory ?? "선택한"} 재료가 없어요`}
      </p>
      {searchQuery && (
        <button
          className="mt-4 h-10 rounded-[10px] border border-[#DEE2E6] bg-white px-5 text-[13px] font-extrabold text-[#495057]"
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
    const current = groups.get(item.category) ?? [];
    current.push(item);
    groups.set(item.category, current);
  });

  const categories = sortWave1PantryCategories(Array.from(groups.keys()));
  return categories.map((category) => ({
    category,
    items: groups.get(category) ?? [],
  }));
}

function getCategoryRail(items: PantryItem[]) {
  const categories = new Set(items.map((item) => item.category));
  WAVE1_PANTRY_CATEGORY_ORDER.forEach((category) => categories.add(category));
  return sortWave1PantryCategories(Array.from(categories));
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
