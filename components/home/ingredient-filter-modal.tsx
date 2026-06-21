"use client";

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ContentState } from "@/components/shared/content-state";
import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import {
  WebButton,
  WebChip,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
} from "@/components/web";
import { fetchJson } from "@/lib/api/fetch-json";
import { filterSafeDisplayItems } from "@/lib/display-safety";
import {
  ALL_INGREDIENT_CATEGORY,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
} from "@/lib/ingredient-categories";
import type { IngredientItem, IngredientListData } from "@/types/recipe";

type IngredientModalState = "loading" | "ready" | "empty" | "error";
const INGREDIENT_FILTER_DESCRIPTION = "재료를 골라 좁혀요";

interface IngredientFilterModalProps {
  isOpen: boolean;
  appliedIngredientIds: string[];
  onApply: (ingredientIds: string[]) => void;
  onClose: () => void;
}

function buildIngredientQueryString(query: string, category: string) {
  const params = new URLSearchParams();

  if (query.trim()) {
    params.set("q", query.trim());
  }

  if (category !== ALL_INGREDIENT_CATEGORY) {
    params.set("category_group_code", category);
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function IngredientFilterModal({
  isOpen,
  appliedIngredientIds,
  onApply,
  onClose,
}: IngredientFilterModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(
    ALL_INGREDIENT_CATEGORY,
  );
  const [draftIngredientIds, setDraftIngredientIds] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [screenState, setScreenState] = useState<IngredientModalState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const isDesktopViewport = useDesktopViewport();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setDraftIngredientIds(appliedIngredientIds);
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialog = dialogRef.current;

      if (!dialog) {
        return;
      }

      const focusableElements = getFocusableElements(dialog);

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey) {
        if (activeElement === firstElement || !dialog.contains(activeElement)) {
          event.preventDefault();
          lastElement.focus();
        }

        return;
      }

      if (activeElement === lastElement || !dialog.contains(activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [appliedIngredientIds, handleClose, isOpen]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setQuery("");
    setDebouncedQuery("");
    setActiveCategory(ALL_INGREDIENT_CATEGORY);
    setDraftIngredientIds(appliedIngredientIds);
  }, [appliedIngredientIds, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const currentRequestId = requestIdRef.current + 1;
    requestIdRef.current = currentRequestId;
    let isStale = false;

    setScreenState("loading");

    const requestPath = `/api/v1/ingredients${buildIngredientQueryString(
      debouncedQuery,
      activeCategory,
    )}`;

    void fetchJson<IngredientListData>(requestPath)
      .then((data) => {
        if (isStale || currentRequestId !== requestIdRef.current) {
          return;
        }

        const safeItems = filterSafeDisplayItems(
          data.items,
          (ingredient) => ingredient.standard_name,
        );
        setIngredients(safeItems);
        setScreenState(safeItems.length > 0 ? "ready" : "empty");
      })
      .catch(() => {
        if (isStale || currentRequestId !== requestIdRef.current) {
          return;
        }

        setIngredients([]);
        setScreenState("error");
      });

    return () => {
      isStale = true;
    };
  }, [activeCategory, debouncedQuery, isOpen, reloadKey]);

  const applyButtonLabel =
    draftIngredientIds.length > 0 ? `${draftIngredientIds.length}개 적용` : "적용";
  const isApplyDisabled =
    screenState === "loading" ||
    screenState === "error" ||
    (screenState === "empty" && draftIngredientIds.length === 0);

  const toggleIngredient = (ingredientId: string) => {
    setDraftIngredientIds((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId],
    );
  };

  if (!isOpen) {
    return null;
  }

  if (isDesktopViewport) {
    return (
      <WebModal onBackdropClick={handleClose}>
        <WebDialog
          aria-labelledby="ingredient-filter-title"
          className="web-ingredient-picker-dialog"
          ref={dialogRef}
          size="narrow"
        >
          <WebDialogHeader>
            <div>
              <WebDialogTitle id="ingredient-filter-title">
                재료로 검색
              </WebDialogTitle>
              <p className="web-modal-copy">{INGREDIENT_FILTER_DESCRIPTION}</p>
            </div>
            <WebIconButton
              aria-label="닫기"
              onClick={handleClose}
              ref={closeButtonRef}
            >
              <CloseIcon />
            </WebIconButton>
          </WebDialogHeader>

          <WebDialogBody>
            <label className="web-modal-search">
              <span className="visually-hidden">재료명으로 검색</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="재료명으로 검색"
                value={query}
              />
            </label>

            <div
              aria-label="카테고리 선택"
              className="web-ingredient-category-rail mt-4"
              role="group"
            >
              {INGREDIENT_CATEGORY_GROUP_OPTIONS.map((category) => (
                <WebChip
                  active={activeCategory === category.value}
                  className="web-ingredient-category-chip"
                  key={category.value}
                  onClick={() => setActiveCategory(category.value)}
                >
                  {category.label}
                </WebChip>
              ))}
            </div>

            <div className="mt-5">
              {screenState === "loading" ? (
                <div
                  aria-label="재료 목록 불러오는 중"
                  className="web-ingredient-modal-grid"
                >
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div className="web-skeleton h-[var(--control-height-md)] rounded-full" key={index} />
                  ))}
                </div>
              ) : null}

              {screenState === "error" ? (
                <div className="web-modal-panel web-modal-panel-error">
                  <p className="web-modal-copy">
                    재료 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                  </p>
                  <WebButton
                    className="mt-3"
                    onClick={() => setReloadKey((current) => current + 1)}
                    size="sm"
                  >
                    다시 시도
                  </WebButton>
                </div>
              ) : null}

              {screenState === "empty" ? (
                <div className="web-modal-panel">
                  <h2 className="web-state-title">검색 결과가 없어요</h2>
                  <p className="web-modal-copy mt-2">
                    다른 재료명으로 검색하거나 카테고리를 바꿔보세요.
                  </p>
                </div>
              ) : null}

              {screenState === "ready" ? (
                <ul className="web-ingredient-modal-grid">
                  {ingredients.map((ingredient) => {
                    const isChecked = draftIngredientIds.includes(ingredient.id);
                    const describedBy = `ingredient-${ingredient.id}-state`;

                    return (
                      <li key={ingredient.id}>
                        <label
                          className={[
                            "web-ingredient-option",
                            "web-ingredient-option-card",
                            isChecked ? "web-ingredient-option-active" : "",
                          ].join(" ")}
                          title={ingredient.standard_name}
                        >
                          <input
                            aria-label={ingredient.standard_name}
                            aria-describedby={describedBy}
                            checked={isChecked}
                            className="visually-hidden"
                            onChange={() => toggleIngredient(ingredient.id)}
                            type="checkbox"
                          />
                          <span>{ingredient.standard_name}</span>
                          <span className="visually-hidden" id={describedBy}>
                            {isChecked ? "선택됨" : "선택 안 됨"}
                          </span>
                          {isChecked ? <CheckIcon /> : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          </WebDialogBody>

          <WebDialogFooter>
            <WebButton
              disabled={draftIngredientIds.length === 0}
              onClick={() => setDraftIngredientIds([])}
              variant="tertiary"
            >
              초기화
            </WebButton>
            <WebButton
              disabled={isApplyDisabled}
              onClick={() => onApply(draftIngredientIds)}
            >
              {applyButtonLabel}
            </WebButton>
          </WebDialogFooter>
        </WebDialog>
      </WebModal>
    );
  }

  return (
    <AppBottomSheet
      ariaLabelledBy="ingredient-filter-title"
      closeButtonRef={closeButtonRef}
      description={INGREDIENT_FILTER_DESCRIPTION}
      footer={
        <div>
          <AppModalFooterActions
            cancelDisabled={draftIngredientIds.length === 0}
            cancelLabel="초기화"
            confirmDisabled={isApplyDisabled}
            confirmLabel={applyButtonLabel}
            onCancel={() => setDraftIngredientIds([])}
            onConfirm={() => onApply(draftIngredientIds)}
          />
        </div>
      }
      headerSlot={
        <>
          <label className="app-field-search mt-3 flex min-h-[var(--control-height-md)] items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[var(--shadow-1)] md:mt-4">
            <span className="visually-hidden">재료명으로 검색</span>
            <input
              className="w-full bg-transparent py-3 outline-none placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="재료명으로 검색"
              value={query}
            />
          </label>
          {/* Category rail — SelectionChipRail pill mode */}
          <div className="mt-3 md:mt-4 md:flex-wrap md:overflow-visible md:pb-0">
            <SelectionChipRail
              ariaLabel="카테고리 선택"
              chips={INGREDIENT_CATEGORY_GROUP_OPTIONS.map((cat) => ({
                value: cat.value,
                label: cat.label,
              }))}
              onSelect={setActiveCategory}
              selectedValue={activeCategory}
            />
          </div>
        </>
      }
      onClose={handleClose}
      panelRef={dialogRef}
      title="재료로 검색"
    >
      {screenState === "loading" ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              className="min-h-[54px] animate-pulse rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface-fill)]"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {screenState === "error" ? (
        <ContentState
          actionLabel="다시 시도"
          className="min-h-[240px] flex items-center justify-center"
          description="잠시 후 다시 시도하면 현재 검색 조건으로 재료를 불러와요."
          eyebrow="재료 동기화 오류"
          onAction={() => setReloadKey((current) => current + 1)}
          tone="error"
          title="재료 목록을 불러오지 못했어요"
          variant="subtle"
        />
      ) : null}

      {screenState === "empty" ? (
        <ContentState
          className="min-h-[240px] flex items-center justify-center"
          description="다른 재료명으로 검색하거나 카테고리를 바꿔보세요."
          eyebrow="검색 결과 없음"
          tone="empty"
          title="검색 결과가 없어요"
          variant="subtle"
        />
      ) : null}

      {screenState === "ready" ? (
        <ul className="grid grid-cols-2 gap-2">
          {ingredients.map((ingredient) => {
            const isChecked = draftIngredientIds.includes(ingredient.id);
            const describedBy = `ingredient-${ingredient.id}-mobile-state`;

            return (
              <li key={ingredient.id}>
                <label
                  className={`relative flex min-h-[54px] cursor-pointer items-center justify-center rounded-[var(--radius-card)] border px-3 py-2 text-center text-[15px] font-semibold transition ${
                    isChecked
                      ? "border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--foreground)]"
                      : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--foreground)]"
                  }`}
                >
                  <input
                    aria-label={ingredient.standard_name}
                    aria-describedby={describedBy}
                    checked={isChecked}
                    className="visually-hidden"
                    onChange={() => toggleIngredient(ingredient.id)}
                    type="checkbox"
                  />
                  <span className="min-w-0 truncate">{ingredient.standard_name}</span>
                  <span className="visually-hidden" id={describedBy}>
                    {isChecked ? "선택됨" : "선택 안 됨"}
                  </span>
                  {isChecked ? (
                    <span
                      aria-hidden="true"
                      className="absolute right-3 text-[15px] font-bold text-[var(--brand)]"
                    >
                      ✓
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </AppBottomSheet>
  );
}
