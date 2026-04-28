"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ModalHeader } from "@/components/shared/modal-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addPantryItems,
  fetchPantryBundles,
} from "@/lib/api/pantry";
import type { PantryBundle } from "@/types/pantry";

type SheetState = "loading" | "error" | "empty" | "ready";

interface PantryBundlePickerProps {
  onAdd: (addedCount: number) => void;
  onClose: () => void;
}

export function PantryBundlePicker({ onAdd, onClose }: PantryBundlePickerProps) {
  const [sheetState, setSheetState] = useState<SheetState>("loading");
  const [bundles, setBundles] = useState<PantryBundle[]>([]);
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [addErrorMessage, setAddErrorMessage] = useState<string | null>(null);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedCount = selectedIds.size;

  const loadBundles = useCallback(async () => {
    setSheetState("loading");
    try {
      const result = await fetchPantryBundles();

      if (result.bundles.length === 0) {
        setBundles([]);
        setSheetState("empty");
        return;
      }

      setBundles(result.bundles);

      // Initialize selectedIds: all non-in-pantry ingredients
      const initialSelected = new Set(
        result.bundles
          .flatMap((b) => b.ingredients)
          .filter((i) => !i.is_in_pantry)
          .map((i) => i.ingredient_id),
      );
      setSelectedIds(initialSelected);
      setSheetState("ready");
    } catch {
      setSheetState("error");
    }
  }, []);

  const handleToggleBundleExpand = useCallback(
    (bundleId: string) => {
      setExpandedBundleId((prev) => (prev === bundleId ? null : bundleId));
    },
    [],
  );

  const handleToggleIngredient = useCallback((ingredientId: string) => {
    setAddErrorMessage(null);
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
    setAddErrorMessage(null);
    try {
      const result = await addPantryItems(Array.from(selectedIds));
      onAdd(result.added);
      onClose();
    } catch {
      setAddErrorMessage("추가에 실패했어요. 다시 시도해 주세요.");
      setIsAdding(false);
    }
  }, [selectedIds, onAdd, onClose]);

  useEffect(() => {
    void loadBundles();
    closeButtonRef.current?.focus();
  }, [loadBundles]);

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

  // Prevent body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={onClose}
    >
      <div
        aria-label="묶음으로 재료 추가"
        aria-modal="true"
        className="flex w-full flex-col rounded-t-[var(--radius-xl)] bg-[var(--panel)] shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        style={{ maxHeight: "90vh" }}
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-3 pb-3">
          <ModalHeader
            closeButtonRef={closeButtonRef}
            description="자주 쓰는 재료를 묶음으로 한번에 추가해요"
            onClose={onClose}
            title="묶음으로 추가"
            titleId="bundle-picker-title"
          />
        </div>

        <div className="border-t border-[var(--line)]" />

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto"
          ref={scrollContainerRef}
          style={{ overscrollBehavior: "contain" }}
        >
          {sheetState === "loading" && <BundleLoadingSkeleton />}

          {sheetState === "error" && (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <p className="text-base text-[var(--foreground)]">
                묶음 목록을 불러오지 못했어요
              </p>
              <button
                className="mt-4 flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 text-sm font-semibold text-[var(--surface)]"
                onClick={() => void loadBundles()}
                type="button"
              >
                다시 시도
              </button>
            </div>
          )}

          {sheetState === "empty" && (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <p className="text-base text-[var(--foreground)]">
                등록된 묶음이 없어요
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                묶음이 준비되면 여기서 한번에 추가할 수 있어요
              </p>
            </div>
          )}

          {sheetState === "ready" && (
            <div>
              {bundles.map((bundle) => {
                const isExpanded = expandedBundleId === bundle.id;

                return (
                  <div key={bundle.id}>
                    {/* Bundle header (accordion) */}
                    <button
                      aria-controls={`bundle-${bundle.id}-content`}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-left"
                      onClick={() => handleToggleBundleExpand(bundle.id)}
                      role="button"
                      style={{ minHeight: 48 }}
                      type="button"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[var(--foreground)]">
                          {bundle.name}
                        </span>
                        <span className="text-xs text-[var(--text-3)]">
                          {bundle.ingredients.length}개
                        </span>
                      </div>
                      <span className="text-[var(--text-3)]">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Bundle ingredient list */}
                    {isExpanded && (
                      <div id={`bundle-${bundle.id}-content`}>
                        {bundle.ingredients.map((ingredient) => {
                          const isInPantry = ingredient.is_in_pantry;
                          const isChecked = selectedIds.has(ingredient.ingredient_id);

                          return (
                            <button
                              aria-checked={isChecked}
                              aria-label={ingredient.standard_name}
                              className="flex w-full items-center gap-3 border-b border-[var(--line)] px-5 py-3 text-left transition hover:bg-[var(--surface-fill)]"
                              key={ingredient.ingredient_id}
                              onClick={() => handleToggleIngredient(ingredient.ingredient_id)}
                              role="checkbox"
                              style={{ minHeight: 44 }}
                              type="button"
                            >
                              {/* Checkbox */}
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                                  isChecked
                                    ? "border-[var(--olive)] bg-[var(--olive)] text-white"
                                    : "border-[var(--line)] bg-[var(--surface)]"
                                }`}
                              >
                                {isChecked && "✓"}
                              </span>

                              {/* Name */}
                              <span
                                className={`flex-1 truncate text-sm ${
                                  isInPantry && !isChecked
                                    ? "text-[var(--text-3)]"
                                    : "text-[var(--foreground)]"
                                }`}
                              >
                                {ingredient.standard_name}
                              </span>

                              {/* Status label */}
                              {isInPantry ? (
                                <span
                                  aria-label="이미 보유 중"
                                  className="shrink-0 rounded-full bg-[var(--surface-fill)] px-2 py-0.5 text-xs text-[var(--text-3)]"
                                >
                                  보유중
                                </span>
                              ) : (
                                <span className="shrink-0 text-xs text-[var(--text-4)]">
                                  (없음)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA */}
        {sheetState === "ready" && (
          <div className="border-t border-[var(--line)] px-5 py-3">
            {addErrorMessage && (
              <p className="mb-2 text-sm font-medium text-[var(--brand-deep)]" role="alert">
                {addErrorMessage}
              </p>
            )}
            <button
              aria-busy={isAdding}
              aria-disabled={selectedCount === 0 || isAdding}
              className={`flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius-md)] text-base font-semibold transition ${
                selectedCount > 0 && !isAdding
                  ? "bg-[var(--brand)] text-[var(--surface)]"
                  : "pointer-events-none bg-[var(--surface-fill)] text-[var(--text-4)]"
              }`}
              disabled={selectedCount === 0 || isAdding}
              onClick={() => void handleAdd()}
              type="button"
            >
              {isAdding
                ? "추가 중..."
                : selectedCount > 0
                  ? `${selectedCount}개 팬트리에 추가`
                  : "추가할 재료를 선택해 주세요"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BundleLoadingSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div className="border-b border-[var(--line)] px-5 py-3" key={i}>
          <Skeleton className="w-full" height={24} rounded="md" />
        </div>
      ))}
    </div>
  );
}
