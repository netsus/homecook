"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getBundleEmoji } from "@/components/pantry/pantry-mobile-visuals";
import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { ModalHeader } from "@/components/shared/modal-header";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
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
  const isMobileViewport = useIsMobileViewport();

  const selectedCount = selectedIds.size;
  const expandedBundle = bundles.find((bundle) => bundle.id === expandedBundleId);
  const getMissingIds = useCallback(
    (bundle: PantryBundle) =>
      bundle.ingredients
        .filter((ingredient) => !ingredient.is_in_pantry)
        .map((ingredient) => ingredient.ingredient_id),
    [],
  );
  const getOwnedCount = useCallback(
    (bundle: PantryBundle) =>
      bundle.ingredients.filter((ingredient) => ingredient.is_in_pantry).length,
    [],
  );

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
      setSelectedIds(new Set());
      setSheetState("ready");
    } catch {
      setSheetState("error");
    }
  }, []);

  const handleToggleBundleExpand = useCallback(
    (bundleId: string) => {
      setAddErrorMessage(null);
      const isCollapsing = expandedBundleId === bundleId;
      const bundle = bundles.find((item) => item.id === bundleId);
      setExpandedBundleId(isCollapsing ? null : bundleId);
      setSelectedIds(!isCollapsing && bundle ? new Set(getMissingIds(bundle)) : new Set());
    },
    [bundles, expandedBundleId, getMissingIds],
  );

  const handleToggleIngredient = useCallback(
    (ingredientId: string) => {
      const ingredient = expandedBundle?.ingredients.find(
        (item) => item.ingredient_id === ingredientId,
      );
      if (ingredient?.is_in_pantry) return;

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
    },
    [expandedBundle],
  );

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

  if (isMobileViewport) {
    return (
      <AppBottomSheet
        ariaLabelledBy="bundle-picker-title-mobile"
        bodyClassName="px-4 py-4"
        closeButtonRef={closeButtonRef}
        description={
          expandedBundle
            ? `${expandedBundle.name}에서 추가할 항목을 골라주세요`
            : "자주 함께 쓰는 재료를 한 번에 추가해요"
        }
        footer={
          sheetState === "ready" && expandedBundle ? (
            <div className="space-y-2">
              {addErrorMessage ? (
                <p className="text-[13px] font-bold text-[#C92A2A]" role="alert">
                  {addErrorMessage}
                </p>
              ) : null}
              <AppModalFooterActions
                cancelLabel="목록"
                confirmDisabled={selectedCount === 0 || isAdding}
                confirmLabel={
                  isAdding
                    ? "추가 중..."
                    : selectedCount > 0
                      ? `${selectedCount}개 팬트리에 추가`
                      : "추가할 재료를 선택해 주세요"
                }
                onCancel={() => {
                  setExpandedBundleId(null);
                  setSelectedIds(new Set());
                }}
                onConfirm={() => void handleAdd()}
              />
            </div>
          ) : null
        }
        onClose={onClose}
        panelClassName="min-h-[372px]"
        panelRef={scrollContainerRef}
        title="묶음으로 재료 추가"
      >
        {sheetState === "loading" ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton className="w-full" height={58} key={item} rounded="lg" />
            ))}
          </div>
        ) : sheetState === "error" ? (
          <div className="flex flex-col items-center py-10 text-center">
            <p className="text-sm font-semibold text-[#212529]">
              묶음 목록을 불러오지 못했어요
            </p>
            <button
              className="mt-4 h-10 rounded-[10px] bg-[#2AC1BC] px-5 text-[13px] font-extrabold text-white"
              onClick={() => void loadBundles()}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : sheetState === "empty" ? (
          <div className="py-10 text-center">
            <p className="text-[15px] font-bold text-[#212529]">
              등록된 묶음이 없어요
            </p>
            <p className="mt-2 text-[13px] text-[#868E96]">
              묶음이 준비되면 여기서 한 번에 추가할 수 있어요
            </p>
          </div>
        ) : expandedBundle ? (
          <div className="space-y-1.5">
            {expandedBundle.ingredients.map((ingredient) => {
              const isChecked = selectedIds.has(ingredient.ingredient_id);
              const isInPantry = ingredient.is_in_pantry;

              return (
                <button
                  aria-checked={isChecked}
                  aria-label={
                    isInPantry
                      ? `${ingredient.standard_name} 보유중`
                      : ingredient.standard_name
                  }
                  className={[
                    "flex min-h-[48px] w-full items-center gap-3 rounded-[10px] border border-[#DEE2E6] px-3 text-left disabled:opacity-100",
                    isInPantry ? "bg-[#F8F9FA]" : "bg-white",
                  ].join(" ")}
                  disabled={isInPantry}
                  key={ingredient.ingredient_id}
                  onClick={() => handleToggleIngredient(ingredient.ingredient_id)}
                  role="checkbox"
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border text-[13px] font-bold",
                      isChecked
                        ? "border-[#2AC1BC] bg-[#2AC1BC] text-white"
                        : "border-[#DEE2E6] bg-white text-transparent",
                    ].join(" ")}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-[#212529]">
                    {ingredient.standard_name}
                  </span>
                  {isInPantry ? (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#495057]">
                      보유중
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {bundles.map((bundle) => {
              const missingCount = getMissingIds(bundle).length;
              const ownedCount = getOwnedCount(bundle);

              return (
                <button
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[#DEE2E6] bg-white px-3.5 py-2.5 text-left"
                  key={bundle.id}
                  onClick={() => handleToggleBundleExpand(bundle.id)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F8F9FA] text-[20px]"
                  >
                    {getBundleEmoji(bundle.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-extrabold text-[#212529]">
                      {bundle.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-bold text-[#495057]">
                      {missingCount > 0
                        ? `추가 가능 ${missingCount}개`
                        : "추가할 새 재료 없음"}
                      {ownedCount > 0 ? ` · 보유중 ${ownedCount}개` : ""}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-[#868E96]">
                      {bundle.ingredients
                        .map((ingredient) => ingredient.standard_name)
                        .join(", ")}
                    </span>
                  </span>
                  <ChevronRightIcon />
                </button>
              );
            })}
          </div>
        )}
      </AppBottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        aria-label="묶음으로 재료 추가"
        aria-modal="true"
        className="flex w-full max-w-2xl flex-col rounded-[var(--radius-xl)] bg-[var(--panel)] shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-5 pt-3 pb-3">
          <ModalHeader
            closeButtonRef={closeButtonRef}
            description="자주 쓰는 재료를 묶음으로 한 번에 추가해요"
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
                const missingCount = getMissingIds(bundle).length;
                const ownedCount = getOwnedCount(bundle);

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
                        <span className="text-xs font-medium text-[var(--text-3)]">
                          {missingCount > 0
                            ? `추가 가능 ${missingCount}개`
                            : "추가할 새 재료 없음"}
                          {ownedCount > 0 ? ` · 보유중 ${ownedCount}개` : ""}
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
                              aria-label={
                                isInPantry
                                  ? `${ingredient.standard_name} 보유중`
                                  : ingredient.standard_name
                              }
                              className="flex w-full items-center gap-3 border-b border-[var(--line)] px-5 py-3 text-left transition hover:bg-[var(--surface-fill)] disabled:opacity-100"
                              disabled={isInPantry}
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
                                  aria-label="이미 보유중"
                                  className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--text-2)]"
                                >
                                  보유중
                                </span>
                              ) : (
                                <span className="shrink-0 text-xs text-[var(--text-4)]">
                                  추가 가능
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

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6 shrink-0 text-[#ADB5BD]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
