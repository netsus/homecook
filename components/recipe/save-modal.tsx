"use client";

import React from "react";

import { ModalHeader } from "@/components/shared/modal-header";
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

  const disableCreate =
    isCreatingBook || isSavingRecipe || newBookName.trim().length === 0;
  const disableSave =
    isSavingRecipe || isCreatingBook || !selectedBookId || isSelectedBookReadOnly;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 md:items-center md:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="save-modal-title"
        aria-modal="true"
        className="w-full max-w-lg rounded-t-[var(--radius-xl)] border border-[var(--line)] border-t-2 border-t-[var(--brand)] bg-[var(--panel)] pb-6 shadow-[var(--shadow-3)] md:rounded-[var(--radius-xl)] md:border-t-2 md:border-t-[var(--brand)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
        </div>
        {/* Header — D2: no eyebrow · D3: icon-only close · D5: title=레시피 저장 */}
        <div className="px-5 pt-3 md:px-6 md:pt-5">
          <ModalHeader
            description="저장할 레시피북을 선택하세요"
            onClose={onClose}
            title="레시피 저장"
            titleId="save-modal-title"
          />
        </div>

        {viewState === "loading" ? (
          <div className="mx-5 mt-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-5 text-sm text-[var(--muted)] md:mx-6">
            저장 가능한 레시피북을 불러오는 중이에요...
          </div>
        ) : null}

        {viewState === "error" ? (
          <div className="mx-5 mt-4 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-4 py-5 md:mx-6">
            <p className="text-sm font-semibold text-[var(--brand-deep)]">
              {loadErrorMessage ?? "레시피북 목록을 불러오지 못했어요."}
            </p>
            <button
              className="mt-3 rounded-[var(--radius-md)] bg-[var(--olive)] px-4 py-2 text-sm font-semibold text-[var(--surface)]"
              onClick={onRetry}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {viewState === "ready" ? (
          <div className="space-y-4 px-5 pt-2 md:px-6">
            {/* Section label — prototype: 폴더 선택 */}
            <p className="text-[13px] font-semibold text-[var(--text-2)]">폴더 선택</p>

            {books.length === 0 ? (
              <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-5 text-sm text-[var(--muted)]">
                저장 가능한 레시피북이 아직 없어요. 아래에서 새 레시피북을 만들어 저장할 수 있어요.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-[var(--line)] bg-white">
                {books.map((book, index) => {
                  const isSelected = selectedBookId === book.id;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--foreground)] ${
                        index < books.length - 1
                          ? "border-b border-[var(--surface-subtle)]"
                          : ""
                      }`}
                      key={book.id}
                      onClick={() => onSelectBook(book.id)}
                      type="button"
                    >
                      {/* Radio circle indicator */}
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected
                            ? "border-[var(--olive)] bg-[var(--olive)]"
                            : "border-[var(--line)] bg-white"
                        }`}
                      >
                        {isSelected ? (
                          <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                        ) : null}
                      </span>
                      <span className="flex-1 text-sm text-[var(--foreground)]">{book.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                새 레시피북 만들기
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]"
                  maxLength={50}
                  onChange={(event) => onNewBookNameChange(event.target.value)}
                  placeholder="예: 주말 파티"
                  value={newBookName}
                />
                <button
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={disableCreate}
                  onClick={onCreateBook}
                  type="button"
                >
                  {isCreatingBook ? "생성 중..." : "생성"}
                </button>
              </div>
            </div>

            {isSelectedBookReadOnly ? (
              <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--olive)_25%,transparent)] bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] px-4 py-3 text-sm text-[var(--olive)]">
                이미 선택한 레시피북에 저장된 레시피예요. 다른 레시피북을 선택해 주세요.
              </p>
            ) : null}

            {saveErrorMessage ? (
              <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-4 py-3 text-sm text-[var(--brand-deep)]">
                {saveErrorMessage}
              </p>
            ) : null}

            {/* Footer CTA — separated by border-top like prototype */}
            <div className="border-t border-[var(--line)] pt-3">
              <button
                className="min-h-11 w-full rounded-[var(--radius-md)] bg-[var(--olive)] px-4 py-3 text-sm font-semibold text-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disableSave}
                onClick={onSaveRecipe}
                type="button"
              >
                {isSavingRecipe ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
