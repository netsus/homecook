"use client";

import React from "react";

import type { RecipeBookSummary } from "@/types/recipe";

type SaveModalViewState = "loading" | "ready" | "error";

interface SaveModalProps {
  isOpen: boolean;
  viewState: SaveModalViewState;
  books: RecipeBookSummary[];
  selectedBookId: string | null;
  newBookName: string;
  isCreatingBook: boolean;
  isSavingRecipe: boolean;
  isSelectedBookReadOnly: boolean;
  loadErrorMessage: string | null;
  saveErrorMessage: string | null;
  onClose: () => void;
  onRetry: () => void;
  onSelectBook: (bookId: string) => void;
  onNewBookNameChange: (value: string) => void;
  onCreateBook: () => void;
  onSaveRecipe: () => void;
}

function getBookTypeLabel(bookType: RecipeBookSummary["book_type"]) {
  if (bookType === "saved") {
    return "저장한 레시피";
  }

  return "커스텀";
}

export function SaveModal({
  isOpen,
  viewState,
  books,
  selectedBookId,
  newBookName,
  isCreatingBook,
  isSavingRecipe,
  isSelectedBookReadOnly,
  loadErrorMessage,
  saveErrorMessage,
  onClose,
  onRetry,
  onSelectBook,
  onNewBookNameChange,
  onCreateBook,
  onSaveRecipe,
}: SaveModalProps) {
  if (!isOpen) {
    return null;
  }

  const disableCreate = isCreatingBook || isSavingRecipe || newBookName.trim().length === 0;
  const disableSave =
    isSavingRecipe
    || isCreatingBook
    || !selectedBookId
    || isSelectedBookReadOnly;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/50 p-4 md:items-center md:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="save-modal-title"
        aria-modal="true"
        className="glass-panel w-full max-w-lg rounded-[20px] px-5 py-6 md:px-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Save Recipe
            </p>
            <h2
              className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]"
              id="save-modal-title"
            >
              저장할 레시피북을 선택하세요
            </h2>
          </div>
          <button
            aria-label="저장 모달 닫기"
            className="rounded-full border border-[var(--line)] px-3 py-1 text-sm text-[var(--muted)]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        {viewState === "loading" ? (
          <div className="mt-5 rounded-[16px] border border-[var(--line)] bg-white/75 px-4 py-5 text-sm text-[var(--muted)]">
            저장 가능한 레시피북을 불러오는 중이에요...
          </div>
        ) : null}

        {viewState === "error" ? (
          <div className="mt-5 rounded-[16px] border border-[color:rgba(255,108,60,0.2)] bg-[color:rgba(255,108,60,0.08)] px-4 py-5">
            <p className="text-sm font-semibold text-[var(--brand-deep)]">
              {loadErrorMessage ?? "레시피북 목록을 불러오지 못했어요."}
            </p>
            <button
              className="mt-3 rounded-[12px] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
              onClick={onRetry}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {viewState === "ready" ? (
          <div className="mt-5 space-y-4">
            {books.length === 0 ? (
              <div className="rounded-[16px] border border-[var(--line)] bg-white/75 px-4 py-5 text-sm text-[var(--muted)]">
                저장 가능한 레시피북이 아직 없어요. 아래에서 새 레시피북을 만들어 저장할 수 있어요.
              </div>
            ) : (
              <div className="space-y-2">
                {books.map((book) => {
                  const isSelected = selectedBookId === book.id;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`flex min-h-11 w-full items-center justify-between rounded-[12px] border px-4 py-3 text-left text-sm ${
                        isSelected
                          ? "border-transparent bg-[color:rgba(255,108,60,0.12)] text-[var(--brand-deep)]"
                          : "border-[var(--line)] bg-white text-[var(--foreground)]"
                      }`}
                      key={book.id}
                      onClick={() => onSelectBook(book.id)}
                      type="button"
                    >
                      <span className="font-semibold">{book.name}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {getBookTypeLabel(book.book_type)} · {book.recipe_count}개
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-[16px] border border-[var(--line)] bg-white/70 p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                새 레시피북 만들기
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  className="min-h-11 flex-1 rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--foreground)]"
                  maxLength={50}
                  onChange={(event) => onNewBookNameChange(event.target.value)}
                  placeholder="예: 주말 파티"
                  value={newBookName}
                />
                <button
                  className="min-h-11 rounded-[12px] border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={disableCreate}
                  onClick={onCreateBook}
                  type="button"
                >
                  {isCreatingBook ? "생성 중..." : "생성"}
                </button>
              </div>
            </div>

            {isSelectedBookReadOnly ? (
              <p className="rounded-[12px] border border-[color:rgba(46,166,122,0.25)] bg-[color:rgba(46,166,122,0.12)] px-4 py-3 text-sm text-[var(--olive)]">
                이미 선택한 레시피북에 저장된 레시피예요. 다른 레시피북을 선택해 주세요.
              </p>
            ) : null}

            {saveErrorMessage ? (
              <p className="rounded-[12px] border border-[color:rgba(255,108,60,0.2)] bg-[color:rgba(255,108,60,0.08)] px-4 py-3 text-sm text-[var(--brand-deep)]">
                {saveErrorMessage}
              </p>
            ) : null}

            <button
              className="min-h-11 w-full rounded-[12px] bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={disableSave}
              onClick={onSaveRecipe}
              type="button"
            >
              {isSavingRecipe ? "저장 중..." : "저장"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
