// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MypageScreen } from "@/components/mypage/mypage-screen";

const mockFetchUserProfile = vi.fn();
const mockFetchRecipeBooks = vi.fn();
const mockCreateRecipeBook = vi.fn();
const mockRenameRecipeBook = vi.fn();
const mockDeleteRecipeBook = vi.fn();
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
  fetchShoppingHistory: (...args: unknown[]) => mockFetchShoppingHistory(...args),
  updateNickname: (...args: unknown[]) => mockUpdateNickname(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  isMypageApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipeBookRecipes: (...args: unknown[]) =>
    mockFetchRecipeBookRecipes(...args),
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
    mockFetchRecipeBooks.mockReset();
    mockCreateRecipeBook.mockReset();
    mockRenameRecipeBook.mockReset();
    mockDeleteRecipeBook.mockReset();
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
    mockFetchRecipeBooks.mockResolvedValue(MOCK_BOOKS);
    mockFetchShoppingHistory.mockResolvedValue(MOCK_SHOPPING_HISTORY);
    mockFetchShoppingListDetail.mockImplementation((listId: string) =>
      Promise.resolve(
        listId === "list-2" ? MOCK_ACTIVE_SHOPPING_DETAIL : MOCK_SHOPPING_DETAIL,
      ),
    );
    mockFetchShoppingShareText.mockResolvedValue({ text: "장보기 공유 텍스트" });
    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_SAVED_RECIPES);
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
    expect(screen.getByText("카카오 로그인")).toBeTruthy();
    expect(screen.getByTestId("mypage-profile")).toBeTruthy();

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
    expect(within(stats).getByText("플래너 등록")).toBeTruthy();
    expect(within(stats).getByText("장보기 완료")).toBeTruthy();
    expect(within(stats).getByText("요리 완료")).toBeTruthy();
    expect(within(stats).getByText("4")).toBeTruthy();
    expect(within(stats).getAllByText("1")).toHaveLength(2);
    expect(mockFetchPlanner).toHaveBeenCalledWith("1900-01-01", "9999-12-31");
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
    expect(screen.getByText("요리 완료")).toBeTruthy();
    expect(screen.getByText("장보기 완료")).toBeTruthy();
    expect(screen.getByText("플래너 등록")).toBeTruthy();
    expect(screen.getByText("4").className).toContain("text-[28px]");
    expect(screen.getByText("4").className).toContain("font-semibold");
    expect(screen.getByText("4").className).not.toContain("font-[800]");
    expect(screen.queryByText("연속")).toBeNull();
    expect(screen.queryByText("계정 관리")).toBeNull();
    expect(screen.queryByRole("button", { name: /저장한 레시피/ })).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("mypage-profile-edit-button"));
    expect(screen.getByTestId("nickname-sheet-backdrop")).toBeTruthy();

    await user.click(screen.getByText("취소"));
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

    render(<MypageScreen initialAuthenticated />);

    expect(screen.getByTestId("mypage-skeleton")).toBeTruthy();
    expect(screen.getByRole("link", { name: "마이페이지" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "팬트리" })).toBeTruthy();
  });

  it("uses the mobile app loading shell instead of the legacy skeleton", () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    mockFetchRecipeBooks.mockReturnValue(new Promise(() => {}));

    render(<MypageScreen initialAuthenticated />);

    expect(screen.getByTestId("mypage-mobile-loading")).toBeTruthy();
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
    await user.click(screen.getByLabelText("주말 파티 옵션 메뉴"));
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
    await user.click(screen.getByRole("button", { name: "삭제" }));

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
    expect(await within(selectedPanel).findByText("4/30~5/6")).toBeTruthy();
    expect(within(selectedPanel).getByText("완료 5/1")).toBeTruthy();
    expect(within(selectedPanel).queryByText("목록 생성")).toBeNull();
    expect(within(selectedPanel).queryByText("생성일")).toBeNull();
    expect(screen.queryByText(/다시열기/)).toBeNull();

    await user.click(
      within(calendar).getByRole("button", {
        name: "4월 23일 만든 장보기 1개, 진행 중 1개",
      }),
    );

    expect(within(selectedPanel).getByText("4/23~29")).toBeTruthy();
    expect(within(selectedPanel).getByText("진행 중")).toBeTruthy();
    expect(within(selectedPanel).getByText("재료 8개")).toBeTruthy();
    expect(within(selectedPanel).getByTestId("shopping-card-list-2").textContent).not.toContain(
      "완료 ",
    );

    await user.click(within(calendar).getByRole("button", { name: "이전 달" }));

    expect(within(calendar).getByText("2026년 3월")).toBeTruthy();
    expect(within(calendar).queryByText("2026년 4월")).toBeNull();
    expect(within(selectedPanel).getByText("3/18~24")).toBeTruthy();
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

  it("opens system book cards inline below the mypage tabs", async () => {
    render(<MypageScreen initialAuthenticated />);

    const user = await openRecipebookSurface();

    const myAddedCard = screen.getByTestId("system-book-my_added");
    expect(myAddedCard.tagName.toLowerCase()).toBe("button");

    await user.click(myAddedCard);

    await waitFor(() => {
      expect(mockFetchRecipeBookRecipes).toHaveBeenCalledWith("book-my", {
        limit: 12,
      });
    });
    expect(await screen.findByRole("heading", { name: "내가 추가한 레시피" })).toBeTruthy();
    expect(screen.getByText("저장된 된장찌개")).toBeTruthy();
    const recipeLink = screen.getByRole("link", { name: /저장된 된장찌개/ });
    expect(recipeLink.getAttribute("href")).toContain("/recipe/recipe-saved-1?");
    expect(recipeLink.getAttribute("href")).toContain(
      "returnTo=%2Fmypage%2Frecipe-books%2Fbook-my",
    );
    expect(recipeLink.getAttribute("href")).toContain("type%3Dmy_added");
    expect(recipeLink.getAttribute("href")).toContain("restore=recipebook-tab");
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

  it("keeps recipebook management inside the tab system without a breadcrumb back button", async () => {
    render(
      <MypageScreen
        initialActiveTab="recipebooks"
        initialAuthenticated
        initialMobileSurface="recipebook"
      />,
    );
    const user = userEvent.setup();

    await screen.findByTestId("recipebook-tab");
    expect(screen.queryByRole("navigation", { name: "레시피북 경로" })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "저장한 레시피" }));
    expect(await screen.findByText("저장된 된장찌개")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "레시피북" })).toBeNull();
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
    expect(await screen.findByText("4/30~5/6")).toBeTruthy();
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

    expect(await screen.findByText("4/30~5/6")).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "장보기 기록" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });
});
