"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContentState } from "@/components/shared/content-state";
import { ModalHeader } from "@/components/shared/modal-header";
import { SelectionChipRail } from "@/components/shared/selection-chip-rail";
import { fetchJson } from "@/lib/api/fetch-json";
import type { IngredientItem, IngredientListData } from "@/types/recipe";

const ALL_CATEGORY = "전체";
const CATEGORY_OPTIONS = [
  ALL_CATEGORY,
  "채소",
  "육류",
  "해산물",
  "양념",
  "유제품",
  "곡류",
  "기타",
] as const;

type IngredientModalState = "loading" | "ready" | "empty" | "error";

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

  if (category !== ALL_CATEGORY) {
    params.set("category", category);
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

export function IngredientFilterModal({
  isOpen,
  appliedIngredientIds,
  onApply,
  onClose,
}: IngredientFilterModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY);
  const [draftIngredientIds, setDraftIngredientIds] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState<IngredientItem[]>([]);
  const [screenState, setScreenState] = useState<IngredientModalState>("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

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
    setActiveCategory(ALL_CATEGORY);
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

        setIngredients(data.items);
        setScreenState(data.items.length > 0 ? "ready" : "empty");
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

  const selectionMessage = useMemo(() => {
    if (draftIngredientIds.length === 0) {
      return "재료를 선택해 레시피를 좁혀보세요";
    }

    return `${draftIngredientIds.length}개 선택됨`;
  }, [draftIngredientIds.length]);
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-0 backdrop-blur-[1px] md:items-center md:justify-center md:p-4"
      onClick={handleClose}
    >
      <div
        aria-labelledby="ingredient-filter-title"
        aria-modal="true"
        className="flex max-h-[min(88vh,42rem)] w-full flex-col rounded-t-[var(--radius-xl)] border border-[var(--line)] border-t-2 border-t-[var(--brand)] bg-[var(--panel)] shadow-[var(--shadow-3)] md:max-h-[85vh] md:max-w-2xl md:rounded-[var(--radius-xl)] md:border-t-2 md:border-t-[var(--brand)]"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="border-b border-[var(--line)] px-5 pb-5 pt-4 md:px-6">
          <div className="mx-auto h-1 w-9 rounded-sm bg-[var(--line)] md:hidden" />
          {/* D2: no eyebrow · D3: icon-only close · closeButtonRef for focus management */}
          <div className="mt-4">
            <ModalHeader
              badge={
                draftIngredientIds.length > 0 ? (
                  <span className="rounded-[var(--radius-full)] border border-[color-mix(in_srgb,var(--olive)_16%,transparent)] bg-[color-mix(in_srgb,var(--olive)_10%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--olive)]">
                    {draftIngredientIds.length}개 선택
                  </span>
                ) : undefined
              }
              closeButtonRef={closeButtonRef}
              description="원하는 재료를 골라 레시피를 좁혀요"
              onClose={handleClose}
              title="재료로 검색"
              titleId="ingredient-filter-title"
            />
          </div>
          <label className="mt-3 flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[var(--shadow-1)] md:mt-4">
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
              chips={CATEGORY_OPTIONS.map((cat) => ({ value: cat, label: cat }))}
              onSelect={setActiveCategory}
              selectedValue={activeCategory}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:min-h-[280px] md:px-6">
          {screenState === "loading" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  className="min-h-11 animate-pulse rounded-[var(--radius-full)] border border-[var(--line)] bg-[var(--surface-fill)]"
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
            <ul className="grid gap-3 sm:grid-cols-2">
              {ingredients.map((ingredient) => {
                const isChecked = draftIngredientIds.includes(ingredient.id);

                return (
                  <li key={ingredient.id}>
                    <label
                      className={`flex min-h-11 cursor-pointer items-center rounded-[var(--radius-full)] border px-4 py-2 text-sm font-semibold transition ${
                        isChecked
                          ? "border-[var(--olive)] bg-[var(--olive)] text-[var(--surface)]"
                          : "border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)]"
                      }`}
                    >
                      <input
                        checked={isChecked}
                        className="visually-hidden"
                        onChange={() => toggleIngredient(ingredient.id)}
                        type="checkbox"
                      />
                      <span>{ingredient.standard_name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="border-t border-[var(--line)] px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {selectionMessage}
              </p>
              <p className="text-xs text-[var(--muted)]">
                선택 재료가 모두 포함된 레시피만 보여줘요.
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
              <button
                className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius-full)] border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-center text-sm font-semibold text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={draftIngredientIds.length === 0}
                onClick={() => setDraftIngredientIds([])}
                type="button"
              >
                초기화
              </button>
              <button
                className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-[var(--radius-full)] bg-[var(--olive)] px-5 py-2 text-center text-sm font-semibold text-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isApplyDisabled}
                onClick={() => onApply(draftIngredientIds)}
                type="button"
              >
                {applyButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
