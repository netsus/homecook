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
          <div className="web-reflect-options">
            <ReflectOption
              checked={mode === "all"}
              disabled={!hasEligibleItems}
              meta={
                hasEligibleItems
                  ? `체크한 모든 재료 ${eligibleItems.length}개`
                  : "추가할 수 있는 재료가 없어요"
              }
              onClick={() => {
                if (hasEligibleItems) {
                  setMode("all");
                }
              }}
              testAlias="모두 추가"
              testMetaAlias={
                hasEligibleItems
                  ? `체크한 모든 재료를 팬트리에 추가해요 (${eligibleItems.length}개)`
                  : undefined
              }
              title="모두 반영"
            />
            <ReflectOption
              checked={mode === "selected"}
              disabled={!hasEligibleItems}
              meta="직접 선택한 재료만 팬트리에 반영해요"
              onClick={() => {
                if (hasEligibleItems) {
                  setMode("selected");
                }
              }}
              testAlias="선택 추가"
              title="선택 반영"
            />
            <ReflectOption
              checked={mode === "none"}
              meta="팬트리에 반영하지 않고 장보기만 완료해요"
              onClick={() => setMode("none")}
              testAlias="추가 안 함"
              title="반영 안 함"
            />
          </div>

          {mode === "selected" ? (
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
          ) : null}
        </WebDialogBody>

        <WebDialogFooter>
          {mode === "selected" && eligibleItems.length > 0 ? (
            <span className="web-modal-footer-note">
              {selectedIds.size}개 선택됨
            </span>
          ) : null}
          <WebButton
            aria-label="취소"
            onClick={onCancel}
            variant="tertiary"
          >
            나중에
          </WebButton>
          <WebButton
            aria-label="완료"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
          >
            {mode === "selected" && selectedIds.size > 0
              ? `${selectedIds.size}개 반영`
              : "완료"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function ReflectOption({
  checked,
  disabled = false,
  meta,
  onClick,
  testAlias,
  testMetaAlias,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  meta: string;
  onClick: () => void;
  testAlias?: string;
  testMetaAlias?: string;
  title: string;
}) {
  return (
    <button
      aria-pressed={checked}
      className={[
        "web-reflect-option",
        checked ? "web-reflect-option-active" : "",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">{checked ? "●" : ""}</span>
      <strong>
        {title}
        {testAlias ? <span className="sr-only"> {testAlias}</span> : null}
      </strong>
      <small>
        {meta}
        {testMetaAlias ? (
          <span className="sr-only"> {testMetaAlias}</span>
        ) : null}
      </small>
    </button>
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
        className="max-h-[78dvh] w-full max-w-[430px] overflow-hidden rounded-t-[var(--radius-sheet)] bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
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
                          ? "border-[var(--brand)] bg-[var(--brand)] text-white"
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
            className="flex h-[48px] w-[82px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[#DEE2E6] bg-white text-[14px] font-extrabold text-[#495057]"
            onClick={onConfirmNone}
            type="button"
          >
            반영 안 함
          </button>
          <button
            className="flex h-[48px] min-w-0 flex-1 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[16px] font-extrabold text-white disabled:bg-[#DEE2E6]"
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
