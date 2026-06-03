"use client";

import React from "react";

import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
} from "@/components/web";
import type { RecipeBookSummary } from "@/types/recipe";

type SaveModalViewState = "loading" | "ready" | "error";

interface SaveModalProps {
  alreadySavedBookIds?: string[];
  isOpen: boolean;
  viewState: SaveModalViewState;
  books: RecipeBookSummary[];
  selectedBookIds: string[];
  newBookName: string;
  isCreatingBook: boolean;
  isSavingRecipe: boolean;
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
  alreadySavedBookIds = [],
  isOpen,
  viewState,
  books,
  selectedBookIds,
  newBookName,
  isCreatingBook,
  isSavingRecipe,
  loadErrorMessage,
  saveErrorMessage,
  onClose,
  onRetry,
  onSelectBook,
  onNewBookNameChange,
  onCreateBook,
  onSaveRecipe,
}: SaveModalProps) {
  const [isCreateExpanded, setIsCreateExpanded] = React.useState(false);
  const isDesktopViewport = useDesktopViewport();
  const alreadySavedBookIdSet = React.useMemo(
    () => new Set(alreadySavedBookIds),
    [alreadySavedBookIds],
  );
  const newSelectedBookCount = selectedBookIds.filter(
    (bookId) => !alreadySavedBookIdSet.has(bookId),
  ).length;
  const removedBookCount = alreadySavedBookIds.filter(
    (bookId) => !selectedBookIds.includes(bookId),
  ).length;
  const changedBookCount = newSelectedBookCount + removedBookCount;

  React.useEffect(() => {
    if (!isOpen) {
      setIsCreateExpanded(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const disableCreate =
    isCreatingBook || isSavingRecipe || newBookName.trim().length === 0;
  const disableSave =
    isSavingRecipe || isCreatingBook || changedBookCount === 0;
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;

  return (
    <>
    {shouldRenderAppView ? (
    <div className="lg:hidden">
      <AppBottomSheet
        ariaLabelledBy="save-modal-title-mobile"
        closeDisabled={isSavingRecipe || isCreatingBook}
        description="저장할 레시피북을 선택하세요"
        footer={
          viewState === "ready" ? (
            <AppModalFooterActions
              cancelDisabled={isSavingRecipe || isCreatingBook}
              confirmAriaLabel={isSavingRecipe ? "저장 중..." : "저장"}
              confirmDisabled={disableSave}
              confirmLabel={
                isSavingRecipe
                  ? "저장 중..."
                  : formatSaveConfirmLabel(
                      newSelectedBookCount,
                      removedBookCount,
                      alreadySavedBookIds.length > 0,
                    )
              }
              onCancel={onClose}
              onConfirm={onSaveRecipe}
            />
          ) : null
        }
        onClose={onClose}
        title="레시피 저장"
      >
        {viewState === "loading" ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-4 py-5 text-[14px] text-[var(--text-2)]">
            저장 가능한 레시피북을 불러오는 중이에요...
          </div>
        ) : null}

        {viewState === "error" ? (
          <div className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-5">
            <p className="text-[14px] font-semibold text-[var(--danger-strong)]">
              {loadErrorMessage ?? "레시피북 목록을 불러오지 못했어요."}
            </p>
            <button
              className="mt-3 min-h-[var(--control-height-md)] rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[14px] font-bold text-[var(--text-inverse)]"
              onClick={onRetry}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {viewState === "ready" ? (
            <div className="space-y-4">
              <p className="text-[13px] font-semibold text-[var(--text-2)]">
                레시피북 다중 선택
              </p>

              <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)]">
                {books.length === 0 ? (
                  <div className="px-4 py-5 text-[14px] leading-5 text-[var(--text-2)]">
                    저장 가능한 레시피북이 아직 없어요. 아래에서 새 레시피북을 만들어 저장할 수 있어요.
                  </div>
                ) : (
                  books.map((book) => {
                    const isSelected = selectedBookIds.includes(book.id);
                    const isSavedBook = book.book_type === "saved";
                    const isAlreadySaved = alreadySavedBookIdSet.has(book.id);

                    return (
                      <button
                        aria-pressed={isSelected}
                        className="flex w-full items-center gap-2.5 border-b border-[var(--surface-subtle)] px-4 py-3 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isSavingRecipe || isCreatingBook}
                        key={book.id}
                        onClick={() => onSelectBook(book.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={[
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-badge)] border-2",
                            isSelected
                              ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]"
                              : "border-[var(--line-strong)] bg-[var(--surface)]",
                          ].join(" ")}
                        >
                          {isSelected ? <CheckIcon /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-extrabold text-[var(--foreground)]">
                            {book.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[var(--text-2)]">
                            {getBookSelectionMeta({ isAlreadySaved, isSelected })}
                          </span>
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-[3px] text-[11px] font-extrabold",
                            isSavedBook
                              ? "bg-[var(--brand-soft)] text-[var(--brand)]"
                              : "bg-[var(--surface-fill)] text-[var(--text-2)]",
                          ].join(" ")}
                        >
                          {getBookSelectionBadge({
                            isAlreadySaved,
                            isSavedBook,
                            isSelected,
                          })}
                        </span>
                      </button>
                    );
                  })
                )}

                {!isCreateExpanded ? (
                  <button
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold text-[var(--brand)]"
                    onClick={() => setIsCreateExpanded(true)}
                    type="button"
                  >
                    <span className="text-[18px] leading-none">+</span>
                    새 레시피북 만들기
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <input
                      autoFocus
                      className="min-h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-[var(--brand)] bg-[var(--surface)] px-3 text-[14px] text-[var(--foreground)] outline-none"
                      maxLength={50}
                      onChange={(event) => onNewBookNameChange(event.target.value)}
                      placeholder="레시피북 이름"
                      value={newBookName}
                    />
                    <button
                      className="min-h-10 rounded-[var(--radius-control)] bg-[var(--brand)] px-3 text-[13px] font-bold text-[var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={disableCreate}
                      onClick={onCreateBook}
                      type="button"
                    >
                      {isCreatingBook ? "추가 중..." : "추가"}
                    </button>
                  </div>
                )}
              </div>

              {saveErrorMessage ? (
                <p className="rounded-[var(--radius-control)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--danger-strong)]">
                  {saveErrorMessage}
                </p>
              ) : null}
            </div>
        ) : null}
      </AppBottomSheet>
    </div>
    ) : null}
    {shouldRenderWebView ? (
    <div className="hidden lg:block">
      <WebModal onBackdropClick={onClose}>
        <WebDialog
          aria-labelledby="save-modal-title-desktop"
          size="default"
        >
          <WebDialogHeader>
            <div>
              <WebDialogTitle id="save-modal-title-desktop">
                레시피 저장
              </WebDialogTitle>
              <p className="web-modal-copy">저장할 레시피북을 선택하세요</p>
            </div>
            <WebIconButton
              aria-label="닫기"
              disabled={isSavingRecipe || isCreatingBook}
              onClick={onClose}
            >
              <CloseIcon />
            </WebIconButton>
          </WebDialogHeader>

        {viewState === "loading" ? (
          <WebDialogBody>
            <div className="web-modal-panel">
              저장 가능한 레시피북을 불러오는 중이에요...
            </div>
          </WebDialogBody>
        ) : null}

        {viewState === "error" ? (
          <WebDialogBody>
            <div className="web-modal-panel web-modal-panel-error">
              <p className="web-modal-copy">
                {loadErrorMessage ?? "레시피북 목록을 불러오지 못했어요."}
              </p>
              <WebButton className="mt-3" onClick={onRetry} size="sm">
                다시 시도
              </WebButton>
            </div>
          </WebDialogBody>
        ) : null}

        {viewState === "ready" ? (
          <>
          <WebDialogBody>
            <p className="web-modal-section-label">폴더 선택</p>

            {books.length === 0 ? (
              <div className="web-modal-panel">
                저장 가능한 레시피북이 아직 없어요. 아래에서 새 레시피북을 만들어 저장할 수 있어요.
              </div>
            ) : (
              <div className="web-modal-list">
                {books.map((book) => {
                  const isSelected = selectedBookIds.includes(book.id);
                  const isAlreadySaved = alreadySavedBookIdSet.has(book.id);
                  const isSavedBook = book.book_type === "saved";

                  return (
                    <button
                      aria-pressed={isSelected}
                      className="web-modal-option"
                      disabled={isSavingRecipe || isCreatingBook}
                      key={book.id}
                      onClick={() => onSelectBook(book.id)}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "web-check-dot",
                          isSelected ? "web-check-dot-active" : "",
                        ].join(" ")}
                      >
                        {isSelected ? <CheckIcon /> : null}
                      </span>
                      <span className="web-modal-option-main">
                        <span className="web-modal-option-title">{book.name}</span>
                        <span className="web-modal-option-meta">
                          {getBookSelectionMeta({ isAlreadySaved, isSelected })}
                        </span>
                      </span>
                      <span
                        className={[
                          "web-modal-badge",
                          isSavedBook || isAlreadySaved ? "web-modal-badge-brand" : "",
                        ].join(" ")}
                      >
                        {getBookSelectionBadge({
                          isAlreadySaved,
                          isSavedBook,
                          isSelected,
                        })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="web-modal-panel web-modal-create">
              <p className="web-modal-section-label">새 레시피북 만들기</p>
              <div className="web-modal-create-row">
                <input
                  className="web-modal-input"
                  maxLength={50}
                  onChange={(event) => onNewBookNameChange(event.target.value)}
                  placeholder="예: 주말 파티"
                  value={newBookName}
                />
                <WebButton
                  disabled={disableCreate}
                  onClick={onCreateBook}
                  variant="tertiary"
                >
                  {isCreatingBook ? "생성 중..." : "생성"}
                </WebButton>
              </div>
            </div>

            {saveErrorMessage ? (
              <p className="web-modal-panel web-modal-panel-error mt-4">
                {saveErrorMessage}
              </p>
            ) : null}
          </WebDialogBody>
          <WebDialogFooter>
              <WebButton
                disabled={isSavingRecipe || isCreatingBook}
                onClick={onClose}
                variant="tertiary"
              >
                취소
              </WebButton>
              <WebButton disabled={disableSave} onClick={onSaveRecipe}>
                {isSavingRecipe
                  ? "저장 중..."
                  : formatSaveConfirmLabel(
                      newSelectedBookCount,
                      removedBookCount,
                      alreadySavedBookIds.length > 0,
                    )}
              </WebButton>
          </WebDialogFooter>
          </>
        ) : null}
        </WebDialog>
      </WebModal>
    </div>
    ) : null}
    </>
  );
}

function formatSaveConfirmLabel(
  addCount: number,
  removeCount: number,
  hasExistingSave: boolean,
) {
  if (addCount > 0 && removeCount > 0) {
    return `${addCount}개 추가 · ${removeCount}개 저장 해제`;
  }

  if (addCount > 0) {
    return hasExistingSave
      ? `${addCount}개 레시피북에 추가 저장`
      : `${addCount}개 레시피북에 저장`;
  }

  if (removeCount > 0) {
    return `${removeCount}개 저장 해제`;
  }

  return "변경 없음";
}

function getBookSelectionMeta({
  isAlreadySaved,
  isSelected,
}: {
  isAlreadySaved: boolean;
  isSelected: boolean;
}) {
  if (isAlreadySaved) {
    return isSelected ? "이미 저장됨" : "저장 해제 예정";
  }

  return isSelected ? "저장 대상" : "선택하면 이 책에 추가";
}

function getBookSelectionBadge({
  isAlreadySaved,
  isSavedBook,
  isSelected,
}: {
  isAlreadySaved: boolean;
  isSavedBook: boolean;
  isSelected: boolean;
}) {
  if (isAlreadySaved && !isSelected) {
    return "해제";
  }

  if (isAlreadySaved) {
    return "저장됨";
  }

  return isSavedBook ? "저장" : "내 책";
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
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
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
