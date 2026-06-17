// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MypageScreen } from "@/components/mypage/mypage-screen";

const mockFetchUserProfile = vi.fn();
const mockFetchUserProgress = vi.fn();
const mockFetchUserGamification = vi.fn();
const mockDismissUserGamificationTutorialQuest = vi.fn();
const mockFetchRecipeBooks = vi.fn();
const mockCreateRecipeBook = vi.fn();
const mockRenameRecipeBook = vi.fn();
const mockDeleteRecipeBook = vi.fn();
const mockUpdateRecipeBook = vi.fn();
const mockUpdateNickname = vi.fn();
const mockUpdateSettings = vi.fn();
const mockLogout = vi.fn();
const mockDeleteAccount = vi.fn();
const mockFetchShoppingHistory = vi.fn();
const mockFetchShoppingListDetail = vi.fn();
const mockUpdateShoppingListItem = vi.fn();
const mockCompleteShoppingList = vi.fn();
const mockFetchShoppingShareText = vi.fn();
const mockReorderShoppingListItems = vi.fn();
const mockFetchRecipeBookRecipes = vi.fn();
const mockFetchRecipeBookRecipeDetail = vi.fn();
const mockFetchLeftovers = vi.fn();
const mockEatLeftover = vi.fn();
const mockUneatLeftover = vi.fn();
const mockCreateMeal = vi.fn();
const mockFetchPlanner = vi.fn();
const mockFetchPlannerColumns = vi.fn();
const mockCreatePlannerColumn = vi.fn();
const mockUpdatePlannerColumn = vi.fn();
const mockDeletePlannerColumn = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const originalScrollTo = window.scrollTo;

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: (...args: unknown[]) => mockFetchUserProfile(...args),
  fetchRecipeBooks: (...args: unknown[]) => mockFetchRecipeBooks(...args),
  createRecipeBook: (...args: unknown[]) => mockCreateRecipeBook(...args),
  renameRecipeBook: (...args: unknown[]) => mockRenameRecipeBook(...args),
  deleteRecipeBook: (...args: unknown[]) => mockDeleteRecipeBook(...args),
  updateRecipeBook: (...args: unknown[]) => mockUpdateRecipeBook(...args),
  fetchShoppingHistory: (...args: unknown[]) => mockFetchShoppingHistory(...args),
  updateNickname: (...args: unknown[]) => mockUpdateNickname(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  isMypageApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/api/user-progress", () => ({
  fetchUserProgress: (...args: unknown[]) => mockFetchUserProgress(...args),
}));

vi.mock("@/lib/api/user-gamification", () => ({
  dismissUserGamificationTutorialQuest: (...args: unknown[]) =>
    mockDismissUserGamificationTutorialQuest(...args),
  fetchUserGamification: (...args: unknown[]) => mockFetchUserGamification(...args),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipeBookRecipes: (...args: unknown[]) =>
    mockFetchRecipeBookRecipes(...args),
  fetchRecipeBookRecipeDetail: (...args: unknown[]) =>
    mockFetchRecipeBookRecipeDetail(...args),
}));

vi.mock("@/lib/api/leftovers", () => ({
  fetchLeftovers: (...args: unknown[]) => mockFetchLeftovers(...args),
  eatLeftover: (...args: unknown[]) => mockEatLeftover(...args),
  uneatLeftover: (...args: unknown[]) => mockUneatLeftover(...args),
  isLeftoverApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/api/meal", () => ({
  createMeal: (...args: unknown[]) => mockCreateMeal(...args),
  isMealApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/api/planner", () => ({
  fetchPlanner: (...args: unknown[]) => mockFetchPlanner(...args),
  fetchPlannerColumns: (...args: unknown[]) => mockFetchPlannerColumns(...args),
  createPlannerColumn: (...args: unknown[]) => mockCreatePlannerColumn(...args),
  updatePlannerColumn: (...args: unknown[]) => mockUpdatePlannerColumn(...args),
  deletePlannerColumn: (...args: unknown[]) => mockDeletePlannerColumn(...args),
  createDefaultPlannerRange: () => ({
    startDate: "2026-05-04",
    endDate: "2026-05-10",
  }),
  isPlannerApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/api/shopping", () => ({
  completeShoppingList: (...args: unknown[]) =>
    mockCompleteShoppingList(...args),
  fetchShoppingListDetail: (...args: unknown[]) =>
    mockFetchShoppingListDetail(...args),
  fetchShoppingShareText: (...args: unknown[]) =>
    mockFetchShoppingShareText(...args),
  reorderShoppingListItems: (...args: unknown[]) =>
    mockReorderShoppingListItems(...args),
  updateShoppingListItem: (...args: unknown[]) =>
    mockUpdateShoppingListItem(...args),
  isShoppingApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => null,
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: React.PropsWithChildren<{ href: string; prefetch?: boolean }>) => {
    void _prefetch;

    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

function installMatchMedia(matchesAppView: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 1023px)" ? matchesAppView : !matchesAppView,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const MOCK_PROFILE = {
  id: "user-1",
  nickname: "집밥러",
  email: "user@example.com",
  profile_image_url: "https://example.com/profile.png",
  social_provider: "kakao" as const,
  settings: { screen_wake_lock: false },
};

const MOCK_PROGRESS = {
  level: {
    current_level: 6,
    total_xp: 520,
    current_level_start_xp: 500,
    next_level_start_xp: 650,
    xp_into_current_level: 20,
    xp_to_next_level: 130,
    progress_ratio: 0.1333,
    progress_percent: 13,
  },
  event_counts: {
    cooking_completed: 3,
    shopping_completed: 2,
    recipe_saved_distinct_ever: 7,
    custom_book_created: 1,
  },
  last_updated_at: "2026-06-10T00:00:00.000Z",
};

const MOCK_GAMIFICATION = {
  level: {
    current_level: 6,
    total_xp: 830,
    xp_to_next_level: 170,
    progress_percent: 82,
  },
  grade: {
    grade_key: "homecook_runner",
    label: "집밥 러너",
    level_min: 4,
    level_max: 7,
  },
  featured_badges: [
    {
      badge_key: "first_cook_done",
      label: "첫 집밥 완성",
      description: "첫 요리 완료를 기록했어요.",
      category: "cooking",
      shape_key: "pot",
      locked_hint: null,
      earned_at: "2026-06-10T12:00:00.000Z",
      is_new: false,
    },
  ],
  badges: { earned: [], locked: [] },
  quests: {
    active: [
      {
        quest_key: "cook_three_meals",
        quest_type: "standard",
        status: "active",
        title: "요리 루틴 3번 완성",
        description: "요리 완료를 3번 기록해 보세요.",
        progress_current: 1,
        progress_target: 3,
        progress_percent: 33,
        completed_at: null,
        dismissed_at: null,
        is_new: false,
      },
    ],
    completed_recent: [],
  },
  tutorial: { active_steps: [] },
  notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
  last_updated_at: "2026-06-10T12:00:00.000Z",
};

const MOCK_BOOKS = {
  books: [
    { id: "book-my", name: "내가 추가한 레시피", book_type: "my_added" as const, recipe_count: 3, sort_order: 0 },
    { id: "book-saved", name: "저장한 레시피", book_type: "saved" as const, recipe_count: 5, sort_order: 1 },
    { id: "book-liked", name: "좋아요한 레시피", book_type: "liked" as const, recipe_count: 10, sort_order: 2 },
    { id: "book-custom", name: "주말 파티", book_type: "custom" as const, recipe_count: 2, sort_order: 3 },
  ],
};

const MOCK_SHOPPING_HISTORY = {
  items: [
    {
      id: "list-1",
      title: "4/30~5/6",
      date_range_start: "2026-04-30",
      date_range_end: "2026-05-06",
      is_completed: true,
      item_count: 12,
      created_at: "2026-04-30T00:00:00Z",
      completed_at: "2026-05-01T09:30:00Z",
    },
    {
      id: "list-2",
      title: "4/23~29",
      date_range_start: "2026-04-23",
      date_range_end: "2026-04-29",
      is_completed: false,
      item_count: 8,
      created_at: "2026-04-23T00:00:00Z",
      completed_at: null,
    },
    {
      id: "list-3",
      title: "3/18~24",
      date_range_start: "2026-03-18",
      date_range_end: "2026-03-24",
      is_completed: true,
      item_count: 10,
      created_at: "2026-03-18T00:00:00Z",
      completed_at: "2026-03-18T09:30:00Z",
    },
  ],
  next_cursor: null,
  has_next: false,
};

const MOCK_SHOPPING_DETAIL = {
  id: "list-1",
  title: "4/30 장보기",
  date_range_start: "2026-04-30",
  date_range_end: "2026-05-06",
  is_completed: true,
  completed_at: "2026-05-01T09:30:00Z",
  created_at: "2026-04-30T00:00:00Z",
  updated_at: "2026-05-01T09:30:00Z",
  recipes: [
    {
      recipe_id: "recipe-1",
      recipe_name: "김치찌개",
      recipe_thumbnail: null,
      shopping_servings: 2,
      planned_servings_total: 2,
    },
  ],
  items: [
    {
      id: "shopping-item-1",
      ingredient_id: "ingredient-1",
      display_text: "양파 2개",
      amounts_json: [{ amount: 2, unit: "개" }],
      is_checked: true,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 0,
    },
  ],
};

const MOCK_ACTIVE_SHOPPING_DETAIL = {
  ...MOCK_SHOPPING_DETAIL,
  id: "list-2",
  title: "4/23 장보기",
  date_range_start: "2026-04-23",
  date_range_end: "2026-04-29",
  is_completed: false,
  completed_at: null,
  created_at: "2026-04-23T00:00:00Z",
  updated_at: "2026-04-23T00:00:00Z",
  items: [
    {
      id: "shopping-item-2",
      ingredient_id: "ingredient-2",
      display_text: "감자 2개",
      amounts_json: [{ amount: 2, unit: "개" }],
      is_checked: false,
      is_pantry_excluded: false,
      added_to_pantry: false,
      sort_order: 0,
    },
    {
      id: "shopping-item-3",
      ingredient_id: "ingredient-3",
      display_text: "양파 1개",
      amounts_json: [{ amount: 1, unit: "개" }],
      is_checked: false,
      is_pantry_excluded: true,
      added_to_pantry: false,
      sort_order: 10,
    },
  ],
};

const MOCK_SAVED_RECIPES = {
  success: true,
  data: {
    items: [
      {
        recipe_id: "recipe-saved-1",
        title: "저장된 된장찌개",
        thumbnail_url: "https://example.com/saved-1.jpg",
        tags: ["한식", "찌개"],
        view_count: 10,
        total_duration_seconds: 1800,
        total_duration_text: "30분",
        base_servings: 2,
        added_at: "2026-05-01T09:00:00.000Z",
      },
      {
        recipe_id: "recipe-saved-2",
        title: "저장된 김치볶음밥",
        thumbnail_url: null,
        tags: ["한식"],
        view_count: 8,
        total_duration_seconds: null,
        total_duration_text: null,
        base_servings: 1,
        added_at: "2026-05-02T09:00:00.000Z",
      },
    ],
    next_cursor: null,
    has_next: false,
  },
  error: null,
};

const MOCK_READER_DETAILS = {
  "recipe-saved-1": {
    recipe_id: "recipe-saved-1",
    title: "저장된 된장찌개",
    thumbnail_url: "https://example.com/saved-1.jpg",
    tags: ["한식", "찌개"],
    view_count: 10,
    total_duration_seconds: 1800,
    total_duration_text: "30분",
    base_servings: 2,
    added_at: "2026-05-01T09:00:00.000Z",
    ingredients: [
      {
        id: "ingredient-saved-1",
        ingredient_id: "doenjang",
        standard_name: "된장",
        amount: 2,
        unit: "큰술",
        ingredient_type: "QUANT" as const,
        display_text: "된장 2큰술",
        component_label: null,
        scalable: true,
        sort_order: 0,
      },
    ],
    steps: [
      {
        id: "step-saved-1",
        step_number: 1,
        instruction: "된장을 풀고 채소를 넣어 끓인다.",
        component_label: null,
        cooking_method: null,
        ingredients_used: [],
        heat_level: null,
        duration_seconds: 180,
        duration_text: "3분",
      },
    ],
  },
  "recipe-saved-2": {
    recipe_id: "recipe-saved-2",
    title: "저장된 김치볶음밥",
    thumbnail_url: null,
    tags: ["한식"],
    view_count: 8,
    total_duration_seconds: null,
    total_duration_text: null,
    base_servings: 1,
    added_at: "2026-05-02T09:00:00.000Z",
    ingredients: [],
    steps: [],
  },
};

const MOCK_LEFTOVERS = {
  items: [
    {
      id: "leftover-1",
      recipe_id: "recipe-leftover-1",
      recipe_title: "남은 김치찌개",
      recipe_thumbnail_url: null,
      status: "leftover" as const,
      cooked_at: "2026-05-01T09:00:00.000Z",
      eaten_at: null,
      cooking_servings: 2,
      source_meal_label: "저녁",
      source_planned_servings: 2,
    },
  ],
};

const MOCK_EATEN_LEFTOVERS = {
  items: [
    {
      id: "eaten-1",
      recipe_id: "recipe-eaten-1",
      recipe_title: "다 먹은 된장찌개",
      recipe_thumbnail_url: null,
      status: "eaten" as const,
      cooked_at: "2026-04-28T09:00:00.000Z",
      eaten_at: "2026-05-02T09:00:00.000Z",
      cooking_servings: 1,
      source_meal_label: "점심",
      source_planned_servings: 1,
    },
  ],
};

async function openRecipebookSurface(user = userEvent.setup()) {
  await screen.findByText("집밥러");
  await user.click(screen.getByRole("tab", { name: "레시피북" }));
  return user;
}

async function openShoppingSurface(user = userEvent.setup()) {
  await screen.findByText("집밥러");
  await user.click(screen.getByRole("tab", { name: "장보기 기록" }));
  return user;
}

describe("MypageScreen", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: originalScrollTo,
    });
    window.history.pushState({}, "", "/");
  });

  beforeEach(() => {
    window.history.pushState({}, "", "/mypage");
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    installMatchMedia(false);
    mockFetchUserProfile.mockReset();
    mockFetchUserProgress.mockReset();
    mockFetchUserGamification.mockReset();
    mockDismissUserGamificationTutorialQuest.mockReset();
    mockFetchRecipeBooks.mockReset();
    mockCreateRecipeBook.mockReset();
    mockRenameRecipeBook.mockReset();
    mockDeleteRecipeBook.mockReset();
    mockUpdateRecipeBook.mockReset();
    mockUpdateNickname.mockReset();
    mockUpdateSettings.mockReset();
    mockLogout.mockReset();
    mockDeleteAccount.mockReset();
    mockFetchShoppingHistory.mockReset();
    mockFetchShoppingListDetail.mockReset();
    mockUpdateShoppingListItem.mockReset();
    mockCompleteShoppingList.mockReset();
    mockFetchShoppingShareText.mockReset();
    mockReorderShoppingListItems.mockReset();
    mockFetchRecipeBookRecipes.mockReset();
    mockFetchRecipeBookRecipeDetail.mockReset();
    mockFetchLeftovers.mockReset();
    mockEatLeftover.mockReset();
    mockUneatLeftover.mockReset();
    mockCreateMeal.mockReset();
    mockFetchPlanner.mockReset();
    mockFetchPlannerColumns.mockReset();
    mockCreatePlannerColumn.mockReset();
    mockUpdatePlannerColumn.mockReset();
    mockDeletePlannerColumn.mockReset();

    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockFetchUserProgress.mockResolvedValue(MOCK_PROGRESS);
    mockFetchUserGamification.mockResolvedValue(MOCK_GAMIFICATION);
    mockDismissUserGamificationTutorialQuest.mockResolvedValue({
      quest_key: "first_shopping_done",
      status: "dismissed",
    });
    mockFetchRecipeBooks.mockResolvedValue(MOCK_BOOKS);
    mockFetchShoppingHistory.mockResolvedValue(MOCK_SHOPPING_HISTORY);
    mockFetchShoppingListDetail.mockImplementation((listId: string) =>
      Promise.resolve(
        listId === "list-2" ? MOCK_ACTIVE_SHOPPING_DETAIL : MOCK_SHOPPING_DETAIL,
      ),
    );
    mockFetchShoppingShareText.mockResolvedValue({ text: "장보기 공유 텍스트" });
    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_SAVED_RECIPES);
    mockFetchRecipeBookRecipeDetail.mockImplementation(
      (_bookId: string, recipeId: keyof typeof MOCK_READER_DETAILS) =>
        Promise.resolve({
          success: true,
          data: MOCK_READER_DETAILS[recipeId] ?? MOCK_READER_DETAILS["recipe-saved-1"],
          error: null,
        }),
    );
    mockFetchLeftovers.mockImplementation((status: string) =>
      Promise.resolve(status === "eaten" ? MOCK_EATEN_LEFTOVERS : MOCK_LEFTOVERS),
    );
    mockEatLeftover.mockResolvedValue({ id: "leftover-1", status: "eaten" });
    mockUneatLeftover.mockResolvedValue({ id: "eaten-1", status: "leftover" });
    mockCreateMeal.mockResolvedValue({ id: "meal-1" });
    mockUpdateNickname.mockResolvedValue({
      ...MOCK_PROFILE,
      nickname: "새집밥러",
    });
    mockUpdateSettings.mockResolvedValue({
      settings: { screen_wake_lock: true },
    });
    mockUpdateRecipeBook.mockResolvedValue({
      id: "book-custom",
      name: "주말 파티",
      book_type: "custom",
      recipe_count: 2,
      sort_order: 3,
      cover_color_key: "sage",
      cover_image_url: "https://example.com/custom-cover.jpg",
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
    });
    mockLogout.mockResolvedValue({ logged_out: true });
    mockDeleteAccount.mockResolvedValue({ deleted: true });
    mockFetchPlanner.mockResolvedValue({
      columns: [
        { id: "column-dinner", name: "저녁", sort_order: 0 },
      ],
      meals: [
        {
          id: "meal-1",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          plan_date: "2026-05-04",
          column_id: "column-dinner",
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
          shopping_list_id: null,
        },
        {
          id: "meal-2",
          recipe_id: "recipe-2",
          recipe_title: "비빔밥",
          recipe_thumbnail_url: null,
          plan_date: "2026-05-05",
          column_id: "column-dinner",
          planned_servings: 1,
          status: "shopping_done",
          is_leftover: false,
          shopping_list_id: "shopping-1",
        },
        {
          id: "meal-3",
          recipe_id: "recipe-3",
          recipe_title: "된장찌개",
          recipe_thumbnail_url: null,
          plan_date: "2026-05-06",
          column_id: "column-dinner",
          planned_servings: 2,
          status: "cook_done",
          is_leftover: false,
          shopping_list_id: "shopping-1",
        },
        {
          id: "meal-4",
          recipe_id: "recipe-4",
          recipe_title: "계란말이",
          recipe_thumbnail_url: null,
          plan_date: "2026-05-07",
          column_id: "column-dinner",
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
          shopping_list_id: null,
        },
      ],
    });
    mockFetchPlannerColumns.mockResolvedValue({
      columns: [
        { id: "column-breakfast", name: "아침", sort_order: 0 },
        { id: "column-lunch", name: "점심", sort_order: 1 },
        { id: "column-dinner", name: "저녁", sort_order: 2 },
      ],
    });
  });

  it("shows the unauthorized gate when not authenticated", () => {
    render(<MypageScreen initialAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByText(/나만의 데이터를 로그인 후 확인/)).toBeTruthy();
  });

  it("keeps the mobile bottom tab visible on the unauthorized gate", () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "마이페이지 하단 탭" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "마이" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows profile and recipe books when authenticated", async () => {
    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("집밥러")).toBeTruthy();
    expect(screen.getByTestId("mypage-profile")).toBeTruthy();
    expect(await screen.findByTestId("mypage-growth-profile")).toBeTruthy();
    const actionBar = screen.getByTestId("mypage-profile-action-bar");
    expect(within(actionBar).getByRole("button", { name: "등급 보기" })).toBeTruthy();
    expect(within(actionBar).getByRole("button", { name: "업적 보기" })).toBeTruthy();
    expect(within(actionBar).getByRole("button", { name: "알림 보기" })).toBeTruthy();
    expect(screen.queryByText("첫 집밥 완성")).toBeNull();
    expect(screen.queryByText("요리 루틴 3번 완성")).toBeNull();

    expect(screen.getByRole("heading", { name: "저장한 레시피" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "레시피북" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "장보기 기록" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "레시피북" }));

    expect(screen.getByTestId("system-book-my_added").textContent).toContain("내가 추가한 레시피");
    expect(screen.getByTestId("system-book-saved").textContent).toContain("저장한 레시피");
    expect(screen.getByTestId("system-book-liked").textContent).toContain("좋아요한 레시피");
    expect(screen.getByText("주말 파티")).toBeTruthy();
  });

  it("shows server-backed growth profile on desktop without hardcoded level copy", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(mockFetchUserProgress).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("mypage-growth-profile")).toBeTruthy();
    const gradeRow = screen.getByTestId("mypage-profile-grade-row");
    expect(within(gradeRow).getByText("집밥 러너")).toBeTruthy();
    expect(within(gradeRow).getByText("Lv.6")).toBeTruthy();
    expect(screen.getByText("다음 레벨까지 130 XP")).toBeTruthy();
    expect(screen.getByTestId("mypage-growth-progress-fill").style.width).toBe("13%");
    expect(screen.queryByText(/레벨 5/)).toBeNull();
  });

  it("integrates mobile grade, progress, and detail buttons into the profile", async () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(await screen.findByTestId("mypage-growth-profile")).toBeTruthy();
    const gradeRow = screen.getByTestId("mypage-profile-grade-row");
    expect(within(gradeRow).getByText("집밥 러너")).toBeTruthy();
    expect(within(gradeRow).getByText("Lv.6")).toBeTruthy();
    expect(screen.getByText("다음 레벨까지 130 XP")).toBeTruthy();
    const actionBar = screen.getByTestId("mypage-profile-action-bar");
    expect(within(actionBar).getByRole("button", { name: "등급 보기" })).toBeTruthy();
    expect(within(actionBar).getByRole("button", { name: "업적 보기" })).toBeTruthy();
    expect(within(actionBar).getByRole("button", { name: "알림 보기" })).toBeTruthy();
    expect(screen.queryByText("첫 집밥 완성")).toBeNull();
    expect(screen.queryByText("🍳 집밥 러너 · 레벨 5")).toBeNull();
  });

  it("keeps the mobile loading shell until growth profile data is ready", async () => {
    installMatchMedia(true);
    let resolveProgress!: (value: unknown) => void;
    let resolveGamification!: (value: unknown) => void;
    mockFetchUserProgress.mockReturnValue(
      new Promise((resolve) => {
        resolveProgress = resolve;
      }),
    );
    mockFetchUserGamification.mockReturnValue(
      new Promise((resolve) => {
        resolveGamification = resolve;
      }),
    );

    render(<MypageScreen initialAuthenticated />);

    await waitFor(() => {
      expect(mockFetchUserProgress).toHaveBeenCalledTimes(1);
      expect(mockFetchUserGamification).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("mypage-mobile-loading")).toBeTruthy();
    expect(screen.queryByTestId("mypage-growth-profile")).toBeNull();

    await act(async () => {
      resolveProgress(MOCK_PROGRESS);
      resolveGamification(MOCK_GAMIFICATION);
    });

    expect(await screen.findByTestId("mypage-growth-profile")).toBeTruthy();
    expect(screen.queryByTestId("mypage-mobile-loading")).toBeNull();
    expect(screen.queryByTestId("mypage-growth-profile-loading")).toBeNull();
  });

  it("keeps core MYPAGE usable when only progress fetch fails", async () => {
    mockFetchUserProgress.mockRejectedValueOnce(new Error("progress unavailable"));

    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("집밥러")).toBeTruthy();
    expect(screen.getByTestId("mypage-profile")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "저장한 레시피" })).toBeTruthy();
    expect((await screen.findByTestId("mypage-growth-progress-error")).textContent).toContain(
      "XP를 잠시 불러오지 못했어요",
    );
    expect(
      screen.queryByRole("heading", { name: "데이터를 불러오지 못했어요" }),
    ).toBeNull();
  });

  it("resets desktop scroll position when opening the recipebook surface", async () => {
    render(<MypageScreen initialAuthenticated />);

    const user = userEvent.setup();
    await screen.findByText("집밥러");
    await user.click(screen.getByRole("tab", { name: "레시피북" }));

    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("opens nickname editing from the profile and removes account-only tabs", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.queryByLabelText("설정")).toBeNull();
    expect(screen.queryByRole("tab", { name: "계정 관리" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "알림 설정" })).toBeNull();
    expect(screen.getByRole("tab", { name: "환경설정" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("mypage-profile-edit-button"));

    expect(screen.getByTestId("nickname-sheet-backdrop")).toBeTruthy();
    expect(screen.getByDisplayValue("집밥러")).toBeTruthy();
  });

  it("uses cumulative planner status stat labels on desktop", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const stats = screen.getByLabelText("마이페이지 통계");
    expect(within(stats).getByText("플래너기록")).toBeTruthy();
    expect(within(stats).getByText("장보기기록")).toBeTruthy();
    expect(within(stats).getByText("요리기록")).toBeTruthy();
    expect(within(stats).getByText("4")).toBeTruthy();
    expect(within(stats).getAllByText("1")).toHaveLength(2);
    expect(mockFetchPlanner).toHaveBeenCalledWith("1900-01-01", "9999-12-31");
  });

  it("removes the legacy desktop growth archive surface because the notification button owns archive access", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.queryByTestId("growth-archive-surface")).toBeNull();
    expect(screen.getByRole("button", { name: "알림 보기" })).toBeTruthy();
  });

  it("shows real saved recipe links instead of prototype-only saved cards", async () => {
    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("저장된 된장찌개")).toBeTruthy();
    expect(mockFetchRecipeBookRecipes).toHaveBeenCalledWith("book-saved", {
      limit: 12,
    });

    const savedRecipeLink = screen.getByRole("link", { name: /저장된 된장찌개/ });
    expect(savedRecipeLink.getAttribute("href")).toContain("/recipe/recipe-saved-1?");
    expect(savedRecipeLink.getAttribute("href")).toContain(
      "returnTo=%2Fmypage%3Ftab%3Dsaved",
    );
    expect(screen.queryByText("소고기 미역국")).toBeNull();
  });

  it("opens the preferences tab from the tab query parameter", async () => {
    window.history.pushState({}, "", "/mypage?tab=preferences");

    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByTestId("mypage-preferences-tab")).toBeTruthy();
    expect(screen.queryByText("저장된 된장찌개")).toBeNull();
  });

  it("shows supported settings inline instead of notification-only settings", async () => {
    render(<MypageScreen initialAuthenticated />);
    const user = userEvent.setup();

    await screen.findByText("집밥러");
    await user.click(screen.getByRole("tab", { name: "환경설정" }));

    expect(screen.getByTestId("mypage-preferences-tab")).toBeTruthy();
    expect(screen.getByText("요리모드 화면 켜둠")).toBeTruthy();
    expect(screen.getByText("끼니 관리")).toBeTruthy();
    expect(screen.getByText("로그아웃")).toBeTruthy();
    expect(screen.getByText("계정 삭제하기")).toBeTruthy();
    expect(screen.queryByText("회원탈퇴")).toBeNull();
    expect(screen.queryByText("푸시 알림")).toBeNull();
    expect(screen.queryByText("계량 단위")).toBeNull();
    expect(screen.queryByText("앱 테마")).toBeNull();
    expect(
      screen.getByText(
        "끼니는 최대 5개까지 사용할 수 있어요. 드래그해서 바꾼 순서는 플래너에 그대로 표시돼요.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/최소 1개/)).toBeNull();
    expect(screen.queryByText(/식사가 있는 끼니는 삭제할 수 없어요/)).toBeNull();
    expect(screen.getByRole("button", { name: "끼니 삭제" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "끼니 삭제" }).className).toContain(
      "web-settings-delete-button",
    );
    expect(screen.queryByRole("button", { name: "편집" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "끼니 삭제" }).closest(".web-settings-column-description-row"),
    ).toBeTruthy();
    expect(screen.getByTestId("settings-account-profile-image")).toBeTruthy();
    expect(screen.getByTestId("mypage-meal-column-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByTestId("mypage-cook-mode-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByTestId("mypage-account-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByTestId("mypage-danger-section").className).toContain(
      "web-settings-bordered-section",
    );

    const addInput = screen.getByLabelText("새 끼니 이름");
    expect(addInput.className).toContain("web-mypage-column-input-prominent");

    await user.click(screen.getByTestId("rename-column-column-breakfast"));
    expect(screen.getByRole("dialog", { name: "끼니 이름 변경" })).toBeTruthy();
    const renameInput = screen.getByLabelText("아침 새 이름");
    expect(renameInput.className).toContain("web-mypage-column-input-prominent");
  });

  it("shows the app-matched logout description in the web confirmation dialog", async () => {
    render(<MypageScreen initialAuthenticated />);
    const user = userEvent.setup();

    await screen.findByText("집밥러");
    await user.click(screen.getByRole("tab", { name: "환경설정" }));
    await user.click(screen.getByRole("button", { name: /로그아웃/ }));

    const dialog = await screen.findByRole("dialog", {
      name: "로그아웃 할까요?",
    });

    expect(
      within(dialog).getByText("다시 로그인해야 식단·팬트리가 동기화돼요."),
    ).toBeTruthy();
  });

  it("uses mobile profile edit, a saved recipe rail, and cumulative stats", async () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("집밥러")).toBeTruthy();
    expect(screen.getByTestId("mobile-saved-recipes-rail")).toBeTruthy();
    expect(await screen.findByText("저장된 된장찌개")).toBeTruthy();
    expect(await screen.findByText("저장된 김치볶음밥")).toBeTruthy();
    expect(
      screen
        .getByTestId("mobile-saved-recipe-image-recipe-saved-2")
        .getAttribute("src"),
    ).toContain("images.unsplash.com");
    const stats = screen.getByLabelText("마이페이지 통계");
    expect(within(stats).getByText("요리기록")).toBeTruthy();
    expect(within(stats).getByText("장보기기록")).toBeTruthy();
    expect(within(stats).getByText("플래너기록")).toBeTruthy();
    expect(
      screen.getByTestId("record-stat-cooking-copy").textContent,
    ).toMatch(/^요리기록1$/);
    expect(
      screen.getByTestId("record-stat-planner-copy").textContent,
    ).toMatch(/^플래너기록4$/);
    const plannerValue = within(screen.getByTestId("record-stat-planner-copy")).getByText("4");
    expect(plannerValue.className).toContain("text-[22px]");
    expect(plannerValue.className).toContain("max-[480px]:text-[20px]");
    expect(plannerValue.className).toContain("font-extrabold");
    expect(plannerValue.className).not.toContain("block truncate text-[20px]");
    expect(screen.getByTestId("record-stat-planner-icon").className).toContain(
      "max-[480px]:w-10",
    );
    expect(screen.queryByText("연속")).toBeNull();
    expect(screen.queryByText("계정 관리")).toBeNull();
    expect(screen.queryByRole("button", { name: /저장한 레시피/ })).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("mypage-profile-edit-button"));
    expect(screen.getByTestId("nickname-sheet-backdrop")).toBeTruthy();

    await user.click(screen.getByText("취소"));
  });

  it("removes the legacy mobile growth archive surface because the notification button owns archive access", async () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.queryByTestId("growth-archive-surface")).toBeNull();
    expect(screen.getByRole("button", { name: "알림 보기" })).toBeTruthy();
  });

  it("uses first recipe images as mobile recipebook covers", async () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("집밥러")).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^레시피북/ }));

    await waitFor(() => {
      expect(mockFetchRecipeBookRecipes).toHaveBeenCalledWith("book-my", {
        limit: 1,
      });
    });

    const cover = await screen.findByTestId("mobile-book-cover-book-my");
    expect(cover.getAttribute("src")).toContain("saved-1.jpg");
  });

  it("uses the mobile recipebook diary header with profile and summary", async () => {
    installMatchMedia(true);

    render(
      <MypageScreen
        initialActiveTab="recipebooks"
        initialAuthenticated
        initialMobileSurface="recipebook"
      />,
    );

    const recipebookSurface = await screen.findByTestId("recipebook-tab");
    expect(recipebookSurface.className).toContain(
      "mobile-recipebooks-diary-screen-fit",
    );
    expect(within(recipebookSurface).getByAltText("집밥러 프로필")).toBeTruthy();
    expect(within(recipebookSurface).getByRole("heading", { name: "나의 레시피북" })).toBeTruthy();
    expect(within(recipebookSurface).getByText("책 4권 · 저장 5개")).toBeTruthy();
    const customSection = within(recipebookSurface).getByTestId(
      "mobile-custom-books-section",
    );
    const systemSection = within(recipebookSurface).getByTestId(
      "mobile-system-books-section",
    );
    expect(within(customSection).getByRole("heading", { name: "커스텀" })).toBeTruthy();
    expect(within(systemSection).getByRole("heading", { name: "시스템" })).toBeTruthy();
    expect(within(customSection).getByTestId("custom-book-book-custom")).toBeTruthy();
    expect(within(systemSection).getByTestId("system-book-saved")).toBeTruthy();
    expect(
      within(customSection).getByTestId("mobile-custom-books-grid").className,
    ).toContain("mobile-recipebooks-book-grid-wide");
    const customBookCard = within(customSection).getByTestId("custom-book-book-custom");
    expect(customBookCard.className).toContain("mobile-recipebook-book-card-web-ratio");
    const customCover = within(customBookCard).getByTestId("mobile-book-cover-book-custom");
    expect(customCover.className).toContain("mobile-recipebook-cover-thumb-image");
    expect(customCover.closest(".mobile-recipebook-cover-thumb")).toBeTruthy();
    expect(
      within(systemSection).getByTestId("mobile-system-books-grid").className,
    ).toContain("mobile-recipebooks-book-grid-wide");
    expect(within(recipebookSurface).queryByText("책장")).toBeNull();
    expect(within(recipebookSurface).queryByText("최근")).toBeNull();
    expect(within(recipebookSurface).queryByText("목록")).toBeNull();
  });

  it("opens mobile custom book cover controls and can clear the cover image", async () => {
    installMatchMedia(true);

    render(
      <MypageScreen
        initialActiveTab="recipebooks"
        initialAuthenticated
        initialMobileSurface="recipebook"
      />,
    );

    const recipebookSurface = await screen.findByTestId("recipebook-tab");
    const user = userEvent.setup();

    await user.click(within(recipebookSurface).getByLabelText("주말 파티 옵션 메뉴"));
    await user.click(screen.getByRole("menuitem", { name: "색상 변경" }));
    expect(screen.getByTestId("book-color-dialog")).toBeTruthy();
    expect(screen.getByTestId("book-color-dialog").className).toContain(
      "web-recipebook-management-modal",
    );
    expect(screen.getByRole("dialog", { name: "색상 변경" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "그린" }).className).toContain(
      "mobile-recipebook-book-card-sage",
    );
    expect(screen.getByRole("button", { name: "스카이" }).className).toContain(
      "mobile-recipebook-book-card-sky",
    );
    await user.click(screen.getByLabelText("닫기"));

    await user.click(within(recipebookSurface).getByLabelText("주말 파티 옵션 메뉴"));
    await user.click(screen.getByRole("menuitem", { name: "커버 이미지 변경" }));
    expect(screen.getByTestId("book-cover-image-dialog")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "커버 이미지 변경" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "커버 이미지 삭제" }));

    await waitFor(() => {
      expect(mockUpdateRecipeBook).toHaveBeenCalledWith("book-custom", {
        cover_image_url: null,
      });
    });
  });

  it("updates only the selected custom book cover image", async () => {
    const booksWithCovers = MOCK_BOOKS.books.map((book) =>
      book.id === "book-saved"
        ? { ...book, cover_image_url: "https://example.com/system-saved.jpg" }
        : book.id === "book-custom"
          ? { ...book, cover_image_url: "https://example.com/custom-old.jpg" }
          : book,
    );
    mockFetchRecipeBooks.mockResolvedValueOnce({ books: booksWithCovers });
    mockUpdateRecipeBook.mockResolvedValueOnce({
      id: "book-custom",
      name: "주말 파티",
      book_type: "custom",
      recipe_count: 2,
      sort_order: 3,
      cover_color_key: "sage",
      cover_image_url: "https://example.com/custom-new.jpg",
      created_at: "2026-05-01T00:00:00.000Z",
      updated_at: "2026-05-02T00:00:00.000Z",
    });

    render(<MypageScreen initialAuthenticated />);

    const user = await openRecipebookSurface();
    expect(
      screen.getByTestId("book-cover-image-book-saved").getAttribute("style"),
    ).toContain("system-saved.jpg");

    await user.click(
      within(screen.getByTestId("custom-book-book-custom")).getByLabelText(
        "주말 파티 옵션 메뉴",
      ),
    );
    await user.click(screen.getByRole("menuitem", { name: "커버 이미지 변경" }));
    const imageUrlInput = screen.getByLabelText("이미지 URL");
    await user.clear(imageUrlInput);
    await user.type(imageUrlInput, "https://example.com/custom-new.jpg");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(mockUpdateRecipeBook).toHaveBeenCalledWith("book-custom", {
        cover_image_url: "https://example.com/custom-new.jpg",
      });
    });
    expect(
      screen.getByTestId("book-cover-image-book-saved").getAttribute("style"),
    ).toContain("system-saved.jpg");
    expect(
      screen.getByTestId("book-cover-image-book-custom").getAttribute("style"),
    ).toContain("custom-new.jpg");
  });

  it("displays system books with correct recipe counts", async () => {
    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const myAddedCard = screen.getByTestId("system-book-my_added");
    expect(myAddedCard.textContent).toContain("3개");
    expect(screen.getByLabelText("레시피 3개")).toBeTruthy();

    const savedCard = screen.getByTestId("system-book-saved");
    expect(savedCard.textContent).toContain("5개");
    expect(screen.getByLabelText("레시피 5개")).toBeTruthy();

    const likedCard = screen.getByTestId("system-book-liked");
    expect(likedCard.textContent).toContain("10개");
    expect(screen.getByLabelText("레시피 10개")).toBeTruthy();
  });

  it("shows the error state and retries on failure", async () => {
    mockFetchUserProfile.mockRejectedValueOnce(new Error("fail"));

    render(<MypageScreen initialAuthenticated />);

    expect(
      await screen.findByText("데이터를 불러오지 못했어요"),
    ).toBeTruthy();

    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("집밥러")).toBeTruthy();
  });

  it("shows loading skeleton initially", () => {
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    mockFetchRecipeBooks.mockReturnValue(new Promise(() => {}));

    const { container } = render(<MypageScreen initialAuthenticated />);

    const skeleton = screen.getByTestId("mypage-skeleton");
    expect(within(skeleton).getByTestId("mypage-loading-growth-profile")).toBeTruthy();
    expect(within(skeleton).getAllByTestId("mypage-loading-growth-action")).toHaveLength(3);
    expect(within(skeleton).getByTestId("mypage-loading-progress-meter")).toBeTruthy();
    expect(within(skeleton).queryByTestId("mypage-legacy-loading-list")).toBeNull();
    expect(container.querySelector(".web-mypage-loading-tabs")).toBeNull();
    expect(container.querySelector(".web-mypage-panel")).toBeNull();
    expect(container.querySelectorAll('[data-testid="mypage-loading-growth-profile"]')).toHaveLength(1);
    expect(screen.getByRole("link", { name: "마이페이지" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "팬트리" })).toBeTruthy();
  });

  it("uses the mobile app loading shell instead of the legacy skeleton", () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    mockFetchRecipeBooks.mockReturnValue(new Promise(() => {}));

    render(<MypageScreen initialAuthenticated />);

    expect(screen.getByTestId("mypage-mobile-loading")).toBeTruthy();
    expect(screen.getByTestId("mypage-mobile-loading-growth-profile")).toBeTruthy();
    expect(screen.getAllByTestId("mypage-mobile-loading-growth-action")).toHaveLength(3);
    expect(screen.getByTestId("mypage-mobile-loading-progress-meter")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "마이페이지" }).className).toContain(
      "text-[var(--brand)]",
    );
  });

  it("uses the theme color for the mobile mypage screen title", async () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated />);

    expect((await screen.findByRole("heading", { name: "마이페이지" })).className).toContain(
      "text-[var(--brand)]",
    );
  });

  it("uses the restored recipebook surface title during mobile loading", () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    mockFetchRecipeBooks.mockReturnValue(new Promise(() => {}));

    render(
      <MypageScreen
        initialActiveTab="recipebooks"
        initialAuthenticated
        initialMobileSurface="recipebook"
      />,
    );

    expect(screen.getByTestId("mypage-mobile-loading")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "레시피북" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "뒤로" })).toBeTruthy();
    expect(screen.getByTestId("recipebook-mobile-loading-hero")).toBeTruthy();
    expect(screen.getAllByTestId(/^recipebook-mobile-loading-book-/)).toHaveLength(4);
    expect(screen.queryByText("책장")).toBeNull();
    expect(screen.queryByRole("heading", { name: "마이페이지" })).toBeNull();
  });

  it("uses the restored shopping surface title during mobile loading", () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    mockFetchRecipeBooks.mockReturnValue(new Promise(() => {}));

    render(
      <MypageScreen
        initialActiveTab="shopping"
        initialAuthenticated
        initialMobileSurface="shopping"
      />,
    );

    expect(screen.getByTestId("mypage-mobile-loading")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "장보기 기록" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "뒤로" })).toBeTruthy();
    expect(screen.getByTestId("shopping-history-loading-skeleton")).toBeTruthy();
    expect(screen.getByText("장보기 달력")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "마이페이지" })).toBeNull();
  });

  it("shows empty state message when no custom books exist", async () => {
    mockFetchRecipeBooks.mockResolvedValue({
      books: MOCK_BOOKS.books.filter((b) => b.book_type !== "custom"),
    });

    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();
    expect(screen.getByText("아직 만든 레시피북이 없어요")).toBeTruthy();
  });

  it("system books do not show a context menu button", async () => {
    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const systemBookCard = screen.getByTestId("system-book-my_added");
    expect(systemBookCard.querySelector("[aria-haspopup='menu']")).toBeNull();
  });

  it("custom books show a context menu with rename and delete", async () => {
    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const user = userEvent.setup();
    const menuButton = screen.getByLabelText("주말 파티 옵션 메뉴");
    await user.click(menuButton);

    expect(screen.getByRole("menuitem", { name: "이름 변경" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "삭제" })).toBeTruthy();
  });

  it("renames a custom book via the context menu", async () => {
    mockRenameRecipeBook.mockResolvedValue({
      id: "book-custom",
      name: "저녁 모임",
      book_type: "custom",
      recipe_count: 2,
      sort_order: 3,
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T01:00:00Z",
    });
    const updatedBooks = {
      books: MOCK_BOOKS.books.map((b) =>
        b.id === "book-custom" ? { ...b, name: "저녁 모임" } : b,
      ),
    };

    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "주말 파티 상세 보기" }));
    const inlineDetail = await screen.findByTestId("recipebook-inline-detail");
    expect(
      within(inlineDetail).getByRole("heading", { name: "주말 파티" }),
    ).toBeTruthy();

    await user.click(
      within(screen.getByTestId("custom-book-book-custom")).getByLabelText(
        "주말 파티 옵션 메뉴",
      ),
    );
    await user.click(screen.getByRole("menuitem", { name: "이름 변경" }));

    const input = screen.getByDisplayValue("주말 파티");
    await user.clear(input);
    await user.type(input, "저녁 모임");

    mockFetchRecipeBooks.mockResolvedValue(updatedBooks);
    await user.click(screen.getByRole("button", { name: "완료" }));

    await waitFor(() => {
      expect(mockRenameRecipeBook).toHaveBeenCalledWith("book-custom", "저녁 모임");
    });

    expect(await screen.findByText("이름을 변경했어요")).toBeTruthy();
    expect(
      within(inlineDetail).getByRole("heading", { name: "저녁 모임" }),
    ).toBeTruthy();
  });

  it("shows delete confirmation dialog and deletes a custom book", async () => {
    mockDeleteRecipeBook.mockResolvedValue({ deleted: true });
    const updatedBooks = {
      books: MOCK_BOOKS.books.filter((b) => b.id !== "book-custom"),
    };

    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("주말 파티 옵션 메뉴"));
    await user.click(screen.getByRole("menuitem", { name: "삭제" }));

    expect(screen.getByTestId("delete-confirm-dialog")).toBeTruthy();
    expect(screen.getByText("레시피북을 삭제할까요?")).toBeTruthy();
    const dialog = screen.getByTestId("delete-confirm-dialog");
    expect(dialog.textContent).toContain("주말 파티");

    mockFetchRecipeBooks.mockResolvedValue(updatedBooks);
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(mockDeleteRecipeBook).toHaveBeenCalledWith("book-custom");
    });

    expect(await screen.findByText("삭제했어요")).toBeTruthy();
  });

  it("cancels delete dialog without deleting", async () => {
    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("주말 파티 옵션 메뉴"));
    await user.click(screen.getByRole("menuitem", { name: "삭제" }));

    expect(screen.getByTestId("delete-confirm-dialog")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByTestId("delete-confirm-dialog")).toBeNull();
    expect(mockDeleteRecipeBook).not.toHaveBeenCalled();
  });

  it("creates a new custom recipe book", async () => {
    mockCreateRecipeBook.mockResolvedValue({
      id: "book-new",
      name: "주말 브런치",
      book_type: "custom",
      recipe_count: 0,
      sort_order: 4,
      created_at: "2026-04-30T00:00:00Z",
      updated_at: "2026-04-30T00:00:00Z",
    });
    const updatedBooks = {
      books: [
        ...MOCK_BOOKS.books,
        { id: "book-new", name: "주말 브런치", book_type: "custom" as const, recipe_count: 0, sort_order: 4 },
      ],
    };

    render(<MypageScreen initialAuthenticated />);

    await openRecipebookSurface();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("새 레시피북 만들기"));

    const input = screen.getByPlaceholderText("레시피북 이름");
    await user.type(input, "주말 브런치");

    mockFetchRecipeBooks.mockResolvedValue(updatedBooks);
    await user.click(screen.getByRole("button", { name: /완료/ }));

    await waitFor(() => {
      expect(mockCreateRecipeBook).toHaveBeenCalledWith("주말 브런치");
    });

    expect(await screen.findByText("레시피북을 만들었어요")).toBeTruthy();
  });

  it("switches to shopping history tab and shows history cards", async () => {
    render(<MypageScreen initialAuthenticated />);

    const user = userEvent.setup();
    await openShoppingSurface(user);

    expect(await screen.findByText("2026년 4월")).toBeTruthy();
    const calendar = screen.getByTestId("shopping-history-calendar");
    expect(within(calendar).queryByText("2026년 3월")).toBeNull();
    expect(within(calendar).queryByText("4/30~5/6")).toBeNull();
    expect(within(calendar).queryByText("4/23~29")).toBeNull();
    expect(within(calendar).getByRole("button", {
      name: "4월 30일 만든 장보기 1개, 완료 1개",
    })).toBeTruthy();
    expect(
      (within(calendar).getByRole("button", { name: "이전 달" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (within(calendar).getByRole("button", { name: "다음 달" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const selectedPanel = screen.getByTestId("shopping-selected-day-panel");
    expect(await within(selectedPanel).findByText("4/30~5/6 장보기")).toBeTruthy();
    expect(within(selectedPanel).getByText("완료 5/1")).toBeTruthy();
    expect(within(selectedPanel).queryByText("목록 생성")).toBeNull();
    expect(within(selectedPanel).queryByText("생성일")).toBeNull();
    expect(screen.queryByText(/다시열기/)).toBeNull();

    await user.click(
      within(calendar).getByRole("button", {
        name: "4월 23일 만든 장보기 1개, 진행 중 1개",
      }),
    );

    expect(within(selectedPanel).getByText("4/23~29 장보기")).toBeTruthy();
    expect(within(selectedPanel).getByText("진행 중")).toBeTruthy();
    expect(within(selectedPanel).getByText("재료 8개")).toBeTruthy();
    expect(within(selectedPanel).getByTestId("shopping-card-list-2").textContent).not.toContain(
      "완료 ",
    );

    await user.click(within(calendar).getByRole("button", { name: "이전 달" }));

    expect(within(calendar).getByText("2026년 3월")).toBeTruthy();
    expect(within(calendar).queryByText("2026년 4월")).toBeNull();
    expect(within(selectedPanel).getByText("3/18~24 장보기")).toBeTruthy();
    expect(within(selectedPanel).getByText("완료 3/18")).toBeTruthy();
    expect(
      (within(calendar).getByRole("button", { name: "이전 달" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(within(calendar).getByRole("button", { name: "다음 달" }));

    expect(within(calendar).getByText("2026년 4월")).toBeTruthy();
    expect(within(calendar).queryByText("2026년 3월")).toBeNull();
  });

  it("shows mobile shopping history as a calendar with selected-day detail rows", async () => {
    installMatchMedia(true);

    render(<MypageScreen initialAuthenticated />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /장보기 기록/ }));

    const heading = await screen.findByRole("heading", { name: "장보기 기록" });
    expect(heading.className).toContain("text-[var(--foreground)]");
    expect(heading.className).not.toContain("text-[var(--brand)]");
    expect(screen.getByText("2026년 4월")).toBeTruthy();

    const calendar = screen.getByTestId("shopping-history-calendar");
    expect(within(calendar).queryByText("2026년 3월")).toBeNull();
    expect(within(calendar).queryByText("4/30~5/6")).toBeNull();
    expect(within(calendar).queryByText("4/23~29")).toBeNull();
    expect(
      within(calendar).getByRole("button", {
        name: "4월 30일 만든 장보기 1개, 완료 1개",
      }),
    ).toBeTruthy();

    const selectedPanel = screen.getByTestId("shopping-selected-day-panel");
    expect(within(selectedPanel).getByRole("heading", {
      name: "4월 30일 만든 장보기",
    })).toBeTruthy();
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").textContent).not.toContain("다시열기");
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").textContent).toContain("4/30~5/6");
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").textContent).not.toContain("목록 생성");
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").textContent).toContain("끼니 범위");
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").textContent).toContain("재료 12개");
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").textContent).toContain("완료 5/1");
    expect(within(selectedPanel).getByTestId("shopping-card-list-1").className).toContain(
      "border-[var(--planner-status-shopping)]",
    );

    await user.click(
      within(calendar).getByRole("button", {
        name: "4월 23일 만든 장보기 1개, 진행 중 1개",
      }),
    );

    expect(within(selectedPanel).getByRole("heading", {
      name: "4월 23일 만든 장보기",
    })).toBeTruthy();
    expect(within(selectedPanel).getByTestId("shopping-card-list-2").textContent).toContain("4/23~29");
    expect(within(selectedPanel).getByTestId("shopping-card-list-2").textContent).toContain("진행 중");
    expect(within(selectedPanel).getByTestId("shopping-card-list-2").textContent).not.toContain("완료 ");
    expect(within(selectedPanel).getByTestId("shopping-card-list-2").className).toContain(
      "border-[var(--planner-status-registered)]",
    );
    expect(screen.getByTestId("shopping-status-legend").textContent).toContain("진행중");
    expect(screen.getByTestId("shopping-status-legend").textContent).toContain("완료");

    await user.click(within(calendar).getByRole("button", { name: "이전 달" }));

    expect(within(calendar).getByText("2026년 3월")).toBeTruthy();
    expect(within(calendar).queryByText("2026년 4월")).toBeNull();
    expect(within(selectedPanel).getByRole("heading", {
      name: "3월 18일 만든 장보기",
    })).toBeTruthy();
    expect(within(selectedPanel).getByTestId("shopping-card-list-3").textContent).toContain("3/18~24");
    expect(
      (within(calendar).getByRole("button", { name: "이전 달" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("returns from restored mobile shopping history to the provided previous screen", async () => {
    installMatchMedia(true);
    window.history.pushState(
      {},
      "",
      "/mypage?restore=shopping-history-tab&returnTo=/planner",
    );

    render(
      <MypageScreen
        initialActiveTab="shopping"
        initialAuthenticated
        initialMobileSurface="shopping"
      />,
    );

    const user = userEvent.setup();
    await screen.findByTestId("shopping-tab");
    await user.click(screen.getByRole("button", { name: "뒤로" }));

    expect(mockRouterReplace).toHaveBeenCalledWith("/planner");
  });

  it("returns the mobile mypage internal surface to the first screen when tapping the My bottom tab", async () => {
    installMatchMedia(true);

    render(
      <MypageScreen
        initialAuthenticated
        initialActiveTab="shopping"
        initialMobileSurface="shopping"
      />,
    );

    expect(await screen.findByRole("heading", { name: "장보기 기록" })).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole("link", { name: "마이" }));

    expect(await screen.findByRole("heading", { name: "마이페이지" })).toBeTruthy();
    expect(screen.getByTestId("mobile-saved-recipes-rail")).toBeTruthy();
  });

  it("shows empty shopping history state with planner link", async () => {
    mockFetchShoppingHistory.mockResolvedValue({
      items: [],
      next_cursor: null,
      has_next: false,
    });

    render(<MypageScreen initialAuthenticated />);

    const user = userEvent.setup();
    await openShoppingSurface(user);

    expect(await screen.findByText("저장된 장보기 기록이 없어요")).toBeTruthy();
    expect(screen.getByText("플래너로 이동")).toBeTruthy();
  });

  it("shows the tab bar with proper ARIA roles", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.getByRole("tablist")).toBeTruthy();
    const savedTab = screen.getByRole("tab", { name: "저장한 레시피" });
    const recipebooksTab = screen.getByRole("tab", { name: "레시피북" });
    const shoppingTab = screen.getByRole("tab", { name: "장보기 기록" });
    const leftoversTab = screen.getByRole("tab", { name: "남은 요리" });
    const eatenTab = screen.getByRole("tab", { name: "다먹은 요리" });
    const preferencesTab = screen.getByRole("tab", { name: "환경설정" });

    expect(savedTab.getAttribute("aria-selected")).toBe("true");
    expect(recipebooksTab.getAttribute("aria-selected")).toBe("false");
    expect(shoppingTab.getAttribute("aria-selected")).toBe("false");
    expect(leftoversTab.getAttribute("aria-selected")).toBe("false");
    expect(eatenTab.getAttribute("aria-selected")).toBe("false");
    expect(preferencesTab.getAttribute("aria-selected")).toBe("false");
  });

  it("does not duplicate library navigation rows under saved recipes on desktop", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const savedPanel = screen.getByRole("tabpanel");

    expect(within(savedPanel).getByRole("heading", { name: "저장한 레시피" })).toBeTruthy();
    expect(within(savedPanel).queryByRole("button", { name: /^레시피북$/ })).toBeNull();
    expect(within(savedPanel).queryByRole("button", { name: /^장보기 기록$/ })).toBeNull();
    expect(within(savedPanel).queryByRole("button", { name: /남은 요리/ })).toBeNull();
    expect(within(savedPanel).queryByRole("button", { name: /다먹은 요리/ })).toBeNull();
  });

  it("renders profile image with fallback initial when no image URL", async () => {
    mockFetchUserProfile.mockResolvedValue({
      ...MOCK_PROFILE,
      profile_image_url: null,
    });

    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.queryByRole("img", { name: "집밥러 프로필" })).toBeNull();
    const avatar = screen.getByTestId("profile-fallback-avatar");
    expect(avatar.textContent).toBe("집");
  });

  it("opens system book cards as inline recipebook detail under the tab", async () => {
    render(<MypageScreen initialAuthenticated />);

    const user = await openRecipebookSurface();

    const myAddedCard = screen.getByTestId("system-book-my_added");
    expect(myAddedCard.tagName.toLowerCase()).toBe("button");

    await user.click(myAddedCard);

    expect(mockRouterPush).not.toHaveBeenCalled();
    const inlineDetail = await screen.findByTestId("recipebook-inline-detail");
    expect(
      within(inlineDetail).getByRole("heading", { name: "레시피북 리더" }),
    ).toBeTruthy();
    expect(
      within(inlineDetail).getByRole("heading", { name: "내가 추가한 레시피" }),
    ).toBeTruthy();
    const inlineRecipe = await within(inlineDetail).findByTestId(
      "recipe-item-recipe-saved-1",
    );
    expect(
      within(inlineRecipe).getByRole("heading", { name: "저장된 된장찌개" }),
    ).toBeTruthy();
    expect(mockFetchRecipeBookRecipes).toHaveBeenCalledWith("book-my", {
      limit: 20,
    });
    expect(
      mockFetchRecipeBookRecipes.mock.calls.some(
        ([bookId, options]) => {
          if (
            bookId !== "book-my" ||
            typeof options !== "object" ||
            options === null ||
            !("limit" in options)
          ) {
            return false;
          }

          return (options as { limit?: number }).limit === 12;
        },
      ),
    ).toBe(false);
    expect(screen.queryByRole("navigation", { name: "레시피북 경로" })).toBeNull();
  });

  it("can render directly into the recipebook return surface", async () => {
    render(
      <MypageScreen
        initialActiveTab="recipebooks"
        initialAuthenticated
        initialMobileSurface="recipebook"
      />,
    );

    expect(await screen.findByTestId("recipebook-tab")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "저장한 레시피" })).toBeNull();
  });

  it("keeps the recipebook tab as a bookshelf without an inline detail breadcrumb", async () => {
    render(
      <MypageScreen
        initialActiveTab="recipebooks"
        initialAuthenticated
        initialMobileSurface="recipebook"
      />,
    );

    await screen.findByTestId("recipebook-tab");
    expect(screen.queryByRole("navigation", { name: "레시피북 경로" })).toBeNull();

    expect(screen.getByTestId("system-book-saved")).toBeTruthy();
    expect(screen.queryByText("저장된 된장찌개")).toBeNull();
    expect(screen.getByRole("heading", { name: "레시피북" })).toBeTruthy();
  });

  it("can render directly into the shopping return surface", async () => {
    render(
      <MypageScreen
        initialActiveTab="shopping"
        initialAuthenticated
        initialMobileSurface="shopping"
      />,
    );

    expect(await screen.findByTestId("shopping-tab")).toBeTruthy();
    expect(await screen.findByText("4/30~5/6 장보기")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "저장한 레시피" })).toBeNull();
  });

  it("opens shopping history detail inline below the mypage tabs", async () => {
    render(<MypageScreen initialAuthenticated />);

    const user = userEvent.setup();
    await openShoppingSurface(user);

    const calendar = await screen.findByTestId("shopping-history-calendar");
    await user.click(
      within(calendar).getByRole("button", {
        name: "4월 23일 만든 장보기 1개, 진행 중 1개",
      }),
    );

    const card = await screen.findByTestId("shopping-card-list-2");
    expect(card.tagName.toLowerCase()).toBe("button");

    await user.click(card);

    await waitFor(() => {
      expect(mockFetchShoppingListDetail).toHaveBeenCalledWith("list-2");
    });
    expect(screen.getByTestId("shopping-detail-embedded")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "4월 23일 장보기" })).toBeTruthy();
    expect(screen.getByText("장보기 진행 중")).toBeTruthy();
    expect(screen.getByText("0 / 1 항목")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "감자 2개 구매 완료 표시" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "양파 1개 되살리기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "장보기 완료" })).toBeTruthy();
    expect(window.location.search).toContain("tab=shopping");
    expect(window.location.search).toContain("shoppingListId=list-2");

    window.history.back();
    await waitFor(() => {
      expect(screen.queryByTestId("shopping-detail-embedded")).toBeNull();
    });
    expect(screen.getByTestId("shopping-tab")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "장보기 기록" }).getAttribute("aria-selected"),
    ).toBe("true");

    await user.click(screen.getByRole("tab", { name: "장보기 기록" }));

    expect(screen.queryByTestId("shopping-detail-embedded")).toBeNull();
    expect(await screen.findByTestId("shopping-tab")).toBeTruthy();
    expect(screen.getByTestId("shopping-card-list-2")).toBeTruthy();
  });

  it("keeps completed shopping history detail inside mypage with list return actions", async () => {
    render(<MypageScreen initialAuthenticated />);

    const user = userEvent.setup();
    await openShoppingSurface(user);

    await user.click(await screen.findByTestId("shopping-card-list-1"));

    await waitFor(() => {
      expect(mockFetchShoppingListDetail).toHaveBeenCalledWith("list-1");
    });
    expect(screen.getByTestId("shopping-detail-embedded")).toBeTruthy();
    expect(screen.getByText("완료된 장보기 기록은 수정할 수 없어요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "플래너로 돌아가기" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "목록으로" }).length).toBeGreaterThan(0);
  });

  it("opens leftovers and eaten-list rows as mypage tab panels", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "남은 요리" }));

    expect(await screen.findByText("남은 김치찌개")).toBeTruthy();
    expect(mockFetchLeftovers).toHaveBeenCalledWith("leftover");
    expect(
      screen.getByRole("tab", { name: "남은 요리" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("leftover-card-leftover-1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "플래너에 추가" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다먹음" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "레시피 보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "남은 요리 전체 관리" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "다먹은 요리" }));

    expect(await screen.findByText("다 먹은 된장찌개")).toBeTruthy();
    expect(mockFetchLeftovers).toHaveBeenCalledWith("eaten");
    expect(
      screen.getByRole("tab", { name: "다먹은 요리" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByTestId("leftover-card-eaten-1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "남은 요리로" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "레시피 보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "다먹은 요리 전체 관리" })).toBeNull();
  });

  it("keeps mobile menu icons visually separated from labels", async () => {
    installMatchMedia(true);
    render(<MypageScreen initialAuthenticated />);

    const recipeBookRow = await screen.findByRole("button", { name: /레시피북/ });
    expect(recipeBookRow.className).toContain("gap-3");
  });

  it("restores the shopping-history tab from return context", async () => {
    window.history.pushState({}, "", "/mypage?restore=shopping-history-tab");

    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("4/30~5/6 장보기")).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "장보기 기록" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });
});
