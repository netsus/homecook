"use client";

import React, { useCallback, useEffect, useState } from "react";

import { fetchRecipeBooks } from "@/lib/api/recipe";
import type { RecipeBookSummary } from "@/types/recipe";

export interface RecipeBookSelectorProps {
  onBookSelect: (book: RecipeBookSummary) => void;
  onClose: () => void;
}

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Book Card ───────────────────────────────────────────────────────────────

interface BookCardProps {
  book: RecipeBookSummary;
  onSelect: (book: RecipeBookSummary) => void;
}

function BookCard({ book, onSelect }: BookCardProps) {
  const bookTypeLabel = {
    my_added: "직접 추가",
    saved: "저장한 레시피",
    liked: "좋아요",
    custom: "커스텀",
  }[book.book_type];

  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <h3 className="text-xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
        {book.name}
      </h3>
      <div className="mt-2 flex items-center gap-3 text-sm text-[var(--muted)]">
        <span>{bookTypeLabel}</span>
        <span>•</span>
        <span>레시피 {book.recipe_count}개</span>
      </div>
      <button
        className="mt-3 h-11 w-full rounded-[12px] bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-deep)]"
        onClick={() => onSelect(book)}
        type="button"
      >
        선택
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RecipeBookSelector({ onBookSelect, onClose }: RecipeBookSelectorProps) {
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="recipebook-selector-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[24px] px-5 py-6 md:px-6"
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

        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {loadState === "loading" && (
            <div className="py-8 text-center text-sm text-[var(--muted)]" aria-busy="true">
              레시피북 불러오는 중...
            </div>
          )}

          {loadState === "empty" && (
            <div className="py-8 text-center">
              <p className="text-base font-semibold text-[var(--foreground)]">
                레시피북이 없어요
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                레시피를 저장하면 레시피북이 생성돼요.
              </p>
            </div>
          )}

          {loadState === "error" && (
            <div
              className="rounded-[12px] border border-red-300 bg-red-50 p-4 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {loadState === "ready" && books.length > 0 && (
            <div className="space-y-3">
              {books.map((book) => (
                <BookCard key={book.id} book={book} onSelect={onBookSelect} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
