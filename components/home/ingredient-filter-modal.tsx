"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ContentState } from "@/components/shared/content-state";
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
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-0 backdrop-blur-[1px] md:items-center md:justify-center md:p-4"
      onClick={handleClose}
    >
      <div
        aria-labelledby="ingredient-filter-title"
        aria-modal="true"
        className="glass-panel flex max-h-[min(88vh,42rem)] w-full flex-col rounded-t-[24px] bg-[var(--panel)] md:max-h-[85vh] md:max-w-2xl md:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
      >
        <div className="border-b border-[var(--line)] px-5 pb-5 pt-4 md:px-6">
          <div className="mx-auto h-1.5 w-14 rounded-full bg-black/10 md:hidden" />
          <div className="mt-4 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                재료 필터
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className="text-[1.4rem] font-extrabold tracking-[-0.02em] text-[var(--foreground)] md:text-2xl"
                  id="ingredient-filter-title"
                >
                  재료로 검색
                </h2>
                {draftIngredientIds.length > 0 ? (
                  <span className="rounded-full border border-[color:rgba(46,166,122,0.16)] bg-[color:rgba(46,166,122,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[var(--olive)]">
                    {draftIngredientIds.length}개 선택
                  </span>
                ) : null}
              </div>
            </div>
            <button
              aria-label="닫기"
              className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
              onClick={handleClose}
              ref={closeButtonRef}
              type="button"
            >
              닫기
            </button>
          </div>
          <label className="mt-3 flex min-h-11 items-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[var(--shadow)] md:mt-4">
            <span className="visually-hidden">재료명으로 검색</span>
            <input
              className="w-full bg-transparent py-3 outline-none placeholder:text-[var(--muted)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="재료명으로 검색"
              value={query}
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 md:mt-4 md:flex-wrap md:overflow-visible md:pb-0">
            {CATEGORY_OPTIONS.map((category) => {
              const isActive = activeCategory === category;

              return (
                <button
                  aria-pressed={isActive}
                  className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--foreground)]"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[var(--olive)] hover:text-[var(--olive)]"
                  }`}
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  type="button"
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:min-h-[280px] md:px-6">
          {screenState === "loading" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  className="min-h-11 animate-pulse rounded-full border border-[var(--line)] bg-white/70"
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
                      className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        isChecked
                          ? "border-[var(--olive)] bg-[var(--olive)] text-white"
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
                className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-center text-sm font-semibold text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={draftIngredientIds.length === 0}
                onClick={() => setDraftIngredientIds([])}
                type="button"
              >
                초기화
              </button>
              <button
                className="flex min-h-11 items-center justify-center whitespace-nowrap rounded-full bg-[var(--brand)] px-5 py-2 text-center text-sm font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
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
