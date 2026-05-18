"use client";

import React, { useEffect, useState } from "react";

import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import type { ShoppingListItemSummary } from "@/types/shopping";

export interface PantryReflectionPopupProps {
  items: ShoppingListItemSummary[];
  onConfirm: (selectedItemIds: string[] | undefined) => void;
  onCancel: () => void;
}

type SelectionMode = "all" | "selected" | "none";

/**
 * Pantry Reflection Popup
 *
 * Shows a bottom-sheet style popup before completing shopping,
 * allowing users to choose which checked items to add to pantry.
 *
 * Three modes:
 * - "모두 추가" (all): calls onConfirm(undefined) → parent sends default policy
 * - "선택 추가" (selected): shows checkboxes, calls onConfirm([...selectedIds])
 * - "추가 안 함" (none): calls onConfirm([])
 *
 * Only checked items where is_pantry_excluded=false are selectable.
 */
export function PantryReflectionPopup({
  items,
  onConfirm,
  onCancel,
}: PantryReflectionPopupProps) {
  const eligibleItems = items.filter(
    (item) => item.is_checked && !item.is_pantry_excluded
  );
  const [mode, setMode] = useState<SelectionMode>(() =>
    eligibleItems.length > 0 ? "all" : "none"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Pre-select all eligible items
    return new Set(eligibleItems.map((item) => item.id));
  });
  const isMobileViewport = useIsMobileViewport();
  const hasEligibleItems = eligibleItems.length > 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleToggleItem = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleConfirmSelected = () => {
    const selectedItemIds = Array.from(selectedIds);
    if (selectedItemIds.length === eligibleItems.length) {
      onConfirm(undefined);
      return;
    }

    onConfirm(selectedItemIds);
  };

  const handleConfirm = () => {
    if (mode === "all") {
      // undefined is the UI signal for the default pantry reflection policy.
      onConfirm(undefined);
    } else if (mode === "none") {
      // [] → no pantry reflection
      onConfirm([]);
    } else {
      // selected → reflect only selected items
      onConfirm(Array.from(selectedIds));
    }
  };

  const isConfirmDisabled =
    mode === "selected" && selectedIds.size === 0;

  if (isMobileViewport) {
    return (
      <MobilePantryReflectionSheet
        eligibleItems={eligibleItems}
        onCancel={onCancel}
        onConfirmNone={() => onConfirm([])}
        onConfirmSelected={handleConfirmSelected}
        onToggleItem={handleToggleItem}
        selectedIds={selectedIds}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pantry-reflection-title"
    >
      <div
        className="w-full max-w-lg rounded-t-3xl bg-[var(--panel)] px-6 pb-8 pt-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex-1">
            <h2
              id="pantry-reflection-title"
              className="text-xl font-extrabold tracking-tight"
            >
              팬트리에 추가할까요?
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              체크한 재료를 팬트리에 자동으로 추가할 수 있어요
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
            type="button"
            aria-label="닫기"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="text-[var(--muted)]"
            >
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Mode selection */}
        <div className="mb-6 space-y-3">
          <button
            onClick={() => {
              if (hasEligibleItems) {
                setMode("all");
              }
            }}
            disabled={!hasEligibleItems}
            className={`w-full rounded-xl border-2 px-4 py-4 text-left transition-colors ${
              mode === "all"
                ? "border-[var(--olive)] bg-[color:rgba(46,166,122,0.08)]"
                : "border-[var(--line)] bg-[var(--surface)]"
            } ${!hasEligibleItems ? "opacity-50" : ""}`}
            aria-disabled={!hasEligibleItems}
            type="button"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-bold">모두 추가</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {hasEligibleItems
                    ? `체크한 모든 재료를 팬트리에 추가해요 (${eligibleItems.length}개)`
                    : "추가할 수 있는 재료가 없어요"}
                </p>
              </div>
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  mode === "all"
                    ? "border-[var(--olive)] bg-[var(--olive)]"
                    : "border-[var(--line)] bg-white"
                }`}
              >
                {mode === "all" && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <circle cx="6" cy="6" r="3" fill="white" />
                  </svg>
                )}
              </div>
            </div>
          </button>

          <button
            onClick={() => {
              if (hasEligibleItems) {
                setMode("selected");
              }
            }}
            disabled={!hasEligibleItems}
            className={`w-full rounded-xl border-2 px-4 py-4 text-left transition-colors ${
              mode === "selected"
                ? "border-[var(--olive)] bg-[color:rgba(46,166,122,0.08)]"
                : "border-[var(--line)] bg-[var(--surface)]"
            } ${!hasEligibleItems ? "opacity-50" : ""}`}
            aria-disabled={!hasEligibleItems}
            type="button"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-bold">선택 추가</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  직접 선택한 재료만 팬트리에 추가해요
                </p>
              </div>
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  mode === "selected"
                    ? "border-[var(--olive)] bg-[var(--olive)]"
                    : "border-[var(--line)] bg-white"
                }`}
              >
                {mode === "selected" && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <circle cx="6" cy="6" r="3" fill="white" />
                  </svg>
                )}
              </div>
            </div>
          </button>

          <button
            onClick={() => setMode("none")}
            className={`w-full rounded-xl border-2 px-4 py-4 text-left transition-colors ${
              mode === "none"
                ? "border-[var(--olive)] bg-[color:rgba(46,166,122,0.08)]"
                : "border-[var(--line)] bg-[var(--surface)]"
            }`}
            type="button"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-base font-bold">추가 안 함</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  팬트리에 추가하지 않고 장보기만 완료해요
                </p>
              </div>
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  mode === "none"
                    ? "border-[var(--olive)] bg-[var(--olive)]"
                    : "border-[var(--line)] bg-white"
                }`}
              >
                {mode === "none" && (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <circle cx="6" cy="6" r="3" fill="white" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Item selection (only visible in selected mode) */}
        {mode === "selected" && (
          <div className="mb-6 max-h-64 overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--surface)]">
            {eligibleItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-[var(--muted)]">
                  선택할 수 있는 재료가 없어요
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {eligibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleToggleItem(item.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/5"
                    type="button"
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                        selectedIds.has(item.id)
                          ? "border-[var(--olive)] bg-[var(--olive)]"
                          : "border-[var(--line)] bg-white"
                      }`}
                    >
                      {selectedIds.has(item.id) && (
                        <span className="text-xs text-white">✓</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">
                        {item.display_text.replace(/\s+\d+.*$/, "")}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {item.amounts_json
                          .map((a) => `${a.amount}${a.unit}`)
                          .join(" + ")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected count (only visible in selected mode) */}
        {mode === "selected" && eligibleItems.length > 0 && (
          <div className="mb-4 text-center">
            <p className="text-sm font-semibold text-[var(--muted)]">
              {selectedIds.size}개 선택됨
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-[var(--line)] bg-white py-4 text-base font-bold text-[var(--foreground)] hover:bg-black/5"
            type="button"
          >
            취소
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="flex-1 rounded-full bg-[var(--olive)] py-4 text-base font-bold text-white hover:bg-[var(--olive)]/90 disabled:opacity-50"
            type="button"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

function MobilePantryReflectionSheet({
  eligibleItems,
  onCancel,
  onConfirmNone,
  onConfirmSelected,
  onToggleItem,
  selectedIds,
}: {
  eligibleItems: ShoppingListItemSummary[];
  onCancel: () => void;
  onConfirmNone: () => void;
  onConfirmSelected: () => void;
  onToggleItem: (itemId: string) => void;
  selectedIds: Set<string>;
}) {
  const selectedCount = selectedIds.size;
  const hasSelectedItems = selectedCount > 0;

  return (
    <div
      aria-labelledby="pantry-reflection-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35"
      onClick={onCancel}
      role="dialog"
    >
      <div
        className="max-h-[78dvh] w-full max-w-[430px] overflow-hidden rounded-t-[20px] bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[#DEE2E6] px-5 pb-[17px] pt-[18px]">
          <h2
            className="text-[18px] font-extrabold leading-[1.3] text-[#212529]"
            id="pantry-reflection-title"
          >
            팬트리에 반영할까요?
          </h2>
          <p className="mt-[7px] text-[12px] font-semibold leading-[1.55] text-[#868E96]">
            장 본 재료 중 팬트리에 추가할 항목을 선택하세요. 선택하지
            않으면 반영하지 않아요.
          </p>
        </div>

        <div className="max-h-[38dvh] overflow-y-auto px-4">
          {eligibleItems.length === 0 ? (
            <div className="py-8 text-center text-[14px] font-bold text-[#868E96]">
              반영할 수 있는 재료가 없어요
            </div>
          ) : (
            <div className="divide-y divide-[#F1F3F5]">
              {eligibleItems.map((item) => {
                const isSelected = selectedIds.has(item.id);

                return (
                  <button
                    className="flex min-h-[71px] w-full items-center gap-3 py-[14px] text-left"
                    key={item.id}
                    onClick={() => onToggleItem(item.id)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border text-[13px] font-extrabold",
                        isSelected
                          ? "border-[#2AC1BC] bg-[#2AC1BC] text-white"
                          : "border-[#DEE2E6] bg-white text-transparent",
                      ].join(" ")}
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-extrabold leading-[1.3] text-[#212529]">
                        {formatPantryItemName(item)}
                      </span>
                      <span className="mt-[2px] block truncate text-[12px] font-semibold leading-[1.3] text-[#868E96]">
                        {formatPantryAmountText(item)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[#DEE2E6] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-4">
          <button
            className="flex h-[48px] w-[82px] shrink-0 items-center justify-center rounded-[8px] border border-[#DEE2E6] bg-white text-[14px] font-extrabold text-[#495057]"
            onClick={onConfirmNone}
            type="button"
          >
            반영 안 함
          </button>
          <button
            className="flex h-[48px] min-w-0 flex-1 items-center justify-center rounded-[8px] bg-[#2AC1BC] px-3 text-[16px] font-extrabold text-white disabled:bg-[#DEE2E6]"
            disabled={!hasSelectedItems}
            onClick={onConfirmSelected}
            type="button"
          >
            {hasSelectedItems ? `${selectedCount}개 반영하기` : "반영할 재료 선택"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatPantryItemName(item: ShoppingListItemSummary): string {
  return item.display_text.replace(/\s+\d+.*$/, "");
}

function formatPantryAmountText(item: ShoppingListItemSummary): string {
  return item.amounts_json
    .map((amount) => `${amount.amount}${amount.unit}`)
    .join(" + ");
}
