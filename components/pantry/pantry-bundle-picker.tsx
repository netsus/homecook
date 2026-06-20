"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getBundleEmoji } from "@/components/pantry/pantry-mobile-visuals";
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
} from "@/components/web";
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
  const expandedMissingIds = expandedBundle ? getMissingIds(expandedBundle) : [];
  const expandedMissingCount = expandedMissingIds.length;
  const selectedExpandedMissingCount = expandedMissingIds.filter((ingredientId) =>
    selectedIds.has(ingredientId),
  ).length;
  const areAllExpandedMissingSelected =
    expandedMissingCount > 0 && selectedExpandedMissingCount === expandedMissingCount;

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

  const handleSelectBundle = useCallback(
    (bundleId: string) => {
      setAddErrorMessage(null);
      const bundle = bundles.find((item) => item.id === bundleId);
      setExpandedBundleId(bundleId);
      setSelectedIds(bundle ? new Set(getMissingIds(bundle)) : new Set());
    },
    [bundles, getMissingIds],
  );

  const handleReturnToBundleList = useCallback(() => {
    setAddErrorMessage(null);
    setExpandedBundleId(null);
    setSelectedIds(new Set());
  }, []);

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

  const handleToggleExpandedSelection = useCallback(() => {
    if (!expandedBundle) return;

    setAddErrorMessage(null);
    setSelectedIds(
      areAllExpandedMissingSelected
        ? new Set()
        : new Set(getMissingIds(expandedBundle)),
    );
  }, [areAllExpandedMissingSelected, expandedBundle, getMissingIds]);

  const renderBundleDetail = useCallback(
    (bundle: PantryBundle, variant: "app" | "web") => {
      if (variant === "app") {
        return (
          <div className="space-y-3">
            <BundleSelectionActions
              areAllMissingSelected={areAllExpandedMissingSelected}
              missingCount={expandedMissingCount}
              onToggleSelection={handleToggleExpandedSelection}
              selectedMissingCount={selectedExpandedMissingCount}
            />
            <div className="space-y-1.5">
              {bundle.ingredients.map((ingredient) => {
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
                      "flex min-h-[48px] w-full items-center gap-3 rounded-[var(--radius-control)] border border-[var(--line-strong)] px-3 text-left disabled:opacity-60",
                      isInPantry
                        ? "bg-[var(--surface-fill)] opacity-60 grayscale"
                        : "bg-[var(--surface)]",
                    ].join(" ")}
                    data-owned={isInPantry ? "true" : undefined}
                    disabled={isInPantry}
                    key={ingredient.ingredient_id}
                    onClick={() => handleToggleIngredient(ingredient.ingredient_id)}
                    role="checkbox"
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[var(--radius-control)] border text-[13px] font-bold",
                        isChecked
                          ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]"
                          : "border-[var(--line-strong)] bg-[var(--surface)] text-transparent",
                      ].join(" ")}
                    >
                      ✓
                    </span>
                    <span
                      className={[
                        "min-w-0 flex-1 truncate text-[14px] font-bold",
                        isInPantry
                          ? "text-[var(--text-3)]"
                          : "text-[var(--foreground)]",
                      ].join(" ")}
                    >
                      {ingredient.standard_name}
                    </span>
                    {isInPantry ? (
                      <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-2)]">
                        보유중
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div className="web-bundle-detail web-bundle-detail-standalone">
          <div className="web-bundle-selection-bar">
            <p>
              추가할 재료 {selectedExpandedMissingCount}/
              {expandedMissingCount}개 선택
            </p>
            <div>
              <button
                disabled={expandedMissingCount === 0}
                onClick={handleToggleExpandedSelection}
                type="button"
              >
                {areAllExpandedMissingSelected ? "전체 해제" : "전체 선택"}
              </button>
            </div>
          </div>
          <div className="web-bundle-ingredients">
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
                  className={[
                    "web-bundle-ingredient",
                    isChecked ? "web-bundle-ingredient-selected" : "",
                    isInPantry ? "opacity-60 grayscale" : "",
                  ].join(" ")}
                  data-owned={isInPantry ? "true" : undefined}
                  disabled={isInPantry}
                  key={ingredient.ingredient_id}
                  onClick={() =>
                    handleToggleIngredient(ingredient.ingredient_id)
                  }
                  role="checkbox"
                  type="button"
                >
                  <span aria-hidden="true">
                    {isChecked || isInPantry ? "✓" : ""}
                  </span>
                  <strong>{ingredient.standard_name}</strong>
                  <small>{isInPantry ? "보유중" : "추가 가능"}</small>
                </button>
              );
            })}
          </div>
        </div>
      );
    },
    [
      areAllExpandedMissingSelected,
      expandedMissingCount,
      handleToggleExpandedSelection,
      handleToggleIngredient,
      selectedExpandedMissingCount,
      selectedIds,
    ],
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
            ? `${expandedBundle.name}에서 추가할 항목을 골라 주세요`
            : "자주 함께 쓰는 재료를 한 번에 추가해요"
        }
        footer={
          sheetState === "ready" && expandedBundle ? (
            <div className="space-y-2">
              {addErrorMessage ? (
                <p className="text-[13px] font-bold text-[var(--danger-strong)]" role="alert">
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
                onCancel={handleReturnToBundleList}
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
            <p className="text-sm font-semibold text-[var(--foreground)]">
              묶음 목록을 불러오지 못했어요
            </p>
            <button
              className="mt-4 h-10 rounded-[var(--radius-control)] bg-[var(--brand)] px-5 text-[13px] font-extrabold text-[var(--text-inverse)]"
              onClick={() => void loadBundles()}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : sheetState === "empty" ? (
          <div className="py-10 text-center">
            <p className="text-[15px] font-bold text-[var(--foreground)]">
              등록된 묶음이 없어요
            </p>
            <p className="mt-2 text-[13px] text-[var(--text-3)]">
              묶음이 준비되면 여기서 한 번에 추가할 수 있어요
            </p>
          </div>
        ) : expandedBundle ? (
          renderBundleDetail(expandedBundle, "app")
        ) : (
          <div className="space-y-2.5">
            {bundles.map((bundle) => (
              <button
                className="flex min-h-[58px] w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-left"
                key={bundle.id}
                onClick={() => handleSelectBundle(bundle.id)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-fill)] text-[20px]"
                >
                  {getBundleEmoji(bundle.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-[var(--foreground)]">
                  {bundle.name}
                </span>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
        )}
      </AppBottomSheet>
    );
  }

  return (
    <WebModal onBackdropClick={onClose}>
      <WebDialog
        aria-labelledby="bundle-picker-title-a11y"
        className="web-bundle-dialog"
      >
        <WebDialogHeader>
          <div>
            <WebDialogTitle id="bundle-picker-title-a11y">
              묶음으로 재료 추가
            </WebDialogTitle>
            <p className="web-modal-copy">
              {expandedBundle
                ? `${expandedBundle.name}에서 추가할 항목을 골라 주세요`
                : "자주 함께 쓰는 재료를 한 번에 추가해요"}
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

        <WebDialogBody
          className="web-bundle-body"
          style={{ overscrollBehavior: "contain" }}
        >
          {sheetState === "loading" ? <BundleLoadingSkeleton /> : null}

          {sheetState === "error" ? (
            <div className="web-modal-panel web-modal-panel-error">
              <p className="web-modal-copy">묶음 목록을 불러오지 못했어요</p>
              <WebButton onClick={() => void loadBundles()} size="sm">
                다시 시도
              </WebButton>
            </div>
          ) : null}

          {sheetState === "empty" ? (
            <div className="web-bundle-empty">
              <p className="web-modal-option-title">등록된 묶음이 없어요</p>
              <p className="web-modal-copy">
                묶음이 준비되면 여기서 한 번에 추가할 수 있어요
              </p>
            </div>
          ) : null}

          {sheetState === "ready" && expandedBundle ? (
            renderBundleDetail(expandedBundle, "web")
          ) : null}

          {sheetState === "ready" && !expandedBundle ? (
            <div className="web-bundle-list">
              {bundles.map((bundle) => (
                <button
                  className="web-bundle-trigger"
                  key={bundle.id}
                  onClick={() => handleSelectBundle(bundle.id)}
                  type="button"
                >
                  <span className="web-bundle-emoji" aria-hidden="true">
                    {getBundleEmoji(bundle.name)}
                  </span>
                  <span className="web-bundle-copy">
                    <strong>{bundle.name}</strong>
                  </span>
                  <ChevronRightIcon />
                </button>
              ))}
            </div>
          ) : null}
        </WebDialogBody>

        {sheetState === "ready" && expandedBundle ? (
          <WebDialogFooter>
            {addErrorMessage ? (
              <p className="web-modal-footer-note" role="alert">
                {addErrorMessage}
              </p>
            ) : null}
            <WebButton onClick={handleReturnToBundleList} variant="tertiary">
              목록
            </WebButton>
            <WebButton
              aria-busy={isAdding}
              aria-label={
                selectedCount > 0
                  ? `${selectedCount}개 팬트리에 추가`
                  : undefined
              }
              disabled={selectedCount === 0 || isAdding}
              onClick={() => void handleAdd()}
            >
              {isAdding
                ? "추가 중..."
                : selectedCount > 0
                  ? `${selectedCount}개 팬트리에 추가`
                  : "재료 선택"}
            </WebButton>
          </WebDialogFooter>
        ) : null}
      </WebDialog>
    </WebModal>
  );
}

interface BundleSelectionActionsProps {
  areAllMissingSelected: boolean;
  missingCount: number;
  onToggleSelection: () => void;
  selectedMissingCount: number;
}

function BundleSelectionActions({
  areAllMissingSelected,
  missingCount,
  onToggleSelection,
  selectedMissingCount,
}: BundleSelectionActionsProps) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-fill)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-extrabold text-[var(--text-2)]">
          추가할 재료 {selectedMissingCount}/{missingCount}개 선택
        </p>
        <div className="flex shrink-0 gap-1.5">
          <button
            className="h-8 rounded-[var(--radius-control)] bg-[var(--brand-soft)] px-2.5 text-[12px] font-extrabold text-[var(--brand)] disabled:opacity-45"
            disabled={missingCount === 0}
            onClick={onToggleSelection}
            type="button"
          >
            {areAllMissingSelected ? "전체 해제" : "전체 선택"}
          </button>
        </div>
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
      className="h-6 w-6 shrink-0 text-[var(--text-4)]"
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
