"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  MypageMobileScreen,
  type MypageMobileSurface,
} from "@/components/mypage/mypage-mobile-screen";
import { ContentState } from "@/components/shared/content-state";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WebButton,
  WebCard,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
  WebRecipeCard,
  WebShell,
  WebSkeleton,
  WebTabButton,
  WebTabs,
  WebTopNav,
} from "@/components/web";
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
import {
  fetchLeftovers,
  isLeftoverApiError,
} from "@/lib/api/leftovers";
import { fetchRecipeBookRecipes } from "@/lib/api/recipe";
import { buildReturnHref } from "@/lib/navigation/return-context";
import {
  resolveMypageRestoreState,
  type MypageRestoreTab,
} from "@/lib/navigation/mypage-return-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type { RecipeBookRecipeItem, RecipeBookSummary } from "@/types/recipe";
import type {
  LeftoverDishStatus,
  LeftoverListItemData,
} from "@/types/leftover";
import type { ShoppingListHistoryItem } from "@/types/shopping";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";
type SavedRecipesState = "idle" | "loading" | "ready" | "empty" | "error";
type LeftoverTabState = "idle" | "loading" | "ready" | "empty" | "error";
type MypageTab =
  | MypageRestoreTab
  | "account"
  | "notifications"
  | "help";

const TOAST_DURATION_MS = 3000;
const SHOPPING_PAGE_SIZE = 10;
const SAVED_RECIPES_PAGE_SIZE = 12;
const MYPAGE_ACCOUNT_HREF = "/mypage?tab=account";
const SETTINGS_FROM_ACCOUNT_HREF = buildReturnHref("/settings", {
  returnTo: MYPAGE_ACCOUNT_HREF,
});

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

const SOCIAL_PROVIDER_LABELS: Record<string, string> = {
  kakao: "카카오 로그인",
  naver: "네이버 로그인",
  google: "Google 로그인",
};

const WEB_RECIPE_FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1547592180-85f173990554?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=900&h=675&fit=crop&q=80",
  "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=900&h=675&fit=crop&q=80",
] as const;

export interface MypageScreenProps {
  initialAuthenticated?: boolean;
  initialActiveTab?: MypageRestoreTab;
  initialMobileSurface?: MypageMobileSurface;
}

export function MypageScreen({
  initialActiveTab = "saved",
  initialAuthenticated = false,
  initialMobileSurface = "home",
}: MypageScreenProps) {
  const [authState, setAuthState] = useState<AuthState>(
    initialAuthenticated ? "authenticated" : "checking",
  );
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [activeTab, setActiveTab] = useState<MypageTab>(initialActiveTab);
  const [mobileSurface, setMobileSurface] =
    useState<MypageMobileSurface>(initialMobileSurface);
  const isMobileViewport = useIsMobileViewport();

  // Profile
  const [profile, setProfile] = useState<UserProfileData | null>(null);

  // Recipe books
  const [books, setBooks] = useState<RecipeBookSummary[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<RecipeBookRecipeItem[]>([]);
  const [savedRecipesState, setSavedRecipesState] =
    useState<SavedRecipesState>("idle");
  const [savedRecipesBookId, setSavedRecipesBookId] = useState<string | null>(null);

  // Shopping history
  const [shoppingItems, setShoppingItems] = useState<ShoppingListHistoryItem[]>([]);
  const [shoppingCursor, setShoppingCursor] = useState<string | null>(null);
  const [shoppingHasNext, setShoppingHasNext] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [shoppingLoaded, setShoppingLoaded] = useState(false);

  // Leftovers
  const [leftoverItems, setLeftoverItems] = useState<LeftoverListItemData[]>([]);
  const [leftoverState, setLeftoverState] =
    useState<LeftoverTabState>("idle");
  const [eatenItems, setEatenItems] = useState<LeftoverListItemData[]>([]);
  const [eatenState, setEatenState] = useState<LeftoverTabState>("idle");

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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = getMypageTabFromQuery(params.get("tab"));
    if (tab) {
      setActiveTab(tab);
      setMobileSurface(getMobileSurfaceForTab(tab));
      return;
    }

    if (!params.has("restore") && !params.has("returnSurface")) {
      return;
    }

    const restored = resolveMypageRestoreState(params);
    setActiveTab(restored.activeTab);
    setMobileSurface(restored.mobileSurface);
  }, []);

  const showToast = useCallback((message: string, tone: "success" | "error") => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, tone });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const switchDesktopTab = useCallback((tab: MypageTab) => {
    setActiveTab(tab);
    window.scrollTo(0, 0);
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

  const loadLeftoverTab = useCallback(async (status: LeftoverDishStatus) => {
    const setItems = status === "leftover" ? setLeftoverItems : setEatenItems;
    const setState = status === "leftover" ? setLeftoverState : setEatenState;

    setState("loading");

    try {
      const result = await fetchLeftovers(status);
      setItems(result.items);
      setState(result.items.length > 0 ? "ready" : "empty");
    } catch (error) {
      setItems([]);
      if (isLeftoverApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setState("error");
    }
  }, []);

  const loadSavedRecipes = useCallback(async (bookId: string) => {
    setSavedRecipesState("loading");
    const result = await fetchRecipeBookRecipes(bookId, {
      limit: SAVED_RECIPES_PAGE_SIZE,
    });

    if (!result.success || !result.data) {
      setSavedRecipes([]);
      setSavedRecipesBookId(bookId);
      setSavedRecipesState("error");
      return;
    }

    setSavedRecipes(result.data.items);
    setSavedRecipesBookId(bookId);
    setSavedRecipesState(result.data.items.length === 0 ? "empty" : "ready");
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

  useEffect(() => {
    if (authState !== "authenticated") return;

    if (activeTab === "leftovers" && leftoverState === "idle") {
      void loadLeftoverTab("leftover");
    }

    if (activeTab === "eaten" && eatenState === "idle") {
      void loadLeftoverTab("eaten");
    }
  }, [activeTab, authState, eatenState, leftoverState, loadLeftoverTab]);

  const savedBook = books.find((book) => book.book_type === "saved") ?? null;
  const savedRecipeCount =
    savedBook?.recipe_count ??
    books.reduce((sum, book) => sum + book.recipe_count, 0);

  // Load actual saved recipes for the desktop saved tab.
  useEffect(() => {
    if (authState !== "authenticated" || activeTab !== "saved") return;

    if (!savedBook || savedRecipeCount === 0) {
      setSavedRecipes([]);
      setSavedRecipesBookId(savedBook?.id ?? null);
      setSavedRecipesState("empty");
      return;
    }

    if (
      savedRecipesState === "loading" ||
      (savedRecipesBookId === savedBook.id &&
        (savedRecipesState === "ready" ||
          savedRecipesState === "empty" ||
          savedRecipesState === "error"))
    ) {
      return;
    }

    void loadSavedRecipes(savedBook.id);
  }, [
    activeTab,
    authState,
    loadSavedRecipes,
    savedBook,
    savedRecipeCount,
    savedRecipesBookId,
    savedRecipesState,
  ]);

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
    if (isMobileViewport) {
      return (
        <MypageLoadingSkeleton
          mobile
          onBack={() => setMobileSurface("home")}
          surface={mobileSurface}
        />
      );
    }

    return <MypageDesktopLoadingShell />;
  }

  if (authState === "unauthorized") {
    return (
      <>
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
              className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
              href="/"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </ContentState>
        {isMobileViewport ? (
          <Wave1MobileBottomTab ariaLabel="마이페이지 하단 탭" currentTab="mypage" />
        ) : null}
      </>
    );
  }

  if (viewState === "loading") {
    if (!isMobileViewport) {
      return <MypageDesktopLoadingShell />;
    }

    return (
      <MypageLoadingSkeleton
        mobile={isMobileViewport}
        onBack={() => setMobileSurface("home")}
        surface={mobileSurface}
      />
    );
  }

  if (viewState === "error") {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16">
        <h2 className="text-lg font-bold text-[var(--foreground)]">
          데이터를 불러오지 못했어요
        </h2>
        <button
          className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white"
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

  if (isMobileViewport) {
    return (
      <>
        <MypageMobileScreen
          books={books}
          createInputRef={createInputRef}
          createName={createName}
          customBooks={customBooks}
          deleteTarget={deleteTarget}
          isCreating={isCreating}
          isDeleting={isDeleting}
          isLoadingMore={isLoadingMore}
          isRenaming={isRenaming}
          menuOpenBookId={menuOpenBookId}
          menuRef={menuRef}
          profile={profile}
          renameInputRef={renameInputRef}
          renameValue={renameValue}
          renamingBookId={renamingBookId}
          scrollSentinelRef={scrollSentinelRef}
          shoppingHasNext={shoppingHasNext}
          shoppingItems={shoppingItems}
          shoppingLoaded={shoppingLoaded}
          showCreateInput={showCreateInput}
          surface={mobileSurface}
          systemBooks={systemBooks}
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
          onRenameValueChange={setRenameValue}
          onRequestDelete={(book) => {
            setDeleteTarget(book);
            setMenuOpenBookId(null);
          }}
          onShowCreateInput={() => setShowCreateInput(true)}
          onSurfaceChange={(surface) => {
            setMobileSurface(surface);
            if (surface === "shopping") {
              setActiveTab("shopping");
            }
            if (surface === "recipebook") {
              setActiveTab("recipebooks");
            }
          }}
        />

        {toast ? (
          <div
            className={`fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-[var(--radius-card)] px-4 py-3 text-center text-sm font-bold shadow-lg ${
              toast.tone === "success"
                ? "bg-[var(--brand)] text-white"
                : "bg-[#FF6B6B] text-white"
            }`}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <WebShell className="web-mypage-shell" wide>
      <WebTopNav
        activeId="mypage"
        items={WEB_NAV_ITEMS}
        rightSlot={<WebProfilePill profile={profile} />}
      />
      <div className="web-mypage-screen">
        <WebCard className="web-mypage-profile" data-testid="mypage-profile">
          <div className="web-mypage-profile-main">
            {profile?.profile_image_url ? (
              <Image
                alt={`${profile.nickname} 프로필`}
                className="web-mypage-avatar"
                height={64}
                src={profile.profile_image_url}
                unoptimized
                width={64}
              />
            ) : (
              <div
                aria-label="프로필 이니셜"
                className="web-mypage-avatar web-mypage-avatar-fallback"
                data-testid="profile-fallback-avatar"
              >
                {profile?.nickname?.slice(0, 1).toUpperCase() ?? "?"}
              </div>
            )}
            <div className="web-mypage-profile-copy">
              <h1>{profile?.nickname ?? ""}</h1>
              <p>{SOCIAL_PROVIDER_LABELS[profile?.social_provider ?? ""] ?? ""}</p>
            </div>
          </div>
          <div className="web-mypage-stats" aria-label="마이페이지 통계">
            <div>
              <strong>{savedRecipeCount}</strong>
              <span>저장한 레시피</span>
            </div>
            <div>
              <strong>26</strong>
              <span>다 먹은 끼니</span>
            </div>
            <div>
              <strong>14</strong>
              <span>플래너 등록</span>
            </div>
          </div>
        </WebCard>

        <WebTabs className="web-mypage-tabs" data-testid="mypage-tabbar" role="tablist">
          <WebTabButton
            active={activeTab === "saved"}
            aria-label="저장한 레시피"
            onClick={() => switchDesktopTab("saved")}
          >
            <BookmarkIcon /> 저장한 레시피
          </WebTabButton>
          <WebTabButton
            active={activeTab === "recipebooks"}
            aria-label="레시피북 관리"
            onClick={() => switchDesktopTab("recipebooks")}
          >
            <BookIcon /> 레시피북 관리
          </WebTabButton>
          <WebTabButton
            active={activeTab === "shopping"}
            aria-label="장보기 내역"
            onClick={() => switchDesktopTab("shopping")}
          >
            <CartIcon /> 장보기 내역
          </WebTabButton>
          <WebTabButton
            active={activeTab === "leftovers"}
            aria-label="남은 요리"
            onClick={() => switchDesktopTab("leftovers")}
          >
            <LeftoverIcon /> 남은 요리
          </WebTabButton>
          <WebTabButton
            active={activeTab === "eaten"}
            aria-label="다먹은 목록"
            onClick={() => switchDesktopTab("eaten")}
          >
            <CheckIcon /> 다먹은 목록
          </WebTabButton>
          <WebTabButton
            active={activeTab === "account"}
            aria-label="계정 관리"
            onClick={() => switchDesktopTab("account")}
          >
            <UserIcon /> 계정 관리
          </WebTabButton>
          <WebTabButton
            active={activeTab === "notifications"}
            aria-label="알림 설정"
            onClick={() => switchDesktopTab("notifications")}
          >
            <BellIcon /> 알림 설정
          </WebTabButton>
          <WebTabButton
            active={activeTab === "help"}
            aria-label="도움말"
            onClick={() => switchDesktopTab("help")}
          >
            <HelpIcon /> 도움말
          </WebTabButton>
        </WebTabs>

        <section className="web-mypage-panel" role="tabpanel">
          {activeTab === "saved" ? (
            <SavedRecipesSurface
              savedRecipes={savedRecipes}
              savedRecipeCount={savedRecipeCount}
              savedRecipesState={savedRecipesState}
              onRetrySavedRecipes={() => {
                if (savedBook) {
                  void loadSavedRecipes(savedBook.id);
                }
              }}
            />
          ) : null}
          {activeTab === "account" ? (
            <MyPageAccountSurface profile={profile} />
          ) : null}
          {activeTab === "notifications" ? <MyPageNotificationSurface /> : null}
          {activeTab === "help" ? <MyPageHelpSurface /> : null}
          {activeTab === "recipebooks" ? (
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
          ) : null}
          {activeTab === "shopping" ? (
            <ShoppingHistoryTabContent
              hasNext={shoppingHasNext}
              isLoadingMore={isLoadingMore}
              items={shoppingItems}
              loaded={shoppingLoaded}
              scrollSentinelRef={scrollSentinelRef}
            />
          ) : null}
          {activeTab === "leftovers" ? (
            <LeftoverTabContent
              description="남겨둔 음식을 확인하고 플래너에 다시 올릴 항목을 고릅니다."
              emptyDescription="요리를 완료하면 남은 요리로 관리할 수 있어요."
              emptyTitle="남은 요리가 없어요"
              items={leftoverItems}
              onRetry={() => void loadLeftoverTab("leftover")}
              state={leftoverState}
              title="남은 요리"
            />
          ) : null}
          {activeTab === "eaten" ? (
            <LeftoverTabContent
              description="다 먹은 목록을 확인하고 필요할 때 다시 만들 레시피로 이동합니다."
              emptyDescription="남은 요리를 다 먹음 처리하면 여기에 모여요."
              emptyTitle="다 먹은 기록이 없어요"
              items={eatenItems}
              onRetry={() => void loadLeftoverTab("eaten")}
              state={eatenState}
              title="다먹은 목록"
            />
          ) : null}
        </section>
      </div>

      {toast ? (
        <div
          className={`fixed inset-x-4 bottom-8 z-50 mx-auto max-w-md rounded-[var(--radius-lg)] px-4 py-3 text-center text-sm font-semibold shadow-lg ${
            toast.tone === "success"
              ? "bg-[var(--brand)] text-white"
              : "bg-[var(--danger)] text-white"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </WebShell>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WebProfilePill({ profile }: { profile: UserProfileData | null }) {
  return (
    <Link
      aria-label={`${profile?.nickname ?? "내"} 마이페이지`}
      className="web-mypage-top-profile"
      href="/mypage"
    >
      <span aria-hidden="true">{profile?.nickname?.slice(0, 1).toUpperCase() ?? "?"}</span>
    </Link>
  );
}

function SavedRecipesSurface({
  savedRecipes,
  savedRecipeCount,
  savedRecipesState,
  onRetrySavedRecipes,
}: {
  savedRecipes: RecipeBookRecipeItem[];
  savedRecipeCount: number;
  savedRecipesState: SavedRecipesState;
  onRetrySavedRecipes: () => void;
}) {
  return (
    <div className="web-mypage-saved" data-testid="recipebook-tab">
      <div className="web-mypage-section-head">
        <h2>저장한 레시피</h2>
        <p>{savedRecipeCount}개의 레시피를 저장했어요.</p>
      </div>
      <SavedRecipeGrid
        recipes={savedRecipes}
        savedRecipesState={savedRecipesState}
        onRetry={onRetrySavedRecipes}
      />
    </div>
  );
}

function SavedRecipeGrid({
  recipes,
  savedRecipesState,
  onRetry,
}: {
  recipes: RecipeBookRecipeItem[];
  savedRecipesState: SavedRecipesState;
  onRetry: () => void;
}) {
  if (savedRecipesState === "idle" || savedRecipesState === "loading") {
    return (
      <div className="web-mypage-recipe-grid" data-testid="saved-recipes-loading">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="web-recipe-card" key={index}>
            <WebSkeleton className="web-recipe-card-thumb" />
            <div className="web-recipe-card-body">
              <WebSkeleton height={18} width="72%" />
              <div className="mt-2">
                <WebSkeleton height={14} width="48%" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (savedRecipesState === "error") {
    return (
      <WebCard className="web-mypage-saved-state">
        <div>
          <h3>저장한 레시피를 불러오지 못했어요</h3>
          <p>잠시 후 다시 시도해 주세요.</p>
        </div>
        <WebButton onClick={onRetry} size="sm" variant="secondary">
          다시 시도
        </WebButton>
      </WebCard>
    );
  }

  if (savedRecipesState === "empty" || recipes.length === 0) {
    return (
      <WebCard className="web-mypage-saved-state" data-testid="saved-recipes-empty">
        <div>
          <h3>아직 저장한 레시피가 없어요</h3>
          <p>마음에 드는 레시피를 저장하면 여기에 모아 보여드려요.</p>
        </div>
        <Link className="web-button web-button-secondary web-button-sm" href="/">
          레시피 둘러보기
        </Link>
      </WebCard>
    );
  }

  return (
    <div className="web-mypage-recipe-grid" role="list">
      {recipes.map((recipe) => (
        <div
          data-testid={`saved-recipe-${recipe.recipe_id}`}
          key={recipe.recipe_id}
          role="listitem"
        >
          <Link href={`/recipe/${recipe.recipe_id}`}>
            <WebRecipeCard
              alt={recipe.title}
              imageSrc={recipe.thumbnail_url ?? getFallbackRecipeImage(recipe.title)}
              meta={formatSavedRecipeMeta(recipe)}
              title={
                <span className="web-mypage-recipe-title">
                  {recipe.title}
                  <span aria-hidden="true" className="web-mypage-save-badge">
                    <BookmarkIcon />
                  </span>
                </span>
              }
            />
          </Link>
        </div>
      ))}
    </div>
  );
}

function MyPageAccountSurface({ profile }: { profile: UserProfileData | null }) {
  return (
    <div className="web-mypage-subsurface" data-testid="mypage-account-tab">
      <div className="web-mypage-section-head">
        <h2>계정 관리</h2>
        <p>프로필, 로그인 상태, 전체 설정을 관리합니다.</p>
      </div>
      <WebCard className="web-mypage-account-card">
        <div className="web-mypage-account-profile">
          <span className="web-mypage-account-avatar">
            {profile?.nickname?.slice(0, 1).toUpperCase() ?? "?"}
          </span>
          <span>
            <strong>{profile?.nickname ?? ""}</strong>
            <em>{SOCIAL_PROVIDER_LABELS[profile?.social_provider ?? ""] ?? ""}</em>
          </span>
          <Link
            className="web-button web-button-secondary web-button-sm"
            href={SETTINGS_FROM_ACCOUNT_HREF}
          >
            닉네임 변경
          </Link>
        </div>
      </WebCard>
      <WebCard className="web-mypage-account-card">
        <Link
          className="web-mypage-settings-row"
          href={SETTINGS_FROM_ACCOUNT_HREF}
        >
          <span className="web-mypage-row-icon"><LogoutIcon /></span>
          <span className="web-mypage-row-copy">
            <strong>로그아웃</strong>
            <span>현재 로그인한 계정에서 나갑니다.</span>
          </span>
          <ChevronRightIcon />
        </Link>
        <Link
          className="web-mypage-settings-row"
          data-testid="mypage-settings-link"
          href={SETTINGS_FROM_ACCOUNT_HREF}
        >
          <span className="web-mypage-row-icon"><SettingsIcon /></span>
          <span className="web-mypage-row-copy">
            <strong>전체 설정</strong>
            <span>끼니, 알림, 단위와 테마를 한 곳에서 관리합니다.</span>
          </span>
          <ChevronRightIcon />
        </Link>
      </WebCard>
      <WebCard className="web-mypage-danger-card">
        <div>
          <h3>계정 삭제</h3>
          <p>모든 레시피북, 플래너, 장보기 기록이 영구적으로 삭제됩니다.</p>
        </div>
        <Link className="web-mypage-danger-button" href={SETTINGS_FROM_ACCOUNT_HREF}>
          계정 삭제하기
        </Link>
      </WebCard>
    </div>
  );
}

function MyPageNotificationSurface() {
  const [settings, setSettings] = useState({
    cookTime: true,
    shoppingReminder: true,
    plannerSummary: false,
    weeklyReport: true,
  });
  const toggle = (key: keyof typeof settings) => {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <div
      className="web-mypage-subsurface web-mypage-notification-surface"
      data-testid="mypage-notification-tab"
    >
      <div className="web-mypage-section-head">
        <h2>알림 설정</h2>
        <p>중요한 요리와 장보기 알림만 받을 수 있어요.</p>
      </div>
      <WebCard className="web-mypage-toggle-card">
        <ToggleRow
          checked={settings.cookTime}
          description="설정한 요리 시간이 다가오면 알려드려요."
          onToggle={() => toggle("cookTime")}
          title="요리 시간 알림"
        />
        <ToggleRow
          checked={settings.shoppingReminder}
          description="장보기 예정일 전날 준비할 항목을 알려드려요."
          onToggle={() => toggle("shoppingReminder")}
          title="장보기 리마인드"
        />
        <ToggleRow
          checked={settings.plannerSummary}
          description="이번 주 플래너 요약을 하루 전에 보내드려요."
          onToggle={() => toggle("plannerSummary")}
          title="플래너 요약"
        />
      </WebCard>
      <WebCard className="web-mypage-toggle-card">
        <ToggleRow
          checked={settings.weeklyReport}
          description="저장한 레시피와 장보기 변화를 주간 리포트로 받아요."
          onToggle={() => toggle("weeklyReport")}
          title="주간 리포트"
        />
      </WebCard>
    </div>
  );
}

function MyPageHelpSurface() {
  const faqs = [
    ["레시피북은 어떻게 정리되나요?", "내가 추가한 레시피, 저장한 레시피, 좋아요한 레시피는 자동으로 정리되고 커스텀 북은 직접 만들 수 있어요."],
    ["장보기 내역은 어디서 보나요?", "저장한 레시피 탭 하단의 장보기 내역에서 진행 중인 리스트와 완료된 리스트를 확인할 수 있어요."],
    ["팬트리와 플래너는 연결되나요?", "팬트리에 있는 재료는 장보기에서 제외할 수 있고, 플래너의 끼니와 함께 이어집니다."],
    ["계정을 바꾸면 데이터가 유지되나요?", "저장 데이터는 로그인 계정 기준으로 관리됩니다."],
    ["문제가 생기면 어디에 문의하나요?", "앱 내 문의 채널 또는 이메일로 상황을 남겨주세요."],
  ];

  return (
    <div className="web-mypage-subsurface" data-testid="mypage-help-tab">
      <div className="web-mypage-section-head">
        <h2>도움말</h2>
        <p>자주 묻는 질문과 문의 채널을 모았습니다.</p>
      </div>
      <WebCard className="web-mypage-faq-card">
        {faqs.map(([question, answer], index) => (
          <div className="web-mypage-faq-row" key={question}>
            <div>
              <strong>{question}</strong>
              {index === 0 ? <p>{answer}</p> : null}
            </div>
            <ChevronRightIcon />
          </div>
        ))}
      </WebCard>
      <WebCard className="web-mypage-contact-card">
        <strong>문의하기</strong>
        <p>support@homecook.local · 카카오톡 채널 @homecook</p>
      </WebCard>
    </div>
  );
}

function ToggleRow({
  checked = false,
  description,
  onToggle,
  title,
}: {
  checked?: boolean;
  description: string;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={title}
      className="web-mypage-toggle-row"
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span className="web-mypage-toggle-copy">
        <strong>{title}</strong>
        <em>{description}</em>
      </span>
      <span
        aria-hidden="true"
        className={checked ? "web-switch web-switch-on" : "web-switch"}
      >
        <span />
      </span>
    </button>
  );
}

function getMypageMobileSurfaceTitle(surface: MypageMobileSurface) {
  if (surface === "recipebook") {
    return "레시피북";
  }
  if (surface === "shopping") {
    return "장보기 기록";
  }
  return "마이페이지";
}

function MypageLoadingSkeleton({
  mobile = false,
  onBack,
  surface = "home",
}: {
  mobile?: boolean;
  onBack?: () => void;
  surface?: MypageMobileSurface;
}) {
  if (mobile) {
    const title = getMypageMobileSurfaceTitle(surface);
    const showBack = surface !== "home" && Boolean(onBack);

    return (
      <div
        className="min-h-dvh bg-[#F8F9FA] pb-[calc(98px+env(safe-area-inset-bottom))] text-[#212529] lg:hidden"
        data-testid="mypage-mobile-loading"
      >
        <div
          className={[
            "sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center border-b border-[#DEE2E6] bg-white px-4",
            showBack ? "justify-center" : "",
          ].join(" ")}
          style={{ borderBottomWidth: "0.5px" }}
        >
          {showBack ? (
            <button
              aria-label="뒤로"
              className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[#212529]"
              onClick={onBack}
              type="button"
            >
              <MypageSkeletonBackIcon />
            </button>
          ) : null}
          <h1
            className={[
              "truncate text-[18px] font-bold leading-none text-[#212529]",
              showBack ? "text-center" : "",
            ].join(" ")}
          >
            {title}
          </h1>
        </div>
        {surface === "home" ? <MypageHomeLoadingBody /> : null}
        {surface === "recipebook" ? <MypageListLoadingBody kind="recipebook" /> : null}
        {surface === "shopping" ? <MypageListLoadingBody kind="shopping" /> : null}
        <Wave1MobileBottomTab ariaLabel="마이페이지 하단 탭" currentTab="mypage" />
      </div>
    );
  }

  return (
    <div className="pb-32" data-testid="mypage-skeleton">
      {/* Profile skeleton */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-4 max-[360px]:gap-2 max-[360px]:py-2.5">
        <Skeleton className="h-[var(--control-height-lg)] w-12 rounded-full max-[360px]:h-10 max-[360px]:w-10" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      {/* Tab bar skeleton */}
      <div className="flex border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="flex-1 py-3 text-center text-sm font-bold text-[var(--brand)] max-[360px]:py-2">
          레시피북
        </div>
        <div className="flex-1 py-3 text-center text-sm font-bold text-[var(--text-3)] max-[360px]:py-2">
          장보기 기록
        </div>
      </div>
      {/* Card skeletons */}
      <div className="space-y-2 px-4 pt-4 max-[360px]:space-y-1 max-[360px]:pt-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-[var(--surface)] p-4 shadow-[var(--shadow-1)] max-[360px]:gap-2 max-[360px]:p-3"
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

function MypageSkeletonBackIcon() {
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

function MypageHomeLoadingBody() {
  return (
    <>
      <section className="border-b border-[#DEE2E6] bg-white px-5 py-5">
        <div className="mb-[18px] flex items-center gap-[14px]">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-14 rounded-[var(--radius-control)]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((index) => (
            <div
              className="rounded-[var(--radius-control)] bg-[#F8F9FA] px-2 py-3"
              key={index}
            >
              <Skeleton className="mx-auto h-6 w-8" />
              <Skeleton className="mx-auto mt-2 h-3 w-12" />
            </div>
          ))}
        </div>
      </section>
      <section className="p-4">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white">
          {[1, 2, 3, 4].map((index) => (
            <div
              className={[
                "flex min-h-[57px] w-full items-center gap-3 px-4",
                index < 4 ? "border-b border-[#F1F3F5]" : "",
              ].join(" ")}
              key={index}
            >
              <Skeleton className="h-7 w-7 shrink-0 rounded-[var(--radius-control)]" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function MypageListLoadingBody({ kind }: { kind: "recipebook" | "shopping" }) {
  const rowCount = kind === "shopping" ? 4 : 5;

  return (
    <section className="p-4">
      <div className="space-y-[10px]">
        {Array.from({ length: rowCount }, (_, index) => (
          <div
            className="flex min-h-[82px] items-center gap-3 rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-3"
            key={index}
          >
            <Skeleton className="h-14 w-14 shrink-0 rounded-[var(--radius-control)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
              {kind === "shopping" ? <Skeleton className="h-3 w-36" /> : null}
            </div>
            <Skeleton className="h-7 w-14 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function MypageDesktopLoadingShell() {
  return (
    <WebShell className="web-mypage-shell" wide>
      <WebTopNav
        activeId="mypage"
        items={WEB_NAV_ITEMS}
        rightSlot={<WebSkeleton className="web-mypage-top-profile" />}
      />
      <div className="web-mypage-screen" data-testid="mypage-skeleton">
        <WebCard className="web-mypage-profile">
          <div className="web-mypage-profile-main">
            <WebSkeleton height={64} width={64} style={{ borderRadius: "50%" }} />
            <div className="web-mypage-profile-copy">
              <WebSkeleton height={28} width={128} />
              <WebSkeleton height={18} width={220} />
            </div>
          </div>
          <div className="web-mypage-stats" aria-hidden="true">
            {[1, 2, 3].map((item) => (
              <div className="web-mypage-stat" key={item}>
                <WebSkeleton height={28} width={48} />
                <WebSkeleton height={14} width={72} />
              </div>
            ))}
          </div>
        </WebCard>

        <div className="web-mypage-loading-tabs">
          {[120, 100, 100, 84].map((width, index) => (
            <WebSkeleton height={48} key={index} width={width} />
          ))}
        </div>

        <WebCard className="web-mypage-panel">
          <div className="web-mypage-section-head">
            <div>
              <WebSkeleton height={26} width={156} />
              <div className="mt-2">
                <WebSkeleton height={16} width={260} />
              </div>
            </div>
          </div>
          <div className="web-mypage-loading-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <WebSkeleton height={220} key={index} />
            ))}
          </div>
        </WebCard>
      </div>
    </WebShell>
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
    <div className="web-recipebooks-screen" data-testid="recipebook-tab">
      <div className="web-recipebooks-header">
        <div>
          <h2>레시피북</h2>
          <p>자동 분류된 시스템 북 3개와 커스텀 북을 한곳에서 관리합니다.</p>
        </div>
        <WebButton onClick={onShowCreateInput}>+ 새 레시피북</WebButton>
      </div>

      <div className="web-recipebooks-section-head">
        <h3>자동 분류</h3>
      </div>
      <div className="web-recipebooks-grid">
        {systemBooks.map((book) => (
          <SystemBookCard book={book} key={book.id} />
        ))}
      </div>

      {/* Custom books section */}
      <div className="web-recipebooks-section-head web-recipebooks-section-head-spaced">
        <h3>커스텀</h3>
      </div>

      {customBooks.length === 0 && !showCreateInput ? (
        <p className="web-recipebooks-empty">
          아직 만든 레시피북이 없어요
        </p>
      ) : (
        <div className="web-recipebooks-grid">
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
        <div className="web-recipebooks-create">
          <input
            ref={createInputRef}
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
          <WebButton
            disabled={isCreating || !createName.trim()}
            onClick={() => void onCreateBook()}
            size="sm"
          >
            {isCreating ? "만드는 중..." : "완료"}
          </WebButton>
          <WebButton
            onClick={onCancelCreate}
            size="sm"
            variant="tertiary"
          >
            취소
          </WebButton>
        </div>
      ) : null}

      {/* Create CTA */}
      <button
        aria-label="새 레시피북 만들기"
        className="web-recipebooks-add"
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

function SystemBookCard({ book }: { book: RecipeBookSummary }) {
  return (
    <Link
      className="web-recipebook-book-card"
      data-testid={`system-book-${book.book_type}`}
      href={buildBookDetailHref(book)}
    >
      <BookThumbCollage book={book} />
      <span className="web-recipebook-book-copy">
        <strong>{book.name}</strong>
        <span>{formatRecipeCount(book.recipe_count)} 레시피 · {book.book_type === "custom" ? "커스텀" : book.name.replace(" 레시피", "")}</span>
      </span>
      <span
        aria-label={`레시피 ${formatRecipeCount(book.recipe_count)}`}
        className="web-recipebook-book-count"
      >
        ›
      </span>
    </Link>
  );
}

function BookThumbCollage({ book }: { book: RecipeBookSummary }) {
  const images = getBookPreviewImages(book);

  return (
    <span className="web-recipebook-collage" aria-hidden="true">
      {images.map((src) => (
        <span
          className="web-recipebook-collage-cell"
          key={src}
          style={{ backgroundImage: `url(${src})` }}
        />
      ))}
    </span>
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
        className="flex items-center gap-2 rounded-[var(--radius-lg)] border-2 border-[var(--brand)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)] max-[360px]:p-2.5"
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
    <div className="relative">
      <div className="web-recipebook-book-card web-recipebook-book-card-static">
        <BookThumbCollage book={book} />
        <Link
          className="web-recipebook-book-copy"
          href={buildBookDetailHref(book)}
        >
          <strong>{book.name}</strong>
          <span>{formatRecipeCount(book.recipe_count)} 레시피 · 커스텀</span>
          <em>커스텀</em>
        </Link>
        <span
          aria-label={`레시피 ${formatRecipeCount(book.recipe_count)}`}
          className="visually-hidden"
        >
          {formatRecipeCount(book.recipe_count)}
        </span>
        <button
          aria-haspopup="menu"
          aria-label={`${book.name} 옵션 메뉴`}
          className="web-recipebook-menu-button"
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
          className="web-recipebook-menu"
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
    <WebModal data-testid="delete-confirm-dialog" onBackdropClick={onCancel}>
      <WebDialog
        aria-labelledby="recipebook-delete-title"
        className="web-confirm-dialog"
        role="alertdialog"
        size="narrow"
      >
        <WebDialogHeader>
          <WebDialogTitle id="recipebook-delete-title">
            레시피북을 삭제할까요?
          </WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={isDeleting} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-confirm-body">
            <span aria-hidden="true" className="web-confirm-icon web-confirm-icon-danger">
              !
            </span>
            <p className="web-confirm-copy">
              &ldquo;{bookName}&rdquo;을 삭제하면 되돌릴 수 없어요.
            </p>
          </div>
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton disabled={isDeleting} onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton
            className="web-confirm-danger"
            disabled={isDeleting}
            onClick={() => void onConfirm()}
          >
            {isDeleting ? "삭제 중..." : "삭제"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
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
      <div className="web-mypage-subsurface">
        <div className="web-mypage-section-head">
          <h2>장보기 내역</h2>
          <p>진행 중이거나 완료한 장보기 목록을 확인합니다.</p>
        </div>
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
          className="h-[var(--control-height-lg)] w-12 text-[var(--text-3)]"
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
          className="mt-5 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] border border-[var(--brand)] px-6 py-3 text-sm font-semibold text-[var(--brand)]"
          href="/planner"
        >
          플래너로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="web-mypage-subsurface" data-testid="shopping-tab">
      <div className="web-mypage-section-head">
        <h2>장보기 내역</h2>
        <p>진행 중이거나 완료한 장보기 목록을 확인합니다.</p>
      </div>
      <div aria-live="polite" className="web-mypage-shopping-list">
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
      className="web-mypage-shopping-card"
      data-testid={`shopping-card-${item.id}`}
      href={buildReturnHref(`/shopping/lists/${item.id}`, {
        restore: "shopping-history-tab",
        returnSurface: "mypage.shopping-history",
        returnTo: "/mypage",
      })}
    >
      <p className="text-base font-semibold text-[var(--foreground)]">
        {item.title}
      </p>
      <p className="mt-1 text-sm text-[var(--text-3)]">
        {dateRange} &middot; {item.item_count}개 항목
      </p>
      {item.completed_at ? (
        <p className="mt-1 text-sm text-[var(--text-3)]">
          {formatShortDate(item.completed_at)} 완료
        </p>
      ) : null}
      <span
        className="mt-2 inline-flex rounded-full bg-[var(--brand-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand)]"
      >
        {item.is_completed ? "다시열기" : "진행 중"}
      </span>
    </Link>
  );
}

// ─── Leftovers Tab ───────────────────────────────────────────────────────────

interface LeftoverTabContentProps {
  description: string;
  emptyDescription: string;
  emptyTitle: string;
  items: LeftoverListItemData[];
  onRetry: () => void;
  state: LeftoverTabState;
  title: string;
}

function LeftoverTabContent({
  description,
  emptyDescription,
  emptyTitle,
  items,
  onRetry,
  state,
  title,
}: LeftoverTabContentProps) {
  if (state === "idle" || state === "loading") {
    return (
      <div className="web-mypage-subsurface" data-testid="leftover-tab-loading">
        <div className="web-mypage-section-head">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="web-mypage-leftover-grid">
          {[1, 2, 3].map((item) => (
            <WebCard className="web-mypage-leftover-card" key={item}>
              <Skeleton className="h-12 w-12 rounded-[var(--web-r-sm)]" />
              <div>
                <Skeleton className="h-5 w-28" />
                <Skeleton className="mt-2 h-4 w-40" />
              </div>
            </WebCard>
          ))}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="web-mypage-subsurface" data-testid="leftover-tab-error">
        <div className="web-mypage-section-head">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <WebCard className="web-mypage-saved-state">
          <strong>목록을 불러오지 못했어요</strong>
          <span>잠시 후 다시 시도해 주세요.</span>
          <WebButton onClick={onRetry} variant="secondary">
            다시 시도
          </WebButton>
        </WebCard>
      </div>
    );
  }

  if (state === "empty" || items.length === 0) {
    return (
      <div className="web-mypage-subsurface" data-testid="leftover-tab-empty">
        <div className="web-mypage-section-head">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <WebCard className="web-mypage-saved-state">
          <strong>{emptyTitle}</strong>
          <span>{emptyDescription}</span>
        </WebCard>
      </div>
    );
  }

  return (
    <div className="web-mypage-subsurface" data-testid="leftover-tab">
      <div className="web-mypage-section-head">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="web-mypage-leftover-grid">
        {items.map((item) => (
          <LeftoverTabCard item={item} key={item.id} />
        ))}
      </div>
    </div>
  );
}

function LeftoverTabCard({ item }: { item: LeftoverListItemData }) {
  return (
    <WebCard className="web-mypage-leftover-card" data-testid={`leftover-card-${item.id}`}>
      {item.recipe_thumbnail_url ? (
        <Image
          alt=""
          className="web-mypage-leftover-thumb"
          height={56}
          src={item.recipe_thumbnail_url}
          unoptimized
          width={56}
        />
      ) : (
        <span className="web-mypage-leftover-thumb web-mypage-leftover-thumb-fallback">
          <LeftoverIcon />
        </span>
      )}
      <span className="web-mypage-leftover-copy">
        <strong>{item.recipe_title}</strong>
        <span>{formatLeftoverTabMeta(item)}</span>
      </span>
      <Link
        className="web-button web-button-tertiary web-button-sm"
        href={`/recipe/${item.recipe_id}`}
      >
        레시피 보기
      </Link>
    </WebCard>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMypageTabFromQuery(value: string | null): MypageTab | null {
  if (
    value === "saved" ||
    value === "recipebooks" ||
    value === "shopping" ||
    value === "leftovers" ||
    value === "eaten" ||
    value === "account" ||
    value === "notifications" ||
    value === "help"
  ) {
    return value;
  }

  return null;
}

function getMobileSurfaceForTab(tab: MypageTab): MypageMobileSurface {
  if (tab === "recipebooks") return "recipebook";
  if (tab === "shopping") return "shopping";
  return "home";
}

function formatLeftoverTabMeta(item: LeftoverListItemData) {
  const mealLabel = item.source_meal_label?.trim() || "끼니 미상";
  const servings =
    item.source_planned_servings ?? item.cooking_servings;
  const servingsLabel =
    typeof servings === "number" && servings > 0 ? `${servings}인분` : "인분 미상";
  const eatenLabel = item.eaten_at ? ` · ${formatShortDate(item.eaten_at)} 다먹음` : "";

  return `${formatShortDate(item.cooked_at)} ${mealLabel} · ${servingsLabel}${eatenLabel}`;
}

function formatSavedRecipeMeta(recipe: RecipeBookRecipeItem) {
  const tags = recipe.tags ?? [];

  return [
    tags.length > 0 ? tags.join(" · ") : null,
    recipe.total_duration_text ?? null,
    typeof recipe.base_servings === "number" ? `${recipe.base_servings}인분` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getFallbackRecipeImage(title: string) {
  const seed = Array.from(title).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );

  return WEB_RECIPE_FALLBACK_IMAGES[seed % WEB_RECIPE_FALLBACK_IMAGES.length];
}

function getBookPreviewImages(book: RecipeBookSummary) {
  const offset =
    book.book_type === "saved"
      ? 1
      : book.book_type === "liked"
        ? 2
        : book.book_type === "custom"
          ? 3
          : 0;

  return [0, 1, 2, 3].map(
    (step) =>
      WEB_RECIPE_FALLBACK_IMAGES[
        (offset + step) % WEB_RECIPE_FALLBACK_IMAGES.length
      ],
  );
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function BookmarkIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M6 4.75A2.75 2.75 0 0 1 8.75 2h6.5A2.75 2.75 0 0 1 18 4.75v16l-6-3.2-6 3.2v-16Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M10 21h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M12 17h.01M9.2 9a3 3 0 1 1 4.6 2.5c-1 .68-1.8 1.2-1.8 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M8 18h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 1.9-1.4L20 8H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx="9" cy="20" r="1" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="20" r="1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function LeftoverIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M8 3h8l1 4H7l1-4ZM7 7h10v13H7V7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M10 11h4M10 15h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="m5 12 4 4L19 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M10 17 15 12l-5-5M15 12H3M21 4v16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05a2.1 2.1 0 1 1-2.96 2.96l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.1 1.66V21a2.1 2.1 0 0 1-4.2 0v-.08A1.8 1.8 0 0 0 8.4 19.3a1.8 1.8 0 0 0-2 .36l-.05.05a2.1 2.1 0 1 1-2.96-2.96l.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.14 13H2a2.1 2.1 0 0 1 0-4.2h.08A1.8 1.8 0 0 0 3.7 7.7a1.8 1.8 0 0 0-.36-2l-.05-.05A2.1 2.1 0 1 1 6.25 2.7l.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 9.4 1.45V1.4a2.1 2.1 0 0 1 4.2 0v.08a1.8 1.8 0 0 0 1.1 1.62 1.8 1.8 0 0 0 2-.36l.05-.05a2.1 2.1 0 1 1 2.96 2.96l-.05.05a1.8 1.8 0 0 0-.36 2c.27.66.92 1.1 1.64 1.1H21a2.1 2.1 0 0 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18">
      <path d="m9 5 7 7-7 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
