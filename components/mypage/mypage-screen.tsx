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
import { LinkedAuthProviders } from "@/components/auth/linked-auth-providers";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  MypageMobileScreen,
  type MypageMobileSurface,
} from "@/components/mypage/mypage-mobile-screen";
import type { MypageGrowthPanel } from "@/components/mypage/mypage-growth-detail-dialog";
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
import {
  PlannerAddSheet,
  type PlannerAddSheetState,
} from "@/components/recipe/planner-add-sheet";
import { RecipeBookDetailScreen } from "@/components/recipebook/recipebook-detail-screen";
import { ShoppingDetailScreen } from "@/components/shopping/shopping-detail-screen";
import { AppBackButton } from "@/components/shared/app-back-button";
import { AppFeedbackToast } from "@/components/shared/app-feedback-toast";
import { ContentState } from "@/components/shared/content-state";
import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
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
  WebTabIcon,
  WebTabs,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { clearLastAuthProvider } from "@/lib/auth/provider-memory";
import {
  getSafeDisplayText,
  isSafeDisplayText,
} from "@/lib/display-safety";
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
  updateRecipeBook,
  updateNickname,
  updateSettings,
  type UserProfileData,
} from "@/lib/api/mypage";
import {
  dismissUserGamificationTutorialQuest,
  fetchUserGamification,
} from "@/lib/api/user-gamification";
import { fetchUserProgress } from "@/lib/api/user-progress";
import { notifyGamificationSourceAction } from "@/lib/gamification-events";
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
import {
  buildReturnHref,
  sanitizeInternalPath,
} from "@/lib/navigation/return-context";
import {
  resolveMypageRestoreState,
  type MypageRestoreTab,
} from "@/lib/navigation/mypage-return-state";
import {
  buildMypageRecordStats,
  buildPlannerMealStatusStats,
  type MypageRecordStats,
} from "@/lib/planner-stats";
import {
  getRecipeBookCoverTone,
  getRecipeBookCoverViewModel,
  RECIPE_BOOK_COVER_TONES,
} from "@/lib/recipebook-cover";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import type {
  RecipeBookCoverColorKey,
  RecipeBookRecipeItem,
  RecipeBookSummary,
} from "@/types/recipe";
import type {
  LeftoverDishStatus,
  LeftoverListItemData,
} from "@/types/leftover";
import type { PlannerColumnData } from "@/types/planner";
import type { ShoppingListHistoryItem } from "@/types/shopping";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

type AuthState = "checking" | "authenticated" | "unauthorized";
type ViewState = "loading" | "error" | "ready";
type SavedRecipesState = "idle" | "loading" | "ready" | "empty" | "error";
type LeftoverTabState = "idle" | "loading" | "ready" | "empty" | "error";
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
const WEB_MYPAGE_LOADING_TAB_LABELS = [
  "저장한 레시피",
  "레시피북",
  "장보기 기록",
  "남은 요리",
  "다먹은 요리",
  "환경설정",
  "도움말",
] as const;

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

function toSafeRecipeBookSummary(book: RecipeBookSummary): RecipeBookSummary {
  return {
    ...book,
    name: getSafeDisplayText(book.name, "이름 정리 필요"),
  };
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
  const [initialGrowthPanel, setInitialGrowthPanel] =
    useState<MypageGrowthPanel | null>(null);
  const isMobileViewport = useIsMobileViewport();
  const [hasHydrated, setHasHydrated] = useState(false);
  const shouldUseMobileViewport = hasHydrated && isMobileViewport;

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
    registered: 0,
    shoppingDone: 0,
    total: 0,
  });
  const [userProgress, setUserProgress] = useState<UserProgressData | null>(null);
  const [progressState, setProgressState] =
    useState<MypageProgressState>("idle");
  const [userGamification, setUserGamification] =
    useState<UserGamificationData | null>(null);
  const [gamificationState, setGamificationState] =
    useState<MypageGamificationState>("idle");

  // Recipe books
  const [books, setBooks] = useState<RecipeBookSummary[]>([]);
  const [bookCoverImages, setBookCoverImages] = useState<Record<string, string | null>>({});
  const [bookCoverUpdatedAt, setBookCoverUpdatedAt] = useState<Record<string, string | null>>({});
  const [savedRecipes, setSavedRecipes] = useState<RecipeBookRecipeItem[]>([]);
  const [savedRecipesState, setSavedRecipesState] =
    useState<SavedRecipesState>("idle");
  const [savedRecipesBookId, setSavedRecipesBookId] = useState<string | null>(null);
  const [selectedRecipeBook, setSelectedRecipeBook] =
    useState<RecipeBookSummary | null>(null);

  // Shopping history
  const [shoppingItems, setShoppingItems] = useState<ShoppingListHistoryItem[]>([]);
  const [shoppingCursor, setShoppingCursor] = useState<string | null>(null);
  const [shoppingHasNext, setShoppingHasNext] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [shoppingLoaded, setShoppingLoaded] = useState(false);
  const [selectedShoppingItem, setSelectedShoppingItem] =
    useState<ShoppingListHistoryItem | null>(null);
  const [shoppingSelectedDateKey, setShoppingSelectedDateKey] = useState("");

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
  const [colorTarget, setColorTarget] = useState<RecipeBookSummary | null>(null);
  const [coverImageTarget, setCoverImageTarget] = useState<RecipeBookSummary | null>(null);
  const [coverImageValue, setCoverImageValue] = useState("");
  const [isUpdatingBookCover, setIsUpdatingBookCover] = useState(false);
  const [bookCoverError, setBookCoverError] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  // Refs
  const scrollSentinelRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const bookCoverLoadedIdsRef = useRef<Set<string>>(new Set());
  const bookCoverLoadingIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileReturnToRef = useRef<string | null>(
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("returnTo"),
  );

  useEffect(() => {
    setHasHydrated(true);
  }, []);

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
    const returnTo = params.get("returnTo");
    if (returnTo) {
      mobileReturnToRef.current = returnTo;
    }
    if (params.get("notifications") === "1") {
      setInitialGrowthPanel("notifications");
      setMobileSurface("home");
    }
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
    if (tab !== "recipebooks") {
      setSelectedRecipeBook(null);
    }

    if (tab === "shopping" && activeTab === "shopping" && selectedShoppingItem) {
      setSelectedShoppingItem(null);
      window.scrollTo(0, 0);
      return;
    }

    setActiveTab(tab);
    if (tab !== "shopping") {
      setSelectedShoppingItem(null);
    }
    window.scrollTo(0, 0);
  }, [activeTab, selectedShoppingItem]);

  const handleMobileSurfaceBack = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo") ?? mobileReturnToRef.current;

    if (returnTo) {
      router.replace(sanitizeInternalPath(returnTo, "/mypage"));
      return;
    }

    mobileReturnToRef.current = null;
    setActiveTab("saved");
    setSelectedRecipeBook(null);
    setSelectedShoppingItem(null);
    setMobileSurface("home");
    router.replace("/mypage");
  }, [router]);

  const handleMobileSurfaceChange = useCallback((surface: MypageMobileSurface) => {
    setMobileSurface(surface);
    if (surface === "shopping") {
      setActiveTab("shopping");
    }
    if (surface === "recipebook") {
      setActiveTab("recipebooks");
    }
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

  const loadMypageStats = useCallback(async () => {
    try {
      const plannerResult = await fetchPlanner(
        LIFETIME_PLANNER_STATS_RANGE.startDate,
        LIFETIME_PLANNER_STATS_RANGE.endDate,
      );
      setLifetimeMealStats(buildPlannerMealStatusStats(plannerResult.meals));
    } catch {
      // Mypage record stats are secondary and must not block the core screen.
    }
  }, []);

  const loadUserProgress = useCallback(async () => {
    setProgressState("loading");

    try {
      const result = await fetchUserProgress();
      setUserProgress(result);
      setProgressState("ready");
      return true;
    } catch (error) {
      setUserProgress(null);
      if (isMypageApiError(error) && error.status === 401) {
        setProgressState("error");
        return false;
      }
      setProgressState("error");
      return false;
    }
  }, []);

  const loadUserGamification = useCallback(async () => {
    setGamificationState("loading");

    try {
      const result = await fetchUserGamification();
      setUserGamification(result);
      const hasSurfaceContent =
        result.featured_badges.length > 0 ||
        result.badges.earned.length > 0 ||
        result.quests.active.length > 0 ||
        result.quests.completed_recent.length > 0 ||
        result.tutorial.active_steps.length > 0;
      setGamificationState(hasSurfaceContent ? "ready" : "empty");
      return true;
    } catch (error) {
      setUserGamification(null);
      if (isMypageApiError(error) && error.status === 401) {
        setGamificationState("error");
        return false;
      }
      setGamificationState("error");
      return false;
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setViewState("loading");
    setUserProgress(null);
    setUserGamification(null);
    setProgressState("loading");
    setGamificationState("loading");
    const secondaryLoads = Promise.allSettled([
      loadMypageStats(),
      loadUserProgress(),
      loadUserGamification(),
    ]);

    try {
      const [profileOk, booksOk] = await Promise.all([
        loadProfile(),
        loadRecipeBooks(),
      ]);
      if (profileOk && booksOk) {
        setViewState("ready");
        void secondaryLoads;
      }
    } catch {
      void secondaryLoads;
      setProgressState("error");
      setGamificationState("error");
      setViewState("error");
    }
  }, [
    loadProfile,
    loadMypageStats,
    loadRecipeBooks,
    loadUserGamification,
    loadUserProgress,
  ]);

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
      clearLastAuthProvider();
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
    if (!isSafeDisplayText(trimmed)) {
      showToast("레시피북 이름을 확인해 주세요", "error");
      return;
    }
    setIsCreating(true);
    try {
      await createRecipeBook(trimmed);
      await loadRecipeBooks();
      notifyGamificationSourceAction();
      void loadUserGamification();
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
  }, [createName, loadRecipeBooks, loadUserGamification, showToast]);

  const handleDismissTutorialQuest = useCallback(
    async (questKey: string) => {
      try {
        await dismissUserGamificationTutorialQuest(questKey);
        void loadUserGamification();
      } catch {
        showToast("튜토리얼 퀘스트 상태를 저장하지 못했어요", "error");
      }
    },
    [loadUserGamification, showToast],
  );

  const handleRenameBook = useCallback(async () => {
    if (!renamingBookId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    if (!isSafeDisplayText(trimmed)) {
      showToast("레시피북 이름을 확인해 주세요", "error");
      return;
    }
    setIsRenaming(true);
    try {
      const updatedBook = await renameRecipeBook(renamingBookId, trimmed);
      await loadRecipeBooks();
      setSelectedRecipeBook((currentBook) =>
        currentBook?.id === updatedBook.id
          ? { ...currentBook, ...updatedBook }
          : currentBook,
      );
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
      if (selectedRecipeBook?.id === deleteTarget.id) {
        setSelectedRecipeBook(null);
      }
      setDeleteTarget(null);
      showToast("삭제했어요", "success");
    } catch {
      showToast("삭제에 실패했어요", "error");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, loadRecipeBooks, selectedRecipeBook?.id, showToast]);

  const applyUpdatedBook = useCallback((updatedBook: RecipeBookSummary) => {
    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.id === updatedBook.id
          ? {
              ...book,
              ...updatedBook,
              recipe_count: updatedBook.recipe_count ?? book.recipe_count,
            }
          : book,
      ),
    );
    setSelectedRecipeBook((currentBook) =>
      currentBook?.id === updatedBook.id
        ? { ...currentBook, ...updatedBook }
        : currentBook,
    );
    setBookCoverImages((currentImages) => {
      const nextImages = { ...currentImages };

      if (updatedBook.cover_image_url) {
        nextImages[updatedBook.id] = updatedBook.cover_image_url;
        bookCoverLoadedIdsRef.current.add(updatedBook.id);
      } else if (updatedBook.cover_image_url === null) {
        delete nextImages[updatedBook.id];
        bookCoverLoadedIdsRef.current.delete(updatedBook.id);
      }

      return nextImages;
    });
  }, []);

  const handleBookColorUpdate = useCallback(async (colorKey: RecipeBookCoverColorKey) => {
    if (!colorTarget || isUpdatingBookCover) return;

    setIsUpdatingBookCover(true);
    setBookCoverError(null);

    try {
      const updatedBook = await updateRecipeBook(colorTarget.id, {
        cover_color_key: colorKey,
      });
      applyUpdatedBook(updatedBook);
      setColorTarget(null);
      showToast("레시피북 색상을 변경했어요", "success");
    } catch (error) {
      setBookCoverError(
        isMypageApiError(error) ? error.message : "색상 변경에 실패했어요",
      );
    } finally {
      setIsUpdatingBookCover(false);
    }
  }, [applyUpdatedBook, colorTarget, isUpdatingBookCover, showToast]);

  const handleBookCoverImageUpdate = useCallback(async (nextImageUrl?: string | null) => {
    if (!coverImageTarget || isUpdatingBookCover) return;

    setIsUpdatingBookCover(true);
    setBookCoverError(null);

    try {
      const normalizedImageUrl =
        nextImageUrl === undefined ? coverImageValue.trim() || null : nextImageUrl;
      const updatedBook = await updateRecipeBook(coverImageTarget.id, {
        cover_image_url: normalizedImageUrl,
      });
      applyUpdatedBook(updatedBook);
      setCoverImageTarget(null);
      setCoverImageValue("");
      showToast(
        normalizedImageUrl ? "커버 이미지를 변경했어요" : "커버 이미지를 삭제했어요",
        "success",
      );
    } catch (error) {
      setBookCoverError(
        isMypageApiError(error) ? error.message : "커버 이미지 변경에 실패했어요",
      );
    } finally {
      setIsUpdatingBookCover(false);
    }
  }, [
    applyUpdatedBook,
    coverImageTarget,
    coverImageValue,
    isUpdatingBookCover,
    showToast,
  ]);

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
  const mypageRecordStats: MypageRecordStats = buildMypageRecordStats(lifetimeMealStats);

  useEffect(() => {
    const shouldLoadSavedRecipes =
      activeTab === "saved" || (shouldUseMobileViewport && mobileSurface === "home");

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
    loadSavedRecipes,
    mobileSurface,
    savedBook,
    savedRecipeCount,
    savedRecipesBookId,
    savedRecipesState,
    shouldUseMobileViewport,
  ]);

  useEffect(() => {
    if (authState !== "authenticated" || books.length === 0) {
      return;
    }

    let cancelled = false;
    const currentBookIds = new Set(books.map((book) => book.id));

    for (const bookId of bookCoverLoadedIdsRef.current) {
      if (!currentBookIds.has(bookId)) {
        bookCoverLoadedIdsRef.current.delete(bookId);
      }
    }

    for (const bookId of bookCoverLoadingIdsRef.current) {
      if (!currentBookIds.has(bookId)) {
        bookCoverLoadingIdsRef.current.delete(bookId);
      }
    }

    const candidates = books.filter(
      (book) =>
        !book.cover_image_url &&
        book.recipe_count > 0 &&
        !bookCoverLoadedIdsRef.current.has(book.id) &&
        !bookCoverLoadingIdsRef.current.has(book.id),
    );

    if (candidates.length === 0) {
      return;
    }

    candidates.forEach((book) => {
      bookCoverLoadingIdsRef.current.add(book.id);
    });

    void Promise.all(
      candidates.map(async (book): Promise<[string, string | null, string | null]> => {
        const result = await fetchRecipeBookRecipes(book.id, {
          limit: RECIPE_BOOK_COVER_PAGE_SIZE,
        });
        const firstRecipe = result.success ? result.data?.items[0] : null;

        return [
          book.id,
          firstRecipe
            ? resolveRecipeImage({
                id: firstRecipe.recipe_id,
                thumbnail_url: firstRecipe.thumbnail_url,
              })
            : null,
          firstRecipe?.added_at ?? null,
        ];
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }

        entries.forEach(([bookId]) => {
          bookCoverLoadedIdsRef.current.add(bookId);
        });
        setBookCoverImages((current) => ({
          ...current,
          ...Object.fromEntries(entries.map(([bookId, imageSrc]) => [bookId, imageSrc])),
        }));
        setBookCoverUpdatedAt((current) => ({
          ...current,
          ...Object.fromEntries(entries.map(([bookId, , updatedAt]) => [bookId, updatedAt])),
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        candidates.forEach((book) => {
          bookCoverLoadedIdsRef.current.add(book.id);
        });
        setBookCoverImages((current) => ({
          ...current,
          ...Object.fromEntries(candidates.map((book) => [book.id, null])),
        }));
        setBookCoverUpdatedAt((current) => ({
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
  }, [authState, books]);

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

  const displayBooks = books.map(toSafeRecipeBookSummary);
  const systemBooks = displayBooks.filter((b) => b.book_type !== "custom");
  const customBooks = displayBooks.filter((b) => b.book_type === "custom");
  const profileSummaryProgress =
    progressState === "idle" || progressState === "loading"
      ? undefined
      : userProgress;
  const profileSummaryGamification =
    gamificationState === "idle" || gamificationState === "loading"
      ? undefined
      : userGamification;
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
  const bookCoverDialogs = (
    <>
      {colorTarget ? (
        <BookColorDialog
          currentColor={getRecipeBookCoverTone(colorTarget)}
          disabled={isUpdatingBookCover}
          errorMessage={bookCoverError}
          onCancel={() => {
            setColorTarget(null);
            setBookCoverError(null);
          }}
          onSelectColor={(colorKey) => void handleBookColorUpdate(colorKey)}
        />
      ) : null}
      {coverImageTarget ? (
        <BookCoverImageDialog
          disabled={isUpdatingBookCover}
          errorMessage={bookCoverError}
          imageUrl={coverImageValue}
          onCancel={() => {
            setCoverImageTarget(null);
            setCoverImageValue("");
            setBookCoverError(null);
          }}
          onChangeImageUrl={setCoverImageValue}
          onClearImage={() => void handleBookCoverImageUpdate(null)}
          onConfirm={() => void handleBookCoverImageUpdate()}
        />
      ) : null}
    </>
  );

  // --- Render states ---
  const renderLoadingShell = () => {
    if (!hasHydrated) {
      return (
        <MypageResponsiveLoadingShell
          onBack={handleMobileSurfaceBack}
          surface={mobileSurface}
        />
      );
    }

    if (shouldUseMobileViewport) {
      return (
        <MypageLoadingSkeleton
          mobile
          onBack={handleMobileSurfaceBack}
          surface={mobileSurface}
        />
      );
    }

    return <MypageDesktopLoadingShell />;
  };

  if (authState === "checking") {
    return renderLoadingShell();
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
        {shouldUseMobileViewport ? (
          <Wave1MobileBottomTab ariaLabel="마이페이지 하단 탭" currentTab="mypage" />
        ) : null}
      </>
    );
  }

  if (viewState === "loading") {
    return renderLoadingShell();
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

  if (shouldUseMobileViewport) {
    return (
      <>
        <MypageMobileScreen
          archiveEnabled={authState === "authenticated"}
          books={displayBooks}
          createInputRef={createInputRef}
          createName={createName}
          customBooks={customBooks}
          deleteTarget={deleteTarget}
          bookCoverImages={bookCoverImages}
          bookCoverUpdatedAt={bookCoverUpdatedAt}
          isCreating={isCreating}
          isDeleting={isDeleting}
          isLoadingMore={isLoadingMore}
          isRenaming={isRenaming}
          menuOpenBookId={menuOpenBookId}
          menuRef={menuRef}
          profile={profile}
          gamification={userGamification}
          gamificationState={gamificationState}
          initialGrowthPanel={initialGrowthPanel}
          profileSummaryGamification={profileSummaryGamification}
          profileSummaryProgress={profileSummaryProgress}
          progress={userProgress}
          progressState={progressState}
          recordStats={mypageRecordStats}
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
          onChangeColor={(book) => {
            setColorTarget(book);
            setBookCoverError(null);
            setMenuOpenBookId(null);
          }}
          onChangeCoverImage={(book) => {
            setCoverImageTarget(book);
            setCoverImageValue(book.cover_image_url ?? bookCoverImages[book.id] ?? "");
            setBookCoverError(null);
            setMenuOpenBookId(null);
          }}
          onCloseDeleteDialog={() => setDeleteTarget(null)}
          onConfirmDelete={handleDeleteBook}
          onConfirmRename={handleRenameBook}
          onCreateBook={handleCreateBook}
          onCreateNameChange={setCreateName}
          onDismissTutorialQuest={handleDismissTutorialQuest}
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
          onSurfaceBack={handleMobileSurfaceBack}
          onSurfaceChange={handleMobileSurfaceChange}
        />

        {toast ? (
          <AppFeedbackToast
            message={toast.message}
            position="mobileTop"
            tone={toast.tone}
          />
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
        {bookCoverDialogs}
      </>
    );
  }

  return (
    <WebShell className="web-mypage-shell" wide>
      <WebTopNav
        activeId="mypage"
        items={WEB_NAV_ITEMS}
        rightSlot={
          <ProfileSummaryButton
            gamification={profileSummaryGamification}
            isAuthenticated
            profile={profile}
            progress={profileSummaryProgress}
            useCachedSummary
            variant="web"
          />
        }
      />
      <div className="web-mypage-screen">
        <h1 className="sr-only">마이페이지</h1>
        <div className="web-mypage-overview">
          <WebCard className="web-mypage-profile" data-testid="mypage-profile">
            <MypageGrowthProfile
              gamification={userGamification}
              gamificationState={gamificationState}
              initialPanel={initialGrowthPanel}
              onDismissTutorialQuest={handleDismissTutorialQuest}
              onEditProfile={openNicknameSheet}
              profile={profile}
              providerLabel={SOCIAL_PROVIDER_LABELS[profile?.social_provider ?? ""] ?? ""}
              progress={userProgress}
              progressState={progressState}
              recordStats={mypageRecordStats}
              variant="desktop"
            />
          </WebCard>
        </div>

        <WebTabs className="web-mypage-tabs" data-testid="mypage-tabbar" role="tablist">
          <WebTabButton
            active={activeTab === "saved"}
            aria-label="저장한 레시피"
            onClick={() => switchDesktopTab("saved")}
          >
            <WebTabIcon>
              <BookmarkIcon />
            </WebTabIcon>
            저장한 레시피
          </WebTabButton>
          <WebTabButton
            active={activeTab === "recipebooks"}
            aria-label="레시피북"
            onClick={() => switchDesktopTab("recipebooks")}
          >
            <WebTabIcon>
              <BookIcon />
            </WebTabIcon>
            레시피북
          </WebTabButton>
          <WebTabButton
            active={activeTab === "shopping"}
            aria-label="장보기 기록"
            onClick={() => switchDesktopTab("shopping")}
          >
            <WebTabIcon>
              <CartIcon />
            </WebTabIcon>
            장보기 기록
          </WebTabButton>
          <WebTabButton
            active={activeTab === "leftovers"}
            aria-label="남은 요리"
            onClick={() => switchDesktopTab("leftovers")}
          >
            <WebTabIcon>
              <LeftoverIcon />
            </WebTabIcon>
            남은 요리
          </WebTabButton>
          <WebTabButton
            active={activeTab === "eaten"}
            aria-label="다먹은 요리"
            onClick={() => switchDesktopTab("eaten")}
          >
            <WebTabIcon>
              <CheckIcon />
            </WebTabIcon>
            다먹은 요리
          </WebTabButton>
          <WebTabButton
            active={activeTab === "preferences"}
            aria-label="환경설정"
            onClick={() => switchDesktopTab("preferences")}
          >
            <WebTabIcon>
              <SettingsIcon />
            </WebTabIcon>
            환경설정
          </WebTabButton>
          <WebTabButton
            active={activeTab === "help"}
            aria-label="도움말"
            onClick={() => switchDesktopTab("help")}
          >
            <WebTabIcon>
              <HelpIcon />
            </WebTabIcon>
            도움말
          </WebTabButton>
        </WebTabs>

        <section
          className={
            activeTab === "recipebooks"
              ? "web-mypage-panel web-mypage-panel-recipebooks"
              : "web-mypage-panel"
          }
          role="tabpanel"
        >
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
              onChangeColor={(book) => {
                setColorTarget(book);
                setBookCoverError(null);
                setMenuOpenBookId(null);
              }}
              onChangeCoverImage={(book) => {
                setCoverImageTarget(book);
                setCoverImageValue(book.cover_image_url ?? bookCoverImages[book.id] ?? "");
                setBookCoverError(null);
                setMenuOpenBookId(null);
              }}
              onCloseDeleteDialog={() => setDeleteTarget(null)}
              onConfirmDelete={handleDeleteBook}
              onConfirmRename={handleRenameBook}
              onCreateBook={handleCreateBook}
              onCreateNameChange={setCreateName}
              bookCoverImages={bookCoverImages}
              bookCoverUpdatedAt={bookCoverUpdatedAt}
              selectedBook={selectedRecipeBook}
              onOpenBookDetail={(book) => setSelectedRecipeBook(book)}
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
              onCloseDetail={closeShoppingDetail}
              onHistoryRefresh={() => void loadShoppingHistory()}
              onOpenDetail={(item) => openShoppingDetail(item)}
              onSelectedDateKeyChange={setShoppingSelectedDateKey}
              scrollSentinelRef={scrollSentinelRef}
              selectedDateKey={shoppingSelectedDateKey}
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
      {bookCoverDialogs}

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
        <AppFeedbackToast message={toast.message} tone={toast.tone} />
      ) : null}
    </WebShell>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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
              imageSrc={resolveRecipeImage({
                id: recipe.recipe_id,
                thumbnail_url: recipe.thumbnail_url,
              })}
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
          <LinkedAuthProviders />
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
          description="다시 로그인해야 식단·팬트리가 동기화돼요."
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
  const contactEmail = process.env.NEXT_PUBLIC_SERVICE_CONTACT_EMAIL?.trim();
  const faqs = [
    ["레시피북은 어떻게 정리되나요?", "내가 추가한 레시피, 저장한 레시피, 좋아요한 레시피는 자동으로 정리되고 커스텀 북은 직접 만들 수 있어요."],
    ["장보기 기록은 어디서 보나요?", "저장한 레시피 탭 하단의 장보기 기록에서 진행 중인 리스트와 완료된 리스트를 확인할 수 있어요."],
    ["팬트리와 플래너는 연결되나요?", "팬트리에 있는 재료는 장보기에서 제외할 수 있고, 플래너의 끼니와 함께 이어집니다."],
    ["계정을 바꾸면 데이터가 유지되나요?", "저장 데이터는 로그인 계정 기준으로 관리돼요."],
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
        {contactEmail ? (
          <p>
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </p>
        ) : (
          <p>문의처는 정식 운영 정보 확정 후 공개됩니다.</p>
        )}
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
            "sticky top-0 z-50 flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4",
            showBack ? "justify-center" : "",
          ].join(" ")}
          style={{ borderBottomWidth: "0.5px" }}
        >
          {showBack ? (
            <AppBackButton
              className="absolute left-4 top-1/2 -translate-y-1/2"
              onClick={() => onBack?.()}
            />
          ) : null}
          <h1
            className={[
              "truncate text-[18px] font-bold leading-none text-[var(--brand)]",
              showBack ? "text-center" : "",
            ].join(" ")}
          >
            {title}
          </h1>
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <ProfileSummaryButton
              isAuthenticated
              useCachedSummary
              variant="mobile"
            />
          </div>
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
      <section
        className="m-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
        data-testid="mypage-loading-growth-profile"
      >
        <div className="flex items-start gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
        <div className="mt-4">
          <Skeleton className="h-3 w-36" />
          <Skeleton
            className="mt-2 h-4 w-full rounded-full"
            data-testid="mypage-loading-progress-meter"
          />
          <Skeleton className="ml-auto mt-1 h-3 w-24" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((index) => (
            <Skeleton
              className="h-10 rounded-[var(--radius-md)]"
              data-testid="mypage-loading-growth-action"
              key={index}
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)]">
          {[1, 2, 3].map((index) => (
            <div className="px-2 py-2.5" key={index}>
              <Skeleton className="mx-auto h-8 w-8 rounded-full" />
              <Skeleton className="mx-auto mt-2 h-4 w-8" />
              <Skeleton className="mx-auto mt-1 h-3 w-12" />
            </div>
          ))}
        </div>
      </section>
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

function MypageResponsiveLoadingShell({
  onBack,
  surface,
}: {
  onBack?: () => void;
  surface: MypageMobileSurface;
}) {
  return (
    <>
      <MypageLoadingSkeleton mobile onBack={onBack} surface={surface} />
      <div
        className="hidden lg:block"
        data-testid="mypage-responsive-desktop-loading-shell"
      >
        <MypageDesktopLoadingShell />
      </div>
    </>
  );
}

function MypageHomeLoadingBody() {
  return (
    <>
      <section className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-5">
        <div
          className="mb-3 grid min-h-[340px] gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-4"
          data-testid="mypage-mobile-loading-profile-shell"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-36" />
            </div>
          </div>
          <div
            aria-hidden="true"
            className="min-h-[232px] rounded-[var(--radius-md)] bg-[var(--surface-fill)]"
          />
        </div>
      </section>
      <section
        className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-5 py-4"
        data-testid="mypage-mobile-loading-saved-recipes"
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="-mx-5 flex gap-3 overflow-hidden px-5">
          {[1, 2, 3].map((index) => (
            <div
              className="h-[158px] w-[148px] shrink-0 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)]"
              data-testid="mypage-mobile-loading-saved-card"
              key={index}
            />
          ))}
        </div>
      </section>
      <section className="p-4">
        <div
          className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)]"
          data-testid="mypage-mobile-loading-menu"
        >
          {[1, 2, 3, 4, 5].map((index) => (
            <div
              className={[
                "flex min-h-[57px] w-full items-center gap-3 px-4",
                index < 5 ? "border-b border-[var(--surface-subtle)]" : "",
              ].join(" ")}
              data-testid="mypage-mobile-loading-menu-row"
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
  if (kind === "shopping") {
    return <MypageShoppingHistoryLoadingBody />;
  }

  return (
    <section className="mobile-recipebooks-diary-screen px-4 pb-8 pt-4">
      <div
        className="mobile-recipebooks-diary-hero rounded-[28px] p-4"
        data-testid="recipebook-mobile-loading-hero"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-36" />
              <Skeleton className="h-4 w-28" />
            </div>
          </div>
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="mobile-recipebook-book-card mobile-recipebook-book-card-sand relative grid overflow-hidden rounded-[18px_10px_10px_18px] p-0"
            data-testid={`recipebook-mobile-loading-book-${index + 1}`}
            key={index}
          >
            <span className="block px-4 pb-3 pl-7 pt-5">
              <Skeleton className="aspect-[1.05] w-full rounded-[14px]" />
            </span>
            <div className="mobile-recipebook-book-copy grid gap-2 px-3 pb-10 pt-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="absolute bottom-2 right-2 h-6 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

function MypageShoppingHistoryLoadingBody() {
  return (
    <section
      className="space-y-4 p-4"
      data-testid="shopping-history-loading-skeleton"
    >
      <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-2 h-4 w-44" />
          </div>
          <Skeleton className="h-4 w-8" />
        </div>
        <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--surface-subtle)] bg-[var(--surface)] px-3 py-3">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="mt-3 h-5 w-28" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-32" />
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3">
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <h2 className="text-[16px] font-extrabold leading-[1.3] text-[var(--foreground)]">
              장보기 달력
            </h2>
            <p className="mt-1 text-[12px] font-semibold leading-[1.35] text-[var(--text-3)]">
              달력은 목록을 만든 날짜 기준이에요.
            </p>
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="mx-1 mt-4 h-5 w-24" />
        <div className="mt-3 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, index) => (
            <Skeleton
              className="h-[46px] rounded-[var(--radius-control)]"
              key={index}
            />
          ))}
        </div>
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
        rightSlot={
          <ProfileSummaryButton
            isAuthenticated
            useCachedSummary
            variant="web"
          />
        }
      />
      <div className="web-mypage-screen" data-testid="mypage-skeleton">
        <h1 className="sr-only">마이페이지</h1>
        <WebCard className="web-mypage-profile">
          <div
            className="grid min-h-[302px] gap-4 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] p-6"
            data-testid="mypage-loading-profile-shell"
          >
            <div className="flex min-w-0 items-center gap-3">
              <WebSkeleton height={72} width={72} style={{ borderRadius: "50%" }} />
              <div className="grid min-w-0 gap-2">
                <WebSkeleton height={28} width={128} />
                <WebSkeleton height={18} width={180} />
              </div>
            </div>
            <div
              aria-hidden="true"
              className="min-h-[164px] rounded-[var(--radius-md)] bg-[var(--surface-fill)]"
            />
          </div>
        </WebCard>

        <div
          aria-hidden="true"
          className="web-tabs web-mypage-tabs"
          data-testid="mypage-loading-tabs"
        >
          {WEB_MYPAGE_LOADING_TAB_LABELS.map((label, index) => (
            <span
              className={["web-tab", index === 0 ? "web-tab-active" : ""].join(" ")}
              data-testid="mypage-loading-tab"
              key={label}
            >
              <span className="web-tab-icon">
                <WebSkeleton height={18} width={18} />
              </span>
              {label}
            </span>
          ))}
        </div>
      </div>
    </WebShell>
  );
}

// ─── Recipe Book Tab ─────────────────────────────────────────────────────────

interface RecipeBookTabContentProps {
  systemBooks: RecipeBookSummary[];
  customBooks: RecipeBookSummary[];
  menuOpenBookId: string | null;
  renamingBookId: string | null;
  renameValue: string;
  isRenaming: boolean;
  deleteTarget: RecipeBookSummary | null;
  isDeleting: boolean;
  showCreateInput: boolean;
  createName: string;
  isCreating: boolean;
  bookCoverImages: Record<string, string | null>;
  bookCoverUpdatedAt: Record<string, string | null>;
  selectedBook: RecipeBookSummary | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  createInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenBookDetail: (book: RecipeBookSummary) => void;
  onChangeColor: (book: RecipeBookSummary) => void;
  onChangeCoverImage: (book: RecipeBookSummary) => void;
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
  menuOpenBookId,
  renamingBookId,
  renameValue,
  isRenaming,
  deleteTarget,
  isDeleting,
  showCreateInput,
  createName,
  isCreating,
  bookCoverImages,
  bookCoverUpdatedAt,
  selectedBook,
  menuRef,
  renameInputRef,
  createInputRef,
  onOpenBookDetail,
  onChangeColor,
  onChangeCoverImage,
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
  const inlineDetailRef = useRef<HTMLElement | null>(null);
  const selectedBookId = selectedBook?.id ?? null;
  const selectedBookCover = selectedBook
    ? getRecipeBookCoverViewModel(selectedBook, {
        loadedImageSrc: bookCoverImages[selectedBook.id],
      })
    : null;

  useEffect(() => {
    if (!selectedBookId) return;

    inlineDetailRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "start",
    });
  }, [selectedBookId]);

  return (
    <div className="web-recipebooks-screen" data-testid="recipebook-tab">
      <div
        className="web-recipebooks-header"
        data-testid="web-recipebooks-header"
      >
        <div>
          <h2>레시피북</h2>
          <p>내가 만든 북과 시스템 북을 책장처럼 관리해요.</p>
        </div>
        <div className="web-recipebooks-header-actions">
          <WebButton aria-label="새 레시피북 만들기" onClick={onShowCreateInput}>
            + 새 레시피북
          </WebButton>
          {showCreateInput ? (
            <div
              className="web-recipebooks-create-panel"
              data-testid="recipebook-create-panel"
            >
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
        </div>
      </div>

      <div className="web-recipebooks-section-head">
        <h3>커스텀</h3>
      </div>

      {customBooks.length === 0 ? (
        <p className="web-recipebooks-empty">
          아직 만든 레시피북이 없어요
        </p>
      ) : (
        <div className="web-recipebooks-grid">
          {customBooks.map((book) => (
            <CustomBookCard
              book={book}
              coverImageSrc={getBookCoverImage(book, bookCoverImages)}
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

      <div className="web-recipebooks-section-head web-recipebooks-section-head-spaced">
        <h3>시스템</h3>
      </div>
      <div className="web-recipebooks-grid">
        {systemBooks.map((book) => (
          <SystemBookCard
            book={book}
            coverImageSrc={getBookCoverImage(book, bookCoverImages)}
            key={book.id}
            lastUpdatedLabel={formatBookLastUpdated(bookCoverUpdatedAt[book.id])}
            onOpen={() => onOpenBookDetail(book)}
          />
        ))}
      </div>

      {deleteTarget ? (
        <DeleteConfirmDialog
          bookName={deleteTarget.name}
          isDeleting={isDeleting}
          onCancel={onCloseDeleteDialog}
          onConfirm={onConfirmDelete}
        />
      ) : null}
      {selectedBook ? (
        <section
          aria-label={`${selectedBook.name} 레시피북 상세`}
          className="web-recipebooks-inline-detail"
          data-testid="recipebook-inline-detail"
          ref={inlineDetailRef}
        >
          <RecipeBookDetailScreen
            bookId={selectedBook.id}
            bookName={selectedBook.name}
            bookType={selectedBook.book_type}
            bookCoverColorKey={selectedBookCover?.tone ?? null}
            bookCoverImageSrc={selectedBookCover?.imageSrc ?? null}
            embedded
            initialAuthenticated={true}
          />
        </section>
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
  coverImageSrc,
  lastUpdatedLabel,
  onOpen,
}: {
  book: RecipeBookSummary;
  coverImageSrc: string;
  lastUpdatedLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      className={`web-recipebook-book-card web-recipebook-book-card-${getRecipeBookCoverTone(book)}`}
      data-testid={`system-book-${book.book_type}`}
      aria-label={`${book.name} 상세 보기`}
      onClick={onOpen}
      type="button"
    >
      <BookCoverThumb book={book} imageSrc={coverImageSrc} />
      <span className="web-recipebook-book-copy">
        <strong>{book.name}</strong>
        <span>{lastUpdatedLabel}</span>
      </span>
      <span
        aria-label={`레시피 ${formatRecipeCount(book.recipe_count)}`}
        className="web-recipebook-book-count"
      >
        {formatRecipeCount(book.recipe_count)}
      </span>
    </button>
  );
}

function BookCoverThumb({
  book,
  imageSrc,
}: {
  book: RecipeBookSummary;
  imageSrc: string;
}) {
  const safeImageSrc = imageSrc.replace(/"/g, "%22");

  return (
    <span
      className={`web-recipebook-cover-thumb web-recipebook-cover-thumb-${getRecipeBookCoverTone(book)}`}
      aria-hidden="true"
    >
      <span
        className="web-recipebook-cover-thumb-image"
        data-testid={`book-cover-image-${book.id}`}
        style={{ backgroundImage: `url("${safeImageSrc}")` }}
      />
    </span>
  );
}

// ─── Custom Book Card ────────────────────────────────────────────────────────

interface CustomBookCardProps {
  book: RecipeBookSummary;
  coverImageSrc: string;
  isMenuOpen: boolean;
  isRenaming: boolean;
  isRenamingLoading: boolean;
  lastUpdatedLabel: string;
  renameValue: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onMenuOpen: () => void;
  onChangeColor: () => void;
  onChangeCoverImage: () => void;
  onOpen: () => void;
  onRenameStart: () => void;
  onCancelRename: () => void;
  onConfirmRename: () => void;
  onRenameValueChange: (value: string) => void;
  onRequestDelete: () => void;
}

function CustomBookCard({
  book,
  coverImageSrc,
  isMenuOpen,
  isRenaming,
  isRenamingLoading,
  lastUpdatedLabel,
  renameValue,
  menuRef,
  renameInputRef,
  onMenuOpen,
  onChangeColor,
  onChangeCoverImage,
  onOpen,
  onRenameStart,
  onCancelRename,
  onConfirmRename,
  onRenameValueChange,
  onRequestDelete,
}: CustomBookCardProps) {
  return (
    <div className="relative">
      <div
        className={`web-recipebook-book-card web-recipebook-book-card-static web-recipebook-book-card-${getRecipeBookCoverTone(book)}`}
        data-testid={`custom-book-${book.id}`}
      >
        <BookCoverThumb book={book} imageSrc={coverImageSrc} />
        {isRenaming ? (
          <div className="web-recipebook-book-copy web-recipebook-rename-copy">
            <input
              ref={renameInputRef}
              className="web-recipebook-rename-input"
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
            <span className="web-recipebook-rename-actions">
              <button
                disabled={isRenamingLoading || !renameValue.trim()}
                onClick={() => void onConfirmRename()}
                type="button"
              >
                {isRenamingLoading ? "저장 중..." : "완료"}
              </button>
              <button
                disabled={isRenamingLoading}
                onClick={onCancelRename}
                type="button"
              >
                취소
              </button>
            </span>
          </div>
        ) : (
          <button
            aria-label={`${book.name} 상세 보기`}
            className="web-recipebook-book-copy"
            onClick={onOpen}
            type="button"
          >
            <strong>{book.name}</strong>
            <span>{lastUpdatedLabel}</span>
          </button>
        )}
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
          <button
            className="flex w-full items-center border-t border-[var(--line)] px-4 py-3 text-base font-medium text-[var(--foreground)] hover:bg-[var(--surface-fill)]"
            onClick={onChangeColor}
            role="menuitem"
            type="button"
          >
            색상 변경
          </button>
          <button
            className="flex w-full items-center border-t border-[var(--line)] px-4 py-3 text-base font-medium text-[var(--foreground)] hover:bg-[var(--surface-fill)]"
            onClick={onChangeCoverImage}
            role="menuitem"
            type="button"
          >
            커버 이미지 변경
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

function BookColorDialog({
  currentColor,
  disabled,
  errorMessage,
  onCancel,
  onSelectColor,
}: {
  currentColor: RecipeBookCoverColorKey;
  disabled: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSelectColor: (colorKey: RecipeBookCoverColorKey) => void;
}) {
  return (
    <WebModal
      className="web-recipebook-management-modal"
      data-testid="book-color-dialog"
      onBackdropClick={onCancel}
    >
      <WebDialog
        aria-labelledby="book-color-title"
        className="web-confirm-dialog"
        role="dialog"
        size="narrow"
      >
        <WebDialogHeader>
          <WebDialogTitle id="book-color-title">색상 변경</WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={disabled} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <div className="web-book-color-grid" role="group" aria-label="레시피북 색상">
            {RECIPE_BOOK_COVER_TONES.map((tone) => (
              <button
                aria-pressed={tone === currentColor}
                className={`web-book-color-swatch web-recipebook-book-card-${tone} mobile-recipebook-book-card-${tone}`}
                disabled={disabled}
                key={tone}
                onClick={() => onSelectColor(tone)}
                type="button"
              >
                <span>{getBookToneLabel(tone)}</span>
              </button>
            ))}
          </div>
          {errorMessage ? (
            <p className="mt-3 text-sm font-semibold text-[var(--danger)]" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
      </WebDialog>
    </WebModal>
  );
}

function BookCoverImageDialog({
  disabled,
  errorMessage,
  imageUrl,
  onCancel,
  onChangeImageUrl,
  onClearImage,
  onConfirm,
}: {
  disabled: boolean;
  errorMessage: string | null;
  imageUrl: string;
  onCancel: () => void;
  onChangeImageUrl: (value: string) => void;
  onClearImage: () => void;
  onConfirm: () => void;
}) {
  return (
    <WebModal
      className="web-recipebook-management-modal"
      data-testid="book-cover-image-dialog"
      onBackdropClick={onCancel}
    >
      <WebDialog
        aria-labelledby="book-cover-image-title"
        className="web-confirm-dialog"
        role="dialog"
        size="narrow"
      >
        <WebDialogHeader>
          <WebDialogTitle id="book-cover-image-title">
            커버 이미지 변경
          </WebDialogTitle>
          <WebIconButton aria-label="닫기" disabled={disabled} onClick={onCancel}>
            ×
          </WebIconButton>
        </WebDialogHeader>
        <WebDialogBody>
          <label className="grid gap-2 text-sm font-bold text-[var(--foreground)]">
            이미지 URL
            <input
              className="web-recipebook-cover-input"
              disabled={disabled}
              onChange={(event) => onChangeImageUrl(event.target.value)}
              placeholder="https://..."
              type="url"
              value={imageUrl}
            />
          </label>
          {errorMessage ? (
            <p className="mt-3 text-sm font-semibold text-[var(--danger)]" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </WebDialogBody>
        <WebDialogFooter>
          <WebButton
            className="web-recipebook-cover-clear-button"
            disabled={disabled}
            onClick={onClearImage}
            variant="tertiary"
          >
            커버 이미지 삭제
          </WebButton>
          <WebButton disabled={disabled} onClick={onCancel} variant="tertiary">
            취소
          </WebButton>
          <WebButton disabled={disabled} onClick={onConfirm}>
            {disabled ? "저장 중..." : "저장"}
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
  selectedDateKey: string;
  scrollSentinelRef: React.RefObject<HTMLDivElement | null>;
  onCloseDetail: () => void;
  onHistoryRefresh: () => void;
  onOpenDetail: (item: ShoppingListHistoryItem) => void;
  onSelectedDateKeyChange: (dateKey: string) => void;
}

function ShoppingHistoryTabContent({
  items,
  loaded,
  hasNext,
  isLoadingMore,
  selectedItem,
  selectedDateKey,
  scrollSentinelRef,
  onCloseDetail,
  onHistoryRefresh,
  onOpenDetail,
  onSelectedDateKeyChange,
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
          <p>진행 중이거나 완료한 장보기 목록을 확인해요.</p>
        </div>
        <ShoppingHistoryWebLoadingSkeleton />
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
        <p>진행 중이거나 완료한 장보기 목록을 확인해요.</p>
      </div>
      <ShoppingHistoryCalendar
        items={items}
        onOpenDetail={onOpenDetail}
        onSelectedDateKeyChange={onSelectedDateKeyChange}
        selectedDateKey={selectedDateKey}
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

function ShoppingHistoryWebLoadingSkeleton() {
  return (
    <div className="web-mypage-shopping-calendar">
      <section className="web-mypage-shopping-selected-day">
        <div className="web-mypage-shopping-selected-head">
          <div>
            <WebSkeleton height={22} width={160} />
            <div className="mt-2">
              <WebSkeleton height={16} width={220} />
            </div>
          </div>
          <WebSkeleton height={16} width={32} />
        </div>
        <div className="web-mypage-shopping-selected-list">
          <div className="web-mypage-shopping-card">
            <WebSkeleton height={24} width={72} />
            <WebSkeleton height={22} width={128} />
            <WebSkeleton height={16} width="100%" />
            <WebSkeleton height={16} width={140} />
          </div>
        </div>
      </section>
      <section className="web-mypage-shopping-months">
        <div className="web-mypage-shopping-calendar-head">
          <div>
            <h3>장보기 달력</h3>
            <p>달력은 목록을 만든 날짜 기준이에요.</p>
          </div>
          <WebSkeleton height={16} width={96} />
        </div>
        <WebSkeleton height={20} width={120} style={{ marginTop: 18 }} />
        <div className="web-mypage-shopping-calendar-grid" style={{ marginTop: 12 }}>
          {Array.from({ length: 35 }, (_, index) => (
            <WebSkeleton height={62} key={index} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Shopping History Calendar ───────────────────────────────────────────────

function ShoppingHistoryCalendar({
  items,
  onOpenDetail,
  onSelectedDateKeyChange,
  selectedDateKey: controlledSelectedDateKey,
}: {
  items: ShoppingListHistoryItem[];
  onOpenDetail: (item: ShoppingListHistoryItem) => void;
  onSelectedDateKeyChange?: (dateKey: string) => void;
  selectedDateKey?: string;
}) {
  const months = useMemo(
    () => buildShoppingHistoryCalendarMonths(items),
    [items],
  );
  const defaultDateKey = useMemo(
    () => getLatestShoppingHistoryDateKey(months),
    [months],
  );
  const defaultMonthIndex = useMemo(
    () => getShoppingHistoryMonthIndexForDateKey(months, defaultDateKey),
    [defaultDateKey, months],
  );
  const [internalSelectedDateKey, setInternalSelectedDateKey] =
    useState(defaultDateKey);
  const [visibleMonthIndex, setVisibleMonthIndex] =
    useState(defaultMonthIndex);
  const safeVisibleMonthIndex =
    months.length === 0
      ? -1
      : Math.min(Math.max(visibleMonthIndex, 0), months.length - 1);
  const visibleMonth =
    safeVisibleMonthIndex >= 0 ? months[safeVisibleMonthIndex] : null;
  const selectedDateKey = controlledSelectedDateKey ?? internalSelectedDateKey;
  const selectedMonthIndex = useMemo(
    () => getShoppingHistoryMonthIndexForDateKey(months, selectedDateKey),
    [months, selectedDateKey],
  );
  const selectDateKey = useCallback(
    (dateKey: string) => {
      if (controlledSelectedDateKey === undefined) {
        setInternalSelectedDateKey(dateKey);
      }
      onSelectedDateKeyChange?.(dateKey);
    },
    [controlledSelectedDateKey, onSelectedDateKeyChange],
  );

  useEffect(() => {
    if (!defaultDateKey) return;

    if (
      !selectedDateKey ||
      !findShoppingHistoryDay(months, selectedDateKey)?.items.length
    ) {
      selectDateKey(defaultDateKey);
      setVisibleMonthIndex(defaultMonthIndex);
    }
  }, [defaultDateKey, defaultMonthIndex, months, selectDateKey, selectedDateKey]);

  useEffect(() => {
    if (safeVisibleMonthIndex >= 0 && safeVisibleMonthIndex !== visibleMonthIndex) {
      setVisibleMonthIndex(safeVisibleMonthIndex);
    }
  }, [safeVisibleMonthIndex, visibleMonthIndex]);

  useEffect(() => {
    if (selectedMonthIndex >= 0 && selectedMonthIndex !== safeVisibleMonthIndex) {
      setVisibleMonthIndex(selectedMonthIndex);
    }
  }, [safeVisibleMonthIndex, selectedMonthIndex]);

  const handleMonthChange = useCallback(
    (nextIndex: number) => {
      const nextMonth = months[nextIndex];
      if (!nextMonth) return;

      const nextDateKey = getLatestShoppingHistoryDateKeyInMonth(nextMonth);
      setVisibleMonthIndex(nextIndex);
      if (nextDateKey) {
        selectDateKey(nextDateKey);
      }
    },
    [months, selectDateKey],
  );

  const selectedDay =
    findShoppingHistoryDay(months, selectedDateKey) ??
    findShoppingHistoryDay(months, defaultDateKey);

  return (
    <div className="web-mypage-shopping-calendar">
      {selectedDay ? (
        <ShoppingHistorySelectedDayPanel
          day={selectedDay}
          onOpenDetail={onOpenDetail}
        />
      ) : null}

      <section
        aria-live="polite"
        className="web-mypage-shopping-months"
        data-testid="shopping-history-calendar"
      >
        <div className="web-mypage-shopping-calendar-head">
          <div>
            <h3>장보기 달력</h3>
            <p>달력은 목록을 만든 날짜 기준이에요.</p>
          </div>
          <ShoppingHistoryStatusLegend />
        </div>

        {visibleMonth ? (
          <section className="web-mypage-shopping-month" key={visibleMonth.monthKey}>
            <div className="web-mypage-shopping-month-nav">
              <button
                aria-label="이전 달"
                className="web-mypage-shopping-month-button"
                disabled={safeVisibleMonthIndex >= months.length - 1}
                onClick={() => handleMonthChange(safeVisibleMonthIndex + 1)}
                type="button"
              >
                ‹
              </button>
              <h3>{visibleMonth.title}</h3>
              <button
                aria-label="다음 달"
                className="web-mypage-shopping-month-button"
                disabled={safeVisibleMonthIndex <= 0}
                onClick={() => handleMonthChange(safeVisibleMonthIndex - 1)}
                type="button"
              >
                ›
              </button>
            </div>
            <div
              aria-hidden="true"
              className="web-mypage-shopping-weekdays"
            >
              {["일", "월", "화", "수", "목", "금", "토"].map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="web-mypage-shopping-calendar-grid">
              {visibleMonth.days.map((day) => (
                <ShoppingHistoryDayCell
                  day={day}
                  isSelected={day.dateKey === selectedDay?.dateKey}
                  key={day.dateKey}
                  onSelect={selectDateKey}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function ShoppingHistoryDayCell({
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
        className="web-mypage-shopping-day web-mypage-shopping-day-empty"
      />
    );
  }

  const hasItems = day.items.length > 0;
  const completedCount = day.items.filter((item) => item.is_completed).length;
  const activeCount = day.items.length - completedCount;

  if (!hasItems) {
    return (
      <div className="web-mypage-shopping-day">
        <span className="web-mypage-shopping-day-number">
          {day.dayNumber}
        </span>
      </div>
    );
  }

  return (
    <button
      aria-label={buildShoppingDayAriaLabel(day)}
      className={[
        "web-mypage-shopping-day web-mypage-shopping-day-button",
        isSelected ? "web-mypage-shopping-day-selected" : "",
      ].join(" ")}
      onClick={() => onSelect(day.dateKey)}
      type="button"
    >
      <span className="web-mypage-shopping-day-number">
        {day.dayNumber}
      </span>
      <span className="web-mypage-shopping-day-markers">
        {activeCount > 0 ? (
          <span
            aria-hidden="true"
            className="web-mypage-shopping-marker web-mypage-shopping-marker-active"
          />
        ) : null}
        {completedCount > 0 ? (
          <span
            aria-hidden="true"
            className="web-mypage-shopping-marker web-mypage-shopping-marker-complete"
          />
        ) : null}
        {day.items.length > 1 ? <em>{day.items.length}</em> : null}
      </span>
    </button>
  );
}

function ShoppingHistorySelectedDayPanel({
  day,
  onOpenDetail,
}: {
  day: ShoppingHistoryCalendarDay;
  onOpenDetail: (item: ShoppingListHistoryItem) => void;
}) {
  const sortedItems = sortShoppingHistoryItemsForDisplay(day.items);

  return (
    <section
      className="web-mypage-shopping-selected-day"
      data-testid="shopping-selected-day-panel"
    >
      <div className="web-mypage-shopping-selected-head">
        <div>
          <h3>{formatShoppingDateKeyLong(day.dateKey)} 만든 장보기</h3>
          <p>끼니 범위와 완료일을 따로 확인하세요.</p>
        </div>
        <span>{sortedItems.length}개</span>
      </div>
      <div className="web-mypage-shopping-selected-list">
        {sortedItems.map((item) => (
          <ShoppingHistoryCard
            item={item}
            key={item.id}
            onOpen={() => onOpenDetail(item)}
          />
        ))}
      </div>
    </section>
  );
}

function ShoppingHistoryCard({
  item,
  onOpen,
}: {
  item: ShoppingListHistoryItem;
  onOpen: () => void;
}) {
  const displayTitle = formatShoppingHistoryCardTitle(item);

  return (
    <button
      className="web-mypage-shopping-card"
      data-testid={`shopping-card-${item.id}`}
      onClick={onOpen}
      type="button"
    >
      <ShoppingHistoryStatusTag item={item} />
      <p className="web-mypage-shopping-card-title">
        {displayTitle}
      </p>
      <dl className="web-mypage-shopping-card-meta">
        <div>
          <dt>끼니 범위</dt>
          <dd>{formatShoppingHistoryMealRange(item)}</dd>
        </div>
        <div>
          <dt>재료</dt>
          <dd>재료 {item.item_count}개</dd>
        </div>
      </dl>
    </button>
  );
}

function formatShoppingHistoryCardTitle(item: ShoppingListHistoryItem) {
  const title = item.title.trim();
  const normalizedTitle = title.endsWith("장보기") ? title : `${title} 장보기`;

  if (title.includes("~")) {
    return normalizedTitle;
  }

  const mealRange = formatShoppingHistoryMealRange(item);

  return mealRange ? `${mealRange} 장보기` : normalizedTitle;
}

function ShoppingHistoryStatusLegend() {
  return (
    <div className="web-mypage-shopping-legend" data-testid="shopping-status-legend">
      <span>
        <i className="web-mypage-shopping-marker web-mypage-shopping-marker-active" />
        진행중
      </span>
      <span>
        <i className="web-mypage-shopping-marker web-mypage-shopping-marker-complete" />
        완료
      </span>
    </div>
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
      {item.is_completed
        ? item.completed_at
          ? `완료 ${formatShoppingHistoryCompletionDate(item.completed_at)}`
          : "완료"
        : "진행 중"}
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

function getBookToneLabel(tone: RecipeBookCoverColorKey) {
  if (tone === "sage") return "그린";
  if (tone === "sky") return "스카이";
  if (tone === "coral") return "코랄";
  if (tone === "lavender") return "라벤더";
  return "샌드";
}

function getBookCoverImage(
  book: RecipeBookSummary,
  bookCoverImages: Record<string, string | null>,
) {
  return getRecipeBookCoverViewModel(book, {
    loadedImageSrc: bookCoverImages[book.id],
  }).imageSrc;
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

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

type SvgIconProps = React.SVGProps<SVGSVGElement>;

function BookmarkIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16" {...props}>
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

function HelpIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 24 24" width="16" {...props}>
      <path d="M12 17h.01M9.2 9a3 3 0 1 1 4.6 2.5c-1 .68-1.8 1.2-1.8 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function BookIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18" {...props}>
      <path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M8 18h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function CartIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18" {...props}>
      <path d="M3 4h2l2.2 10.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 1.9-1.4L20 8H6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <circle cx="9" cy="20" r="1" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="20" r="1" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function LeftoverIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18" {...props}>
      <path d="M8 3h8l1 4H7l1-4ZM7 7h10v13H7V7Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M10 11h4M10 15h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
    </svg>
  );
}

function CheckIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="0 0 24 24" width="18" {...props}>
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

function SettingsIcon(props: SvgIconProps = {}) {
  return (
    <svg aria-hidden="true" fill="none" height="18" viewBox="-1 -1 26 26" width="18" {...props}>
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
