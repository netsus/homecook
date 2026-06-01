"use client";

import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import {
  WebEmptyState,
  WebListRow,
  WebSkeleton,
} from "@/components/web";
import { fetchRecipeBooks } from "@/lib/api/recipe";
import type { RecipeBookSummary } from "@/types/recipe";

type RecipeBookPresentation = "dialog" | "screen" | "web" | "sheet";

export interface RecipeBookSelectorProps {
  onBookSelect: (book: RecipeBookSummary) => void;
  onClose: () => void;
  onBack?: () => void;
  presentation?: RecipeBookPresentation;
  slotLabel?: string;
}

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Book Card ───────────────────────────────────────────────────────────────

interface BookCardProps {
  book: RecipeBookSummary;
  onSelect: (book: RecipeBookSummary) => void;
  presentation?: RecipeBookPresentation;
}

function BookCard({ book, onSelect, presentation = "dialog" }: BookCardProps) {
  const hasRecipes = book.recipe_count > 0;
  const bookTypeLabel = {
    my_added: "직접 추가",
    saved: "저장한 레시피",
    liked: "좋아요",
    custom: "커스텀",
  }[book.book_type];
  const screenSubtitle = bookTypeLabel;
  const screenIcon =
    {
      "저장한 레시피": "🔖",
      "평일 저녁 빠른요리": "🍳",
      "주말 한 상 차림": "🍽️",
    }[book.name] ?? (book.book_type === "liked" ? "💚" : book.book_type === "custom" ? "🍳" : "🔖");

  if (presentation === "screen" || presentation === "sheet") {
    return (
      <button
        className={[
          "mb-2 flex min-h-[74px] w-full items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3.5 text-left",
          hasRecipes
            ? "border-[var(--line-strong)] bg-[var(--surface)] active:border-[var(--brand)] active:bg-[var(--brand-soft)]"
            : "border-[var(--surface-subtle)] bg-[var(--surface-fill)]",
        ].join(" ")}
        onClick={() => onSelect(book)}
        type="button"
      >
        <span className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface)] text-[20px] shadow-[inset_0_0_0_1px_var(--line-strong)]">
          {screenIcon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-[var(--foreground)]">{book.name}</span>
            <span className="shrink-0 rounded-[var(--radius-badge)] bg-[var(--brand-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand)]">
              {hasRecipes ? `${book.recipe_count}개` : "비어 있음"}
            </span>
          </span>
          <span className="mt-0.5 block text-[12px] text-[var(--text-3)]">{screenSubtitle}</span>
        </span>
        <span className="text-[22px] text-[var(--text-4)]" aria-hidden="true">
          ›
        </span>
        <span className="sr-only">선택</span>
      </button>
    );
  }

  if (presentation === "web") {
    return (
      <button
        className="web-picker-book-button"
        onClick={() => onSelect(book)}
        type="button"
      >
        <WebListRow interactive className="web-picker-book-row">
          <span className="web-picker-book-thumb" aria-hidden="true">
            {screenIcon}
          </span>
          <span className="web-picker-book-copy">
            <span>{book.name}</span>
            <small>{screenSubtitle}</small>
          </span>
          <span className="web-picker-count-badge">
            {hasRecipes ? `${book.recipe_count}개` : "비어 있음"}
          </span>
        </WebListRow>
      </button>
    );
  }

  return (
    <div className="rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_var(--shadow-color-soft)]">
      <h3 className="text-xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
        {book.name}
      </h3>
      <div className="mt-2 flex items-center gap-3 text-sm text-[var(--muted)]">
        <span>{bookTypeLabel}</span>
        <span>•</span>
        <span>레시피 {book.recipe_count}개</span>
      </div>
      <button
        className="mt-3 h-[var(--control-height-md)] w-full rounded-[var(--radius-card)] bg-[var(--brand)] text-base font-semibold text-[var(--text-inverse)] hover:bg-[var(--brand-deep)]"
        onClick={() => onSelect(book)}
        type="button"
      >
        선택
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RecipeBookSelector({
  onBookSelect,
  onClose,
  onBack,
  presentation = "dialog",
  slotLabel,
}: RecipeBookSelectorProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [books, setBooks] = useState<RecipeBookSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadBooks = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    const response = await fetchRecipeBooks();

    if (!response.success || !response.data) {
      setLoadState("error");
      setErrorMessage(response.error?.message ?? "레시피북 목록을 불러오지 못했어요.");
      setBooks([]);
      return;
    }

    if (response.data.books.length === 0) {
      setLoadState("empty");
      setBooks([]);
    } else {
      setLoadState("ready");
      setBooks(response.data.books);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const content = (
    <>
      {loadState === "loading" && (
        <div className={presentation === "web" ? "space-y-2" : "py-8 text-center text-sm text-[var(--muted)]"} aria-busy="true">
          {presentation === "web" ? (
            Array.from({ length: 4 }).map((_, index) => (
              <WebSkeleton className="h-[78px]" key={index} />
            ))
          ) : (
            "레시피북 불러오는 중..."
          )}
        </div>
      )}

      {loadState === "empty" && (
        presentation === "web" ? (
          <WebEmptyState
            description="레시피를 저장하면 레시피북이 생성돼요."
            icon="📖"
            title="레시피북이 없어요"
          />
        ) : (
          <div className="py-8 text-center">
            <p className="text-base font-semibold text-[var(--foreground)]">
              레시피북이 없어요
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              레시피를 저장하면 레시피북이 생성돼요.
            </p>
          </div>
        )
      )}

      {loadState === "error" && (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {loadState === "ready" && books.length > 0 && (
        <div className={presentation === "screen" || presentation === "sheet" ? "" : presentation === "web" ? "space-y-2" : "space-y-3"}>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onSelect={onBookSelect}
              presentation={presentation}
            />
          ))}
        </div>
      )}
    </>
  );

  if (presentation === "web") {
    return (
      <section className="web-picker-section" aria-label="레시피북 선택">
        {slotLabel ? <p className="web-picker-subtle">대상 · {slotLabel}</p> : null}
        {content}
      </section>
    );
  }

  if (presentation === "sheet") {
    return (
      <>
        {slotLabel ? (
          <p className="mb-3 text-[12px] font-bold leading-[1.5] text-[var(--brand)]">
            대상 · {slotLabel}
          </p>
        ) : null}
        {content}
      </>
    );
  }

  if (presentation === "screen") {
    return (
      <div className="min-h-screen bg-[var(--surface-fill)] pb-[112px] text-[var(--foreground)]">
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-2">
          <AppBackButton onClick={onBack ?? onClose} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[var(--foreground)]">
            레시피북에서 추가
          </h1>
          <AppBackButtonSpacer />
        </div>
        <div className="p-4 pb-[112px]">
          {slotLabel ? (
            <p className="mb-3 text-[12px] font-bold leading-[1.5] text-[var(--brand)]">
              대상 · {slotLabel}
            </p>
          ) : null}
          {content}
        </div>
        <Wave1MobileBottomTab ariaLabel="레시피북 선택 하단 탭" currentTab="planner" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[var(--overlay-42)] p-4 backdrop-blur-[1px] lg:items-center lg:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="recipebook-selector-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[var(--radius-sheet)] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-xl font-bold text-[var(--foreground)]"
            id="recipebook-selector-title"
          >
            레시피북 선택
          </h2>
          <button
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--line)]"
            onClick={onClose}
            type="button"
          >
            <svg
              fill="none"
              height="20"
              viewBox="0 0 20 20"
              width="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 5L15 15M5 15L15 5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">{content}</div>
      </div>
    </div>
  );
}
