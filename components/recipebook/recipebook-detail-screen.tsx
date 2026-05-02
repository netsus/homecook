"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
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
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
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

  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);

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
          <SocialLoginButtons nextPath={buildRecipeBookDetailHref({ bookId, bookName, bookType })} />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/mypage"
          >
            마이페이지로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  if (viewState === "loading") {
    return <RecipeBookDetailSkeleton bookName={bookName} />;
  }

  if (viewState === "error") {
    return (
      <div className="pb-32">
        <DetailHeader bookName={bookName} />
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
      </div>
    );
  }

  if (viewState === "empty") {
    return (
      <div className="pb-32">
        <DetailHeader bookName={bookName} />
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
      </div>
    );
  }

  const canRemove = bookType !== "my_added";
  const removeLabel = REMOVE_LABEL[bookType] ?? "제거";

  return (
    <div className="pb-32">
      <DetailHeader bookName={bookName} />
      <div
        aria-live="polite"
        className="space-y-2 px-4 pt-4 max-[360px]:space-y-1 max-[360px]:pt-2"
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
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DetailHeader({ bookName }: { bookName: string }) {
  return (
    <div
      className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-3"
      data-testid="recipebook-detail-header"
    >
      <Link
        aria-label="뒤로 가기"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        href="/mypage"
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
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-[var(--foreground)]">
        {bookName}
      </h1>
    </div>
  );
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
      className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)] max-[360px]:gap-2 max-[360px]:p-2"
      data-testid={`recipe-item-${item.recipe_id}`}
      role="listitem"
    >
      <Link
        className="flex min-w-0 flex-1 items-center gap-3 max-[360px]:gap-2"
        href={`/recipe/${item.recipe_id}`}
      >
        {item.thumbnail_url ? (
          <img
            alt={item.title}
            className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] object-cover max-[360px]:h-14 max-[360px]:w-14"
            src={item.thumbnail_url}
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-fill)] text-2xl max-[360px]:h-14 max-[360px]:w-14">
            🍽️
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-[var(--foreground)] max-[360px]:text-sm">
            {item.title}
          </p>
          {item.tags.length > 0 ? (
            <p className="mt-0.5 truncate text-sm text-[var(--text-3)] max-[360px]:text-xs">
              {item.tags.join(" · ")}
            </p>
          ) : null}
        </div>
      </Link>
      {canRemove ? (
        <button
          aria-label={`${item.title} ${removeLabel}`}
          className="shrink-0 rounded-[var(--radius-md)] border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--text-2)] transition-colors hover:bg-[var(--surface-fill)] disabled:opacity-50 max-[360px]:px-2 max-[360px]:py-1"
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
