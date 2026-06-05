"use client";

import React, { useEffect, useState } from "react";

import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebModal,
} from "@/components/web";
import type { ShoppingListItemSummary } from "@/types/shopping";

export interface PantryReflectionPopupProps {
  items: ShoppingListItemSummary[];
  onConfirm: (selectedItemIds: string[] | undefined) => void;
  onCancel: () => void;
}

/**
 * Pantry Reflection Popup
 *
 * Shows a bottom-sheet style popup before completing shopping,
 * allowing users to choose which checked items to add to pantry.
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    // Pre-select all eligible items
    return new Set(eligibleItems.map((item) => item.id));
  });
  const isMobileViewport = useIsMobileViewport();
  const selectedCount = selectedIds.size;
  const hasSelectedItems = selectedCount > 0;

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
    <WebModal onBackdropClick={onCancel}>
      <WebDialog
        aria-labelledby="pantry-reflection-title"
        className="web-reflect-dialog"
      >
        <WebDialogHeader>
          <div>
            <WebDialogTitle id="pantry-reflection-title">
              팬트리에 반영할까요?
              <span className="sr-only"> 팬트리에 추가할까요?</span>
            </WebDialogTitle>
            <p className="web-modal-copy">
              장 본 재료 중 팬트리에 추가할 항목을 선택하세요.
            </p>
          </div>
          <button
            aria-label="닫기"
            className="web-modal-close"
            onClick={onCancel}
            type="button"
          >
            ×
          </button>
        </WebDialogHeader>

        <WebDialogBody>
          <div className="web-reflect-list">
            {eligibleItems.length === 0 ? (
              <p className="web-modal-copy">선택할 수 있는 재료가 없어요</p>
            ) : (
              eligibleItems.map((item) => {
                const checked = selectedIds.has(item.id);

                return (
                  <button
                    aria-pressed={checked}
                    className="web-reflect-item"
                    key={item.id}
                    onClick={() => handleToggleItem(item.id)}
                    type="button"
                  >
                    <span aria-hidden="true">{checked ? "✓" : ""}</span>
                    <strong>{formatPantryItemName(item)}</strong>
                    <small>{formatPantryAmountText(item)}</small>
                  </button>
                );
              })
            )}
          </div>
        </WebDialogBody>

        <WebDialogFooter>
          {eligibleItems.length > 0 ? (
            <span className="web-modal-footer-note">
              {selectedCount}개 선택됨
            </span>
          ) : null}
          <WebButton
            onClick={() => onConfirm([])}
            variant="tertiary"
          >
            반영 안 함
          </WebButton>
          <WebButton
            disabled={!hasSelectedItems}
            onClick={handleConfirmSelected}
          >
            {hasSelectedItems ? `${selectedCount}개 반영하기` : "반영할 재료 선택"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-35)]"
      onClick={onCancel}
      role="dialog"
    >
      <div
        className="max-h-[78dvh] w-full max-w-[430px] overflow-hidden rounded-t-[var(--radius-sheet)] bg-[var(--surface)] shadow-[0_-8px_24px_var(--shadow-color-raised)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--line-strong)] px-5 pb-[17px] pt-[18px]">
          <h2
            className="text-[18px] font-extrabold leading-[1.3] text-[var(--foreground)]"
            id="pantry-reflection-title"
          >
            팬트리에 반영할까요?
          </h2>
          <p className="mt-[7px] text-[12px] font-semibold leading-[1.55] text-[var(--text-3)]">
            장 본 재료 중 팬트리에 추가할 항목을 선택하세요.
          </p>
        </div>

        <div className="max-h-[38dvh] overflow-y-auto px-4">
          {eligibleItems.length === 0 ? (
            <div className="py-8 text-center text-[14px] font-bold text-[var(--text-3)]">
              반영할 수 있는 재료가 없어요
            </div>
          ) : (
            <div className="space-y-2 py-3">
              {eligibleItems.map((item) => {
                const isSelected = selectedIds.has(item.id);

                return (
                  <button
                    className="flex min-h-[54px] w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-[10px] text-left"
                    data-testid={`pantry-reflection-row-${item.id}`}
                    key={item.id}
                    onClick={() => onToggleItem(item.id)}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={[
                          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border text-[13px] font-extrabold",
                          isSelected
                            ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]"
                            : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent",
                        ].join(" ")}
                      >
                        ✓
                      </span>
                      <span className="block min-w-0 truncate text-[14px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                        {formatPantryItemName(item)}
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-right text-[12px] font-extrabold leading-[1.3] text-[var(--text-3)]"
                      data-testid={`pantry-reflection-amount-${item.id}`}
                    >
                      {formatPantryAmountText(item)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-[var(--line-strong)] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-4">
          <button
            className="flex h-[48px] w-[82px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)]"
            onClick={onConfirmNone}
            type="button"
          >
            반영 안 함
          </button>
          <button
            className="flex h-[48px] min-w-0 flex-1 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[16px] font-extrabold text-[var(--text-inverse)] disabled:bg-[var(--line-strong)]"
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
