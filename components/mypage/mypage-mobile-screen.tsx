"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import type { UserProfileData } from "@/lib/api/mypage";
import { buildReturnHref } from "@/lib/navigation/return-context";
import type { RecipeBookRecipeItem, RecipeBookSummary } from "@/types/recipe";
import type { ShoppingListHistoryItem } from "@/types/shopping";

export type MypageMobileSurface = "home" | "recipebook" | "shopping";

interface MypageStatItem {
  color: string;
  label: string;
  value: number;
}

interface MypageMobileScreenProps {
  books: RecipeBookSummary[];
  bookCoverImages: Record<string, string | null>;
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
  savedRecipeCount: number;
  savedRecipes: RecipeBookRecipeItem[];
  savedRecipesState: "idle" | "loading" | "ready" | "empty" | "error";
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
  shoppingHasNext: boolean;
  shoppingItems: ShoppingListHistoryItem[];
  shoppingLoaded: boolean;
  showCreateInput: boolean;
  stats: MypageStatItem[];
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
  onOpenNicknameSheet: () => void;
  onRenameStart: (book: RecipeBookSummary) => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: (book: RecipeBookSummary) => void;
  onRetrySavedRecipes: () => void;
  onShowCreateInput: () => void;
  onSurfaceChange: (surface: MypageMobileSurface) => void;
}

const MOBILE_RECIPE_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1547592180-85f173990554?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=900&h=675&fit=crop&q=80",
] as const;

export function MypageMobileScreen({
  books,
  bookCoverImages,
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
  savedRecipeCount,
  savedRecipes,
  savedRecipesState,
  scrollSentinelRef,
  shoppingHasNext,
  shoppingItems,
  shoppingLoaded,
  showCreateInput,
  stats,
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
  onOpenNicknameSheet,
  onRenameStart,
  onRenameValueChange,
  onRequestDelete,
  onRetrySavedRecipes,
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
    <div className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden">
      <MobileAppBar
        onBack={surface === "home" ? undefined : () => onSurfaceChange("home")}
        title={title}
      />

      {surface === "home" ? (
        <MobileHomeSurface
          books={books}
          profile={profile}
          savedRecipeCount={savedRecipeCount}
          savedRecipes={savedRecipes}
          savedRecipesState={savedRecipesState}
          shoppingItems={shoppingItems}
          shoppingLoaded={shoppingLoaded}
          stats={stats}
          onOpenNicknameSheet={onOpenNicknameSheet}
          onRetrySavedRecipes={onRetrySavedRecipes}
          onSurfaceChange={onSurfaceChange}
        />
      ) : surface === "recipebook" ? (
        <MobileRecipebookSurface
          bookCoverImages={bookCoverImages}
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
      className={[
        "sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4",
        onBack ? "justify-center" : "",
      ].join(" ")}
      style={{ borderBottomWidth: "0.5px" }}
    >
      {onBack ? (
        <button
          aria-label="뒤로"
          className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[var(--foreground)]"
          onClick={onBack}
          type="button"
        >
          <BackIcon />
        </button>
      ) : null}
      <h1
        className={[
          "truncate text-[18px] font-bold leading-none text-[var(--brand)]",
          onBack ? "text-center" : "",
        ].join(" ")}
      >
        {title}
      </h1>
    </div>
  );
}

function MobileHomeSurface({
  books,
  profile,
  savedRecipeCount,
  savedRecipes,
  savedRecipesState,
  shoppingItems,
  shoppingLoaded,
  stats,
  onOpenNicknameSheet,
  onRetrySavedRecipes,
  onSurfaceChange,
}: {
  books: RecipeBookSummary[];
  profile: UserProfileData | null;
  savedRecipeCount: number;
  savedRecipes: RecipeBookRecipeItem[];
  savedRecipesState: "idle" | "loading" | "ready" | "empty" | "error";
  shoppingItems: ShoppingListHistoryItem[];
  shoppingLoaded: boolean;
  stats: MypageStatItem[];
  onOpenNicknameSheet: () => void;
  onRetrySavedRecipes: () => void;
  onSurfaceChange: (surface: MypageMobileSurface) => void;
}) {
  const nickname = profile?.nickname ?? "사용자";
  const fallbackInitial = nickname.charAt(0) || "?";
  const recipeBookCount = books.length;
  const shoppingCount = shoppingLoaded ? shoppingItems.length : 0;

  const menuRows = [
    {
      detail: `${recipeBookCount}개`,
      icon: "book",
      label: "레시피북",
      onClick: () => onSurfaceChange("recipebook"),
    },
    {
      detail: `${shoppingCount}회`,
      icon: "cart",
      label: "장보기 기록",
      onClick: () => onSurfaceChange("shopping"),
    },
    {
      detail: "관리",
      icon: "box",
      href: buildReturnHref("/leftovers", {
        restore: "mypage-home",
        returnSurface: "mypage.leftovers",
        returnTo: "/mypage",
      }),
      label: "남은 요리",
    },
    {
      detail: "히스토리",
      icon: "check",
      href: buildReturnHref("/leftovers/ate", {
        restore: "mypage-home",
        returnSurface: "mypage.eaten-list",
        returnTo: "/mypage",
      }),
      label: "다먹은 요리",
    },
    {
      icon: "settings",
      href: buildReturnHref("/settings", {
        returnTo: "/mypage",
      }),
      label: "환경설정",
    },
  ];

  return (
    <>
      <section
        className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-5"
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
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-deep)] text-[24px] font-extrabold text-[var(--text-inverse)]"
              data-testid="profile-fallback-avatar"
            >
              {fallbackInitial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[18px] font-extrabold leading-[1.25] text-[var(--foreground)]">
              {nickname}
            </p>
            <p className="mt-0.5 truncate text-[13px] font-medium leading-[1.35] text-[var(--text-3)]">
              🍳 집밥 러너 · 레벨 5
            </p>
          </div>
          <button
            className="flex h-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-3 text-[12px] font-bold text-[var(--text-2)]"
            data-testid="mypage-profile-edit-button"
            onClick={onOpenNicknameSheet}
            type="button"
          >
            편집
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {stats.map((item) => (
            <MobileStatCard
              color={item.color}
              key={item.label}
              label={item.label}
              value={String(item.value)}
            />
          ))}
        </div>
      </section>

      <MobileSavedRecipesRail
        count={savedRecipeCount}
        recipes={savedRecipes}
        state={savedRecipesState}
        onRetry={onRetrySavedRecipes}
      />

      <section className="p-4">
        <div
          className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]"
          data-testid="mypage-menu-card"
        >
          {menuRows.map((row, index) => {
            const className = [
              "flex min-h-[57px] w-full items-center gap-3 px-4 text-left",
              index < menuRows.length - 1 ? "border-b border-[var(--surface-subtle)]" : "",
            ].join(" ");

            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[var(--text-2)]"
                >
                  <MypageMenuIcon name={row.icon} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--foreground)]">
                  {row.label}
                </span>
                {row.detail ? (
                  <span className="mr-2 shrink-0 text-[13px] font-medium text-[var(--text-3)]">
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
    <div className="rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-2 py-3 text-center">
      <div
        className="text-[28px] font-[800] leading-[1.1]"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium leading-[1.25] text-[var(--text-3)]">
        {label}
      </div>
    </div>
  );
}

function MobileSavedRecipesRail({
  count,
  recipes,
  state,
  onRetry,
}: {
  count: number;
  recipes: RecipeBookRecipeItem[];
  state: "idle" | "loading" | "ready" | "empty" | "error";
  onRetry: () => void;
}) {
  const visibleRecipes = recipes.slice(0, 8);

  return (
    <section
      className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-4"
      data-testid="mobile-saved-recipes-rail"
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-[16px] font-extrabold leading-none text-[var(--foreground)]">
          저장한 레시피
        </h2>
        <p className="shrink-0 text-[12px] font-bold leading-none text-[var(--text-3)]">
          {count}개
        </p>
      </div>

      {state === "idle" || state === "loading" ? (
        <div
          className="-mx-5 flex gap-3 overflow-x-auto px-5"
          data-testid="saved-recipes-loading"
        >
          {[0, 1, 2].map((index) => (
            <div
              className="h-[136px] w-[148px] shrink-0 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)]"
              key={index}
            />
          ))}
        </div>
      ) : null}

      {state === "error" ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] p-4">
          <strong className="text-[14px] text-[var(--foreground)]">
            저장한 레시피를 불러오지 못했어요
          </strong>
          <button
            className="mt-3 h-9 rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[13px] font-extrabold text-[var(--text-inverse)]"
            onClick={onRetry}
            type="button"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {state === "empty" || (state === "ready" && recipes.length === 0) ? (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] p-4"
          data-testid="saved-recipes-empty"
        >
          <strong className="text-[14px] text-[var(--foreground)]">
            아직 저장한 레시피가 없어요
          </strong>
          <p className="mt-1 text-[12px] font-medium text-[var(--text-3)]">
            마음에 드는 레시피를 저장하면 여기에 모아 보여드려요.
          </p>
        </div>
      ) : null}

      {state === "ready" && visibleRecipes.length > 0 ? (
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5" role="list">
          {visibleRecipes.map((recipe) => {
            const imageSrc =
              recipe.thumbnail_url ?? getMobileFallbackRecipeImage(recipe.title);

            return (
              <Link
                className="w-[148px] shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)]"
                href={buildReturnHref(`/recipe/${recipe.recipe_id}`, {
                  returnTo: "/mypage?tab=saved",
                })}
                key={recipe.recipe_id}
                role="listitem"
              >
                <span className="block h-[86px] w-full overflow-hidden bg-[var(--brand-soft)]">
                  <Image
                    alt=""
                    className="h-full w-full object-cover"
                    data-testid={`mobile-saved-recipe-image-${recipe.recipe_id}`}
                    height={86}
                    src={imageSrc}
                    unoptimized
                    width={148}
                  />
                </span>
                <span className="block px-3 py-2">
                  <span className="line-clamp-2 min-h-[34px] text-[13px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                    {recipe.title}
                  </span>
                  <span className="mt-1 block truncate text-[11px] font-medium leading-[1.35] text-[var(--text-3)]">
                    {formatMobileSavedRecipeMeta(recipe)}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function getMobileFallbackRecipeImage(title: string) {
  const seed = Array.from(title).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );

  return MOBILE_RECIPE_FALLBACK_IMAGES[
    seed % MOBILE_RECIPE_FALLBACK_IMAGES.length
  ];
}

function MypageMenuIcon({ name }: { name: string }) {
  const commonProps = {
    "aria-hidden": true,
    className: "h-[18px] w-[18px]",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (name === "book") {
    return (
      <svg {...commonProps}>
        <path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z" strokeLinejoin="round" />
        <path d="M8 18h10" />
      </svg>
    );
  }

  if (name === "bookmark") {
    return (
      <svg {...commonProps}>
        <path d="M6 4.75A2.75 2.75 0 0 1 8.75 2h6.5A2.75 2.75 0 0 1 18 4.75v16l-6-3.2-6 3.2v-16Z" />
      </svg>
    );
  }

  if (name === "cart") {
    return (
      <svg {...commonProps}>
        <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 1.9-1.4L20 8H6" />
        <circle cx="9" cy="20" r="1" fill="currentColor" stroke="none" />
        <circle cx="18" cy="20" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "box") {
    return (
      <svg {...commonProps}>
        <path d="M8 3h8l1 4H7l1-4ZM7 7h10v13H7V7Z" strokeLinejoin="round" />
        <path d="M10 11h4M10 15h4" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...commonProps} strokeWidth={1.9}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  }

  if (name === "settings") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19.4 15a1.75 1.75 0 0 0 .35 1.93l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.75 1.75 0 0 0-1.93-.35 1.75 1.75 0 0 0-1.05 1.6V21.3a2.1 2.1 0 1 1-4.2 0v-.07a1.75 1.75 0 0 0-1.05-1.6 1.75 1.75 0 0 0-1.93.35l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.75 1.75 0 0 0 4.6 15a1.75 1.75 0 0 0-1.6-1.05H2.9a2.1 2.1 0 1 1 0-4.2h.07A1.75 1.75 0 0 0 4.6 8.7a1.75 1.75 0 0 0-.35-1.93l-.05-.05a2.1 2.1 0 1 1 2.97-2.97l.05.05A1.75 1.75 0 0 0 9.15 4.15 1.75 1.75 0 0 0 10.2 2.55V2.5a2.1 2.1 0 1 1 4.2 0v.07a1.75 1.75 0 0 0 1.05 1.6 1.75 1.75 0 0 0 1.93-.35l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05A1.75 1.75 0 0 0 19.4 8.7a1.75 1.75 0 0 0 1.6 1.05h.1a2.1 2.1 0 1 1 0 4.2h-.07A1.75 1.75 0 0 0 19.4 15Z" />
      </svg>
    );
  }

  if (name === "user") {
    return (
      <svg {...commonProps}>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 5h16M4 12h16M4 19h16" />
    </svg>
  );
}

function MobileRecipebookSurface({
  bookCoverImages,
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
  bookCoverImages: Record<string, string | null>;
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
              coverImageSrc={bookCoverImages[book.id] ?? null}
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
            <MobileSystemBookCard
              book={book}
              coverImageSrc={bookCoverImages[book.id] ?? null}
              key={book.id}
            />
          ),
        )}
      </div>

      {showCreateInput ? (
        <div className="mt-2 flex min-h-[58px] items-center gap-2 rounded-[var(--radius-card)] border-2 border-[var(--brand)] bg-[var(--surface)] px-4 py-3">
          <input
            ref={createInputRef}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)]"
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
            className="shrink-0 text-[13px] font-extrabold text-[var(--brand)] disabled:opacity-50"
            disabled={isCreating || !createName.trim()}
            onClick={() => void onCreateBook()}
            type="button"
          >
            {isCreating ? "만드는 중..." : "완료"}
          </button>
          <button
            className="shrink-0 text-[13px] font-bold text-[var(--text-3)]"
            onClick={onCancelCreate}
            type="button"
          >
            취소
          </button>
        </div>
      ) : null}

      <button
        aria-label="새 레시피북 만들기"
        className="mt-3 flex h-[var(--control-height-lg)] w-full items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--line-strong)] bg-transparent text-[13px] font-extrabold text-[var(--text-3)]"
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

function MobileSystemBookCard({
  book,
  coverImageSrc,
}: {
  book: RecipeBookSummary;
  coverImageSrc: string | null;
}) {
  const visual = getBookVisual(book);

  return (
    <Link
      className="flex min-h-[72px] items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-[14px]"
      data-testid={`system-book-${book.book_type}`}
      href={buildBookDetailHref(book)}
      role="listitem"
    >
      <BookCoverThumb
        bookId={book.id}
        fallbackLabel={visual.emoji}
        imageSrc={coverImageSrc}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-extrabold leading-[1.35] text-[var(--foreground)]">
            {book.name}
          </span>
          <RecipeCountBadge count={book.recipe_count} />
        </div>
        <div className="mt-0.5 text-[11px] font-medium leading-[1.35] text-[var(--text-3)]">
          {visual.kindLabel}
        </div>
      </div>
    </Link>
  );
}

interface MobileCustomBookCardProps {
  book: RecipeBookSummary;
  coverImageSrc: string | null;
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
  coverImageSrc,
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
        className="flex min-h-[72px] items-center gap-2 rounded-[var(--radius-card)] border-2 border-[var(--brand)] bg-[var(--surface)] px-4 py-3"
        role="listitem"
      >
        <input
          ref={renameInputRef}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-extrabold text-[var(--foreground)] outline-none"
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
          className="shrink-0 text-[13px] font-extrabold text-[var(--brand)] disabled:opacity-50"
          disabled={isRenamingLoading || !renameValue.trim()}
          onClick={() => void onConfirmRename()}
          type="button"
        >
          {isRenamingLoading ? "저장 중..." : "완료"}
        </button>
        <button
          className="shrink-0 text-[13px] font-bold text-[var(--text-3)]"
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
      <div className="flex min-h-[72px] items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-[14px]">
        <BookCoverThumb
          bookId={book.id}
          fallbackLabel={visual.emoji}
          imageSrc={coverImageSrc}
        />
        <Link
          className="min-w-0 flex-1"
          href={buildBookDetailHref(book)}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate text-[14px] font-extrabold leading-[1.35] text-[var(--foreground)]">
              {book.name}
            </span>
            <RecipeCountBadge count={book.recipe_count} />
          </div>
          <div className="mt-0.5 text-[11px] font-medium leading-[1.35] text-[var(--text-3)]">
            {visual.kindLabel}
          </div>
        </Link>
        <button
          aria-haspopup="menu"
          aria-label={`${book.name} 옵션 메뉴`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-[18px] font-bold leading-none text-[var(--text-4)]"
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
          className="absolute right-3 top-11 z-20 min-w-[120px] overflow-hidden rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[0_2px_8px_var(--shadow-color-soft)]"
          role="menu"
        >
          <button
            className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-bold text-[var(--foreground)]"
            onClick={onRenameStart}
            role="menuitem"
            type="button"
          >
            이름 변경
          </button>
          <button
            className="flex w-full items-center border-t border-[var(--surface-subtle)] px-3 py-2.5 text-left text-[13px] font-bold text-[var(--danger)]"
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

function BookCoverThumb({
  bookId,
  fallbackLabel,
  imageSrc,
}: {
  bookId: string;
  fallbackLabel: string;
  imageSrc: string | null;
}) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[20px]"
    >
      {imageSrc ? (
        <Image
          alt=""
          className="h-full w-full object-cover"
          data-testid={`mobile-book-cover-${bookId}`}
          height={44}
          src={imageSrc}
          unoptimized
          width={44}
        />
      ) : (
        fallbackLabel
      )}
    </span>
  );
}

function RecipeCountBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`레시피 ${formatRecipeCount(count)}`}
      className="shrink-0 rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-[10px] font-extrabold leading-[1.25] text-[var(--brand)]"
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)] px-0"
      data-testid="delete-confirm-dialog"
    >
      <div
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_var(--shadow-color-strong)]"
        role="alertdialog"
      >
        <div className="flex justify-center pb-2">
          <div className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
        </div>
        <h2 className="text-[18px] font-extrabold leading-[1.35] text-[var(--foreground)]">
          레시피북을 삭제할까요?
        </h2>
        <p className="mt-2 text-[13px] font-medium leading-5 text-[var(--text-2)]">
          &ldquo;{bookName}&rdquo; 안의 레시피는 삭제되지 않아요.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-extrabold text-[var(--text-2)]"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--danger)] text-[14px] font-extrabold text-[var(--text-inverse)] disabled:opacity-50"
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
            className="h-[68px] rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]"
            key={index}
          />
        ))}
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="px-4 py-4" data-testid="shopping-empty">
        <div className="rounded-[var(--radius-card)] bg-[var(--surface)] px-10 py-10 text-center">
          <div className="mb-2 text-[36px] leading-none">🛒</div>
          <p className="text-[13px] font-medium text-[var(--text-3)]">
            아직 장보기 기록이 없어요
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--brand)] px-5 text-[13px] font-extrabold text-[var(--brand)]"
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
        <div className="py-4 text-center text-[13px] font-bold text-[var(--text-3)]">
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
      className="flex min-h-[68px] items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 py-[14px]"
      data-testid={`shopping-card-${item.id}`}
      href={buildReturnHref(`/shopping/lists/${item.id}`, {
        restore: "shopping-history-tab",
        returnSurface: "mypage.shopping-history",
        returnTo: "/mypage",
      })}
      role="listitem"
    >
      <span
        aria-hidden="true"
        className={[
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[18px]",
          completed
            ? "bg-[var(--brand-soft)] text-[var(--brand)]"
            : "bg-[var(--surface-fill)] text-[var(--text-2)]",
        ].join(" ")}
      >
        {completed ? "✓" : "🛒"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold leading-[1.35] text-[var(--foreground)]">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.35] text-[var(--text-3)]">
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

  return buildReturnHref(`/mypage/recipe-books/${book.id}?${params.toString()}`, {
    restore: "recipebook-tab",
    returnSurface: "mypage.recipebooks",
    returnTo: "/mypage",
  });
}

function formatRecipeCount(count: number) {
  return `${Number.isFinite(count) ? count : 0}개`;
}

function formatMobileSavedRecipeMeta(recipe: RecipeBookRecipeItem) {
  return [
    recipe.tags?.slice(0, 2).join(" · ") || null,
    recipe.total_duration_text ?? null,
    typeof recipe.base_servings === "number" ? `${recipe.base_servings}인분` : null,
  ]
    .filter(Boolean)
    .join(" · ");
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
      className="h-5 w-5 shrink-0 text-[var(--text-4)]"
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
