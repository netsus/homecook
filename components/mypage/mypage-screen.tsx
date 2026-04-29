"use client";

import Link from "next/link";
import React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ContentState } from "@/components/shared/content-state";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import {
  createRecipeBook,
  deleteRecipeBook,
  fetchRecipeBooks,
  fetchShoppingHistory,
  fetchUserProfile,
  isMypageApiError,
  renameRecipeBook,
  type UserProfileData,
} from "@/lib/api/mypage";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { RecipeBookSummary } from "@/types/recipe";
import type { ShoppingListHistoryItem } from "@/types/shopping";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";
type MypageTab = "recipebook" | "shopping";

const TOAST_DURATION_MS = 3000;
const SHOPPING_PAGE_SIZE = 10;

const SOCIAL_PROVIDER_LABELS: Record<string, string> = {
  kakao: "카카오 로그인",
  naver: "네이버 로그인",
  google: "Google 로그인",
};

const SYSTEM_BOOK_ICON: Record<string, { icon: string; colorClass: string }> = {
  my_added: { icon: "📝", colorClass: "text-[var(--text-2)]" },
  saved: { icon: "🔖", colorClass: "text-[var(--olive)]" },
  liked: { icon: "❤️", colorClass: "text-[var(--brand)]" },
};

export interface MypageScreenProps {
  initialAuthenticated?: boolean;
}

export function MypageScreen({
  initialAuthenticated = false,
}: MypageScreenProps) {
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [activeTab, setActiveTab] = useState<MypageTab>("recipebook");

  // Profile
  const [profile, setProfile] = useState<UserProfileData | null>(null);

  // Recipe books
  const [books, setBooks] = useState<RecipeBookSummary[]>([]);

  // Shopping history
  const [shoppingItems, setShoppingItems] = useState<ShoppingListHistoryItem[]>([]);
  const [shoppingCursor, setShoppingCursor] = useState<string | null>(null);
  const [shoppingHasNext, setShoppingHasNext] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [shoppingLoaded, setShoppingLoaded] = useState(false);

  // CRUD states
  const [menuOpenBookId, setMenuOpenBookId] = useState<string | null>(null);
  const [renamingBookId, setRenamingBookId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecipeBookSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [showCreateInput, setShowCreateInput] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  // Refs
  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  // --- Data loading ---

  const loadRecipeBooks = useCallback(async () => {
    try {
      const result = await fetchRecipeBooks();
      setBooks(result.books);
      return true;
    } catch (error) {
      if (isMypageApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return false;
      }
      throw error;
    }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const result = await fetchUserProfile();
      setProfile(result);
      return true;
    } catch (error) {
      if (isMypageApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return false;
      }
      throw error;
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setViewState("loading");
    try {
      const [profileOk, booksOk] = await Promise.all([loadProfile(), loadRecipeBooks()]);
      if (profileOk && booksOk) {
        setViewState("ready");
      }
    } catch {
      setViewState("error");
    }
  }, [loadProfile, loadRecipeBooks]);

  const loadShoppingHistory = useCallback(async (cursor?: string) => {
    try {
      const result = await fetchShoppingHistory({
        cursor,
        limit: SHOPPING_PAGE_SIZE,
      });
      if (cursor) {
        setShoppingItems((prev) => [...prev, ...result.items]);
      } else {
        setShoppingItems(result.items);
      }
      setShoppingCursor(result.next_cursor);
      setShoppingHasNext(result.has_next);
      setShoppingLoaded(true);
    } catch (error) {
      if (isMypageApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      if (!cursor) {
        setViewState("error");
      }
    }
  }, []);

  const loadMoreShopping = useCallback(async () => {
    if (!shoppingCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await loadShoppingHistory(shoppingCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [shoppingCursor, isLoadingMore, loadShoppingHistory]);

  // --- CRUD handlers ---

  const handleCreateBook = useCallback(async () => {
    const trimmed = createName.trim();
    if (!trimmed) return;
    setIsCreating(true);
    try {
      await createRecipeBook(trimmed);
      await loadRecipeBooks();
      setShowCreateInput(false);
      setCreateName("");
      showToast("레시피북을 만들었어요", "success");
    } catch (error) {
      if (isMypageApiError(error) && error.code === "VALIDATION_ERROR") {
        showToast("레시피북 이름을 확인해 주세요", "error");
      } else {
        showToast("레시피북 만들기에 실패했어요", "error");
      }
    } finally {
      setIsCreating(false);
    }
  }, [createName, loadRecipeBooks, showToast]);

  const handleRenameBook = useCallback(async () => {
    if (!renamingBookId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setIsRenaming(true);
    try {
      await renameRecipeBook(renamingBookId, trimmed);
      await loadRecipeBooks();
      setRenamingBookId(null);
      setRenameValue("");
      showToast("이름을 변경했어요", "success");
    } catch {
      showToast("이름 변경에 실패했어요", "error");
    } finally {
      setIsRenaming(false);
    }
  }, [renamingBookId, renameValue, loadRecipeBooks, showToast]);

  const handleDeleteBook = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteRecipeBook(deleteTarget.id);
      await loadRecipeBooks();
      setDeleteTarget(null);
      showToast("삭제했어요", "success");
    } catch {
      showToast("삭제에 실패했어요", "error");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, loadRecipeBooks, showToast]);

  // --- Effects ---

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

  // Load initial data on auth
  useEffect(() => {
    if (authState !== "authenticated") return;
    void loadInitialData();
  }, [authState, loadInitialData]);

  // Load shopping history when tab switches
  useEffect(() => {
    if (authState !== "authenticated" || activeTab !== "shopping" || shoppingLoaded) return;
    void loadShoppingHistory();
  }, [authState, activeTab, shoppingLoaded, loadShoppingHistory]);

  // Infinite scroll observer for shopping tab
  useEffect(() => {
    if (activeTab !== "shopping" || !shoppingHasNext) return;

    const sentinel = scrollSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreShopping();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [activeTab, shoppingHasNext, loadMoreShopping]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingBookId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingBookId]);

  // Focus create input when showing create mode
  useEffect(() => {
    if (showCreateInput && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [showCreateInput]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenBookId) return;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenBookId(null);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpenBookId]);

  // --- Render helpers ---

  const systemBooks = books.filter((b) => b.book_type !== "custom");
  const customBooks = books.filter((b) => b.book_type === "custom");

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
        description="마이페이지를 보려면 로그인이 필요해요."
        eyebrow="마이페이지 접근"
        safeBottomPadding
        title="이 화면은 로그인이 필요해요"
        tone="gate"
      >
        <div className="space-y-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              로그인하면 마이페이지로 바로 복귀해요.
            </p>
            <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
              레시피북, 장보기 기록 등 나만의 데이터를 확인할 수 있어요.
            </p>
          </div>
          <SocialLoginButtons nextPath="/mypage" />
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
            href="/"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </ContentState>
    );
  }

  if (viewState === "loading") {
    return <MypageLoadingSkeleton />;
  }

  if (viewState === "error") {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16">
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          데이터를 불러오지 못했어요
        </h2>
        <button
          className="mt-4 flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white"
          onClick={() => {
            if (activeTab === "shopping") {
              setShoppingLoaded(false);
              void loadShoppingHistory();
            } else {
              void loadInitialData();
            }
          }}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      {/* Profile Section */}
      <div
        className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-4"
        data-testid="mypage-profile"
      >
        {profile?.profile_image_url ? (
          <img
            alt={`${profile.nickname} 프로필`}
            className="h-12 w-12 shrink-0 rounded-full border border-[var(--line)] object-cover"
            src={profile.profile_image_url}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-base font-bold text-[var(--brand)]">
            {profile?.nickname?.charAt(0) ?? "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[var(--foreground)]">
            {profile?.nickname ?? ""}
          </p>
          <p className="text-sm text-[var(--text-3)]">
            {SOCIAL_PROVIDER_LABELS[profile?.social_provider ?? ""] ?? ""}
          </p>
        </div>
        <Link
          aria-label="설정"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          href="/settings"
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
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      {/* Tab Bar */}
      <div
        className="sticky top-0 z-10 flex border-b border-[var(--line)] bg-[var(--surface)]"
        data-testid="mypage-tabbar"
        role="tablist"
      >
        <button
          aria-selected={activeTab === "recipebook"}
          className={`flex-1 py-3 text-center text-sm font-bold transition-colors ${
            activeTab === "recipebook"
              ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
              : "text-[var(--text-3)]"
          }`}
          onClick={() => setActiveTab("recipebook")}
          role="tab"
          type="button"
        >
          레시피북
        </button>
        <button
          aria-selected={activeTab === "shopping"}
          className={`flex-1 py-3 text-center text-sm font-bold transition-colors ${
            activeTab === "shopping"
              ? "border-b-2 border-[var(--brand)] text-[var(--brand)]"
              : "text-[var(--text-3)]"
          }`}
          onClick={() => setActiveTab("shopping")}
          role="tab"
          type="button"
        >
          장보기 기록
        </button>
      </div>

      {/* Tab Content */}
      <div className="px-4 pt-4" role="tabpanel">
        {activeTab === "recipebook" ? (
          <RecipeBookTabContent
            books={books}
            createInputRef={createInputRef}
            createName={createName}
            customBooks={customBooks}
            deleteTarget={deleteTarget}
            isCreating={isCreating}
            isDeleting={isDeleting}
            isRenaming={isRenaming}
            menuOpenBookId={menuOpenBookId}
            menuRef={menuRef}
            onCancelCreate={() => {
              setShowCreateInput(false);
              setCreateName("");
            }}
            onCancelRename={() => {
              setRenamingBookId(null);
              setRenameValue("");
            }}
            onCloseDeleteDialog={() => setDeleteTarget(null)}
            onConfirmDelete={handleDeleteBook}
            onConfirmRename={handleRenameBook}
            onCreateBook={handleCreateBook}
            onCreateNameChange={setCreateName}
            onMenuClose={() => setMenuOpenBookId(null)}
            onMenuOpen={(id) => setMenuOpenBookId(id)}
            onRenameStart={(book) => {
              setRenamingBookId(book.id);
              setRenameValue(book.name);
              setMenuOpenBookId(null);
            }}
            onRequestDelete={(book) => {
              setDeleteTarget(book);
              setMenuOpenBookId(null);
            }}
            onRenameValueChange={setRenameValue}
            onShowCreateInput={() => setShowCreateInput(true)}
            renameInputRef={renameInputRef}
            renameValue={renameValue}
            renamingBookId={renamingBookId}
            showCreateInput={showCreateInput}
            systemBooks={systemBooks}
          />
        ) : (
          <ShoppingHistoryTabContent
            hasNext={shoppingHasNext}
            isLoadingMore={isLoadingMore}
            items={shoppingItems}
            loaded={shoppingLoaded}
            scrollSentinelRef={scrollSentinelRef}
          />
        )}
      </div>

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

function MypageLoadingSkeleton() {
  return (
    <div className="pb-24" data-testid="mypage-skeleton">
      {/* Profile skeleton */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      {/* Tab bar skeleton */}
      <div className="flex border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex-1 py-3 text-center text-sm font-bold text-[var(--brand)]">
          레시피북
        </div>
        <div className="flex-1 py-3 text-center text-sm font-bold text-[var(--text-3)]">
          장보기 기록
        </div>
      </div>
      {/* Card skeletons */}
      <div className="space-y-2 px-4 pt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]"
          >
            <Skeleton className="h-5 w-32" />
            <div className="flex-1" />
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recipe Book Tab ─────────────────────────────────────────────────────────

interface RecipeBookTabContentProps {
  systemBooks: RecipeBookSummary[];
  customBooks: RecipeBookSummary[];
  books: RecipeBookSummary[];
  menuOpenBookId: string | null;
  renamingBookId: string | null;
  renameValue: string;
  isRenaming: boolean;
  deleteTarget: RecipeBookSummary | null;
  isDeleting: boolean;
  showCreateInput: boolean;
  createName: string;
  isCreating: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  onMenuOpen: (id: string) => void;
  onMenuClose: () => void;
  onRenameStart: (book: RecipeBookSummary) => void;
  onCancelRename: () => void;
  onConfirmRename: () => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: (book: RecipeBookSummary) => void;
  onCloseDeleteDialog: () => void;
  onConfirmDelete: () => void;
  onShowCreateInput: () => void;
  onCancelCreate: () => void;
  onCreateNameChange: (value: string) => void;
  onCreateBook: () => void;
}

function RecipeBookTabContent({
  systemBooks,
  customBooks,
  menuOpenBookId,
  renamingBookId,
  renameValue,
  isRenaming,
  deleteTarget,
  isDeleting,
  showCreateInput,
  createName,
  isCreating,
  menuRef,
  renameInputRef,
  createInputRef,
  onMenuOpen,
  onMenuClose,
  onRenameStart,
  onCancelRename,
  onConfirmRename,
  onRenameValueChange,
  onRequestDelete,
  onCloseDeleteDialog,
  onConfirmDelete,
  onShowCreateInput,
  onCancelCreate,
  onCreateNameChange,
  onCreateBook,
}: RecipeBookTabContentProps) {
  return (
    <div data-testid="recipebook-tab">
      {/* System books section */}
      <p className="mb-2 text-sm font-semibold text-[var(--text-3)]">
        나의 레시피북
      </p>
      <div className="space-y-2" role="list">
        {systemBooks.map((book) => (
          <SystemBookCard book={book} key={book.id} />
        ))}
      </div>

      {/* Custom books section */}
      <p className="mb-2 mt-6 text-sm font-semibold text-[var(--text-3)]">
        커스텀 레시피북
      </p>

      {customBooks.length === 0 && !showCreateInput ? (
        <p className="mb-3 text-sm text-[var(--text-3)]">
          아직 만든 레시피북이 없어요
        </p>
      ) : (
        <div className="space-y-2" role="list">
          {customBooks.map((book) => (
            <CustomBookCard
              book={book}
              isMenuOpen={menuOpenBookId === book.id}
              isRenaming={renamingBookId === book.id}
              isRenamingLoading={isRenaming}
              key={book.id}
              menuRef={menuRef}
              onCancelRename={onCancelRename}
              onConfirmRename={onConfirmRename}
              onMenuOpen={() => onMenuOpen(book.id)}
              onMenuClose={onMenuClose}
              onRenameStart={() => onRenameStart(book)}
              onRenameValueChange={onRenameValueChange}
              onRequestDelete={() => onRequestDelete(book)}
              renameInputRef={renameInputRef}
              renameValue={renameValue}
            />
          ))}
        </div>
      )}

      {/* Create input */}
      {showCreateInput ? (
        <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-lg)] border-2 border-[var(--brand)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)]">
          <input
            ref={createInputRef}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)]"
            disabled={isCreating}
            maxLength={50}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onCreateBook();
              if (e.key === "Escape") onCancelCreate();
            }}
            onChange={(e) => onCreateNameChange(e.target.value)}
            placeholder="레시피북 이름"
            type="text"
            value={createName}
          />
          <button
            className="shrink-0 text-sm font-bold text-[var(--brand)] disabled:opacity-50"
            disabled={isCreating || !createName.trim()}
            onClick={() => void onCreateBook()}
            type="button"
          >
            {isCreating ? "만드는 중..." : "완료"}
          </button>
          <button
            className="shrink-0 text-sm font-semibold text-[var(--text-3)]"
            onClick={onCancelCreate}
            type="button"
          >
            취소
          </button>
        </div>
      ) : null}

      {/* Create CTA */}
      <button
        aria-label="새 레시피북 만들기"
        className="mt-2 flex w-full min-h-12 items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--line)] bg-[var(--surface)] text-base font-semibold text-[var(--brand)] transition-colors hover:bg-[var(--brand-soft)] active:bg-[var(--brand-soft)]"
        onClick={onShowCreateInput}
        type="button"
      >
        + 새 레시피북
      </button>

      {/* Delete confirm dialog */}
      {deleteTarget ? (
        <DeleteConfirmDialog
          bookName={deleteTarget.name}
          isDeleting={isDeleting}
          onCancel={onCloseDeleteDialog}
          onConfirm={onConfirmDelete}
        />
      ) : null}
    </div>
  );
}

// ─── System Book Card ────────────────────────────────────────────────────────

function SystemBookCard({ book }: { book: RecipeBookSummary }) {
  const iconMeta = SYSTEM_BOOK_ICON[book.book_type] ?? {
    icon: "📁",
    colorClass: "text-[var(--text-3)]",
  };

  return (
    <Link
      className="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-fill)]"
      data-testid={`system-book-${book.book_type}`}
      href={`/recipe-books/${book.id}`}
      role="listitem"
    >
      <span aria-hidden="true" className={`text-2xl ${iconMeta.colorClass}`}>
        {iconMeta.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--foreground)]">
        {book.name}
      </span>
      <span className="shrink-0 text-sm text-[var(--text-3)]">
        {book.recipe_count}
      </span>
    </Link>
  );
}

// ─── Custom Book Card ────────────────────────────────────────────────────────

interface CustomBookCardProps {
  book: RecipeBookSummary;
  isMenuOpen: boolean;
  isRenaming: boolean;
  isRenamingLoading: boolean;
  renameValue: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onMenuOpen: () => void;
  onMenuClose: () => void;
  onRenameStart: () => void;
  onCancelRename: () => void;
  onConfirmRename: () => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: () => void;
}

function CustomBookCard({
  book,
  isMenuOpen,
  isRenaming,
  isRenamingLoading,
  renameValue,
  menuRef,
  renameInputRef,
  onMenuOpen,
  onRenameStart,
  onCancelRename,
  onConfirmRename,
  onRenameValueChange,
  onRequestDelete,
}: CustomBookCardProps) {
  if (isRenaming) {
    return (
      <div
        className="flex items-center gap-2 rounded-[var(--radius-lg)] border-2 border-[var(--brand)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)]"
        role="listitem"
      >
        <input
          ref={renameInputRef}
          className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)]"
          disabled={isRenamingLoading}
          maxLength={50}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onConfirmRename();
            if (e.key === "Escape") onCancelRename();
          }}
          onChange={(e) => onRenameValueChange(e.target.value)}
          type="text"
          value={renameValue}
        />
        <button
          className="shrink-0 text-sm font-bold text-[var(--brand)] disabled:opacity-50"
          disabled={isRenamingLoading || !renameValue.trim()}
          onClick={() => void onConfirmRename()}
          type="button"
        >
          {isRenamingLoading ? "저장 중..." : "완료"}
        </button>
      </div>
    );
  }

  return (
    <div className="relative" role="listitem">
      <div className="flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-1)]">
        <Link
          className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--foreground)]"
          href={`/recipe-books/${book.id}`}
        >
          {book.name}
        </Link>
        <span className="shrink-0 text-sm text-[var(--text-3)]">
          {book.recipe_count}
        </span>
        <button
          aria-haspopup="menu"
          aria-label={`${book.name} 옵션 메뉴`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-3)]"
          onClick={(e) => {
            e.preventDefault();
            onMenuOpen();
          }}
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
      </div>

      {/* Context menu */}
      {isMenuOpen ? (
        <div
          ref={menuRef}
          className="absolute right-4 top-full z-20 mt-1 w-40 overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface)] shadow-[var(--shadow-2)]"
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

// ─── Delete Confirm Dialog ───────────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  bookName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmDialog({
  bookName,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      data-testid="delete-confirm-dialog"
    >
      <div
        aria-modal="true"
        className="w-full max-w-sm rounded-[var(--radius-xl)] bg-[var(--surface)] p-6 shadow-[var(--shadow-3)]"
        role="alertdialog"
      >
        <h3 className="text-lg font-bold text-[var(--foreground)]">
          레시피북을 삭제할까요?
        </h3>
        <p className="mt-2 text-sm text-[var(--text-3)]">
          &ldquo;{bookName}&rdquo;을 삭제하면 되돌릴 수 없어요.
        </p>
        <div className="mt-5 flex gap-3">
          <button
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] text-sm font-semibold text-[var(--text-2)]"
            disabled={isDeleting}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] bg-[var(--danger)] text-sm font-semibold text-white disabled:opacity-50"
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

// ─── Shopping History Tab ────────────────────────────────────────────────────

interface ShoppingHistoryTabContentProps {
  items: ShoppingListHistoryItem[];
  loaded: boolean;
  hasNext: boolean;
  isLoadingMore: boolean;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
}

function ShoppingHistoryTabContent({
  items,
  loaded,
  hasNext,
  isLoadingMore,
  scrollSentinelRef,
}: ShoppingHistoryTabContentProps) {
  if (!loaded) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)]"
          >
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-4 w-40" />
            <Skeleton className="mt-2 h-5 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        data-testid="shopping-empty"
      >
        <svg
          aria-hidden="true"
          className="h-12 w-12 text-[var(--text-3)]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
        >
          <path
            d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h3 className="mt-4 text-lg font-bold text-[var(--foreground)]">
          저장된 장보기 기록이 없어요
        </h3>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          플래너에서 장보기를 만들면 여기에 저장돼요
        </p>
        <Link
          className="mt-5 flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--brand)]"
          href="/planner"
        >
          플래너로 이동
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="shopping-tab">
      <div aria-live="polite" className="space-y-2" role="list">
        {items.map((item) => (
          <ShoppingHistoryCard item={item} key={item.id} />
        ))}
      </div>
      {isLoadingMore ? (
        <div className="flex justify-center py-4">
          <Skeleton className="h-5 w-32" />
        </div>
      ) : null}
      {hasNext ? (
        <div ref={scrollSentinelRef} className="h-4" />
      ) : null}
    </div>
  );
}

// ─── Shopping History Card ───────────────────────────────────────────────────

function ShoppingHistoryCard({ item }: { item: ShoppingListHistoryItem }) {
  const dateRange = `${formatShortDate(item.date_range_start)} ~ ${formatShortDate(item.date_range_end)}`;

  return (
    <Link
      className="block rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)] transition-colors hover:bg-[var(--surface-fill)]"
      data-testid={`shopping-card-${item.id}`}
      href={`/shopping/${item.id}`}
      role="listitem"
    >
      <p className="text-base font-semibold text-[var(--foreground)]">
        {item.title}
      </p>
      <p className="mt-1 text-sm text-[var(--text-3)]">
        {dateRange} &middot; {item.item_count}개 항목
      </p>
      <span
        className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          item.is_completed
            ? "bg-[rgba(31,107,82,0.1)] text-[var(--olive)]"
            : "bg-[var(--brand-soft)] text-[var(--brand)]"
        }`}
      >
        {item.is_completed ? "완료" : "진행 중"}
      </span>
    </Link>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
