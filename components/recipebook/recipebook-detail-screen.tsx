"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { ContentState } from "@/components/shared/content-state";
import { useAppReturn } from "@/components/shared/use-app-return";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { deleteRecipeBook, renameRecipeBook } from "@/lib/api/mypage";
import {
  fetchRecipeBookRecipes,
  removeRecipeBookRecipe,
} from "@/lib/api/recipe";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { RecipeBookRecipeItem, RecipeBookType } from "@/types/recipe";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "empty" | "error" | "ready";

const TOAST_DURATION_MS = 3000;
const PAGE_SIZE = 20;

const REMOVE_LABEL: Record<string, string> = {
  liked: "좋아요 해제",
  saved: "제거",
  custom: "제거",
};

const BOOK_BADGE_LABEL: Record<RecipeBookType, string> = {
  custom: "내 책",
  liked: "좋아요",
  my_added: "내 레시피",
  saved: "저장",
};

function buildRecipeBookDetailHref({
  bookId,
  bookName,
  bookType,
}: {
  bookId: string;
  bookName: string;
  bookType: RecipeBookType;
}) {
  const params = new URLSearchParams({
    type: bookType,
    name: bookName,
  });

  return `/mypage/recipe-books/${bookId}?${params.toString()}`;
}

export interface RecipeBookDetailScreenProps {
  bookId: string;
  bookName: string;
  bookType: RecipeBookType;
  initialAuthenticated?: boolean;
}

export function RecipeBookDetailScreen({
  bookId,
  bookName,
  bookType,
  initialAuthenticated = false,
}: RecipeBookDetailScreenProps) {
  const router = useRouter();
  const isMobileViewport = useIsMobileViewport();
  const appReturn = useAppReturn({ fallback: "/mypage" });
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [currentBookName, setCurrentBookName] = useState(bookName);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [items, setItems] = useState<RecipeBookRecipeItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState("데이터를 불러오지 못했어요");
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [bookMenuOpen, setBookMenuOpen] = useState(false);
  const [bookRenameOpen, setBookRenameOpen] = useState(false);
  const [bookRenameValue, setBookRenameValue] = useState(bookName);
  const [bookDeleteOpen, setBookDeleteOpen] = useState(false);
  const [bookActionError, setBookActionError] = useState<string | null>(null);
  const [isBookActionSaving, setIsBookActionSaving] = useState(false);

  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const canManageBook = bookType === "custom";

  const showToast = useCallback(
    (message: string, tone: "success" | "error") => {
      setToast({ message, tone });
      setTimeout(() => setToast(null), TOAST_DURATION_MS);
    },
    [],
  );

  const loadRecipes = useCallback(
    async (nextCursor?: string) => {
      try {
        if (!nextCursor) {
          setErrorMessage("데이터를 불러오지 못했어요");
        }

        const result = await fetchRecipeBookRecipes(bookId, {
          cursor: nextCursor,
          limit: PAGE_SIZE,
        });

        if (!result.success || !result.data) {
          if (!nextCursor) {
            setErrorMessage(result.error?.message ?? "데이터를 불러오지 못했어요");
            setViewState("error");
          }
          return;
        }

        if (nextCursor) {
          setItems((prev) => mergeUniqueRecipeItems(prev, result.data!.items));
        } else {
          setItems(result.data.items);
        }

        setCursor(result.data.next_cursor);
        setHasNext(result.data.has_next);

        if (!nextCursor) {
          setViewState(result.data.items.length === 0 ? "empty" : "ready");
        }
      } catch {
        if (!nextCursor) {
          setErrorMessage("데이터를 불러오지 못했어요");
          setViewState("error");
        }
      }
    },
    [bookId],
  );

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await loadRecipes(cursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, loadRecipes]);

  const handleRemove = useCallback(
    async (recipeId: string) => {
      if (removingId) return;
      setRemovingId(recipeId);

      // Optimistic removal
      const previousItems = items;
      setItems((prev) => prev.filter((item) => item.recipe_id !== recipeId));

      const result = await removeRecipeBookRecipe(bookId, recipeId);

      if (result.success) {
        showToast(
          bookType === "liked" ? "좋아요를 해제했어요" : "레시피를 제거했어요",
          "success",
        );
        // If list is now empty, switch to empty state
        if (previousItems.length === 1) {
          setViewState("empty");
        }
      } else {
        // Rollback on failure
        setItems(previousItems);
        setViewState(previousItems.length === 0 ? "empty" : "ready");
        showToast(
          result.error?.message ?? "제거에 실패했어요",
          "error",
        );
      }

      setRemovingId(null);
    },
    [bookId, bookType, items, removingId, showToast],
  );

  const handleBookRenameStart = useCallback(() => {
    setBookMenuOpen(false);
    setBookRenameValue(currentBookName);
    setBookActionError(null);
    setBookRenameOpen(true);
  }, [currentBookName]);

  const handleBookRenameCancel = useCallback(() => {
    setBookRenameOpen(false);
    setBookRenameValue(currentBookName);
    setBookActionError(null);
  }, [currentBookName]);

  const handleBookRename = useCallback(async () => {
    if (!canManageBook || isBookActionSaving) return;

    const trimmed = bookRenameValue.trim();
    if (!trimmed) return;

    if (trimmed === currentBookName) {
      handleBookRenameCancel();
      return;
    }

    setIsBookActionSaving(true);
    setBookActionError(null);

    try {
      const result = await renameRecipeBook(bookId, trimmed);
      setCurrentBookName(result.name);
      setBookRenameOpen(false);
      showToast("레시피북 이름을 변경했어요", "success");
    } catch (error) {
      setBookActionError(
        error instanceof Error ? error.message : "이름 변경에 실패했어요.",
      );
    } finally {
      setIsBookActionSaving(false);
    }
  }, [
    bookId,
    bookRenameValue,
    canManageBook,
    currentBookName,
    handleBookRenameCancel,
    isBookActionSaving,
    showToast,
  ]);

  const handleBookDeleteRequest = useCallback(() => {
    setBookMenuOpen(false);
    setBookActionError(null);
    setBookDeleteOpen(true);
  }, []);

  const handleBookDelete = useCallback(async () => {
    if (!canManageBook || isBookActionSaving) return;

    setIsBookActionSaving(true);
    setBookActionError(null);

    try {
      await deleteRecipeBook(bookId);
      router.replace(appReturn.href);
    } catch (error) {
      setBookActionError(
        error instanceof Error ? error.message : "레시피북 삭제에 실패했어요.",
      );
    } finally {
      setIsBookActionSaving(false);
    }
  }, [appReturn.href, bookId, canManageBook, isBookActionSaving, router]);

  const renderDetailHeader = () => (
    <DetailHeader
      backHref={appReturn.href}
      bookName={currentBookName}
      canManageBook={canManageBook}
      errorMessage={bookRenameOpen ? bookActionError : null}
      isMenuOpen={bookMenuOpen}
      isRenaming={bookRenameOpen}
      isSaving={isBookActionSaving}
      onDeleteRequest={handleBookDeleteRequest}
      onMenuToggle={() => setBookMenuOpen((current) => !current)}
      onRenameCancel={handleBookRenameCancel}
      onRenameConfirm={() => void handleBookRename()}
      onRenameStart={handleBookRenameStart}
      onRenameValueChange={setBookRenameValue}
      renameValue={bookRenameValue}
    />
  );

  const renderBookDeleteDialog = () =>
    bookDeleteOpen ? (
      <BookDeleteConfirmDialog
        bookName={currentBookName}
        disabled={isBookActionSaving}
        errorMessage={bookActionError}
        mobile={isMobileViewport}
        onCancel={() => {
          setBookDeleteOpen(false);
          setBookActionError(null);
        }}
        onConfirm={() => void handleBookDelete()}
      />
    ) : null;

  // Auth check
  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setAuthState(e2eAuthOverride ? "authenticated" : "unauthorized");
      return;
    }

    if (initialAuthenticated) {
      setAuthState("authenticated");

      if (!hasSupabasePublicEnv()) {
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, session: Session | null) => {
          setAuthState(session ? "authenticated" : "unauthorized");
        },
      );

      return () => {
        subscription.unsubscribe();
      };
    }

    if (!hasSupabasePublicEnv()) {
      setAuthState("unauthorized");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setAuthState(result.data.session ? "authenticated" : "unauthorized");
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setAuthState(session ? "authenticated" : "unauthorized");
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [initialAuthenticated]);

  // Load data on auth
  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadRecipes();
  }, [authState, loadRecipes]);

  // Infinite scroll observer
  useEffect(() => {
    if (!hasNext) return;

    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNext, loadMore]);

  // --- Render states ---

  if (authState === "checking") {
    return (
      <ContentState
        className="md:px-7"
        description="로그인 상태를 확인하고 있어요."
        tone="loading"
        title="잠시만 기다려주세요"
      />
    );
  }

  if (authState === "unauthorized") {
    return (
      <ContentState
        className="-mt-5 md:mt-0"
        description="레시피북을 보려면 로그인이 필요해요."
        eyebrow="레시피북 접근"
        safeBottomPadding
        title="이 화면은 로그인이 필요해요"
        tone="gate"
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              로그인하면 레시피북으로 바로 복귀해요.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
              저장한 레시피를 확인하고 관리할 수 있어요.
            </p>
          </div>
          <SocialLoginButtons
            nextPath={buildRecipeBookDetailHref({
              bookId,
              bookName: currentBookName,
              bookType,
            })}
          />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href={appReturn.href}
          >
            마이페이지로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  if (viewState === "loading") {
    return <RecipeBookDetailSkeleton bookName={currentBookName} />;
  }

  if (viewState === "error") {
    return (
      <div className="pb-32">
        {renderDetailHeader()}
        <div className="flex flex-col items-center justify-center px-4 py-16">
          <h2 className="text-lg font-bold text-[var(--foreground)]">
            {errorMessage}
          </h2>
          <button
            className="mt-4 flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white"
            onClick={() => void loadRecipes()}
            type="button"
          >
            다시 시도
          </button>
        </div>
        {renderBookDeleteDialog()}
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div className="pb-32">
        {renderDetailHeader()}
        <ContentState
          className="mx-4 mt-8"
          description="레시피를 추가하면 여기에 표시돼요."
          title="아직 이 레시피북에 레시피가 없어요"
          tone="empty"
          variant="subtle"
        >
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--brand)] px-5 py-3 text-sm font-semibold text-[var(--brand)]"
            href="/"
          >
            레시피 둘러보기
          </Link>
        </ContentState>
        {renderBookDeleteDialog()}
      </div>
    );
  }

  const canRemove = bookType !== "my_added";
  const removeLabel = REMOVE_LABEL[bookType] ?? "제거";

  if (isMobileViewport) {
    return (
      <MobileRecipeBookDetailView
        backHref={appReturn.href}
        bookMenuOpen={bookMenuOpen}
        bookName={currentBookName}
        bookRenameOpen={bookRenameOpen}
        bookRenameValue={bookRenameValue}
        bookType={bookType}
        canManageBook={canManageBook}
        canRemove={canRemove}
        errorMessage={bookActionError}
        hasNext={hasNext}
        isLoadingMore={isLoadingMore}
        isSaving={isBookActionSaving}
        items={items}
        onDeleteRequest={handleBookDeleteRequest}
        onMenuToggle={() => setBookMenuOpen((current) => !current)}
        onRemove={(recipeId) => void handleRemove(recipeId)}
        onRenameCancel={handleBookRenameCancel}
        onRenameConfirm={() => void handleBookRename()}
        onRenameStart={handleBookRenameStart}
        onRenameValueChange={setBookRenameValue}
        removeLabel={removeLabel}
        removingId={removingId}
        renderBookDeleteDialog={renderBookDeleteDialog}
        scrollSentinelRef={scrollSentinelRef}
        toast={toast}
      />
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {renderDetailHeader()}
      <div
        aria-live="polite"
        className="grid gap-4 lg:grid-cols-2"
        data-testid="recipebook-detail-list"
        role="list"
      >
        {items.map((item) => (
          <RecipeItemCard
            canRemove={canRemove}
            item={item}
            key={item.recipe_id}
            onRemove={() => void handleRemove(item.recipe_id)}
            removeLabel={removeLabel}
            removing={removingId === item.recipe_id}
          />
        ))}
      </div>
      {isLoadingMore ? (
        <div className="flex justify-center py-4">
          <Skeleton className="h-5 w-32" />
        </div>
      ) : null}
      {hasNext ? <div ref={scrollSentinelRef} className="h-4" /> : null}

      {/* Toast */}
      {toast ? (
        <div
          className={`fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-[var(--radius-lg)] px-4 py-3 text-center text-sm font-semibold shadow-lg ${
            toast.tone === "success"
              ? "bg-[var(--olive)] text-white"
              : "bg-[var(--danger)] text-white"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
      {renderBookDeleteDialog()}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface DetailHeaderProps {
  backHref?: string;
  bookName: string;
  canManageBook?: boolean;
  isMenuOpen?: boolean;
  isRenaming?: boolean;
  isSaving?: boolean;
  renameValue?: string;
  errorMessage?: string | null;
  onMenuToggle?: () => void;
  onRenameStart?: () => void;
  onRenameCancel?: () => void;
  onRenameConfirm?: () => void;
  onRenameValueChange?: (value: string) => void;
  onDeleteRequest?: () => void;
}

function DetailHeader({
  backHref = "/mypage",
  bookName,
  canManageBook = false,
  isMenuOpen = false,
  isRenaming = false,
  isSaving = false,
  renameValue = "",
  errorMessage = null,
  onMenuToggle,
  onRenameStart,
  onRenameCancel,
  onRenameConfirm,
  onRenameValueChange,
  onDeleteRequest,
}: DetailHeaderProps) {
  return (
      <div
        className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-4 py-4 shadow-[var(--shadow-1)]"
        data-testid="recipebook-detail-header"
      >
      <Link
        aria-label="뒤로 가기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        href={backHref}
      >
        <svg
          aria-hidden="true"
          className="h-6 w-6 text-[var(--text-2)]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path
            d="M15 19l-7-7 7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      {isRenaming ? (
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <input
              aria-label="레시피북 이름"
              className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--brand)] bg-[var(--surface-fill)] px-3 text-base font-semibold text-[var(--foreground)] outline-none"
              disabled={isSaving}
              maxLength={50}
              onChange={(event) => onRenameValueChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onRenameConfirm?.();
                if (event.key === "Escape") onRenameCancel?.();
              }}
              value={renameValue}
            />
            <button
              className="flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-3 text-sm font-bold text-white disabled:opacity-50"
              disabled={isSaving || !renameValue.trim()}
              onClick={onRenameConfirm}
              type="button"
            >
              {isSaving ? "저장 중..." : "완료"}
            </button>
            <button
              className="flex min-h-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] px-3 text-sm font-semibold text-[var(--text-2)] disabled:opacity-50"
              disabled={isSaving}
              onClick={onRenameCancel}
              type="button"
            >
              취소
            </button>
          </div>
          {errorMessage ? (
            <p className="mt-1 text-xs font-semibold text-[var(--danger)]">
              {errorMessage}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-[-0.3px] text-[var(--foreground)]">
            {bookName}
          </h1>
          {canManageBook ? (
            <div className="relative">
              <button
                aria-controls="recipebook-detail-book-menu"
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label={`${bookName} 옵션 메뉴`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
                onClick={onMenuToggle}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <circle cx="10" cy="4" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="10" cy="16" r="1.5" />
                </svg>
              </button>
              {isMenuOpen ? (
                <div
                  id="recipebook-detail-book-menu"
                  className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-2)]"
                  role="menu"
                >
                  <button
                    className="flex w-full items-center px-4 py-3 text-base font-medium text-[var(--foreground)] hover:bg-[var(--surface-fill)]"
                    onClick={onRenameStart}
                    role="menuitem"
                    type="button"
                  >
                    이름 변경
                  </button>
                  <div className="border-t border-[var(--line)]" />
                  <button
                    className="flex w-full items-center px-4 py-3 text-base font-medium text-[var(--danger)] hover:bg-[var(--surface-fill)]"
                    onClick={onDeleteRequest}
                    role="menuitem"
                    type="button"
                  >
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function BookDeleteConfirmDialog({
  bookName,
  disabled,
  errorMessage,
  mobile = false,
  onCancel,
  onConfirm,
}: {
  bookName: string;
  disabled: boolean;
  errorMessage: string | null;
  mobile?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (mobile) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
        <div
          aria-describedby="recipebook-delete-description"
          aria-labelledby="recipebook-delete-title"
          aria-modal="true"
          className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(14px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_28px_rgba(0,0,0,0.18)]"
          role="alertdialog"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-9 rounded-full bg-[#DEE2E6] min-[390px]:hidden"
          />
          <h2
            className="text-[18px] font-extrabold leading-[1.35] text-[#212529]"
            id="recipebook-delete-title"
          >
            이 레시피북을 삭제할까요?
          </h2>
          <p
            className="mt-4 text-[13px] font-medium leading-[1.45] text-[#495057]"
            id="recipebook-delete-description"
          >
            레시피북 안의 레시피는 삭제되지 않아요.
          </p>
          {errorMessage ? (
            <p
              className="mt-3 rounded-lg bg-[#FFF5F5] px-3 py-2 text-[13px] font-bold text-[#FF6B6B]"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              className="flex h-11 items-center justify-center rounded-lg border border-[#DEE2E6] bg-white text-[14px] font-extrabold text-[#495057] disabled:opacity-50"
              disabled={disabled}
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="flex h-11 items-center justify-center rounded-lg bg-[#FF6B6B] text-[14px] font-extrabold text-white disabled:opacity-50"
              disabled={disabled}
              onClick={onConfirm}
              type="button"
            >
              {disabled ? "삭제 중..." : "삭제하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        aria-describedby="recipebook-delete-description"
        aria-labelledby="recipebook-delete-title"
        aria-modal="true"
        className="w-full max-w-sm rounded-[var(--radius-xl)] bg-[var(--surface)] p-6 shadow-[var(--shadow-3)]"
        role="alertdialog"
      >
        <h2
          className="text-lg font-bold text-[var(--foreground)]"
          id="recipebook-delete-title"
        >
          레시피북을 삭제할까요?
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-[var(--text-3)]"
          id="recipebook-delete-description"
        >
          &ldquo;{bookName}&rdquo;을 삭제하면 되돌릴 수 없어요.
        </p>
        {errorMessage ? (
          <p
            className="mt-3 rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-2 text-sm font-semibold text-[var(--danger)]"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] text-sm font-semibold text-[var(--text-2)] disabled:opacity-50"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--danger)] text-sm font-semibold text-white disabled:opacity-50"
            disabled={disabled}
            onClick={onConfirm}
            type="button"
          >
            {disabled ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileRecipeBookDetailView({
  backHref,
  bookMenuOpen,
  bookName,
  bookRenameOpen,
  bookRenameValue,
  bookType,
  canManageBook,
  canRemove,
  errorMessage,
  hasNext,
  isLoadingMore,
  isSaving,
  items,
  onDeleteRequest,
  onMenuToggle,
  onRemove,
  onRenameCancel,
  onRenameConfirm,
  onRenameStart,
  onRenameValueChange,
  removeLabel,
  removingId,
  renderBookDeleteDialog,
  scrollSentinelRef,
  toast,
}: {
  backHref: string;
  bookMenuOpen: boolean;
  bookName: string;
  bookRenameOpen: boolean;
  bookRenameValue: string;
  bookType: RecipeBookType;
  canManageBook: boolean;
  canRemove: boolean;
  errorMessage: string | null;
  hasNext: boolean;
  isLoadingMore: boolean;
  isSaving: boolean;
  items: RecipeBookRecipeItem[];
  onDeleteRequest: () => void;
  onMenuToggle: () => void;
  onRemove: (recipeId: string) => void;
  onRenameCancel: () => void;
  onRenameConfirm: () => void;
  onRenameStart: () => void;
  onRenameValueChange: (value: string) => void;
  removeLabel: string;
  removingId: string | null;
  renderBookDeleteDialog: () => React.ReactNode;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
  toast: { message: string; tone: "success" | "error" } | null;
}) {
  return (
    <div
      className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
      data-testid="recipebook-detail-mobile"
    >
      <MobileRecipeBookAppBar
        backHref={backHref}
        bookName={bookName}
        canManageBook={canManageBook}
        isMenuOpen={bookMenuOpen}
        onDeleteRequest={onDeleteRequest}
        onMenuToggle={onMenuToggle}
        onRenameStart={onRenameStart}
      />
      <MobileRecipeBookSummary
        bookName={bookName}
        bookType={bookType}
        count={items.length}
      />

      <div
        aria-live="polite"
        className="space-y-[10px] p-4"
        data-testid="recipebook-detail-list"
        role="list"
      >
        {items.map((item) => (
          <MobileRecipeBookRecipeCard
            canRemove={canRemove}
            item={item}
            key={item.recipe_id}
            onRemove={() => onRemove(item.recipe_id)}
            removeLabel={removeLabel}
            removing={removingId === item.recipe_id}
          />
        ))}
      </div>
      {isLoadingMore ? (
        <div className="flex justify-center py-4">
          <Skeleton className="h-5 w-32" />
        </div>
      ) : null}
      {hasNext ? <div ref={scrollSentinelRef} className="h-4" /> : null}
      {toast ? (
        <div
          className={[
            "fixed inset-x-4 bottom-[calc(86px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-lg px-4 py-3 text-center text-[13px] font-extrabold shadow-lg",
            toast.tone === "success"
              ? "bg-[#E6FCF5] text-[#099268]"
              : "bg-[#FFF5F5] text-[#FF6B6B]",
          ].join(" ")}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
      {bookRenameOpen ? (
        <MobileRecipeBookRenameSheet
          disabled={isSaving}
          errorMessage={errorMessage}
          onCancel={onRenameCancel}
          onConfirm={onRenameConfirm}
          onValueChange={onRenameValueChange}
          value={bookRenameValue}
        />
      ) : null}
      {renderBookDeleteDialog()}
      <Wave1MobileBottomTab
        ariaLabel="레시피북 상세 하단 탭"
        currentTab="mypage"
      />
    </div>
  );
}

function MobileRecipeBookAppBar({
  backHref,
  bookName,
  canManageBook,
  isMenuOpen,
  onDeleteRequest,
  onMenuToggle,
  onRenameStart,
}: {
  backHref: string;
  bookName: string;
  canManageBook: boolean;
  isMenuOpen: boolean;
  onDeleteRequest: () => void;
  onMenuToggle: () => void;
  onRenameStart: () => void;
}) {
  return (
    <div
      className="sticky top-0 z-30 flex min-h-[52px] items-center justify-center border-b border-[#DEE2E6] bg-white px-4"
      style={{ borderBottomWidth: "0.5px" }}
    >
      <Link
        aria-label="뒤로 가기"
        className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start text-[#212529]"
        href={backHref}
      >
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
      </Link>
      <h1 className="max-w-[190px] truncate text-center text-[18px] font-extrabold leading-none text-[#212529] min-[390px]:max-w-[230px]">
        {bookName}
      </h1>
      {canManageBook ? (
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <button
            aria-controls="recipebook-detail-book-menu"
            aria-expanded={isMenuOpen}
            aria-haspopup="menu"
            aria-label={`${bookName} 옵션 메뉴`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[18px] font-bold leading-none text-[#868E96]"
            onClick={onMenuToggle}
            type="button"
          >
            ⋯
          </button>
          {isMenuOpen ? (
            <div
              className="absolute right-0 top-full z-40 mt-2 w-36 overflow-hidden rounded-lg border border-[#DEE2E6] bg-white shadow-[0_8px_22px_rgba(0,0,0,0.14)]"
              id="recipebook-detail-book-menu"
              role="menu"
            >
              <button
                className="flex w-full items-center px-4 py-3 text-[14px] font-bold text-[#212529]"
                onClick={onRenameStart}
                role="menuitem"
                type="button"
              >
                이름 변경
              </button>
              <div className="border-t border-[#DEE2E6]" />
              <button
                className="flex w-full items-center px-4 py-3 text-[14px] font-bold text-[#FF6B6B]"
                onClick={onDeleteRequest}
                role="menuitem"
                type="button"
              >
                삭제
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MobileRecipeBookSummary({
  bookName,
  bookType,
  count,
}: {
  bookName: string;
  bookType: RecipeBookType;
  count: number;
}) {
  return (
    <section
      className="border-b border-[#DEE2E6] bg-white px-5 py-5"
      data-testid="recipebook-detail-header"
    >
      <div className="flex items-center gap-[14px]">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[#E6FCF5] text-[26px]">
          <span aria-hidden="true">{getBookEmoji(bookType, bookName)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-[17px] font-extrabold leading-[1.3] text-[#212529]">
              {bookName}
            </h2>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold leading-[1.2] text-[#868E96] bg-[#F8F9FA]">
              {BOOK_BADGE_LABEL[bookType]}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] font-medium leading-[1.3] text-[#868E96]">
            {count}개 레시피
          </p>
        </div>
      </div>
    </section>
  );
}

function MobileRecipeBookRecipeCard({
  canRemove,
  item,
  onRemove,
  removeLabel,
  removing,
}: RecipeItemCardProps) {
  return (
    <article
      className="flex min-h-[82px] items-center gap-3 rounded-xl border border-[#DEE2E6] bg-white p-3"
      data-testid={`recipe-item-${item.recipe_id}`}
      role="listitem"
    >
      <Link
        className="flex min-w-0 flex-1 items-center gap-3"
        href={`/recipe/${item.recipe_id}`}
      >
        <MobileRecipeThumb item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold leading-[1.35] text-[#212529]">
            {item.title}
          </p>
          {item.tags.length > 0 ? (
            <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.35] text-[#868E96]">
              {item.tags.join(" · ")}
            </p>
          ) : null}
          <p className="mt-0.5 truncate text-[11px] font-medium leading-[1.35] text-[#868E96]">
            조회 {formatRecipeBookMetric(item.view_count)} · {item.total_duration_text ?? "시간 미정"} · {item.base_servings}인분
          </p>
        </div>
      </Link>
      {canRemove ? (
        <button
          aria-label={`${item.title} ${removeLabel}`}
          className="h-9 shrink-0 rounded-lg border border-[#DEE2E6] bg-white px-3 text-[11px] font-extrabold text-[#495057] disabled:opacity-50"
          disabled={removing}
          onClick={onRemove}
          type="button"
        >
          {removing ? "처리 중..." : removeLabel}
        </button>
      ) : null}
    </article>
  );
}

function MobileRecipeThumb({ item }: { item: RecipeBookRecipeItem }) {
  if (item.thumbnail_url) {
    return (
      <Image
        alt={item.title}
        className="h-14 w-14 shrink-0 rounded-[10px] object-cover"
        height={56}
        src={item.thumbnail_url}
        unoptimized
        width={56}
      />
    );
  }

  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] text-[24px]"
      style={{ backgroundColor: getRecipeThumbColor(item.title) }}
    >
      <span aria-hidden="true">{getRecipeEmoji(item.title)}</span>
    </div>
  );
}

function MobileRecipeBookRenameSheet({
  disabled,
  errorMessage,
  onCancel,
  onConfirm,
  onValueChange,
  value,
}: {
  disabled: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div
        aria-modal="true"
        className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-8px_28px_rgba(0,0,0,0.18)]"
        role="dialog"
      >
        <h2 className="text-[18px] font-extrabold text-[#212529]">
          레시피북 이름 변경
        </h2>
        <input
          aria-label="레시피북 이름"
          className="mt-4 h-12 w-full rounded-lg border border-[#DEE2E6] bg-[#F8F9FA] px-3 text-[15px] font-bold text-[#212529] outline-none focus:border-[#2AC1BC]"
          disabled={disabled}
          maxLength={50}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm();
            if (event.key === "Escape") onCancel();
          }}
          value={value}
        />
        {errorMessage ? (
          <p className="mt-2 text-[13px] font-bold text-[#FF6B6B]" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            className="h-11 rounded-lg border border-[#DEE2E6] bg-white text-[14px] font-extrabold text-[#495057] disabled:opacity-50"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-11 rounded-lg bg-[#2AC1BC] text-[14px] font-extrabold text-white disabled:opacity-50"
            disabled={disabled || !value.trim()}
            onClick={onConfirm}
            type="button"
          >
            {disabled ? "저장 중..." : "완료"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getBookEmoji(bookType: RecipeBookType, bookName: string) {
  if (bookType === "saved") return "🔖";
  if (bookType === "liked") return "❤️";
  if (bookType === "my_added") return "✏️";
  if (bookName.includes("주말")) return "🍽️";
  return "🍳";
}

function getRecipeEmoji(title: string) {
  if (title.includes("볶음밥") || title.includes("밥")) return "🍚";
  if (title.includes("샐러드")) return "🥗";
  if (title.includes("제육") || title.includes("고기")) return "🥩";
  if (title.includes("찌개")) return "🍲";
  return "🍽️";
}

function getRecipeThumbColor(title: string) {
  if (title.includes("샐러드")) return "#D8F5A2";
  if (title.includes("제육") || title.includes("고기")) return "#FFC9C9";
  if (title.includes("볶음밥") || title.includes("밥")) return "#FFD8CC";
  return "#F1F3F5";
}

function mergeUniqueRecipeItems(
  currentItems: RecipeBookRecipeItem[],
  nextItems: RecipeBookRecipeItem[],
) {
  const seen = new Set(currentItems.map((item) => item.recipe_id));
  const uniqueNextItems = nextItems.filter((item) => {
    if (seen.has(item.recipe_id)) {
      return false;
    }

    seen.add(item.recipe_id);
    return true;
  });

  return [...currentItems, ...uniqueNextItems];
}

function RecipeBookDetailSkeleton({ bookName }: { bookName: string }) {
  return (
    <div className="pb-32" data-testid="recipebook-detail-skeleton">
      <DetailHeader bookName={bookName} />
      <div className="space-y-2 px-4 pt-4 max-[360px]:space-y-1 max-[360px]:pt-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)]"
          >
            <Skeleton className="h-16 w-16 shrink-0 rounded-[var(--radius-md)]" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RecipeItemCardProps {
  item: RecipeBookRecipeItem;
  canRemove: boolean;
  removeLabel: string;
  removing: boolean;
  onRemove: () => void;
}

function RecipeItemCard({
  item,
  canRemove,
  removeLabel,
  removing,
  onRemove,
}: RecipeItemCardProps) {
  return (
    <div
      className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)] transition hover:border-[var(--brand)] hover:shadow-[var(--shadow-2)]"
      data-testid={`recipe-item-${item.recipe_id}`}
      role="listitem"
    >
      <Link
        className="flex min-w-0 flex-1 items-center gap-4"
        href={`/recipe/${item.recipe_id}`}
      >
        {item.thumbnail_url ? (
          <Image
            alt={item.title}
            className="h-24 w-24 shrink-0 rounded-[var(--radius-md)] object-cover"
            height={96}
            src={item.thumbnail_url}
            unoptimized
            width={96}
          />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-fill)] text-3xl">
            🍽️
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold tracking-[-0.3px] text-[var(--foreground)]">
            {item.title}
          </p>
          {item.tags.length > 0 ? (
            <p className="mt-1 truncate text-sm text-[var(--text-3)]">
              {item.tags.join(" · ")}
            </p>
          ) : null}
          <p className="mt-2 truncate text-sm text-[var(--text-3)]">
            조회 {formatRecipeBookMetric(item.view_count)} · {item.total_duration_text ?? "시간 미정"} · {item.base_servings}인분
          </p>
        </div>
      </Link>
      {canRemove ? (
        <button
          aria-label={`${item.title} ${removeLabel}`}
          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--surface-fill)] disabled:opacity-50"
          disabled={removing}
          onClick={onRemove}
          type="button"
        >
          {removing ? "처리 중..." : removeLabel}
        </button>
      ) : null}
    </div>
  );
}

function formatRecipeBookMetric(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    notation: value >= 1000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}
