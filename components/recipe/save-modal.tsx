"use client";

import React from "react";

import { ModalHeader } from "@/components/shared/modal-header";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
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
    isSavingRecipe || isCreatingBook || newSelectedBookCount === 0;
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;

  return (
    <>
    {shouldRenderAppView ? (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/40 lg:hidden"
      onClick={onClose}
    >
      <div
        aria-labelledby="save-modal-title-mobile"
        aria-modal="true"
        className="max-h-[85vh] w-full overflow-y-auto rounded-t-[20px] bg-white pb-6 shadow-[0_-10px_30px_rgba(0,0,0,0.18)] lg:max-w-lg lg:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-sm bg-[#DEE2E6]" />
        </div>
        <div className="flex items-center px-5 pb-2 pt-3">
          <h2
            className="flex-1 text-[18px] font-bold leading-tight text-[#212529]"
            id="save-modal-title-mobile"
          >
            레시피 저장
          </h2>
          <button
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F8F9FA] text-[#495057] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSavingRecipe || isCreatingBook}
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        {viewState === "loading" ? (
          <div className="mx-5 mt-4 rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-4 py-5 text-[14px] text-[#5F6470]">
            저장 가능한 레시피북을 불러오는 중이에요...
          </div>
        ) : null}

        {viewState === "error" ? (
          <div className="mx-5 mt-4 rounded-[12px] border border-[#F4C7C3] bg-[#FFF1F0] px-4 py-5">
            <p className="text-[14px] font-semibold text-[#C84C48]">
              {loadErrorMessage ?? "레시피북 목록을 불러오지 못했어요."}
            </p>
            <button
              className="mt-3 min-h-11 rounded-[10px] bg-[#007A76] px-4 text-[14px] font-bold text-white"
              onClick={onRetry}
              type="button"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {viewState === "ready" ? (
          <>
            <div className="space-y-4 px-5 pb-4 pt-2">
              <p className="text-[13px] font-semibold text-[#495057]">
                레시피북 다중 선택
              </p>

              <div className="overflow-hidden rounded-[10px] border border-[#DEE2E6] bg-white">
                {books.length === 0 ? (
                  <div className="px-4 py-5 text-[14px] leading-5 text-[#5F6470]">
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
                        className="flex w-full items-center gap-2.5 border-b border-[#F1F3F5] px-4 py-3 text-left last:border-b-0 disabled:cursor-default"
                        disabled={isSavingRecipe || isCreatingBook || isAlreadySaved}
                        key={book.id}
                        onClick={() => onSelectBook(book.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={[
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border-2",
                            isSelected
                              ? "border-[#2AC1BC] bg-[#2AC1BC] text-white"
                              : "border-[#DEE2E6] bg-white",
                          ].join(" ")}
                        >
                          {isSelected ? <CheckIcon /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-extrabold text-[#212529]">
                            {book.name}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-[#5F6470]">
                            {isAlreadySaved
                              ? "이미 저장됨"
                              : isSelected
                                ? "저장 대상"
                                : "선택하면 이 책에 추가"}
                          </span>
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-[3px] text-[11px] font-extrabold",
                            isSavedBook
                              ? "bg-[#E8F8F7] text-[#007A76]"
                              : "bg-[#F8F9FA] text-[#5F6470]",
                          ].join(" ")}
                        >
                          {isAlreadySaved ? "완료" : isSavedBook ? "저장" : "내 책"}
                        </span>
                      </button>
                    );
                  })
                )}

                {!isCreateExpanded ? (
                  <button
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold text-[#007A76]"
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
                      className="min-h-10 min-w-0 flex-1 rounded-[8px] border border-[#2AC1BC] bg-white px-3 text-[14px] text-[#212529] outline-none"
                      maxLength={50}
                      onChange={(event) => onNewBookNameChange(event.target.value)}
                      placeholder="레시피북 이름"
                      value={newBookName}
                    />
                    <button
                      className="min-h-10 rounded-[8px] bg-[#007A76] px-3 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                <p className="rounded-[10px] border border-[#F4C7C3] bg-[#FFF1F0] px-4 py-3 text-[13px] font-semibold text-[#C84C48]">
                  {saveErrorMessage}
                </p>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-[#DEE2E6] bg-white px-5 pb-2 pt-3">
              <button
                className="min-h-11 basis-[88px] rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-4 text-[15px] font-bold text-[#495057] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingRecipe || isCreatingBook}
                onClick={onClose}
                type="button"
              >
                취소
              </button>
              <button
                aria-label={isSavingRecipe ? "저장 중..." : "저장"}
                className="min-h-11 flex-1 rounded-[12px] bg-[#007A76] px-4 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:bg-[#ADB5BD]"
                disabled={disableSave}
                onClick={onSaveRecipe}
                type="button"
              >
                {isSavingRecipe
                  ? "저장 중..."
                  : newSelectedBookCount > 0
                    ? `${newSelectedBookCount}개 레시피북에 추가 저장`
                    : "이미 저장됨"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
    ) : null}
    {shouldRenderWebView ? (
    <div
      className="fixed inset-0 z-40 hidden items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 lg:flex"
      onClick={onClose}
    >
      <div
        aria-labelledby="save-modal-title-desktop"
        aria-modal="true"
        className="w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--line)] border-t-2 border-t-[var(--brand)] bg-[var(--panel)] pb-6 shadow-[var(--shadow-3)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="px-6 pt-5">
          <ModalHeader
            description="저장할 레시피북을 선택하세요"
            onClose={onClose}
            title="레시피 저장"
            titleId="save-modal-title-desktop"
          />
        </div>

        {viewState === "loading" ? (
          <div className="mx-6 mt-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-5 text-sm text-[var(--muted)]">
            저장 가능한 레시피북을 불러오는 중이에요...
          </div>
        ) : null}

        {viewState === "error" ? (
          <div className="mx-6 mt-4 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-4 py-5">
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
          <div className="space-y-4 px-6 pt-2">
            <p className="text-[13px] font-semibold text-[var(--text-2)]">
              폴더 선택
            </p>

            {books.length === 0 ? (
              <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-5 text-sm text-[var(--muted)]">
                저장 가능한 레시피북이 아직 없어요. 아래에서 새 레시피북을 만들어 저장할 수 있어요.
              </div>
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-[var(--line)] bg-white">
                {books.map((book, index) => {
                  const isSelected = selectedBookIds.includes(book.id);
                  const isAlreadySaved = alreadySavedBookIdSet.has(book.id);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-[var(--foreground)] ${
                        index < books.length - 1
                          ? "border-b border-[var(--surface-subtle)]"
                          : ""
                      }`}
                      disabled={isSavingRecipe || isCreatingBook || isAlreadySaved}
                      key={book.id}
                      onClick={() => onSelectBook(book.id)}
                      type="button"
                    >
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
                      <span className="flex-1 text-sm text-[var(--foreground)]">
                        {book.name}
                        {isAlreadySaved ? (
                          <span className="ml-2 text-xs font-semibold text-[var(--olive)]">
                            이미 저장됨
                          </span>
                        ) : null}
                      </span>
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

            {saveErrorMessage ? (
              <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--brand)_20%,transparent)] bg-[color-mix(in_srgb,var(--brand)_8%,transparent)] px-4 py-3 text-sm text-[var(--brand-deep)]">
                {saveErrorMessage}
              </p>
            ) : null}

            <div className="border-t border-[var(--line)] pt-3">
              <button
                className="min-h-11 w-full rounded-[var(--radius-md)] bg-[var(--olive)] px-4 py-3 text-sm font-semibold text-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={disableSave}
                onClick={onSaveRecipe}
                type="button"
              >
                {isSavingRecipe
                  ? "저장 중..."
                  : newSelectedBookCount > 0
                    ? `${newSelectedBookCount}개 레시피북에 추가 저장`
                    : "이미 저장됨"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
    ) : null}
    </>
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
