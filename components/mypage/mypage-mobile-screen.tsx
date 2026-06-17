"use client";

import Image from "next/image";
import Link from "next/link";
import React from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import type { MypageGamificationState } from "@/components/mypage/mypage-gamification-card";
import { MypageGrowthProfile } from "@/components/mypage/mypage-growth-profile";
import {
  type MypageProgressState,
} from "@/components/mypage/mypage-progress-card";
import {
  buildShoppingHistoryCalendarMonths,
  buildShoppingDayAriaLabel,
  findShoppingHistoryDay,
  formatShoppingDateKeyLong,
  formatShoppingHistoryCompletionDate,
  formatShoppingHistoryMealRange,
  getLatestShoppingHistoryDateKey,
  getLatestShoppingHistoryDateKeyInMonth,
  getShoppingHistoryMonthIndexForDateKey,
  sortShoppingHistoryItemsForDisplay,
  type ShoppingHistoryCalendarDay,
} from "@/components/mypage/shopping-history-calendar";
import type { UserProfileData } from "@/lib/api/mypage";
import { buildReturnHref } from "@/lib/navigation/return-context";
import type { MypageRecordStats } from "@/lib/planner-stats";
import { resolveRecipeImage } from "@/lib/recipe-image";
import type { RecipeBookRecipeItem, RecipeBookSummary } from "@/types/recipe";
import type { ShoppingListHistoryItem } from "@/types/shopping";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

export type MypageMobileSurface = "home" | "recipebook" | "shopping";

interface MypageMobileScreenProps {
  books: RecipeBookSummary[];
  archiveEnabled?: boolean;
  bookCoverImages: Record<string, string | null>;
  bookCoverUpdatedAt: Record<string, string | null>;
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
  gamification: UserGamificationData | null;
  gamificationState: MypageGamificationState;
  progress: UserProgressData | null;
  progressState: MypageProgressState;
  recordStats: MypageRecordStats;
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
  surface: MypageMobileSurface;
  systemBooks: RecipeBookSummary[];
  onCancelCreate: () => void;
  onCancelRename: () => void;
  onChangeColor: (book: RecipeBookSummary) => void;
  onChangeCoverImage: (book: RecipeBookSummary) => void;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: () => void;
  onConfirmRename: () => void;
  onCreateBook: () => void;
  onCreateNameChange: (value: string) => void;
  onDismissTutorialQuest: (questKey: string) => void;
  onMenuClose: () => void;
  onMenuOpen: (id: string) => void;
  onOpenNicknameSheet: () => void;
  onRenameStart: (book: RecipeBookSummary) => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: (book: RecipeBookSummary) => void;
  onRetrySavedRecipes: () => void;
  onShowCreateInput: () => void;
  onSurfaceBack: () => void;
  onSurfaceChange: (surface: MypageMobileSurface) => void;
}

const MOBILE_PROVIDER_LABELS: Record<UserProfileData["social_provider"], string> = {
  google: "Google 로그인",
  kakao: "카카오 로그인",
  naver: "네이버 로그인",
};

export function MypageMobileScreen({
  books,
  bookCoverImages,
  bookCoverUpdatedAt,
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
  gamification,
  gamificationState,
  progress,
  progressState,
  recordStats,
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
  surface,
  systemBooks,
  onCancelCreate,
  onCancelRename,
  onChangeColor,
  onChangeCoverImage,
  onCloseDeleteDialog,
  onConfirmDelete,
  onConfirmRename,
  onCreateBook,
  onCreateNameChange,
  onDismissTutorialQuest,
  onMenuClose,
  onMenuOpen,
  onOpenNicknameSheet,
  onRenameStart,
  onRenameValueChange,
  onRequestDelete,
  onRetrySavedRecipes,
  onShowCreateInput,
  onSurfaceBack,
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
      className={[
        "min-h-dvh pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden",
        surface === "recipebook"
          ? "mobile-recipebooks-diary-root"
          : "bg-[var(--surface-fill)]",
      ].join(" ")}
    >
      <MobileAppBar
        onBack={surface === "home" ? undefined : onSurfaceBack}
        titleTone={surface === "shopping" ? "default" : "brand"}
        title={title}
      />

      {surface === "home" ? (
        <MobileHomeSurface
          books={books}
          gamification={gamification}
          gamificationState={gamificationState}
          profile={profile}
          progress={progress}
          progressState={progressState}
          recordStats={recordStats}
          savedRecipeCount={savedRecipeCount}
          savedRecipes={savedRecipes}
          savedRecipesState={savedRecipesState}
          shoppingItems={shoppingItems}
          shoppingLoaded={shoppingLoaded}
          onOpenNicknameSheet={onOpenNicknameSheet}
          onDismissTutorialQuest={onDismissTutorialQuest}
          onRetrySavedRecipes={onRetrySavedRecipes}
          onSurfaceChange={onSurfaceChange}
        />
      ) : surface === "recipebook" ? (
        <MobileRecipebookSurface
          bookCoverImages={bookCoverImages}
          bookCoverUpdatedAt={bookCoverUpdatedAt}
          createInputRef={createInputRef}
          createName={createName}
          customBooks={customBooks}
          deleteTarget={deleteTarget}
          isCreating={isCreating}
          isDeleting={isDeleting}
          isRenaming={isRenaming}
          menuOpenBookId={menuOpenBookId}
          menuRef={menuRef}
          profile={profile}
          renameInputRef={renameInputRef}
          renameValue={renameValue}
          renamingBookId={renamingBookId}
          savedRecipeCount={savedRecipeCount}
          showCreateInput={showCreateInput}
          systemBooks={systemBooks}
          onCancelCreate={onCancelCreate}
          onCancelRename={onCancelRename}
          onChangeColor={onChangeColor}
          onChangeCoverImage={onChangeCoverImage}
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
        onTabClick={(tabId, event) => {
          if (tabId === "mypage" && surface !== "home") {
            event.preventDefault();
            onSurfaceChange("home");
          }
        }}
      />
    </div>
  );
}

function MobileAppBar({
  onBack,
  title,
  titleTone = "brand",
}: {
  onBack?: () => void;
  title: string;
  titleTone?: "brand" | "default";
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
          "truncate text-[18px] font-bold leading-none",
          titleTone === "default" ? "text-[var(--foreground)]" : "text-[var(--brand)]",
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
  gamification,
  gamificationState,
  profile,
  progress,
  progressState,
  recordStats,
  savedRecipeCount,
  savedRecipes,
  savedRecipesState,
  shoppingItems,
  shoppingLoaded,
  onOpenNicknameSheet,
  onDismissTutorialQuest,
  onRetrySavedRecipes,
  onSurfaceChange,
}: {
  books: RecipeBookSummary[];
  gamification: UserGamificationData | null;
  gamificationState: MypageGamificationState;
  profile: UserProfileData | null;
  progress: UserProgressData | null;
  progressState: MypageProgressState;
  recordStats: MypageRecordStats;
  savedRecipeCount: number;
  savedRecipes: RecipeBookRecipeItem[];
  savedRecipesState: "idle" | "loading" | "ready" | "empty" | "error";
  shoppingItems: ShoppingListHistoryItem[];
  shoppingLoaded: boolean;
  onDismissTutorialQuest: (questKey: string) => void;
  onOpenNicknameSheet: () => void;
  onRetrySavedRecipes: () => void;
  onSurfaceChange: (surface: MypageMobileSurface) => void;
}) {
  const providerLabel = profile
    ? MOBILE_PROVIDER_LABELS[profile.social_provider]
    : "소셜 로그인";
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
        <MypageGrowthProfile
          className="mb-3 border-[var(--line-strong)]"
          gamification={gamification}
          gamificationState={gamificationState}
          onDismissTutorialQuest={onDismissTutorialQuest}
          onEditProfile={onOpenNicknameSheet}
          profile={profile}
          providerLabel={providerLabel}
          progress={progress}
          progressState={progressState}
          recordStats={recordStats}
          variant="mobile"
        />

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
            const imageSrc = resolveRecipeImage({
              id: recipe.recipe_id,
              thumbnail_url: recipe.thumbnail_url,
            });

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
  bookCoverUpdatedAt,
  createInputRef,
  createName,
  customBooks,
  deleteTarget,
  isCreating,
  isDeleting,
  isRenaming,
  menuOpenBookId,
  menuRef,
  profile,
  renameInputRef,
  renameValue,
  renamingBookId,
  savedRecipeCount,
  showCreateInput,
  systemBooks,
  onCancelCreate,
  onCancelRename,
  onChangeColor,
  onChangeCoverImage,
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
  bookCoverUpdatedAt: Record<string, string | null>;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  createName: string;
  customBooks: RecipeBookSummary[];
  deleteTarget: RecipeBookSummary | null;
  isCreating: boolean;
  isDeleting: boolean;
  isRenaming: boolean;
  menuOpenBookId: string | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  profile: UserProfileData | null;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  renamingBookId: string | null;
  savedRecipeCount: number;
  showCreateInput: boolean;
  systemBooks: RecipeBookSummary[];
  onCancelCreate: () => void;
  onCancelRename: () => void;
  onChangeColor: (book: RecipeBookSummary) => void;
  onChangeCoverImage: (book: RecipeBookSummary) => void;
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
  const allBooks = [...customBooks, ...systemBooks];
  const nickname = profile?.nickname ?? "사용자";
  const fallbackInitial = nickname.charAt(0) || "?";

  return (
    <main
      className="mobile-recipebooks-diary-screen mobile-recipebooks-diary-screen-fit px-4 pb-8 pt-4"
      data-testid="recipebook-tab"
    >
      <section className="mobile-recipebooks-diary-hero rounded-[28px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {profile?.profile_image_url ? (
              <Image
                alt={`${nickname} 프로필`}
                className="h-12 w-12 shrink-0 rounded-full object-cover"
                height={48}
                src={profile.profile_image_url}
                unoptimized
                width={48}
              />
            ) : (
              <div
                aria-label={`${nickname} 프로필`}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-deep)] text-[18px] font-black text-[var(--text-inverse)]"
                role="img"
              >
                {fallbackInitial}
              </div>
            )}
            <div className="min-w-0">
              <p className="mobile-recipebooks-diary-eyebrow text-[11px] font-black">
                Recipe books
              </p>
              <h2 className="mt-1 text-[24px] font-black leading-[1.08] text-[var(--foreground)]">
                나의 레시피북
              </h2>
              <p className="mt-1 text-[12px] font-extrabold leading-[1.35] text-[var(--text-3)]">
                책 {allBooks.length}권 · 저장 {savedRecipeCount}개
              </p>
            </div>
          </div>
          <button
            aria-label="새 레시피북 만들기"
            className="mobile-recipebooks-diary-add-button grid h-11 w-11 shrink-0 place-items-center rounded-full text-[22px] font-black leading-none"
            onClick={onShowCreateInput}
            type="button"
          >
            +
          </button>
        </div>
      </section>

      {showCreateInput ? (
        <div className="mobile-recipebooks-create mt-3 flex min-h-[58px] items-center gap-2 rounded-[22px] px-4 py-3">
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
            className="mobile-recipebooks-create-action shrink-0 text-[13px] font-extrabold disabled:opacity-50"
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

      {customBooks.length > 0 ? (
        <section
          className="mt-4"
          data-testid="mobile-custom-books-section"
        >
          <div className="mobile-recipebooks-section-head flex items-end justify-between px-1">
            <h3 className="text-[16px] font-black leading-none text-[var(--foreground)]">
              커스텀
            </h3>
            <span className="text-[11px] font-extrabold text-[var(--text-3)]">
              {customBooks.length}권
            </span>
          </div>
          <div
            className="mobile-recipebooks-book-grid mobile-recipebooks-book-grid-wide mt-3 grid"
            data-testid="mobile-custom-books-grid"
            role="list"
          >
            {customBooks.map((book) => (
            <MobileCustomBookCard
              book={book}
              coverImageSrc={bookCoverImages[book.id] ?? null}
              isMenuOpen={menuOpenBookId === book.id}
              isRenaming={renamingBookId === book.id}
              isRenamingLoading={isRenaming}
              key={book.id}
              lastUpdatedLabel={formatBookLastUpdated(bookCoverUpdatedAt[book.id])}
              menuRef={menuRef}
              onCancelRename={onCancelRename}
              onChangeColor={() => onChangeColor(book)}
              onChangeCoverImage={() => onChangeCoverImage(book)}
              onConfirmRename={onConfirmRename}
              onMenuClose={onMenuClose}
              onMenuOpen={() => onMenuOpen(book.id)}
              onRenameStart={() => onRenameStart(book)}
              onRenameValueChange={onRenameValueChange}
              onRequestDelete={() => onRequestDelete(book)}
              renameInputRef={renameInputRef}
              renameValue={renameValue}
            />
            ))}
          </div>
        </section>
      ) : null}

      <section
        className="mt-5"
        data-testid="mobile-system-books-section"
      >
        <div className="mobile-recipebooks-section-head flex items-end justify-between px-1">
          <h3 className="text-[16px] font-black leading-none text-[var(--foreground)]">
            시스템
          </h3>
          <span className="text-[11px] font-extrabold text-[var(--text-3)]">
            {systemBooks.length}권
          </span>
        </div>
        <div
          className="mobile-recipebooks-book-grid mobile-recipebooks-book-grid-wide mt-3 grid"
          data-testid="mobile-system-books-grid"
          role="list"
        >
          {systemBooks.map((book) => (
            <MobileSystemBookCard
              book={book}
              coverImageSrc={bookCoverImages[book.id] ?? null}
              key={book.id}
            />
          ))}
        </div>
      </section>

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
  return (
    <Link
      className={`mobile-recipebook-book-card mobile-recipebook-book-card-web-ratio relative grid overflow-hidden rounded-[18px_10px_10px_18px] p-0 text-left ${getBookToneClasses(book)}`}
      data-testid={`system-book-${book.book_type}`}
      href={buildBookDetailHref(book)}
      role="listitem"
    >
      <BookCoverThumb
        book={book}
        imageSrc={coverImageSrc}
      />
      <div className="mobile-recipebook-book-copy grid gap-1">
        <strong className="line-clamp-2 text-[14px] font-black leading-[1.2] text-[var(--foreground)]">
          {book.name}
        </strong>
      </div>
      <RecipeCountBadge count={book.recipe_count} />
    </Link>
  );
}

interface MobileCustomBookCardProps {
  book: RecipeBookSummary;
  coverImageSrc: string | null;
  isMenuOpen: boolean;
  isRenaming: boolean;
  isRenamingLoading: boolean;
  lastUpdatedLabel: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  renameValue: string;
  onCancelRename: () => void;
  onChangeColor: () => void;
  onChangeCoverImage: () => void;
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
  lastUpdatedLabel,
  menuRef,
  renameInputRef,
  renameValue,
  onCancelRename,
  onChangeColor,
  onChangeCoverImage,
  onConfirmRename,
  onMenuOpen,
  onRenameStart,
  onRenameValueChange,
  onRequestDelete,
}: MobileCustomBookCardProps) {
  return (
    <div className="relative" role="listitem">
      <div
        className={`mobile-recipebook-book-card mobile-recipebook-book-card-web-ratio relative grid overflow-hidden rounded-[18px_10px_10px_18px] p-0 text-left ${getBookToneClasses(book)}`}
        data-testid={`custom-book-${book.id}`}
      >
        <BookCoverThumb
          book={book}
          imageSrc={coverImageSrc}
        />
        <div className="mobile-recipebook-book-copy grid gap-1">
          {isRenaming ? (
            <>
              <input
                ref={renameInputRef}
                className="mobile-recipebook-rename-input min-w-0 rounded-[12px] px-2.5 py-2 text-[13px] font-extrabold text-[var(--foreground)] outline-none"
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
              <div className="flex gap-1.5">
                <button
                  className="mobile-recipebook-rename-save h-8 rounded-full px-3 text-[11px] font-black disabled:opacity-50"
                  disabled={isRenamingLoading || !renameValue.trim()}
                  onClick={() => void onConfirmRename()}
                  type="button"
                >
                  {isRenamingLoading ? "저장 중" : "완료"}
                </button>
                <button
                  className="mobile-recipebook-rename-cancel h-8 rounded-full px-3 text-[11px] font-black text-[var(--text-3)]"
                  onClick={onCancelRename}
                  type="button"
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <Link
              className="min-w-0"
              href={buildBookDetailHref(book)}
            >
              <strong className="line-clamp-2 text-[14px] font-black leading-[1.2] text-[var(--foreground)]">
              {book.name}
              </strong>
              <span className="mt-1 block text-[11px] font-extrabold text-[var(--text-3)]">
                {lastUpdatedLabel}
              </span>
            </Link>
          )}
        </div>
        <button
          aria-haspopup="menu"
          aria-label={`${book.name} 옵션 메뉴`}
          className="mobile-recipebook-menu-button absolute right-2 top-2 z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-0 text-[18px] font-bold leading-none text-[var(--text-4)]"
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
            className="flex w-full items-center border-t border-[var(--surface-subtle)] px-3 py-2.5 text-left text-[13px] font-bold text-[var(--foreground)]"
            onClick={onChangeColor}
            role="menuitem"
            type="button"
          >
            색상 변경
          </button>
          <button
            className="flex w-full items-center border-t border-[var(--surface-subtle)] px-3 py-2.5 text-left text-[13px] font-bold text-[var(--foreground)]"
            onClick={onChangeCoverImage}
            role="menuitem"
            type="button"
          >
            커버 이미지 변경
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
  book,
  imageSrc,
}: {
  book: RecipeBookSummary;
  imageSrc: string | null;
}) {
  const coverImageSrc = book.cover_image_url ?? imageSrc ?? getMobileFallbackBookCover(book);

  return (
    <span
      aria-hidden="true"
      className="mobile-recipebook-cover-frame mobile-recipebook-cover-thumb block"
    >
      <Image
        alt=""
        className="mobile-recipebook-cover-image mobile-recipebook-cover-thumb-image object-cover"
        data-testid={`mobile-book-cover-${book.id}`}
        height={160}
        src={coverImageSrc}
        unoptimized
        width={180}
      />
    </span>
  );
}

function RecipeCountBadge({ count }: { count: number }) {
  return (
    <span
      aria-label={`레시피 ${formatRecipeCount(count)}`}
      className="mobile-recipebook-count-badge absolute bottom-2 right-2 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black leading-[1.25] text-[var(--foreground)]"
    >
      {formatRecipeCount(count)}
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
      <MobileShoppingCalendar items={items} />
      {isLoadingMore ? (
        <div className="py-4 text-center text-[13px] font-bold text-[var(--text-3)]">
          불러오는 중...
        </div>
      ) : null}
      {hasNext ? <div className="h-4" ref={scrollSentinelRef} /> : null}
    </main>
  );
}

function MobileShoppingCalendar({ items }: { items: ShoppingListHistoryItem[] }) {
  const months = React.useMemo(
    () => buildShoppingHistoryCalendarMonths(items),
    [items],
  );
  const defaultDateKey = React.useMemo(
    () => getLatestShoppingHistoryDateKey(months),
    [months],
  );
  const defaultMonthIndex = React.useMemo(
    () => getShoppingHistoryMonthIndexForDateKey(months, defaultDateKey),
    [defaultDateKey, months],
  );
  const [selectedDateKey, setSelectedDateKey] = React.useState(
    defaultDateKey,
  );
  const [visibleMonthIndex, setVisibleMonthIndex] =
    React.useState(defaultMonthIndex);
  const safeVisibleMonthIndex =
    months.length === 0
      ? -1
      : Math.min(Math.max(visibleMonthIndex, 0), months.length - 1);
  const visibleMonth =
    safeVisibleMonthIndex >= 0 ? months[safeVisibleMonthIndex] : null;
  const selectedMonthIndex = React.useMemo(
    () => getShoppingHistoryMonthIndexForDateKey(months, selectedDateKey),
    [months, selectedDateKey],
  );

  React.useEffect(() => {
    if (!defaultDateKey) return;

    if (
      !selectedDateKey ||
      !findShoppingHistoryDay(months, selectedDateKey)?.items.length
    ) {
      setSelectedDateKey(defaultDateKey);
      setVisibleMonthIndex(defaultMonthIndex);
    }
  }, [defaultDateKey, defaultMonthIndex, months, selectedDateKey]);

  React.useEffect(() => {
    if (safeVisibleMonthIndex >= 0 && safeVisibleMonthIndex !== visibleMonthIndex) {
      setVisibleMonthIndex(safeVisibleMonthIndex);
    }
  }, [safeVisibleMonthIndex, visibleMonthIndex]);

  React.useEffect(() => {
    if (selectedMonthIndex >= 0 && selectedMonthIndex !== safeVisibleMonthIndex) {
      setVisibleMonthIndex(selectedMonthIndex);
    }
  }, [safeVisibleMonthIndex, selectedMonthIndex]);

  const handleMonthChange = React.useCallback(
    (nextIndex: number) => {
      const nextMonth = months[nextIndex];
      if (!nextMonth) return;

      const nextDateKey = getLatestShoppingHistoryDateKeyInMonth(nextMonth);
      setVisibleMonthIndex(nextIndex);
      if (nextDateKey) {
        setSelectedDateKey(nextDateKey);
      }
    },
    [months],
  );

  const selectedDay =
    findShoppingHistoryDay(months, selectedDateKey) ??
    findShoppingHistoryDay(months, defaultDateKey);

  return (
    <div className="space-y-4">
      {selectedDay ? (
        <MobileShoppingSelectedDayPanel day={selectedDay} />
      ) : null}

      <section
        className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3"
        data-testid="shopping-history-calendar"
      >
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <h2 className="min-w-0 text-[16px] font-extrabold leading-[1.3] text-[var(--foreground)]">
              장보기 달력
            </h2>
            <p className="mt-1 text-[12px] font-semibold leading-[1.35] text-[var(--text-3)]">
              달력은 목록을 만든 날짜 기준이에요.
            </p>
          </div>
          <MobileShoppingStatusLegend />
        </div>

        {visibleMonth ? (
          <section className="mt-4" key={visibleMonth.monthKey}>
            <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
              <button
                aria-label="이전 달"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-fill)] text-[20px] font-bold leading-none text-[var(--foreground)] disabled:cursor-default disabled:opacity-30"
                disabled={safeVisibleMonthIndex >= months.length - 1}
                onClick={() => handleMonthChange(safeVisibleMonthIndex + 1)}
                type="button"
              >
                ‹
              </button>
              <h3 className="min-w-0 text-center text-[15px] font-extrabold leading-[1.3] text-[var(--foreground)]">
                {visibleMonth.title}
            </h3>
              <button
                aria-label="다음 달"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-fill)] text-[20px] font-bold leading-none text-[var(--foreground)] disabled:cursor-default disabled:opacity-30"
                disabled={safeVisibleMonthIndex <= 0}
                onClick={() => handleMonthChange(safeVisibleMonthIndex - 1)}
                type="button"
              >
                ›
              </button>
            </div>
            <div
              aria-hidden="true"
              className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-[var(--text-3)]"
            >
              {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {visibleMonth.days.map((day) => (
                <MobileShoppingDayCell
                  day={day}
                  isSelected={day.dateKey === selectedDay?.dateKey}
                  key={day.dateKey}
                  onSelect={setSelectedDateKey}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function MobileShoppingDayCell({
  day,
  isSelected,
  onSelect,
}: {
  day: ShoppingHistoryCalendarDay;
  isSelected: boolean;
  onSelect: (dateKey: string) => void;
}) {
  if (day.dayNumber === null) {
    return (
      <div
        aria-hidden="true"
        className="min-h-[46px] rounded-[var(--radius-control)] border border-transparent bg-transparent"
      />
    );
  }

  const hasItems = day.items.length > 0;
  const completedCount = day.items.filter((item) => item.is_completed).length;
  const activeCount = day.items.length - completedCount;

  if (!hasItems) {
    return (
      <div className="min-h-[46px] rounded-[var(--radius-control)] border border-[var(--surface-subtle)] bg-[var(--surface-fill)] p-1 text-left">
        <span className="block text-[12px] font-bold leading-none text-[var(--text-3)]">
          {day.dayNumber}
        </span>
      </div>
    );
  }

  return (
    <button
      aria-label={buildShoppingDayAriaLabel(day)}
      className={[
        "min-h-[46px] rounded-[var(--radius-control)] border p-1 text-left transition-colors",
        isSelected
          ? "border-[var(--brand)] bg-[var(--brand-soft)]"
          : "border-[var(--surface-subtle)] bg-[var(--surface-fill)]",
      ].join(" ")}
      onClick={() => onSelect(day.dateKey)}
      type="button"
    >
      <span className="block text-[12px] font-extrabold leading-none text-[var(--foreground)]">
        {day.dayNumber}
      </span>
      <span className="mt-2 flex min-h-[12px] items-center gap-1">
        {activeCount > 0 ? (
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[var(--planner-status-registered)]"
          />
        ) : null}
        {completedCount > 0 ? (
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[var(--planner-status-shopping)]"
          />
        ) : null}
        {day.items.length > 1 ? (
          <span className="text-[10px] font-extrabold leading-none text-[var(--text-2)]">
            {day.items.length}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MobileShoppingSelectedDayPanel({
  day,
}: {
  day: ShoppingHistoryCalendarDay;
}) {
  const sortedItems = sortShoppingHistoryItemsForDisplay(day.items);

  return (
    <section
      className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3"
      data-testid="shopping-selected-day-panel"
    >
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-[16px] font-extrabold leading-[1.3] text-[var(--foreground)]">
            {formatShoppingDateKeyLong(day.dateKey)} 만든 장보기
          </h2>
          <p className="mt-1 text-[12px] font-semibold leading-[1.35] text-[var(--text-3)]">
            끼니 범위와 완료일을 따로 확인하세요.
          </p>
        </div>
        <span className="shrink-0 text-[13px] font-extrabold text-[var(--text-3)]">
          {sortedItems.length}개
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {sortedItems.map((item) => (
          <MobileShoppingCard item={item} key={item.id} />
        ))}
      </div>
    </section>
  );
}

function MobileShoppingCard({ item }: { item: ShoppingListHistoryItem }) {
  const isCompleted = item.is_completed;

  return (
    <Link
      className={[
        "block rounded-[var(--radius-control)] border bg-[var(--surface)] px-3 py-3 shadow-[0_1px_4px_var(--overlay-10)]",
        isCompleted
          ? "border-[var(--planner-status-shopping)]"
          : "border-[var(--planner-status-registered)]",
      ].join(" ")}
      data-testid={`shopping-card-${item.id}`}
      href={buildReturnHref(`/shopping/lists/${item.id}`, {
        restore: "shopping-history-tab",
        returnSurface: "mypage.shopping-history",
        returnTo: "/mypage",
      })}
      role="listitem"
    >
      <span className="flex min-w-0 items-start justify-between gap-3">
        <span className="min-w-0">
          <span
            className={[
              "inline-flex h-6 items-center rounded-full px-2 text-[12px] font-extrabold leading-none",
              isCompleted
                ? "bg-[var(--planner-status-shopping-soft)] text-[var(--planner-status-shopping)]"
                : "bg-[var(--planner-status-registered-soft)] text-[var(--planner-status-registered-strong)]",
            ].join(" ")}
          >
            {item.completed_at
              ? `완료 ${formatShoppingHistoryCompletionDate(item.completed_at)}`
              : "진행 중"}
          </span>
          <strong className="mt-2 block truncate text-[15px] font-extrabold leading-[1.3] text-[var(--foreground)]">
            {item.title}
          </strong>
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-[22px] leading-none text-[var(--text-4)]"
        >
          ›
        </span>
      </span>
      <dl className="mt-3 grid gap-1.5 text-[12px] font-semibold leading-[1.35]">
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-[var(--text-3)]">끼니 범위</dt>
          <dd className="min-w-0 text-right text-[var(--foreground)]">
            {formatShoppingHistoryMealRange(item)}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-2">
          <dt className="shrink-0 text-[var(--text-3)]">재료</dt>
          <dd className="min-w-0 text-right text-[var(--foreground)]">
            재료 {item.item_count}개
          </dd>
        </div>
      </dl>
    </Link>
  );
}

function MobileShoppingStatusLegend() {
  return (
    <div
      className="flex shrink-0 items-center gap-2 text-[10px] font-bold leading-none text-[var(--text-3)]"
      data-testid="shopping-status-legend"
    >
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full border-2 border-[var(--planner-status-registered)]"
        />
        진행중
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full border-2 border-[var(--planner-status-shopping)]"
        />
        완료
      </span>
    </div>
  );
}

function getBookToneClasses(book: RecipeBookSummary) {
  if (isMobileBookTone(book.cover_color_key)) {
    return `mobile-recipebook-book-card-${book.cover_color_key}`;
  }

  if (book.book_type === "custom") {
    return `mobile-recipebook-book-card-${getMobileCustomBookTone(book)}`;
  }
  if (book.book_type === "saved") {
    return "mobile-recipebook-book-card-sky";
  }
  if (book.book_type === "liked") {
    return "mobile-recipebook-book-card-coral";
  }
  if (book.book_type === "my_added") {
    return "mobile-recipebook-book-card-lavender";
  }

  return "mobile-recipebook-book-card-sand";
}

const MOBILE_RECIPE_BOOK_TONES = [
  "sage",
  "sky",
  "coral",
  "lavender",
  "sand",
] as const;

function isMobileBookTone(value: unknown): value is (typeof MOBILE_RECIPE_BOOK_TONES)[number] {
  return typeof value === "string"
    && MOBILE_RECIPE_BOOK_TONES.includes(value as (typeof MOBILE_RECIPE_BOOK_TONES)[number]);
}

function getMobileCustomBookTone(book: RecipeBookSummary) {
  return MOBILE_RECIPE_BOOK_TONES[
    Math.abs(book.sort_order) % MOBILE_RECIPE_BOOK_TONES.length
  ] ?? "sage";
}

function getMobileFallbackBookCover(book: RecipeBookSummary) {
  if (book.book_type === "liked") {
    return "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=360&h=320&fit=crop&q=80";
  }
  if (book.book_type === "my_added") {
    return "https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=360&h=320&fit=crop&q=80";
  }
  if (book.book_type === "custom") {
    return "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=360&h=320&fit=crop&q=80";
  }

  return "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=360&h=320&fit=crop&q=80";
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

function formatBookLastUpdated(updatedAt?: string | null) {
  if (!updatedAt) {
    return "마지막 기록 없음";
  }

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "마지막 기록 없음";
  }

  return `마지막 기록 ${date.getMonth() + 1}월 ${date.getDate()}일`;
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
