"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import type { UserProfileData } from "@/lib/api/mypage";
import type { RecipeBookSummary } from "@/types/recipe";
import type { ShoppingListHistoryItem } from "@/types/shopping";

export type MypageMobileSurface = "home" | "recipebook" | "shopping";

interface MypageMobileScreenProps {
  books: RecipeBookSummary[];
  createInputRef: React.RefObject<HTMLInputElement | null>;
  createName: string;
  customBooks: RecipeBookSummary[];
  deleteTarget: RecipeBookSummary | null;
  isCreating: boolean;
  isDeleting: boolean;
  isLoadingMore: boolean;
  isRenaming: boolean;
  menuOpenBookId: string | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  profile: UserProfileData | null;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  renamingBookId: string | null;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
  shoppingHasNext: boolean;
  shoppingItems: ShoppingListHistoryItem[];
  shoppingLoaded: boolean;
  showCreateInput: boolean;
  surface: MypageMobileSurface;
  systemBooks: RecipeBookSummary[];
  onCancelCreate: () => void;
  onCancelRename: () => void;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: () => void;
  onConfirmRename: () => void;
  onCreateBook: () => void;
  onCreateNameChange: (value: string) => void;
  onMenuClose: () => void;
  onMenuOpen: (id: string) => void;
  onRenameStart: (book: RecipeBookSummary) => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: (book: RecipeBookSummary) => void;
  onShowCreateInput: () => void;
  onSurfaceChange: (surface: MypageMobileSurface) => void;
}

const mobileFontFamily =
  '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

export function MypageMobileScreen({
  books,
  createInputRef,
  createName,
  customBooks,
  deleteTarget,
  isCreating,
  isDeleting,
  isLoadingMore,
  isRenaming,
  menuOpenBookId,
  menuRef,
  profile,
  renameInputRef,
  renameValue,
  renamingBookId,
  scrollSentinelRef,
  shoppingHasNext,
  shoppingItems,
  shoppingLoaded,
  showCreateInput,
  surface,
  systemBooks,
  onCancelCreate,
  onCancelRename,
  onCloseDeleteDialog,
  onConfirmDelete,
  onConfirmRename,
  onCreateBook,
  onCreateNameChange,
  onMenuClose,
  onMenuOpen,
  onRenameStart,
  onRenameValueChange,
  onRequestDelete,
  onShowCreateInput,
  onSurfaceChange,
}: MypageMobileScreenProps) {
  const title =
    surface === "recipebook"
      ? "레시피북"
      : surface === "shopping"
        ? "장보기 기록"
        : "마이페이지";

  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] md:hidden"
      style={{ fontFamily: mobileFontFamily }}
    >
      <MobileAppBar
        onBack={surface === "home" ? undefined : () => onSurfaceChange("home")}
        title={title}
      />

      {surface === "home" ? (
        <MobileHomeSurface
          books={books}
          profile={profile}
          shoppingItems={shoppingItems}
          shoppingLoaded={shoppingLoaded}
          onSurfaceChange={onSurfaceChange}
        />
      ) : surface === "recipebook" ? (
        <MobileRecipebookSurface
          createInputRef={createInputRef}
          createName={createName}
          customBooks={customBooks}
          deleteTarget={deleteTarget}
          isCreating={isCreating}
          isDeleting={isDeleting}
          isRenaming={isRenaming}
          menuOpenBookId={menuOpenBookId}
          menuRef={menuRef}
          renameInputRef={renameInputRef}
          renameValue={renameValue}
          renamingBookId={renamingBookId}
          showCreateInput={showCreateInput}
          systemBooks={systemBooks}
          onCancelCreate={onCancelCreate}
          onCancelRename={onCancelRename}
          onCloseDeleteDialog={onCloseDeleteDialog}
          onConfirmDelete={onConfirmDelete}
          onConfirmRename={onConfirmRename}
          onCreateBook={onCreateBook}
          onCreateNameChange={onCreateNameChange}
          onMenuClose={onMenuClose}
          onMenuOpen={onMenuOpen}
          onRenameStart={onRenameStart}
          onRenameValueChange={onRenameValueChange}
          onRequestDelete={onRequestDelete}
          onShowCreateInput={onShowCreateInput}
        />
      ) : (
        <MobileShoppingSurface
          hasNext={shoppingHasNext}
          isLoadingMore={isLoadingMore}
          items={shoppingItems}
          loaded={shoppingLoaded}
          scrollSentinelRef={scrollSentinelRef}
        />
      )}

      <Wave1MobileBottomTab
        ariaLabel="마이페이지 하단 탭"
        currentTab="mypage"
      />
    </div>
  );
}

function MobileAppBar({
  onBack,
  title,
}: {
  onBack?: () => void;
  title: string;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex min-h-[52px] items-center justify-center border-b border-[#DEE2E6] bg-white px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      {onBack ? (
        <button
          aria-label="뒤로"
          className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[#212529]"
          onClick={onBack}
          type="button"
        >
          <BackIcon />
        </button>
      ) : null}
      <h1 className="truncate text-center text-[18px] font-extrabold leading-none text-[#212529]">
        {title}
      </h1>
    </div>
  );
}

function MobileHomeSurface({
  books,
  profile,
  shoppingItems,
  shoppingLoaded,
  onSurfaceChange,
}: {
  books: RecipeBookSummary[];
  profile: UserProfileData | null;
  shoppingItems: ShoppingListHistoryItem[];
  shoppingLoaded: boolean;
  onSurfaceChange: (surface: MypageMobileSurface) => void;
}) {
  const nickname = profile?.nickname ?? "사용자";
  const fallbackInitial = nickname.charAt(0) || "?";
  const recipeBookCount = Math.max(5, books.length);
  const shoppingCount = shoppingLoaded ? Math.max(12, shoppingItems.length) : 12;

  const menuRows = [
    {
      detail: `${recipeBookCount}개`,
      emoji: "📚",
      label: "레시피북",
      onClick: () => onSurfaceChange("recipebook"),
    },
    {
      detail: `${shoppingCount}회`,
      emoji: "🛒",
      label: "장보기 기록",
      onClick: () => onSurfaceChange("shopping"),
    },
    {
      detail: "관리",
      emoji: "🍱",
      href: "/leftovers",
      label: "남은요리",
    },
    {
      detail: "히스토리",
      emoji: "🍽️",
      href: "/leftovers/ate",
      label: "다먹은 요리",
    },
    {
      emoji: "⚙️",
      href: "/settings",
      label: "환경설정",
    },
    {
      emoji: "👤",
      href: "/settings?view=account",
      label: "계정 정보",
    },
    {
      emoji: "🔔",
      label: "알림 설정",
    },
    {
      emoji: "💬",
      label: "도움말 · FAQ",
    },
  ];

  return (
    <>
      <section
        className="border-b border-[#DEE2E6] bg-white px-5 py-5"
        data-testid="mypage-profile"
      >
        <div className="mb-[18px] flex items-center gap-[14px]">
          {profile?.profile_image_url ? (
            <Image
              alt={`${nickname} 프로필`}
              className="h-16 w-16 shrink-0 rounded-full object-cover"
              height={64}
              src={profile.profile_image_url}
              unoptimized
              width={64}
            />
          ) : (
            <div
              aria-label="프로필 이니셜"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2AC1BC] to-[#12B886] text-[24px] font-extrabold text-white [font-family:var(--font-jua),-apple-system,sans-serif]"
              data-testid="profile-fallback-avatar"
            >
              {fallbackInitial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-extrabold leading-[1.25] text-[#212529]">
              {nickname}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium leading-[1.35] text-[#868E96]">
              🍳 집밥 러너 · 레벨 5
            </p>
          </div>
          <Link
            className="flex h-8 shrink-0 items-center justify-center rounded-lg bg-[#F8F9FA] px-3 text-[12px] font-bold text-[#495057]"
            data-testid="mypage-settings-link"
            href="/settings"
          >
            편집
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <MobileStatCard color="#2AC1BC" label="요리 완료" value="24" />
          <MobileStatCard
            color="#FFB347"
            label="레시피북"
            value={String(recipeBookCount)}
          />
          <MobileStatCard color="#FF6B6B" label="연속" value="7" />
        </div>
      </section>

      <section className="p-4">
        <div
          className="overflow-hidden rounded-xl border border-[#DEE2E6] bg-white"
          data-testid="mypage-menu-card"
        >
          {menuRows.map((row, index) => {
            const className = [
              "flex min-h-[57px] w-full items-center px-4 text-left",
              index < menuRows.length - 1 ? "border-b border-[#F1F3F5]" : "",
            ].join(" ");

            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="w-7 shrink-0 text-[18px] leading-none"
                >
                  {row.emoji}
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#212529]">
                  {row.label}
                </span>
                {row.detail ? (
                  <span className="mr-2 shrink-0 text-[13px] font-medium text-[#868E96]">
                    {row.detail}
                  </span>
                ) : null}
                <ChevronRightIcon />
              </>
            );

            if (row.href) {
              return (
                <Link className={className} href={row.href} key={row.label}>
                  {content}
                </Link>
              );
            }

            return (
              <button
                className={className}
                key={row.label}
                onClick={row.onClick}
                type="button"
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function MobileStatCard({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[10px] bg-[#F8F9FA] px-2 py-3 text-center">
      <div
        className="text-[22px] font-extrabold leading-none [font-family:var(--font-jua),-apple-system,sans-serif]"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium leading-[1.25] text-[#868E96]">
        {label}
      </div>
    </div>
  );
}

function MobileRecipebookSurface({
  createInputRef,
  createName,
  customBooks,
  deleteTarget,
  isCreating,
  isDeleting,
  isRenaming,
  menuOpenBookId,
  menuRef,
  renameInputRef,
  renameValue,
  renamingBookId,
  showCreateInput,
  systemBooks,
  onCancelCreate,
  onCancelRename,
  onCloseDeleteDialog,
  onConfirmDelete,
  onConfirmRename,
  onCreateBook,
  onCreateNameChange,
  onMenuClose,
  onMenuOpen,
  onRenameStart,
  onRenameValueChange,
  onRequestDelete,
  onShowCreateInput,
}: {
  createInputRef: React.RefObject<HTMLInputElement | null>;
  createName: string;
  customBooks: RecipeBookSummary[];
  deleteTarget: RecipeBookSummary | null;
  isCreating: boolean;
  isDeleting: boolean;
  isRenaming: boolean;
  menuOpenBookId: string | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  renamingBookId: string | null;
  showCreateInput: boolean;
  systemBooks: RecipeBookSummary[];
  onCancelCreate: () => void;
  onCancelRename: () => void;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: () => void;
  onConfirmRename: () => void;
  onCreateBook: () => void;
  onCreateNameChange: (value: string) => void;
  onMenuClose: () => void;
  onMenuOpen: (id: string) => void;
  onRenameStart: (book: RecipeBookSummary) => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: (book: RecipeBookSummary) => void;
  onShowCreateInput: () => void;
}) {
  const allBooks = [...systemBooks, ...customBooks];

  return (
    <main className="px-4 py-4" data-testid="recipebook-tab">
      <div className="space-y-2" role="list">
        {allBooks.map((book) =>
          book.book_type === "custom" ? (
            <MobileCustomBookCard
              book={book}
              isMenuOpen={menuOpenBookId === book.id}
              isRenaming={renamingBookId === book.id}
              isRenamingLoading={isRenaming}
              key={book.id}
              menuRef={menuRef}
              onCancelRename={onCancelRename}
              onConfirmRename={onConfirmRename}
              onMenuClose={onMenuClose}
              onMenuOpen={() => onMenuOpen(book.id)}
              onRenameStart={() => onRenameStart(book)}
              onRenameValueChange={onRenameValueChange}
              onRequestDelete={() => onRequestDelete(book)}
              renameInputRef={renameInputRef}
              renameValue={renameValue}
            />
          ) : (
            <MobileSystemBookCard book={book} key={book.id} />
          ),
        )}
      </div>

      {showCreateInput ? (
        <div className="mt-2 flex min-h-[58px] items-center gap-2 rounded-xl border-2 border-[#2AC1BC] bg-white px-4 py-3">
          <input
            ref={createInputRef}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-[#212529] outline-none placeholder:text-[#868E96]"
            disabled={isCreating}
            maxLength={50}
            onChange={(event) => onCreateNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void onCreateBook();
              if (event.key === "Escape") onCancelCreate();
            }}
            placeholder="레시피북 이름"
            type="text"
            value={createName}
          />
          <button
            className="shrink-0 text-[13px] font-extrabold text-[#20A8A4] disabled:opacity-50"
            disabled={isCreating || !createName.trim()}
            onClick={() => void onCreateBook()}
            type="button"
          >
            {isCreating ? "만드는 중..." : "완료"}
          </button>
          <button
            className="shrink-0 text-[13px] font-bold text-[#868E96]"
            onClick={onCancelCreate}
            type="button"
          >
            취소
          </button>
        </div>
      ) : null}

      <button
        aria-label="새 레시피북 만들기"
        className="mt-3 flex h-12 w-full items-center justify-center rounded-xl border border-dashed border-[#DEE2E6] bg-transparent text-[13px] font-extrabold text-[#868E96]"
        onClick={onShowCreateInput}
        type="button"
      >
        + 새 레시피북 만들기
      </button>

      {deleteTarget ? (
        <MobileDeleteConfirmDialog
          bookName={deleteTarget.name}
          isDeleting={isDeleting}
          onCancel={onCloseDeleteDialog}
          onConfirm={onConfirmDelete}
        />
      ) : null}
    </main>
  );
}

function MobileSystemBookCard({ book }: { book: RecipeBookSummary }) {
  const visual = getBookVisual(book);

  return (
    <Link
      className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[#DEE2E6] bg-white px-4 py-[14px]"
      data-testid={`system-book-${book.book_type}`}
      href={buildBookDetailHref(book)}
      role="listitem"
    >
      <BookIconBox emoji={visual.emoji} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-extrabold leading-[1.35] text-[#212529]">
            {book.name}
          </span>
          <RecipeCountBadge count={book.recipe_count} />
        </div>
        <div className="mt-0.5 text-[11px] font-medium leading-[1.35] text-[#868E96]">
          {visual.kindLabel}
        </div>
      </div>
    </Link>
  );
}

interface MobileCustomBookCardProps {
  book: RecipeBookSummary;
  isMenuOpen: boolean;
  isRenaming: boolean;
  isRenamingLoading: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  onCancelRename: () => void;
  onConfirmRename: () => void;
  onMenuClose: () => void;
  onMenuOpen: () => void;
  onRenameStart: () => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: () => void;
}

function MobileCustomBookCard({
  book,
  isMenuOpen,
  isRenaming,
  isRenamingLoading,
  menuRef,
  renameInputRef,
  renameValue,
  onCancelRename,
  onConfirmRename,
  onMenuOpen,
  onRenameStart,
  onRenameValueChange,
  onRequestDelete,
}: MobileCustomBookCardProps) {
  const visual = getBookVisual(book);

  if (isRenaming) {
    return (
      <div
        className="flex min-h-[72px] items-center gap-2 rounded-xl border-2 border-[#2AC1BC] bg-white px-4 py-3"
        role="listitem"
      >
        <input
          ref={renameInputRef}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-extrabold text-[#212529] outline-none"
          disabled={isRenamingLoading}
          maxLength={50}
          onChange={(event) => onRenameValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void onConfirmRename();
            if (event.key === "Escape") onCancelRename();
          }}
          type="text"
          value={renameValue}
        />
        <button
          className="shrink-0 text-[13px] font-extrabold text-[#20A8A4] disabled:opacity-50"
          disabled={isRenamingLoading || !renameValue.trim()}
          onClick={() => void onConfirmRename()}
          type="button"
        >
          {isRenamingLoading ? "저장 중..." : "완료"}
        </button>
        <button
          className="shrink-0 text-[13px] font-bold text-[#868E96]"
          onClick={onCancelRename}
          type="button"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <div className="relative" role="listitem">
      <div className="flex min-h-[72px] items-center gap-3 rounded-xl border border-[#DEE2E6] bg-white px-4 py-[14px]">
        <BookIconBox emoji={visual.emoji} />
        <Link
          className="min-w-0 flex-1"
          href={buildBookDetailHref(book)}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-[14px] font-extrabold leading-[1.35] text-[#212529]">
              {book.name}
            </span>
            <RecipeCountBadge count={book.recipe_count} />
          </div>
          <div className="mt-0.5 text-[11px] font-medium leading-[1.35] text-[#868E96]">
            {visual.kindLabel}
          </div>
        </Link>
        <button
          aria-haspopup="menu"
          aria-label={`${book.name} 옵션 메뉴`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[18px] font-bold leading-none text-[#ADB5BD]"
          onClick={(event) => {
            event.preventDefault();
            onMenuOpen();
          }}
          type="button"
        >
          ⋯
        </button>
      </div>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          className="absolute right-3 top-11 z-20 min-w-[120px] overflow-hidden rounded-[10px] border border-[#DEE2E6] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
          role="menu"
        >
          <button
            className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-bold text-[#212529]"
            onClick={onRenameStart}
            role="menuitem"
            type="button"
          >
            이름 변경
          </button>
          <button
            className="flex w-full items-center border-t border-[#F1F3F5] px-3 py-2.5 text-left text-[13px] font-bold text-[#FF6B6B]"
            onClick={onRequestDelete}
            role="menuitem"
            type="button"
          >
            삭제
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BookIconBox({ emoji }: { emoji: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#E6F8F7] text-[20px]"
    >
      {emoji}
    </span>
  );
}

function RecipeCountBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`레시피 ${formatRecipeCount(count)}`}
      className="shrink-0 rounded bg-[#E6F8F7] px-1.5 py-0.5 text-[10px] font-extrabold leading-[1.25] text-[#20A8A4]"
    >
      {formatRecipeCount(count)} 레시피
    </span>
  );
}

function MobileDeleteConfirmDialog({
  bookName,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  bookName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0"
      data-testid="delete-confirm-dialog"
    >
      <div
        aria-modal="true"
        className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
        role="alertdialog"
      >
        <div className="flex justify-center pb-2">
          <div className="h-1 w-9 rounded-full bg-[#DEE2E6]" />
        </div>
        <h2 className="text-[18px] font-extrabold leading-[1.35] text-[#212529] [font-family:var(--font-jua),-apple-system,sans-serif]">
          레시피북을 삭제할까요?
        </h2>
        <p className="mt-2 text-[13px] font-medium leading-5 text-[#495057]">
          &ldquo;{bookName}&rdquo; 안의 레시피는 삭제되지 않아요.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="h-12 rounded-[10px] border border-[#DEE2E6] bg-white text-[14px] font-extrabold text-[#495057]"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-12 rounded-[10px] bg-[#FF6B6B] text-[14px] font-extrabold text-white disabled:opacity-50"
            disabled={isDeleting}
            onClick={() => void onConfirm()}
            type="button"
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileShoppingSurface({
  hasNext,
  isLoadingMore,
  items,
  loaded,
  scrollSentinelRef,
}: {
  items: ShoppingListHistoryItem[];
  loaded: boolean;
  hasNext: boolean;
  isLoadingMore: boolean;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
}) {
  if (!loaded) {
    return (
      <main className="space-y-2 px-4 py-4">
        {[1, 2].map((index) => (
          <div
            className="h-[68px] rounded-xl border border-[#DEE2E6] bg-white"
            key={index}
          />
        ))}
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="px-4 py-4" data-testid="shopping-empty">
        <div className="rounded-xl bg-white px-10 py-10 text-center">
          <div className="mb-2 text-[36px] leading-none">🛒</div>
          <p className="text-[13px] font-medium text-[#868E96]">
            아직 장보기 기록이 없어요
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center rounded-[10px] border border-[#2AC1BC] px-5 text-[13px] font-extrabold text-[#20A8A4]"
            href="/planner"
          >
            플래너로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-4" data-testid="shopping-tab">
      <div className="space-y-2" role="list">
        {items.map((item) => (
          <MobileShoppingCard item={item} key={item.id} />
        ))}
      </div>
      {isLoadingMore ? (
        <div className="py-4 text-center text-[13px] font-bold text-[#868E96]">
          불러오는 중...
        </div>
      ) : null}
      {hasNext ? <div className="h-4" ref={scrollSentinelRef} /> : null}
    </main>
  );
}

function MobileShoppingCard({ item }: { item: ShoppingListHistoryItem }) {
  const completed = item.is_completed;

  return (
    <Link
      className="flex min-h-[68px] items-center gap-3 rounded-xl border border-[#DEE2E6] bg-white px-4 py-[14px]"
      data-testid={`shopping-card-${item.id}`}
      href={`/shopping/lists/${item.id}`}
      role="listitem"
    >
      <span
        aria-hidden="true"
        className={[
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[18px]",
          completed
            ? "bg-[#E6F8F7] text-[#20A8A4]"
            : "bg-[#F8F9FA] text-[#495057]",
        ].join(" ")}
      >
        {completed ? "✓" : "🛒"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-[1.35] text-[#212529]">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.35] text-[#868E96]">
          {item.item_count}개 재료 · {completed ? "다시열기" : "진행 중"}
          {item.completed_at ? ` · ${formatShortDate(item.completed_at)} 완료` : ""}
        </p>
      </div>
      <ChevronRightIcon />
    </Link>
  );
}

function getBookVisual(book: RecipeBookSummary) {
  if (book.book_type === "saved") {
    return { emoji: "🔖", kindLabel: "저장" };
  }
  if (book.book_type === "my_added") {
    return { emoji: "✏️", kindLabel: "내 책" };
  }
  if (book.book_type === "liked") {
    return { emoji: "❤️", kindLabel: "좋아요" };
  }
  if (book.name.includes("주말") || book.name.includes("한 상")) {
    return { emoji: "🍽️", kindLabel: "내 책" };
  }
  return { emoji: "🍳", kindLabel: "내 책" };
}

function buildBookDetailHref(book: RecipeBookSummary) {
  const params = new URLSearchParams({
    type: book.book_type,
    name: book.name,
  });

  return `/mypage/recipe-books/${book.id}?${params.toString()}`;
}

function formatRecipeCount(count: number) {
  return `${Number.isFinite(count) ? count : 0}개`;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
      viewBox="0 0 24 24"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-[#ADB5BD]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
