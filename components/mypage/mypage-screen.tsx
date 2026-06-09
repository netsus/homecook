"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
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
import {
  buildShoppingHistoryCalendarMonths,
  formatShoppingHistoryDateTime,
  formatShoppingHistoryMealRange,
} from "@/components/mypage/shopping-history-calendar";
import {
  PlannerAddSheet,
  type PlannerAddSheetState,
} from "@/components/recipe/planner-add-sheet";
import { ShoppingDetailScreen } from "@/components/shopping/shopping-detail-screen";
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
  deleteAccount,
  deleteRecipeBook,
  fetchRecipeBooks,
  fetchShoppingHistory,
  fetchUserProfile,
  isMypageApiError,
  logout,
  renameRecipeBook,
  updateNickname,
  updateSettings,
  type UserProfileData,
} from "@/lib/api/mypage";
import {
  eatLeftover,
  fetchLeftovers,
  isLeftoverApiError,
  uneatLeftover,
} from "@/lib/api/leftovers";
import { createMeal, isMealApiError } from "@/lib/api/meal";
import {
  createPlannerColumn,
  deletePlannerColumn,
  fetchPlanner,
  fetchPlannerColumns,
  isPlannerApiError,
  updatePlannerColumn,
} from "@/lib/api/planner";
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
import type { PlannerColumnData } from "@/types/planner";
import type { ShoppingListHistoryItem } from "@/types/shopping";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";
type SavedRecipesState = "idle" | "loading" | "ready" | "empty" | "error";
type LeftoverTabState = "idle" | "loading" | "ready" | "empty" | "error";
type RecipeBookDetailState = "idle" | "loading" | "ready" | "empty" | "error";
type MypageTab =
  | MypageRestoreTab
  | "preferences"
  | "help";

const TOAST_DURATION_MS = 3000;
const SHOPPING_PAGE_SIZE = 10;
const SAVED_RECIPES_PAGE_SIZE = 12;
const RECIPE_BOOK_COVER_PAGE_SIZE = 1;
const LIFETIME_PLANNER_STATS_RANGE = {
  startDate: "1900-01-01",
  endDate: "9999-12-31",
} as const;
const LEFTOVERS_DESCRIPTION =
  "요리한 음식 기록을 확인하고, 남은 음식은 다른 끼니에 추가할 수 있어요. 다 먹은 음식은 다먹음 버튼으로 정리해 주세요.";
const EATEN_DESCRIPTION =
  "다먹은 음식 기록을 확인하고, 필요하면 남은 요리로 다시 옮길 수 있어요.";
const MYPAGE_SAVED_RECIPES_HREF = "/mypage?tab=saved";
const MYPAGE_SHOPPING_HREF = "/mypage?tab=shopping";

function buildMypageSavedRecipeHref(recipeId: string) {
  return buildReturnHref(`/recipe/${recipeId}`, {
    returnTo: MYPAGE_SAVED_RECIPES_HREF,
  });
}

interface PlannerColumnReorderResult {
  nextColumns: PlannerColumnData[];
  nextIndex: number;
  previousColumns: PlannerColumnData[];
}

function reorderPlannerColumns(
  columns: PlannerColumnData[],
  columnId: string,
  targetIndex: number,
): PlannerColumnReorderResult | null {
  const previousColumns = [...columns].sort((a, b) => a.sort_order - b.sort_order);
  const currentIndex = previousColumns.findIndex((column) => column.id === columnId);

  if (currentIndex < 0 || previousColumns.length <= 1) {
    return null;
  }

  const nextIndex = Math.max(0, Math.min(targetIndex, previousColumns.length - 1));

  if (nextIndex === currentIndex) {
    return null;
  }

  const movedColumns = [...previousColumns];
  const [movedColumn] = movedColumns.splice(currentIndex, 1);

  if (!movedColumn) {
    return null;
  }

  movedColumns.splice(nextIndex, 0, movedColumn);

  return {
    nextColumns: movedColumns.map((column, index) => ({
      ...column,
      sort_order: index,
    })),
    nextIndex,
    previousColumns,
  };
}

function formatProviderLabel(provider?: UserProfileData["social_provider"]) {
  if (provider === "kakao") return "카카오 로그인";
  if (provider === "naver") return "네이버 로그인";
  if (provider === "google") return "Google 로그인";
  return "소셜 로그인";
}

function buildMypageRecipeBookDetailHref(book: RecipeBookSummary) {
  const params = new URLSearchParams({
    type: book.book_type,
    name: book.name,
  });

  return `/mypage/recipe-books/${book.id}?${params.toString()}`;
}

function buildMypageRecipeBookRecipeHref(
  recipeId: string,
  book: RecipeBookSummary,
) {
  return buildReturnHref(`/recipe/${recipeId}`, {
    restore: "recipebook-tab",
    returnSurface: "mypage.recipebooks",
    returnTo: buildMypageRecipeBookDetailHref(book),
  });
}

function buildMypageLeftoverRecipeHref(
  recipeId: string,
  tabKind: LeftoverDishStatus,
) {
  const isEaten = tabKind === "eaten";

  return buildReturnHref(`/recipe/${recipeId}`, {
    restore: isEaten ? "eaten-list-tab" : "leftovers-tab",
    returnSurface: isEaten ? "mypage.eaten-list" : "mypage.leftovers",
    returnTo: `/mypage?tab=${isEaten ? "eaten" : "leftovers"}`,
  });
}

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
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
  const router = useRouter();
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
  const [showNicknameSheet, setShowNicknameSheet] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [isUpdatingWakeLock, setIsUpdatingWakeLock] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showAccountDeleteDialog, setShowAccountDeleteDialog] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [lifetimeMealStats, setLifetimeMealStats] = useState({
    cookDone: 0,
    shoppingDone: 0,
    total: 0,
  });

  // Recipe books
  const [books, setBooks] = useState<RecipeBookSummary[]>([]);
  const [bookCoverImages, setBookCoverImages] = useState<Record<string, string | null>>({});
  const [savedRecipes, setSavedRecipes] = useState<RecipeBookRecipeItem[]>([]);
  const [savedRecipesState, setSavedRecipesState] =
    useState<SavedRecipesState>("idle");
  const [savedRecipesBookId, setSavedRecipesBookId] = useState<string | null>(null);
  const [selectedRecipeBook, setSelectedRecipeBook] =
    useState<RecipeBookSummary | null>(null);
  const [recipeBookDetailRecipes, setRecipeBookDetailRecipes] = useState<
    RecipeBookRecipeItem[]
  >([]);
  const [recipeBookDetailState, setRecipeBookDetailState] =
    useState<RecipeBookDetailState>("idle");

  // Shopping history
  const [shoppingItems, setShoppingItems] = useState<ShoppingListHistoryItem[]>([]);
  const [shoppingCursor, setShoppingCursor] = useState<string | null>(null);
  const [shoppingHasNext, setShoppingHasNext] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [shoppingLoaded, setShoppingLoaded] = useState(false);
  const [selectedShoppingItem, setSelectedShoppingItem] =
    useState<ShoppingListHistoryItem | null>(null);

  // Leftovers
  const [leftoverItems, setLeftoverItems] = useState<LeftoverListItemData[]>([]);
  const [leftoverState, setLeftoverState] =
    useState<LeftoverTabState>("idle");
  const [eatenItems, setEatenItems] = useState<LeftoverListItemData[]>([]);
  const [eatenState, setEatenState] = useState<LeftoverTabState>("idle");
  const [leftoverMutatingId, setLeftoverMutatingId] = useState<string | null>(null);
  const [plannerAddTarget, setPlannerAddTarget] =
    useState<LeftoverListItemData | null>(null);
  const [isPlannerAddSheetOpen, setIsPlannerAddSheetOpen] = useState(false);
  const [plannerAddSheetState, setPlannerAddSheetState] =
    useState<PlannerAddSheetState>("loading-columns");
  const [plannerColumns, setPlannerColumns] = useState<PlannerColumnData[]>([]);
  const [selectedPlanDate, setSelectedPlanDate] = useState("");
  const [selectedPlanColumnId, setSelectedPlanColumnId] = useState("");
  const [plannerServings, setPlannerServings] = useState(1);
  const [plannerAddError, setPlannerAddError] = useState<string | null>(null);

  // Preferences
  const [mealColumns, setMealColumns] = useState<PlannerColumnData[]>([]);
  const [mealColumnsLoading, setMealColumnsLoading] = useState(false);
  const [mealColumnsLoaded, setMealColumnsLoaded] = useState(false);
  const [mealColumnsError, setMealColumnsError] = useState<string | null>(null);
  const [mealColumnsEditMode, setMealColumnsEditMode] = useState(false);
  const [mealColumnAddInput, setMealColumnAddInput] = useState("");
  const [isAddingMealColumn, setIsAddingMealColumn] = useState(false);
  const [mealColumnAddError, setMealColumnAddError] = useState<string | null>(null);
  const [renamingMealColumnId, setRenamingMealColumnId] = useState<string | null>(null);
  const [mealColumnRenameInput, setMealColumnRenameInput] = useState("");
  const [isRenamingMealColumn, setIsRenamingMealColumn] = useState(false);
  const [mealColumnRenameError, setMealColumnRenameError] = useState<string | null>(null);
  const [deleteMealColumnTarget, setDeleteMealColumnTarget] =
    useState<PlannerColumnData | null>(null);
  const [isDeletingMealColumn, setIsDeletingMealColumn] = useState(false);
  const [deleteMealColumnError, setDeleteMealColumnError] = useState<string | null>(null);

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
  const bookCoverLoadingIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectablePlannerDates = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      dates.push(`${year}-${month}-${day}`);
    }

    return dates;
  }, []);

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
    if (tab === "shopping" && activeTab === "shopping" && selectedShoppingItem) {
      setSelectedShoppingItem(null);
      window.scrollTo(0, 0);
      return;
    }

    setActiveTab(tab);
    if (tab !== "recipebooks") {
      setSelectedRecipeBook(null);
      setRecipeBookDetailRecipes([]);
      setRecipeBookDetailState("idle");
    }
    if (tab !== "shopping") {
      setSelectedShoppingItem(null);
    }
    window.scrollTo(0, 0);
  }, [activeTab, selectedShoppingItem]);

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

  const loadMypageStats = useCallback(async () => {
    const [plannerResult, leftoverResult, eatenResult] = await Promise.allSettled([
      fetchPlanner(
        LIFETIME_PLANNER_STATS_RANGE.startDate,
        LIFETIME_PLANNER_STATS_RANGE.endDate,
      ),
      fetchLeftovers("leftover"),
      fetchLeftovers("eaten"),
    ]);

    if (plannerResult.status === "fulfilled") {
      setLifetimeMealStats(
        plannerResult.value.meals.reduce(
          (stats, meal) => {
            if (meal.status === "shopping_done") {
              stats.shoppingDone += 1;
            }
            if (meal.status === "cook_done") {
              stats.cookDone += 1;
            }
            stats.total += 1;
            return stats;
          },
          { cookDone: 0, shoppingDone: 0, total: 0 },
        ),
      );
    }

    if (leftoverResult.status === "fulfilled") {
      setLeftoverItems(leftoverResult.value.items);
      setLeftoverState(leftoverResult.value.items.length > 0 ? "ready" : "empty");
    }

    if (eatenResult.status === "fulfilled") {
      setEatenItems(eatenResult.value.items);
      setEatenState(eatenResult.value.items.length > 0 ? "ready" : "empty");
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setViewState("loading");
    try {
      const [profileOk, booksOk] = await Promise.all([
        loadProfile(),
        loadRecipeBooks(),
        loadMypageStats().then(() => true),
      ]);
      if (profileOk && booksOk) {
        setViewState("ready");
      }
    } catch {
      setViewState("error");
    }
  }, [loadProfile, loadMypageStats, loadRecipeBooks]);

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

  const loadMealColumns = useCallback(async () => {
    setMealColumnsLoading(true);
    setMealColumnsError(null);

    try {
      const result = await fetchPlannerColumns();
      setMealColumns(
        [...result.columns].sort((a, b) => a.sort_order - b.sort_order),
      );
      setMealColumnsLoaded(true);
    } catch (error) {
      if (isPlannerApiError(error) && error.status === 401) {
        setAuthState("unauthorized");
        return;
      }
      setMealColumnsError(
        isPlannerApiError(error)
          ? error.message
          : "끼니를 불러오지 못했어요",
      );
    } finally {
      setMealColumnsLoading(false);
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

  const openRecipeBookDetail = useCallback(async (book: RecipeBookSummary) => {
    setSelectedRecipeBook(book);
    setRecipeBookDetailRecipes([]);
    setRecipeBookDetailState("loading");

    const result = await fetchRecipeBookRecipes(book.id, {
      limit: SAVED_RECIPES_PAGE_SIZE,
    });

    if (!result.success || !result.data) {
      setRecipeBookDetailState("error");
      return;
    }

    setRecipeBookDetailRecipes(result.data.items);
    setRecipeBookDetailState(result.data.items.length > 0 ? "ready" : "empty");
  }, []);

  const openShoppingDetail = useCallback((item: ShoppingListHistoryItem) => {
    if (typeof window !== "undefined") {
      window.history.replaceState(
        { mypageTab: "shopping" },
        "",
        MYPAGE_SHOPPING_HREF,
      );
      const params = new URLSearchParams({ tab: "shopping", shoppingListId: item.id });
      window.history.pushState(
        { mypageTab: "shopping", shoppingListId: item.id },
        "",
        `/mypage?${params.toString()}`,
      );
    }
    setSelectedShoppingItem(item);
  }, []);

  const closeShoppingDetail = useCallback(() => {
    setSelectedShoppingItem(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        { mypageTab: "shopping" },
        "",
        MYPAGE_SHOPPING_HREF,
      );
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = getMypageTabFromQuery(params.get("tab"));
      if (tab) {
        setActiveTab(tab);
        setMobileSurface(getMobileSurfaceForTab(tab));
      }

      if (tab === "shopping" && !params.get("shoppingListId")) {
        setSelectedShoppingItem(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
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

  const openNicknameSheet = useCallback(() => {
    setNicknameInput(profile?.nickname ?? "");
    setNicknameError(null);
    setShowNicknameSheet(true);
  }, [profile]);

  const handleSaveNickname = useCallback(async () => {
    const trimmed = nicknameInput.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return;

    setNicknameError(null);
    setIsSavingNickname(true);

    try {
      const result = await updateNickname(trimmed);
      setProfile(result);
      setShowNicknameSheet(false);
      showToast("닉네임을 변경했어요", "success");
    } catch (error) {
      setNicknameError(
        isMypageApiError(error)
          ? error.message
          : "닉네임 변경에 실패했어요",
      );
    } finally {
      setIsSavingNickname(false);
    }
  }, [nicknameInput, showToast]);

  const handleToggleWakeLock = useCallback(async () => {
    if (!profile || isUpdatingWakeLock) return;

    const previous = profile.settings.screen_wake_lock;
    const next = !previous;
    setIsUpdatingWakeLock(true);
    setProfile({
      ...profile,
      settings: { ...profile.settings, screen_wake_lock: next },
    });

    try {
      const result = await updateSettings({ screen_wake_lock: next });
      setProfile((current) =>
        current ? { ...current, settings: result.settings } : current,
      );
      showToast("환경설정을 저장했어요", "success");
    } catch (error) {
      setProfile((current) =>
        current
          ? {
              ...current,
              settings: { ...current.settings, screen_wake_lock: previous },
            }
          : current,
      );
      showToast(
        isMypageApiError(error)
          ? error.message
          : "환경설정 변경에 실패했어요",
        "error",
      );
    } finally {
      setIsUpdatingWakeLock(false);
    }
  }, [isUpdatingWakeLock, profile, showToast]);

  const handleLogout = useCallback(async () => {
    setLogoutError(null);
    setIsLoggingOut(true);

    try {
      await logout();
      router.replace("/");
    } catch (error) {
      setLogoutError(
        isMypageApiError(error) ? error.message : "로그아웃에 실패했어요",
      );
      setIsLoggingOut(false);
    }
  }, [router]);

  const handleDeleteAccount = useCallback(async () => {
    setAccountDeleteError(null);
    setIsDeletingAccount(true);

    try {
      await deleteAccount();
      await logout();
      router.replace("/");
    } catch (error) {
      setAccountDeleteError(
        isMypageApiError(error) ? error.message : "계정 삭제에 실패했어요",
      );
      setIsDeletingAccount(false);
    }
  }, [router]);

  const handleAddMealColumn = useCallback(async () => {
    const trimmed = mealColumnAddInput.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return;

    setMealColumnAddError(null);
    setIsAddingMealColumn(true);

    try {
      const result = await createPlannerColumn(trimmed);
      setMealColumns((current) =>
        [...current, result.column].sort((a, b) => a.sort_order - b.sort_order),
      );
      setMealColumnAddInput("");
      showToast("끼니를 추가했어요", "success");
    } catch (error) {
      setMealColumnAddError(
        isPlannerApiError(error)
          ? error.message
          : "끼니를 추가하지 못했어요",
      );
    } finally {
      setIsAddingMealColumn(false);
    }
  }, [mealColumnAddInput, showToast]);

  const startRenameMealColumn = useCallback((column: PlannerColumnData) => {
    setRenamingMealColumnId(column.id);
    setMealColumnRenameInput(column.name);
    setMealColumnRenameError(null);
  }, []);

  const handleRenameMealColumn = useCallback(async () => {
    if (!renamingMealColumnId) return;
    const trimmed = mealColumnRenameInput.trim();
    if (trimmed.length < 1 || trimmed.length > 30) return;

    setMealColumnRenameError(null);
    setIsRenamingMealColumn(true);

    try {
      const result = await updatePlannerColumn(renamingMealColumnId, trimmed);
      setMealColumns((current) =>
        current.map((column) =>
          column.id === result.column.id ? result.column : column,
        ),
      );
      setRenamingMealColumnId(null);
      setMealColumnRenameInput("");
      showToast("끼니 이름을 변경했어요", "success");
    } catch (error) {
      setMealColumnRenameError(
        isPlannerApiError(error)
          ? error.message
          : "끼니 이름을 변경하지 못했어요",
      );
    } finally {
      setIsRenamingMealColumn(false);
    }
  }, [mealColumnRenameInput, renamingMealColumnId, showToast]);

  const handleDeleteMealColumn = useCallback(async () => {
    if (!deleteMealColumnTarget) return;

    setDeleteMealColumnError(null);
    setIsDeletingMealColumn(true);

    try {
      await deletePlannerColumn(deleteMealColumnTarget.id);
      setMealColumns((current) =>
        current
          .filter((column) => column.id !== deleteMealColumnTarget.id)
          .map((column, index) => ({ ...column, sort_order: index })),
      );
      setDeleteMealColumnTarget(null);
      showToast("끼니를 삭제했어요", "error");
    } catch (error) {
      setDeleteMealColumnError(
        isPlannerApiError(error)
          ? error.message
          : "끼니를 삭제하지 못했어요",
      );
    } finally {
      setIsDeletingMealColumn(false);
    }
  }, [deleteMealColumnTarget, showToast]);

  const handleMoveMealColumn = useCallback(async (columnId: string, targetIndex: number) => {
    const reorderResult = reorderPlannerColumns(mealColumns, columnId, targetIndex);

    if (!reorderResult) return;

    const { nextColumns, nextIndex, previousColumns } = reorderResult;

    setMealColumns(nextColumns);

    try {
      await updatePlannerColumn(columnId, { sort_order: nextIndex });
      showToast("끼니 순서를 저장했어요", "success");
    } catch (error) {
      setMealColumns(previousColumns);
      showToast(
        isPlannerApiError(error)
          ? error.message
          : "끼니 순서를 저장하지 못했어요",
        "error",
      );
    }
  }, [mealColumns, showToast]);

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

  const loadPlannerColumns = useCallback(async () => {
    setPlannerAddSheetState("loading-columns");
    setPlannerAddError(null);

    try {
      const today = selectablePlannerDates[0] ?? "";
      const data = await fetchPlanner(today, today);
      setPlannerColumns(data.columns);
      setSelectedPlanColumnId((current) => {
        if (current && data.columns.some((column) => column.id === current)) {
          return current;
        }

        return data.columns[0]?.id ?? "";
      });
      setPlannerAddSheetState("ready");
    } catch {
      setPlannerAddSheetState("error");
      setPlannerAddError("플래너 슬롯을 불러오지 못했어요.");
    }
  }, [selectablePlannerDates]);

  const openPlannerAddSheet = useCallback(
    async (item: LeftoverListItemData) => {
      if (authState !== "authenticated") return;

      setPlannerAddTarget(item);
      setIsPlannerAddSheetOpen(true);
      setPlannerAddError(null);
      setSelectedPlanDate(selectablePlannerDates[0] ?? "");
      setPlannerServings(
        item.source_planned_servings ?? item.cooking_servings ?? 1,
      );

      await loadPlannerColumns();
    },
    [authState, loadPlannerColumns, selectablePlannerDates],
  );

  const closePlannerAddSheet = useCallback(() => {
    if (plannerAddSheetState === "submitting") return;
    setIsPlannerAddSheetOpen(false);
    setPlannerAddError(null);
    setPlannerAddTarget(null);
  }, [plannerAddSheetState]);

  const handlePlannerAddSubmit = useCallback(async () => {
    if (
      !plannerAddTarget ||
      !selectedPlanColumnId ||
      !selectedPlanDate ||
      plannerAddSheetState !== "ready"
    ) {
      return;
    }

    setPlannerAddSheetState("submitting");
    setPlannerAddError(null);

    try {
      await createMeal({
        recipe_id: plannerAddTarget.recipe_id,
        plan_date: selectedPlanDate,
        column_id: selectedPlanColumnId,
        planned_servings: plannerServings,
        leftover_dish_id: plannerAddTarget.id,
      });

      setIsPlannerAddSheetOpen(false);
      setPlannerAddTarget(null);
      showToast("플래너에 추가했어요", "success");
    } catch (error) {
      const message =
        isMealApiError(error) && error.status === 403
          ? "내 플래너 슬롯에만 추가할 수 있어요."
          : error instanceof Error
            ? error.message
            : "플래너 추가에 실패했어요.";

      setPlannerAddError(message);
      setPlannerAddSheetState("ready");
    }
  }, [
    plannerAddTarget,
    plannerAddSheetState,
    plannerServings,
    selectedPlanColumnId,
    selectedPlanDate,
    showToast,
  ]);

  const handleEatLeftover = useCallback(
    async (item: LeftoverListItemData) => {
      if (leftoverMutatingId) return;

      setLeftoverMutatingId(item.id);
      try {
        await eatLeftover(item.id);
        await Promise.all([loadLeftoverTab("leftover"), loadLeftoverTab("eaten")]);
        showToast("다먹은 요리로 옮겼어요", "success");
      } catch (error) {
        if (isLeftoverApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }
        showToast("다먹음 처리에 실패했어요", "error");
      } finally {
        setLeftoverMutatingId(null);
      }
    },
    [leftoverMutatingId, loadLeftoverTab, showToast],
  );

  const handleUneatLeftover = useCallback(
    async (item: LeftoverListItemData) => {
      if (leftoverMutatingId) return;

      setLeftoverMutatingId(item.id);
      try {
        await uneatLeftover(item.id);
        await Promise.all([loadLeftoverTab("leftover"), loadLeftoverTab("eaten")]);
        showToast("남은 요리로 옮겼어요", "success");
      } catch (error) {
        if (isLeftoverApiError(error) && error.status === 401) {
          setAuthState("unauthorized");
          return;
        }
        showToast("남은 요리 전환에 실패했어요", "error");
      } finally {
        setLeftoverMutatingId(null);
      }
    },
    [leftoverMutatingId, loadLeftoverTab, showToast],
  );

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

  useEffect(() => {
    if (
      authState !== "authenticated" ||
      activeTab !== "preferences" ||
      mealColumnsLoaded ||
      mealColumnsLoading
    ) {
      return;
    }

    void loadMealColumns();
  }, [
    activeTab,
    authState,
    loadMealColumns,
    mealColumnsLoaded,
    mealColumnsLoading,
  ]);

  const savedBook = books.find((book) => book.book_type === "saved") ?? null;
  const savedRecipeCount =
    savedBook?.recipe_count ??
    books.reduce((sum, book) => sum + book.recipe_count, 0);
  const nicknameSaveDisabled =
    nicknameInput.trim().length < 2 ||
    nicknameInput.trim().length > 30 ||
    isSavingNickname;
  const mealColumnAddDisabled =
    mealColumnAddInput.trim().length < 1 ||
    mealColumnAddInput.trim().length > 30 ||
    mealColumns.length >= 5 ||
    isAddingMealColumn;
  const mealColumnRenameDisabled =
    mealColumnRenameInput.trim().length < 1 ||
    mealColumnRenameInput.trim().length > 30 ||
    isRenamingMealColumn;
  const mypageStats = [
    {
      color: "var(--planner-status-registered-strong)",
      label: "플래너 등록",
      value: lifetimeMealStats.total,
    },
    {
      color: "var(--planner-status-shopping)",
      label: "장보기 완료",
      value: lifetimeMealStats.shoppingDone,
    },
    {
      color: "var(--planner-status-cooked)",
      label: "요리 완료",
      value: lifetimeMealStats.cookDone,
    },
  ];

  useEffect(() => {
    const shouldLoadSavedRecipes =
      activeTab === "saved" || (isMobileViewport && mobileSurface === "home");

    if (authState !== "authenticated" || !shouldLoadSavedRecipes) return;

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
    isMobileViewport,
    loadSavedRecipes,
    mobileSurface,
    savedBook,
    savedRecipeCount,
    savedRecipesBookId,
    savedRecipesState,
  ]);

  useEffect(() => {
    if (authState !== "authenticated" || !isMobileViewport || books.length === 0) {
      return;
    }

    let cancelled = false;
    const candidates = books.filter(
      (book) =>
        book.recipe_count > 0 &&
        !(book.id in bookCoverImages) &&
        !bookCoverLoadingIdsRef.current.has(book.id),
    );

    if (candidates.length === 0) {
      return;
    }

    candidates.forEach((book) => {
      bookCoverLoadingIdsRef.current.add(book.id);
    });

    void Promise.all(
      candidates.map(async (book): Promise<[string, string | null]> => {
        const result = await fetchRecipeBookRecipes(book.id, {
          limit: RECIPE_BOOK_COVER_PAGE_SIZE,
        });
        const firstRecipe = result.success ? result.data?.items[0] : null;

        return [
          book.id,
          firstRecipe
            ? firstRecipe.thumbnail_url ?? getFallbackRecipeImage(firstRecipe.title)
            : null,
        ];
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }

        setBookCoverImages((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setBookCoverImages((current) => ({
          ...current,
          ...Object.fromEntries(candidates.map((book) => [book.id, null])),
        }));
      })
      .finally(() => {
        candidates.forEach((book) => {
          bookCoverLoadingIdsRef.current.delete(book.id);
        });
      });

    return () => {
      cancelled = true;
    };
  }, [authState, bookCoverImages, books, isMobileViewport]);

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
  const plannerAddSheet = (
    <PlannerAddSheet
      columns={plannerColumns}
      errorMessage={plannerAddError}
      isOpen={isPlannerAddSheetOpen}
      onChangeServings={setPlannerServings}
      onClose={closePlannerAddSheet}
      onRetryLoad={loadPlannerColumns}
      onSelectColumn={setSelectedPlanColumnId}
      onSelectDate={setSelectedPlanDate}
      onSubmit={handlePlannerAddSubmit}
      selectableDates={selectablePlannerDates}
      selectedColumnId={selectedPlanColumnId}
      selectedDate={selectedPlanDate}
      servings={plannerServings}
      sheetState={plannerAddSheetState}
      variant="recipe-detail"
    />
  );

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
          description="레시피북, 장보기 기록 등 나만의 데이터를 로그인 후 확인할 수 있어요."
          eyebrow="마이페이지 접근"
          safeBottomPadding
          title="이 화면은 로그인이 필요해요"
          tone="gate"
        >
          <div className="space-y-3">
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
          className="mt-4 flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand-contrast)] px-6 py-3 text-sm font-semibold text-[var(--text-inverse)]"
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
          bookCoverImages={bookCoverImages}
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
          savedRecipeCount={savedRecipeCount}
          savedRecipes={savedRecipes}
          savedRecipesState={savedRecipesState}
          scrollSentinelRef={scrollSentinelRef}
          shoppingHasNext={shoppingHasNext}
          shoppingItems={shoppingItems}
          shoppingLoaded={shoppingLoaded}
          showCreateInput={showCreateInput}
          stats={mypageStats}
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
          onOpenNicknameSheet={openNicknameSheet}
          onRetrySavedRecipes={() => {
            if (savedBook) {
              void loadSavedRecipes(savedBook.id);
            }
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
            className={`pointer-events-none fixed left-1/2 top-[calc(var(--control-height-xl)+12px+env(safe-area-inset-top))] z-50 w-[calc(100vw-40px)] max-w-[360px] -translate-x-1/2 rounded-full px-4 py-3 text-center text-[13px] font-extrabold shadow-[0_12px_24px_var(--overlay-20)] ${
              toast.tone === "success"
                ? "bg-[var(--brand)] text-[var(--text-inverse)]"
                : "bg-[var(--danger)] text-[var(--text-inverse)]"
            }`}
            role="status"
          >
            {toast.message}
          </div>
        ) : null}

        {showNicknameSheet ? (
          <NicknameEditSheet
            errorMessage={nicknameError}
            isSaving={isSavingNickname}
            mobile
            nicknameInput={nicknameInput}
            onClose={() => {
              setShowNicknameSheet(false);
              setNicknameError(null);
            }}
            onInputChange={(value) => {
              setNicknameInput(value);
              setNicknameError(null);
            }}
            onSave={() => void handleSaveNickname()}
            saveDisabled={nicknameSaveDisabled}
          />
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
          <button
            aria-label={`닉네임 변경, 현재 닉네임: ${profile?.nickname ?? ""}`}
            className="web-mypage-profile-main web-mypage-profile-edit"
            data-testid="mypage-profile-edit-button"
            onClick={openNicknameSheet}
            type="button"
          >
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
          </button>
          <div className="web-mypage-stats" aria-label="마이페이지 통계">
            {mypageStats.map((item) => (
              <div key={item.label}>
                <strong style={{ color: item.color }}>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
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
            aria-label="레시피북"
            onClick={() => switchDesktopTab("recipebooks")}
          >
            <BookIcon /> 레시피북
          </WebTabButton>
          <WebTabButton
            active={activeTab === "shopping"}
            aria-label="장보기 기록"
            onClick={() => switchDesktopTab("shopping")}
          >
            <CartIcon /> 장보기 기록
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
            aria-label="다먹은 요리"
            onClick={() => switchDesktopTab("eaten")}
          >
            <CheckIcon /> 다먹은 요리
          </WebTabButton>
          <WebTabButton
            active={activeTab === "preferences"}
            aria-label="환경설정"
            onClick={() => switchDesktopTab("preferences")}
          >
            <SettingsIcon /> 환경설정
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
          {activeTab === "preferences" ? (
            <MyPagePreferencesSurface
              accountDeleteError={accountDeleteError}
              deleteMealColumnError={deleteMealColumnError}
              deleteMealColumnTarget={deleteMealColumnTarget}
              isAddingMealColumn={isAddingMealColumn}
              isDeletingAccount={isDeletingAccount}
              isDeletingMealColumn={isDeletingMealColumn}
              isLoggingOut={isLoggingOut}
              isRenamingMealColumn={isRenamingMealColumn}
              isUpdatingWakeLock={isUpdatingWakeLock}
              logoutError={logoutError}
              mealColumnAddDisabled={mealColumnAddDisabled}
              mealColumnAddError={mealColumnAddError}
              mealColumnAddInput={mealColumnAddInput}
              mealColumnRenameDisabled={mealColumnRenameDisabled}
              mealColumnRenameError={mealColumnRenameError}
              mealColumnRenameInput={mealColumnRenameInput}
              mealColumns={mealColumns}
              mealColumnsEditMode={mealColumnsEditMode}
              mealColumnsError={mealColumnsError}
              mealColumnsLoading={mealColumnsLoading}
              profile={profile}
              renamingMealColumnId={renamingMealColumnId}
              showAccountDeleteDialog={showAccountDeleteDialog}
              showLogoutDialog={showLogoutDialog}
              onAddMealColumn={() => void handleAddMealColumn()}
              onCancelRenameMealColumn={() => {
                setRenamingMealColumnId(null);
                setMealColumnRenameInput("");
                setMealColumnRenameError(null);
              }}
              onCloseAccountDeleteDialog={() => {
                setShowAccountDeleteDialog(false);
                setAccountDeleteError(null);
              }}
              onCloseDeleteMealColumnDialog={() => {
                setDeleteMealColumnTarget(null);
                setDeleteMealColumnError(null);
              }}
              onCloseLogoutDialog={() => {
                setShowLogoutDialog(false);
                setLogoutError(null);
              }}
              onConfirmAccountDelete={() => void handleDeleteAccount()}
              onConfirmDeleteMealColumn={() => void handleDeleteMealColumn()}
              onConfirmLogout={() => void handleLogout()}
              onMealColumnAddInputChange={(value) => {
                setMealColumnAddInput(value);
                setMealColumnAddError(null);
              }}
              onMealColumnRenameInputChange={(value) => {
                setMealColumnRenameInput(value);
                setMealColumnRenameError(null);
              }}
              onMoveMealColumn={(columnId, targetIndex) =>
                void handleMoveMealColumn(columnId, targetIndex)
              }
              onRenameMealColumn={() => void handleRenameMealColumn()}
              onRequestDeleteMealColumn={(column) => {
                setDeleteMealColumnError(null);
                setDeleteMealColumnTarget(column);
              }}
              onRetryMealColumns={() => void loadMealColumns()}
              onShowAccountDeleteDialog={() => {
                setAccountDeleteError(null);
                setShowAccountDeleteDialog(true);
              }}
              onShowLogoutDialog={() => {
                setLogoutError(null);
                setShowLogoutDialog(true);
              }}
              onStartRenameMealColumn={startRenameMealColumn}
              onToggleMealColumnsEditMode={() =>
                setMealColumnsEditMode((current) => !current)
              }
              onToggleWakeLock={() => void handleToggleWakeLock()}
            />
          ) : null}
          {activeTab === "help" ? <MyPageHelpSurface /> : null}
          {activeTab === "recipebooks" ? (
            <RecipeBookTabContent
              createInputRef={createInputRef}
              createName={createName}
              customBooks={customBooks}
              deleteTarget={deleteTarget}
              detailRecipes={recipeBookDetailRecipes}
              detailState={recipeBookDetailState}
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
              onOpenBookDetail={(book) => void openRecipeBookDetail(book)}
              onCloseBookDetail={() => {
                setSelectedRecipeBook(null);
                setRecipeBookDetailRecipes([]);
                setRecipeBookDetailState("idle");
              }}
              onRetryBookDetail={() => {
                if (selectedRecipeBook) {
                  void openRecipeBookDetail(selectedRecipeBook);
                }
              }}
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
              selectedBook={selectedRecipeBook}
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
              onCloseDetail={closeShoppingDetail}
              onHistoryRefresh={() => void loadShoppingHistory()}
              onOpenDetail={(item) => openShoppingDetail(item)}
              scrollSentinelRef={scrollSentinelRef}
              selectedItem={selectedShoppingItem}
            />
          ) : null}
          {activeTab === "leftovers" ? (
            <LeftoverTabContent
              description={LEFTOVERS_DESCRIPTION}
              emptyDescription="요리를 완료하면 여기에 저장돼요"
              emptyTitle="남은 요리가 없어요"
              items={leftoverItems}
              mutatingId={leftoverMutatingId}
              onEat={handleEatLeftover}
              onPlannerAdd={(item) => void openPlannerAddSheet(item)}
              onRetry={() => void loadLeftoverTab("leftover")}
              state={leftoverState}
              tabKind="leftover"
              title="남은 요리"
            />
          ) : null}
          {activeTab === "eaten" ? (
            <LeftoverTabContent
              description={EATEN_DESCRIPTION}
              emptyDescription="남은 요리를 다 먹음 처리하면 여기에 모여요."
              emptyTitle="다먹은 요리가 없어요"
              items={eatenItems}
              mutatingId={leftoverMutatingId}
              onRetry={() => void loadLeftoverTab("eaten")}
              onUneat={handleUneatLeftover}
              state={eatenState}
              tabKind="eaten"
              title="다먹은 요리"
            />
          ) : null}
        </section>
      </div>

      {plannerAddSheet}

      {showNicknameSheet ? (
        <NicknameEditSheet
          errorMessage={nicknameError}
          isSaving={isSavingNickname}
          nicknameInput={nicknameInput}
          onClose={() => {
            setShowNicknameSheet(false);
            setNicknameError(null);
          }}
          onInputChange={(value) => {
            setNicknameInput(value);
            setNicknameError(null);
          }}
          onSave={() => void handleSaveNickname()}
          saveDisabled={nicknameSaveDisabled}
        />
      ) : null}

      {toast ? (
        <div
          className={`fixed inset-x-4 bottom-8 z-50 mx-auto max-w-md rounded-[var(--radius-lg)] px-4 py-3 text-center text-sm font-semibold shadow-lg ${
            toast.tone === "success"
              ? "bg-[var(--brand-contrast)] text-[var(--text-inverse)]"
              : "bg-[var(--danger)] text-[var(--text-inverse)]"
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

function MyPageSettingsAccountAvatar({ profile }: { profile: UserProfileData | null }) {
  const fallbackInitial = profile?.nickname?.slice(0, 1).toUpperCase() ?? "?";

  if (profile?.profile_image_url) {
    return (
      <Image
        alt=""
        className="web-settings-account-avatar"
        data-testid="settings-account-profile-image"
        height={36}
        src={profile.profile_image_url}
        unoptimized
        width={36}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="web-settings-account-avatar web-settings-account-avatar-fallback"
      data-testid="settings-account-profile-fallback"
    >
      {fallbackInitial}
    </span>
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
          <Link href={buildMypageSavedRecipeHref(recipe.recipe_id)}>
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

function MyPagePreferencesSurface({
  accountDeleteError,
  deleteMealColumnError,
  deleteMealColumnTarget,
  isAddingMealColumn,
  isDeletingAccount,
  isDeletingMealColumn,
  isLoggingOut,
  isRenamingMealColumn,
  isUpdatingWakeLock,
  logoutError,
  mealColumnAddDisabled,
  mealColumnAddError,
  mealColumnAddInput,
  mealColumnRenameDisabled,
  mealColumnRenameError,
  mealColumnRenameInput,
  mealColumns,
  mealColumnsEditMode,
  mealColumnsError,
  mealColumnsLoading,
  profile,
  renamingMealColumnId,
  showAccountDeleteDialog,
  showLogoutDialog,
  onAddMealColumn,
  onCancelRenameMealColumn,
  onCloseAccountDeleteDialog,
  onCloseDeleteMealColumnDialog,
  onCloseLogoutDialog,
  onConfirmAccountDelete,
  onConfirmDeleteMealColumn,
  onConfirmLogout,
  onMealColumnAddInputChange,
  onMealColumnRenameInputChange,
  onMoveMealColumn,
  onRenameMealColumn,
  onRequestDeleteMealColumn,
  onRetryMealColumns,
  onShowAccountDeleteDialog,
  onShowLogoutDialog,
  onStartRenameMealColumn,
  onToggleMealColumnsEditMode,
  onToggleWakeLock,
}: {
  accountDeleteError: string | null;
  deleteMealColumnError: string | null;
  deleteMealColumnTarget: PlannerColumnData | null;
  isAddingMealColumn: boolean;
  isDeletingAccount: boolean;
  isDeletingMealColumn: boolean;
  isLoggingOut: boolean;
  isRenamingMealColumn: boolean;
  isUpdatingWakeLock: boolean;
  logoutError: string | null;
  mealColumnAddDisabled: boolean;
  mealColumnAddError: string | null;
  mealColumnAddInput: string;
  mealColumnRenameDisabled: boolean;
  mealColumnRenameError: string | null;
  mealColumnRenameInput: string;
  mealColumns: PlannerColumnData[];
  mealColumnsEditMode: boolean;
  mealColumnsError: string | null;
  mealColumnsLoading: boolean;
  profile: UserProfileData | null;
  renamingMealColumnId: string | null;
  showAccountDeleteDialog: boolean;
  showLogoutDialog: boolean;
  onAddMealColumn: () => void;
  onCancelRenameMealColumn: () => void;
  onCloseAccountDeleteDialog: () => void;
  onCloseDeleteMealColumnDialog: () => void;
  onCloseLogoutDialog: () => void;
  onConfirmAccountDelete: () => void;
  onConfirmDeleteMealColumn: () => void;
  onConfirmLogout: () => void;
  onMealColumnAddInputChange: (value: string) => void;
  onMealColumnRenameInputChange: (value: string) => void;
  onMoveMealColumn: (columnId: string, targetIndex: number) => void;
  onRenameMealColumn: () => void;
  onRequestDeleteMealColumn: (column: PlannerColumnData) => void;
  onRetryMealColumns: () => void;
  onShowAccountDeleteDialog: () => void;
  onShowLogoutDialog: () => void;
  onStartRenameMealColumn: (column: PlannerColumnData) => void;
  onToggleMealColumnsEditMode: () => void;
  onToggleWakeLock: () => void;
}) {
  const renamingMealColumn =
    mealColumns.find((column) => column.id === renamingMealColumnId) ?? null;
  const [draggingMealColumnId, setDraggingMealColumnId] = useState<string | null>(null);

  const handleDropMealColumn = useCallback((targetColumnId: string) => {
    if (!draggingMealColumnId || draggingMealColumnId === targetColumnId) {
      setDraggingMealColumnId(null);
      return;
    }

    const targetIndex = mealColumns.findIndex((column) => column.id === targetColumnId);
    setDraggingMealColumnId(null);

    if (targetIndex >= 0) {
      onMoveMealColumn(draggingMealColumnId, targetIndex);
    }
  }, [draggingMealColumnId, mealColumns, onMoveMealColumn]);

  return (
    <div className="web-mypage-subsurface" data-testid="mypage-preferences-tab">
      <div className="web-mypage-section-head">
        <h2>환경설정</h2>
        <p>끼니 관리, 요리모드 화면 켜둠, 계정 상태를 관리해요.</p>
      </div>

      <section
        className="web-settings-bordered-section"
        data-testid="mypage-meal-column-section"
      >
        <div className="web-mypage-section-head web-mypage-preferences-head">
          <h2>끼니 관리</h2>
          <div className="web-settings-column-description-row">
            <p>
              끼니는 최대 5개까지 사용할 수 있어요. 드래그해서 바꾼 순서는 플래너에 그대로 표시돼요.
            </p>
            {!mealColumnsLoading && !mealColumnsError ? (
              <WebButton
                className="web-settings-delete-button"
                onClick={onToggleMealColumnsEditMode}
                variant="tertiary"
              >
                {mealColumnsEditMode ? "완료" : "끼니 삭제"}
              </WebButton>
            ) : null}
          </div>
        </div>
        <WebCard className="web-settings-column-card">
          {mealColumnsLoading ? (
            <div className="web-settings-column-list" data-testid="columns-loading">
              {[0, 1, 2].map((index) => (
                <div className="web-settings-column-row" key={index}>
                  <WebSkeleton height={18} width={120} />
                </div>
              ))}
            </div>
          ) : mealColumnsError ? (
            <div className="web-mypage-saved-state" data-testid="columns-error">
              <div>
                <h3>끼니를 불러오지 못했어요</h3>
                <p>{mealColumnsError}</p>
              </div>
              <WebButton onClick={onRetryMealColumns} size="sm" variant="secondary">
                다시 시도
              </WebButton>
            </div>
          ) : (
            <>
            <div className="web-settings-column-list" data-testid="column-list">
              {mealColumns.map((column, index) => (
                <div
                  className={[
                    "web-settings-column-row",
                    draggingMealColumnId === column.id
                      ? "web-settings-column-row-dragging"
                      : "",
                  ].join(" ")}
                  data-testid={`column-item-${column.id}`}
                  draggable
                  key={column.id}
                  onDragEnd={() => setDraggingMealColumnId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", column.id);
                    setDraggingMealColumnId(column.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    handleDropMealColumn(column.id);
                  }}
                >
                  <button
                    aria-label={`${column.name} 순서 드래그`}
                    className="web-settings-drag-handle"
                    data-testid={`column-drag-${column.id}`}
                    type="button"
                  >
                    <DragHandleIcon />
                  </button>
                  <div className="web-settings-column-field" data-testid={`column-name-${column.id}`}>
                    <strong className="web-settings-column-name" title={column.name}>
                      {column.name}
                    </strong>
                  </div>
                  <span className="web-settings-column-buttons">
                    <span className="web-settings-reorder-buttons">
                      <button
                        aria-label={`${column.name} 위로 이동`}
                        className="web-settings-reorder-button"
                        disabled={index === 0}
                        onClick={() => onMoveMealColumn(column.id, index - 1)}
                        type="button"
                      >
                        <MypageReorderArrowIcon direction="up" />
                      </button>
                      <button
                        aria-label={`${column.name} 아래로 이동`}
                        className="web-settings-reorder-button"
                        disabled={index === mealColumns.length - 1}
                        onClick={() => onMoveMealColumn(column.id, index + 1)}
                        type="button"
                      >
                        <MypageReorderArrowIcon direction="down" />
                      </button>
                    </span>
                    <button
                      aria-label={`${column.name} 이름 변경`}
                      className="web-settings-icon-button"
                      data-testid={`rename-column-${column.id}`}
                      onClick={() => onStartRenameMealColumn(column)}
                      type="button"
                    >
                      <PencilIcon />
                    </button>
                    {mealColumnsEditMode ? (
                      <button
                        aria-label={`${column.name} 끼니 삭제`}
                        className="web-settings-icon-button web-settings-icon-danger"
                        data-testid={`delete-column-${column.id}`}
                        disabled={mealColumns.length <= 1}
                        onClick={() => onRequestDeleteMealColumn(column)}
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
            {mealColumns.length < 5 ? (
              <form
                className="web-mypage-column-actions"
                onSubmit={(event) => {
                  event.preventDefault();
                  onAddMealColumn();
                }}
              >
                <input
                  aria-label="새 끼니 이름"
                  className="web-mypage-column-input web-mypage-column-input-prominent"
                  maxLength={30}
                  onChange={(event) => onMealColumnAddInputChange(event.target.value)}
                  placeholder="새 끼니 이름"
                  value={mealColumnAddInput}
                />
                <WebButton
                  data-testid="add-column-button"
                  disabled={mealColumnAddDisabled}
                  type="submit"
                  variant="secondary"
                >
                  {isAddingMealColumn ? "추가 중..." : "끼니 추가"}
                </WebButton>
              </form>
            ) : null}
            </>
          )}
        </WebCard>

        {mealColumnAddError ? (
          <p className="web-form-error" data-testid="add-column-error">
            {mealColumnAddError}
          </p>
        ) : null}
      </section>

      {renamingMealColumn ? (
        <MealColumnRenameDialog
          column={renamingMealColumn}
          errorMessage={mealColumnRenameError}
          inputValue={mealColumnRenameInput}
          isSaving={isRenamingMealColumn}
          onCancel={onCancelRenameMealColumn}
          onInputChange={onMealColumnRenameInputChange}
          onSave={onRenameMealColumn}
          saveDisabled={mealColumnRenameDisabled}
        />
      ) : null}

      <section
        className="web-settings-bordered-section"
        data-testid="mypage-cook-mode-section"
      >
        <div className="web-mypage-section-head web-mypage-preferences-head">
          <h2>요리 모드</h2>
        </div>
        <WebCard className="web-mypage-toggle-card">
          <PreferenceSwitchRow
            checked={profile?.settings.screen_wake_lock ?? false}
            description="요리 중 레시피를 보는 동안 화면이 꺼지지 않아요."
            disabled={isUpdatingWakeLock}
            onToggle={onToggleWakeLock}
            title="요리모드 화면 켜둠"
          />
        </WebCard>
      </section>

      <section
        className="web-settings-bordered-section"
        data-testid="mypage-account-section"
      >
        <div className="web-mypage-section-head web-mypage-preferences-head">
          <h2>계정</h2>
          <p>로그인 상태를 정리해요.</p>
        </div>
        <WebCard className="web-mypage-account-card">
          <div className="web-mypage-settings-row">
            <MyPageSettingsAccountAvatar profile={profile} />
            <span className="web-mypage-row-copy">
              <strong>{profile?.nickname ?? ""}</strong>
              <span>{formatProviderLabel(profile?.social_provider)}</span>
            </span>
          </div>
          <button
            className="web-mypage-settings-row"
            onClick={onShowLogoutDialog}
            type="button"
          >
              <span className="web-mypage-row-icon"><LogoutIcon /></span>
              <span className="web-mypage-row-copy">
                <strong>로그아웃</strong>
                <span>현재 로그인한 계정에서 나가요.</span>
              </span>
            <ChevronRightIcon />
          </button>
        </WebCard>
      </section>

      <section
        className="web-settings-bordered-section"
        data-testid="mypage-danger-section"
      >
        <div className="web-mypage-section-head web-mypage-preferences-head">
          <h2>위험 영역</h2>
        </div>
        <WebCard className="web-settings-danger-card">
          <div>
            <strong>계정 삭제</strong>
            <span>레시피북, 플래너, 장보기, 팬트리 기록이 영구적으로 삭제돼요.</span>
          </div>
          <WebButton
            className="web-settings-danger-button"
            onClick={onShowAccountDeleteDialog}
          >
            계정 삭제하기
          </WebButton>
        </WebCard>
      </section>

      {showLogoutDialog ? (
        <MyPageConfirmDialog
          confirmLabel={isLoggingOut ? "로그아웃 중..." : "로그아웃"}
          errorMessage={logoutError}
          onCancel={onCloseLogoutDialog}
          onConfirm={onConfirmLogout}
          title="로그아웃 할까요?"
        />
      ) : null}

      {showAccountDeleteDialog ? (
        <MyPageConfirmDialog
          confirmLabel={isDeletingAccount ? "삭제 중..." : "계정 삭제"}
          destructive
          description="계정을 삭제하면 레시피북, 플래너, 장보기, 팬트리 기록은 삭제돼요. 되돌릴 수 없어요. 직접 등록한 레시피는 작성자 정보 없이 남을 수 있어요."
          errorMessage={accountDeleteError}
          onCancel={onCloseAccountDeleteDialog}
          onConfirm={onConfirmAccountDelete}
          title="정말 계정을 삭제할까요?"
        />
      ) : null}

      {deleteMealColumnTarget ? (
        <MyPageConfirmDialog
          confirmLabel={isDeletingMealColumn ? "삭제 중..." : "끼니 삭제"}
          destructive
          description={`"${deleteMealColumnTarget.name}" 끼니를 삭제할까요? 식사가 있으면 삭제되지 않아요.`}
          errorMessage={deleteMealColumnError}
          onCancel={onCloseDeleteMealColumnDialog}
          onConfirm={onConfirmDeleteMealColumn}
          title="끼니 삭제"
        />
      ) : null}
    </div>
  );
}

function MealColumnRenameDialog({
  column,
  errorMessage,
  inputValue,
  isSaving,
  onCancel,
  onInputChange,
  onSave,
  saveDisabled,
}: {
  column: PlannerColumnData;
  errorMessage: string | null;
  inputValue: string;
  isSaving: boolean;
  onCancel: () => void;
  onInputChange: (value: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog aria-labelledby="meal-column-rename-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="meal-column-rename-title">
            끼니 이름 변경
          </WebDialogTitle>
        </WebDialogHeader>
        <WebDialogBody>
          <label className="web-form-label" htmlFor="meal-column-rename-input">
            끼니 이름
          </label>
          <input
            aria-label={`${column.name} 새 이름`}
            autoFocus
            className="web-mypage-column-input web-mypage-column-input-prominent"
            id="meal-column-rename-input"
            maxLength={30}
            onChange={(event) => onInputChange(event.target.value)}
            value={inputValue}
          />
          <p className="web-form-help">1~30자로 입력해 주세요.</p>
          {errorMessage ? (
            <p className="web-form-error" data-testid="rename-column-error">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onCancel} variant="ghost">
            취소
          </WebButton>
          <WebButton disabled={saveDisabled} onClick={onSave}>
            {isSaving ? "저장 중..." : "저장"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function MyPageConfirmDialog({
  confirmLabel,
  description,
  destructive = false,
  errorMessage,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel: string;
  description?: string;
  destructive?: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <WebModal onBackdropClick={onCancel}>
      <WebDialog aria-labelledby="mypage-confirm-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="mypage-confirm-title">{title}</WebDialogTitle>
        </WebDialogHeader>
        <WebDialogBody>
          {description ? <p className="web-form-help">{description}</p> : null}
          {errorMessage ? (
            <p className="web-form-error" data-testid="mypage-confirm-error">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onCancel} variant="ghost">
            취소
          </WebButton>
          <WebButton
            className={destructive ? "web-mypage-danger-button" : undefined}
            onClick={onConfirm}
            variant={destructive ? "ghost" : "primary"}
          >
            {confirmLabel}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function NicknameEditSheet({
  errorMessage,
  isSaving,
  mobile = false,
  nicknameInput,
  onClose,
  onInputChange,
  onSave,
  saveDisabled,
}: {
  errorMessage: string | null;
  isSaving: boolean;
  mobile?: boolean;
  nicknameInput: string;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  if (mobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-40)]"
        data-testid="nickname-sheet-backdrop"
        onClick={onClose}
      >
        <div
          aria-modal="true"
          className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
        >
          <h2 className="text-[18px] font-extrabold text-[var(--foreground)]">
            닉네임 변경
          </h2>
          <input
            aria-label="새 닉네임"
            className="mt-4 h-[38px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-[14px] font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--brand)]"
            maxLength={30}
            onChange={(event) => onInputChange(event.target.value)}
            type="text"
            value={nicknameInput}
          />
          <p className="mt-2 text-[12px] font-medium text-[var(--text-3)]">
            2~30자로 입력해 주세요
          </p>
          {errorMessage ? (
            <p
              className="mt-2 text-[12px] font-bold text-[var(--danger)]"
              data-testid="nickname-error"
            >
              {errorMessage}
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-[78px_minmax(0,1fr)] gap-2">
            <button
              className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--surface-fill)] text-[16px] font-extrabold text-[var(--foreground)]"
              onClick={onClose}
              type="button"
            >
              취소
            </button>
            <button
              className="h-[var(--control-height-lg)] rounded-[var(--radius-control)] bg-[var(--brand)] text-[16px] font-extrabold text-[var(--text-inverse)] disabled:bg-[var(--line-strong)]"
              disabled={saveDisabled}
              onClick={onSave}
              type="button"
            >
              {isSaving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <WebModal data-testid="nickname-sheet-backdrop" onBackdropClick={onClose}>
      <WebDialog aria-labelledby="mypage-nickname-title" size="narrow">
        <WebDialogHeader>
          <WebDialogTitle id="mypage-nickname-title">닉네임 변경</WebDialogTitle>
        </WebDialogHeader>
        <WebDialogBody>
          <label className="web-form-label" htmlFor="mypage-nickname-input">
            새 닉네임
          </label>
          <input
            aria-describedby="mypage-nickname-help"
            className="web-form-input"
            id="mypage-nickname-input"
            maxLength={30}
            onChange={(event) => onInputChange(event.target.value)}
            value={nicknameInput}
          />
          <p className="web-form-help" id="mypage-nickname-help">
            2~30자로 입력해 주세요
          </p>
          {errorMessage ? (
            <p className="web-form-error" data-testid="nickname-error">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton onClick={onClose} variant="ghost">
            취소
          </WebButton>
          <WebButton disabled={saveDisabled} onClick={onSave} variant="primary">
            {isSaving ? "저장 중..." : "저장"}
          </WebButton>
        </WebDialogFooter>
      </WebDialog>
    </WebModal>
  );
}

function MyPageHelpSurface() {
  const faqs = [
    ["레시피북은 어떻게 정리되나요?", "내가 추가한 레시피, 저장한 레시피, 좋아요한 레시피는 자동으로 정리되고 커스텀 북은 직접 만들 수 있어요."],
    ["장보기 기록은 어디서 보나요?", "저장한 레시피 탭 하단의 장보기 기록에서 진행 중인 리스트와 완료된 리스트를 확인할 수 있어요."],
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

function PreferenceSwitchRow({
  checked = false,
  description,
  disabled = false,
  onToggle,
  title,
}: {
  checked?: boolean;
  description: string;
  disabled?: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={title}
      className="web-mypage-toggle-row"
      disabled={disabled}
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
        className="min-h-dvh bg-[var(--surface-fill)] pb-[calc(98px+env(safe-area-inset-bottom))] text-[var(--foreground)] lg:hidden"
        data-testid="mypage-mobile-loading"
      >
        <div
          className={[
            "sticky top-0 z-30 flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4",
            showBack ? "justify-center" : "",
          ].join(" ")}
          style={{ borderBottomWidth: "0.5px" }}
        >
          {showBack ? (
            <button
              aria-label="뒤로"
              className="absolute left-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-start border-0 bg-transparent p-0 text-[var(--foreground)]"
              onClick={onBack}
              type="button"
            >
              <MypageSkeletonBackIcon />
            </button>
          ) : null}
          <h1
            className={[
              "truncate text-[18px] font-bold leading-none text-[var(--brand)]",
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
      <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-5">
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
              className="rounded-[var(--radius-control)] bg-[var(--surface-fill)] px-2 py-3"
              key={index}
            >
              <Skeleton className="mx-auto h-6 w-8" />
              <Skeleton className="mx-auto mt-2 h-3 w-12" />
            </div>
          ))}
        </div>
      </section>
      <section className="p-4">
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]">
          {[1, 2, 3, 4].map((index) => (
            <div
              className={[
                "flex min-h-[57px] w-full items-center gap-3 px-4",
                index < 4 ? "border-b border-[var(--surface-subtle)]" : "",
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
            className="flex min-h-[82px] items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3"
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
  detailRecipes: RecipeBookRecipeItem[];
  detailState: RecipeBookDetailState;
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
  selectedBook: RecipeBookSummary | null;
  onCloseBookDetail: () => void;
  onOpenBookDetail: (book: RecipeBookSummary) => void;
  onRetryBookDetail: () => void;
  onMenuOpen: (id: string) => void;
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
  detailRecipes,
  detailState,
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
  selectedBook,
  onCloseBookDetail,
  onOpenBookDetail,
  onRetryBookDetail,
  onMenuOpen,
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
  if (selectedBook) {
    return (
      <RecipeBookInlineDetail
        book={selectedBook}
        recipes={detailRecipes}
        state={detailState}
        onBack={onCloseBookDetail}
        onRetry={onRetryBookDetail}
      />
    );
  }

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
          <SystemBookCard
            book={book}
            key={book.id}
            onOpen={() => onOpenBookDetail(book)}
          />
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
              onOpen={() => onOpenBookDetail(book)}
              onMenuOpen={() => onMenuOpen(book.id)}
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

function formatRecipeCount(count: number) {
  return `${Number.isFinite(count) ? count : 0}개`;
}

function SystemBookCard({
  book,
  onOpen,
}: {
  book: RecipeBookSummary;
  onOpen: () => void;
}) {
  return (
    <button
      className="web-recipebook-book-card"
      data-testid={`system-book-${book.book_type}`}
      onClick={onOpen}
      type="button"
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
    </button>
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

function RecipeBookInlineDetail({
  book,
  recipes,
  state,
  onBack,
  onRetry,
}: {
  book: RecipeBookSummary;
  recipes: RecipeBookRecipeItem[];
  state: RecipeBookDetailState;
  onBack: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="web-mypage-subsurface web-mypage-inline-detail">
      <div className="web-mypage-inline-head">
        <div>
          <WebButton onClick={onBack} size="sm" variant="tertiary">
            목록으로
          </WebButton>
          <h2>{book.name}</h2>
          <p>{formatRecipeCount(book.recipe_count)} 레시피를 확인합니다.</p>
        </div>
        {book.book_type === "custom" ? (
          <span className="web-mypage-inline-badge">커스텀</span>
        ) : null}
      </div>

      {state === "loading" || state === "idle" ? (
        <div className="web-mypage-recipe-grid" data-testid="recipebook-detail-loading">
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
      ) : null}

      {state === "error" ? (
        <WebCard className="web-mypage-saved-state">
          <div>
            <h3>레시피북을 불러오지 못했어요</h3>
            <p>잠시 후 다시 시도해 주세요.</p>
          </div>
          <WebButton onClick={onRetry} size="sm" variant="secondary">
            다시 시도
          </WebButton>
        </WebCard>
      ) : null}

      {state === "empty" ? (
        <WebCard className="web-mypage-saved-state">
          <div>
            <h3>아직 담긴 레시피가 없어요</h3>
            <p>레시피를 저장하면 이곳에 모아 보여드려요.</p>
          </div>
        </WebCard>
      ) : null}

      {state === "ready" ? (
        <div className="web-mypage-recipe-grid" role="list">
          {recipes.map((recipe) => (
            <div key={recipe.recipe_id} role="listitem">
              <Link href={buildMypageRecipeBookRecipeHref(recipe.recipe_id, book)}>
                <WebRecipeCard
                  alt={recipe.title}
                  imageSrc={recipe.thumbnail_url ?? getFallbackRecipeImage(recipe.title)}
                  meta={formatSavedRecipeMeta(recipe)}
                  title={recipe.title}
                />
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </div>
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
  onOpen: () => void;
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
  onOpen,
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
        <button
          className="web-recipebook-book-copy"
          onClick={onOpen}
          type="button"
        >
          <strong>{book.name}</strong>
          <span>{formatRecipeCount(book.recipe_count)} 레시피 · 커스텀</span>
          <em>커스텀</em>
        </button>
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
  selectedItem: ShoppingListHistoryItem | null;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
  onCloseDetail: () => void;
  onHistoryRefresh: () => void;
  onOpenDetail: (item: ShoppingListHistoryItem) => void;
}

function ShoppingHistoryTabContent({
  items,
  loaded,
  hasNext,
  isLoadingMore,
  selectedItem,
  scrollSentinelRef,
  onCloseDetail,
  onHistoryRefresh,
  onOpenDetail,
}: ShoppingHistoryTabContentProps) {
  if (selectedItem) {
    return (
      <ShoppingHistoryInlineDetail
        item={selectedItem}
        onBack={onCloseDetail}
        onCompleted={onHistoryRefresh}
      />
    );
  }

  if (!loaded) {
    return (
      <div className="web-mypage-subsurface">
        <div className="web-mypage-section-head">
          <h2>장보기 기록</h2>
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
        <h2>장보기 기록</h2>
        <p>진행 중이거나 완료한 장보기 목록을 확인합니다.</p>
      </div>
      <ShoppingHistoryCalendar
        items={items}
        onOpenDetail={onOpenDetail}
      />
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

// ─── Shopping History Calendar ───────────────────────────────────────────────

function ShoppingHistoryCalendar({
  items,
  onOpenDetail,
}: {
  items: ShoppingListHistoryItem[];
  onOpenDetail: (item: ShoppingListHistoryItem) => void;
}) {
  const months = buildShoppingHistoryCalendarMonths(items);

  return (
    <div aria-live="polite" className="web-mypage-shopping-calendar">
      {months.map((month) => (
        <section className="web-mypage-shopping-month" key={month.monthKey}>
          <h3>{month.title}</h3>
          <div
            aria-hidden="true"
            className="web-mypage-shopping-weekdays"
          >
            {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="web-mypage-shopping-calendar-grid">
            {month.days.map((day) => (
              <div
                className={[
                  "web-mypage-shopping-day",
                  day.dayNumber === null ? "web-mypage-shopping-day-empty" : "",
                ].join(" ")}
                key={day.dateKey}
              >
                {day.dayNumber !== null ? (
                  <span className="web-mypage-shopping-day-number">
                    {day.dayNumber}
                  </span>
                ) : null}
                {day.items.map((item) => (
                  <ShoppingHistoryCard
                    item={item}
                    key={item.id}
                    onOpen={() => onOpenDetail(item)}
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ShoppingHistoryCard({
  item,
  onOpen,
}: {
  item: ShoppingListHistoryItem;
  onOpen: () => void;
}) {
  const dateRange = formatShoppingHistoryMealRange(item);

  return (
    <button
      className="web-mypage-shopping-card"
      data-testid={`shopping-card-${item.id}`}
      onClick={onOpen}
      type="button"
    >
      <p className="text-base font-semibold text-[var(--foreground)]">
        {item.title}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-left text-sm">
        <div>
          <dt className="text-[12px] font-bold text-[var(--text-3)]">생성일</dt>
          <dd className="mt-0.5 font-semibold text-[var(--foreground)]">
            {formatShoppingHistoryDateTime(item.created_at)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-bold text-[var(--text-3)]">완료일</dt>
          <dd className="mt-0.5 font-semibold text-[var(--foreground)]">
            {formatShoppingHistoryDateTime(item.completed_at)}
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-bold text-[var(--text-3)]">구매 재료</dt>
          <dd className="mt-0.5 font-semibold text-[var(--foreground)]">
            {item.item_count}개
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-bold text-[var(--text-3)]">끼니 범위</dt>
          <dd className="mt-0.5 font-semibold text-[var(--foreground)]">
            {dateRange}
          </dd>
        </div>
      </dl>
      <ShoppingHistoryStatusTag item={item} />
    </button>
  );
}

function ShoppingHistoryStatusTag({ item }: { item: ShoppingListHistoryItem }) {
  return (
    <span
      className={[
        "web-mypage-shopping-status",
        item.is_completed
          ? "web-mypage-shopping-status-complete"
          : "web-mypage-shopping-status-active",
      ].join(" ")}
    >
      {item.is_completed ? "✓ 완료" : "진행 중"}
    </span>
  );
}

function ShoppingHistoryInlineDetail({
  item,
  onBack,
  onCompleted,
}: {
  item: ShoppingListHistoryItem;
  onBack: () => void;
  onCompleted: () => void;
}) {
  return (
    <div className="web-mypage-subsurface web-mypage-inline-detail">
      <ShoppingDetailScreen
        initialAuthenticated
        listId={item.id}
        navActiveId="mypage"
        onCompleted={onCompleted}
        onRequestClose={onBack}
        presentation="embedded"
      />
    </div>
  );
}

// ─── Leftovers Tab ───────────────────────────────────────────────────────────

interface LeftoverTabContentProps {
  description: string;
  emptyDescription: string;
  emptyTitle: string;
  items: LeftoverListItemData[];
  mutatingId: string | null;
  onEat?: (item: LeftoverListItemData) => void;
  onPlannerAdd?: (item: LeftoverListItemData) => void;
  onRetry: () => void;
  onUneat?: (item: LeftoverListItemData) => void;
  state: LeftoverTabState;
  tabKind: LeftoverDishStatus;
  title: string;
}

function LeftoverTabContent({
  description,
  emptyDescription,
  emptyTitle,
  items,
  mutatingId,
  onEat,
  onPlannerAdd,
  onRetry,
  onUneat,
  state,
  tabKind,
  title,
}: LeftoverTabContentProps) {
  if (state === "idle" || state === "loading") {
    return (
      <div className="web-mypage-subsurface" data-testid="leftover-tab-loading">
        <div className="web-mypage-section-head">
          <h2>{title} {items.length}개</h2>
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
          <h2>{title} {items.length}개</h2>
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
          <h2>{title} 0개</h2>
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
        <h2>{title} {items.length}개</h2>
        <p>{description}</p>
      </div>
      <div className="web-mypage-leftover-grid">
        {items.map((item) => (
          <LeftoverTabCard
            isMutating={mutatingId === item.id}
            item={item}
            key={item.id}
            onEat={onEat}
            onPlannerAdd={onPlannerAdd}
            onUneat={onUneat}
            tabKind={tabKind}
          />
        ))}
      </div>
    </div>
  );
}

function LeftoverTabCard({
  isMutating,
  item,
  onEat,
  onPlannerAdd,
  onUneat,
  tabKind,
}: {
  isMutating: boolean;
  item: LeftoverListItemData;
  onEat?: (item: LeftoverListItemData) => void;
  onPlannerAdd?: (item: LeftoverListItemData) => void;
  onUneat?: (item: LeftoverListItemData) => void;
  tabKind: LeftoverDishStatus;
}) {
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
        <Link
          className="web-mypage-leftover-title"
          href={buildMypageLeftoverRecipeHref(item.recipe_id, tabKind)}
        >
          {item.recipe_title}
        </Link>
        <span>{formatLeftoverTabMeta(item)}</span>
      </span>
      <span className="web-mypage-leftover-actions">
        {tabKind === "leftover" ? (
          <>
            <WebButton
              disabled={isMutating}
              onClick={() => onPlannerAdd?.(item)}
              size="sm"
              variant="secondary"
            >
              플래너에 추가
            </WebButton>
            <WebButton
              disabled={isMutating}
              onClick={() => onEat?.(item)}
              size="sm"
              variant="tertiary"
            >
              {isMutating ? "처리 중..." : "다먹음"}
            </WebButton>
          </>
        ) : (
          <WebButton
            disabled={isMutating}
            onClick={() => onUneat?.(item)}
            size="sm"
            variant="secondary"
          >
            {isMutating ? "처리 중..." : "남은 요리로"}
          </WebButton>
        )}
      </span>
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
    value === "preferences" ||
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
  const mealLabel = item.source_meal_label?.trim() || "연결 끼니 없음";
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

function PencilIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
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

function DragHandleIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16">
      <path d="M8 7h.01M8 12h.01M8 17h.01M16 7h.01M16 12h.01M16 17h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function MypageReorderArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      aria-hidden="true"
      className="web-settings-reorder-icon"
      fill="none"
      viewBox="0 0 12 12"
    >
      <path
        d={direction === "up" ? "M6 3.25 3.25 6h5.5L6 3.25Z" : "M6 8.75 3.25 6h5.5L6 8.75Z"}
        fill="currentColor"
      />
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
