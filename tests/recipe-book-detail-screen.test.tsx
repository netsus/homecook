// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeBookDetailScreen } from "@/components/recipebook/recipebook-detail-screen";

const mockFetchRecipeBookRecipes = vi.fn();
const mockFetchRecipeBookRecipeDetail = vi.fn();
const mockRemoveRecipeBookRecipe = vi.fn();
const mockRenameRecipeBook = vi.fn();
const mockDeleteRecipeBook = vi.fn();
const mockFetchSaveableRecipeBooks = vi.fn();
const mockCreateCustomRecipeBook = vi.fn();
const mockSaveRecipeToBooks = vi.fn();
const mockRemoveRecipeFromBook = vi.fn();
const mockFetchPlanner = vi.fn();
const mockCreateMeal = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipeBookRecipes: (...args: unknown[]) =>
    mockFetchRecipeBookRecipes(...args),
  fetchRecipeBookRecipeDetail: (...args: unknown[]) =>
    mockFetchRecipeBookRecipeDetail(...args),
  removeRecipeBookRecipe: (...args: unknown[]) =>
    mockRemoveRecipeBookRecipe(...args),
}));

vi.mock("@/lib/api/mypage", () => ({
  renameRecipeBook: (...args: unknown[]) => mockRenameRecipeBook(...args),
  deleteRecipeBook: (...args: unknown[]) => mockDeleteRecipeBook(...args),
}));

vi.mock("@/lib/api/recipe-save", () => ({
  fetchSaveableRecipeBooks: (...args: unknown[]) =>
    mockFetchSaveableRecipeBooks(...args),
  createCustomRecipeBook: (...args: unknown[]) =>
    mockCreateCustomRecipeBook(...args),
  saveRecipeToBooks: (...args: unknown[]) => mockSaveRecipeToBooks(...args),
  removeRecipeFromBook: (...args: unknown[]) =>
    mockRemoveRecipeFromBook(...args),
}));

vi.mock("@/lib/api/planner", () => ({
  fetchPlanner: (...args: unknown[]) => mockFetchPlanner(...args),
}));

vi.mock("@/lib/api/meal", () => ({
  createMeal: (...args: unknown[]) => mockCreateMeal(...args),
  isMealApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
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

const MOCK_ITEMS = {
  success: true,
  data: {
    items: [
      {
        recipe_id: "recipe-1",
        title: "된장찌개",
        thumbnail_url: "https://example.com/img1.jpg",
        tags: ["한식", "찌개"],
        base_servings: 2,
        added_at: "2026-04-30T09:00:00.000Z",
      },
      {
        recipe_id: "recipe-2",
        title: "김치볶음밥",
        thumbnail_url: null,
        tags: ["한식"],
        base_servings: 1,
        added_at: "2026-04-29T09:00:00.000Z",
      },
    ],
    next_cursor: null,
    has_next: false,
  },
  error: null,
};

const MOCK_EMPTY = {
  success: true,
  data: {
    items: [],
    next_cursor: null,
    has_next: false,
  },
  error: null,
};

const MOCK_READER_DETAILS = {
  "recipe-1": {
    recipe_id: "recipe-1",
    title: "된장찌개",
    thumbnail_url: "https://example.com/img1.jpg",
    tags: ["한식", "찌개"],
    view_count: 12,
    total_duration_seconds: 1500,
    total_duration_text: "25분",
    base_servings: 2,
    added_at: "2026-04-30T09:00:00.000Z",
    ingredients: [
      {
        id: "ingredient-1",
        ingredient_id: "tofu",
        standard_name: "두부",
        amount: 1,
        unit: "모",
        ingredient_type: "QUANT" as const,
        display_text: "두부 1모",
        component_label: null,
        scalable: true,
        sort_order: 0,
      },
    ],
    steps: [
      {
        id: "step-1",
        step_number: 1,
        instruction: "냄비에 물과 된장을 넣고 끓인다.",
        component_label: null,
        cooking_method: null,
        ingredients_used: [],
        heat_level: null,
        duration_seconds: 90,
        duration_text: "1분 30초",
      },
    ],
  },
  "recipe-2": {
    recipe_id: "recipe-2",
    title: "김치볶음밥",
    thumbnail_url: null,
    tags: ["한식"],
    view_count: 8,
    total_duration_seconds: 900,
    total_duration_text: "15분",
    base_servings: 1,
    added_at: "2026-04-29T09:00:00.000Z",
    ingredients: [
      {
        id: "ingredient-2",
        ingredient_id: "kimchi",
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT" as const,
        display_text: "김치 200g",
        component_label: null,
        scalable: true,
        sort_order: 0,
      },
    ],
    steps: [
      {
        id: "step-2",
        step_number: 1,
        instruction: "밥과 김치를 센 불에 볶는다.",
        component_label: null,
        cooking_method: null,
        ingredients_used: [],
        heat_level: "강",
        duration_seconds: 180,
        duration_text: "3분",
      },
    ],
  },
};

describe("RecipeBookDetailScreen", () => {
  let originalIntersectionObserver: typeof globalThis.IntersectionObserver | undefined;
  let triggerIntersection: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    globalThis.IntersectionObserver = originalIntersectionObserver!;
    triggerIntersection = null;
    Reflect.deleteProperty(window, "matchMedia");
  });

  beforeEach(() => {
    installMatchMedia(false);
    originalIntersectionObserver = globalThis.IntersectionObserver;
    mockFetchRecipeBookRecipes.mockReset();
    mockFetchRecipeBookRecipeDetail.mockReset();
    mockRemoveRecipeBookRecipe.mockReset();
    mockRenameRecipeBook.mockReset();
    mockDeleteRecipeBook.mockReset();
    mockFetchSaveableRecipeBooks.mockReset();
    mockCreateCustomRecipeBook.mockReset();
    mockSaveRecipeToBooks.mockReset();
    mockRemoveRecipeFromBook.mockReset();
    mockFetchPlanner.mockReset();
    mockCreateMeal.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_ITEMS);
    mockFetchRecipeBookRecipeDetail.mockImplementation(
      (_bookId: string, recipeId: keyof typeof MOCK_READER_DETAILS) =>
        Promise.resolve({
          success: true,
          data: MOCK_READER_DETAILS[recipeId] ?? MOCK_READER_DETAILS["recipe-1"],
          error: null,
        }),
    );
    mockRenameRecipeBook.mockResolvedValue({
      id: "book-custom",
      name: "주말 모임",
      book_type: "custom",
      recipe_count: 2,
      sort_order: 3,
    });
    mockDeleteRecipeBook.mockResolvedValue({ deleted: true });
    mockFetchSaveableRecipeBooks.mockResolvedValue([
      {
        id: "book-saved",
        name: "저장한 레시피",
        book_type: "saved",
        recipe_count: 2,
        sort_order: 1,
      },
      {
        id: "book-custom",
        name: "주말 파티",
        book_type: "custom",
        recipe_count: 1,
        sort_order: 3,
      },
    ]);
    mockCreateCustomRecipeBook.mockResolvedValue({
      id: "book-new",
      name: "새 레시피북",
      book_type: "custom",
      recipe_count: 0,
      sort_order: 4,
    });
    mockSaveRecipeToBooks.mockResolvedValue({ saved_book_ids: ["book-custom"] });
    mockRemoveRecipeFromBook.mockResolvedValue({ removed: true });
    mockFetchPlanner.mockResolvedValue({
      columns: [{ id: "column-dinner", name: "저녁", sort_order: 0 }],
      meals: [],
    });
    mockCreateMeal.mockResolvedValue({ id: "meal-1" });
  });

  // ─── Auth / Gate ────────────────────────────────────────────────────────────

  it("shows login gate when not authenticated", () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByText(/레시피북으로 바로 복귀/)).toBeTruthy();
  });

  // ─── Loading ────────────────────────────────────────────────────────────────

  it("shows loading skeleton initially", () => {
    mockFetchRecipeBookRecipes.mockReturnValue(new Promise(() => {}));

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    const skeleton = screen.getByTestId("recipebook-detail-skeleton");
    expect(skeleton.closest(".web-recipebook-detail-shell")).toBeTruthy();
    expect(screen.getByTestId("recipebook-detail-header")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "레시피북 리더" })).toBeTruthy();
    expect(screen.getByText("불러오는 중")).toBeTruthy();
  });

  it("keeps the first recipe thumbnail as the direct detail cover when no book cover is passed", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(
      screen.getByTestId("recipebook-detail-cover-image").getAttribute("style"),
    ).toContain("img1.jpg");
  });

  it("uses the passed book cover over the first recipe thumbnail", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        bookCoverColorKey="sand"
        bookCoverImageSrc="https://example.com/card-cover.jpg"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(screen.getByTestId("recipebook-detail-cover").className).toContain(
      "web-recipebook-detail-cover-sand",
    );
    expect(
      screen.getByTestId("recipebook-detail-cover-image").getAttribute("style"),
    ).toContain("card-cover.jpg");
  });

  it("uses the mobile loading shell and preserves mypage tab return context", () => {
    installMatchMedia(true);
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        restore: "recipebook-tab",
        returnSurface: "mypage.recipebooks",
        returnTo: "/mypage",
      }),
    );
    mockFetchRecipeBookRecipes.mockReturnValue(new Promise(() => {}));

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    expect(screen.getByTestId("recipebook-detail-mobile-loading")).toBeTruthy();
    expect(screen.getByLabelText("뒤로 가기").getAttribute("href")).toBe(
      "/mypage?returnSurface=mypage.recipebooks&restore=recipebook-tab",
    );
  });

  // ─── Ready with items ───────────────────────────────────────────────────────

  it("displays recipe items when loaded", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    expect(await screen.findByTestId("recipe-item-recipe-1")).toBeTruthy();
    expect(await screen.findByText("두부 1모")).toBeTruthy();
    expect(await screen.findByText("냄비에 물과 된장을 넣고 끓인다.")).toBeTruthy();
    expect(
      within(screen.getByTestId("recipe-item-recipe-1")).getByRole("heading", {
        name: "재료",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("recipe-item-recipe-1")).getByRole("heading", {
        name: "만들기",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("recipe-item-recipe-1")).queryByText(/시간 미정/),
    ).toBeNull();
    expect(
      within(screen.getByTestId("recipe-item-recipe-1")).queryByText(
        /레시피 상세에서 확인할 수 있어요/,
      ),
    ).toBeNull();
    expect(mockFetchRecipeBookRecipeDetail).toHaveBeenCalledWith("book-1", "recipe-1");
    expect(screen.getByTestId("recipebook-detail-header")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "저장한 레시피" })).toBeTruthy();

    const user = userEvent.setup();
    const toc = screen.getByTestId("recipebook-detail-toc");
    expect(toc.closest(".web-recipebook-detail-layout")).toBeTruthy();
    expect(
      screen.getByTestId("recipebook-detail-list").closest(".web-recipebook-detail-main"),
    ).toBeTruthy();
    expect(within(toc).getByRole("heading", { name: "목차" })).toBeTruthy();
    expect(within(toc).getByRole("button", { name: /된장찌개/ })).toBeTruthy();
    expect(screen.getByTestId("recipe-item-recipe-1").id).toBe(
      "recipebook-recipe-recipe-1",
    );
    await user.click(within(toc).getByRole("button", { name: /김치볶음밥/ }));
    expect(await screen.findByTestId("recipe-item-recipe-2")).toBeTruthy();
  });

  it("shows a mobile table of contents before the recipe list", async () => {
    installMatchMedia(true);

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    expect(await screen.findByTestId("recipe-item-recipe-1")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "저장한 레시피" })).toBeTruthy();
    const toc = screen.getByTestId("recipebook-detail-header");
    expect(within(toc).getByText("목차")).toBeTruthy();
    expect(within(toc).queryByRole("heading", { name: "저장한 레시피" })).toBeNull();
    expect(within(toc).queryByText("Page list")).toBeNull();
    expect(within(toc).getByText("저장한 레시피 · 2개 레시피")).toBeTruthy();
    const firstTocButton = within(toc).getByRole("button", { name: /된장찌개/ });
    expect(firstTocButton.getAttribute("aria-current")).toBe("page");
    expect(firstTocButton.className).toContain("mobile-toc-row");
    expect(screen.getByTestId("recipe-item-recipe-1").id).toBe(
      "recipebook-recipe-recipe-1",
    );
    const card = screen.getByTestId("recipe-item-recipe-1");
    expect(await within(card).findByText("두부 1모")).toBeTruthy();
    const noteStack = within(card).getByTestId(
      "mobile-recipebook-note-stack-recipe-1",
    );
    expect(noteStack.className).toContain("grid-cols-1");
    expect(noteStack.className).not.toContain("grid-cols-2");
    const ingredientRow = within(card).getByTestId(
      "reader-ingredient-ingredient-1",
    );
    expect(
      within(ingredientRow).getByTestId("reader-ingredient-marker-ingredient-1"),
    ).toBeTruthy();
    const stepRow = within(card).getByTestId("reader-step-step-1");
    expect(within(stepRow).getByText("1")).toBeTruthy();
    expect(within(stepRow).getByText("냄비에 물과 된장을 넣고 끓인다.")).toBeTruthy();
    expect(within(card).getByText("2인분").className).toContain(
      "mobile-recipebook-detail-meta-badge",
    );
    expect(within(card).getByText("한식").className).toContain(
      "mobile-recipebook-detail-meta-badge",
    );
    expect(within(card).getByText("찌개").className).toContain(
      "mobile-recipebook-detail-meta-badge",
    );
    expect(within(card).queryByText(/조회/)).toBeNull();
    expect(within(card).queryByText("25분")).toBeNull();
    expect(screen.getByTestId("recipebook-detail-list").className).toContain(
      "pb-[calc(128px+env(safe-area-inset-bottom))]",
    );
    expect(within(card).getByRole("button", { name: "저장하기" })).toBeTruthy();
    expect(within(card).getByRole("link", { name: "요리하기" })).toBeTruthy();
    expect(within(card).getByRole("button", { name: "플래너에 추가" })).toBeTruthy();
    expect(
      within(card).getByRole("button", { name: "된장찌개 제거" }).className,
    ).toContain("mobile-recipebook-recipe-remove-icon");

    expect(within(toc).queryByRole("button", { name: "책" })).toBeNull();
    expect(
      within(screen.getByTestId("recipebook-detail-mobile")).getByRole("group", {
        name: "상세 보기 방식",
      }),
    ).toBeTruthy();
    expect(
      screen.getByTestId("recipebook-mobile-toc-card-recipe-1").className,
    ).toContain("mobile-toc-row");

    await userEvent.click(screen.getByRole("button", { name: "목록" }));
    const listCard = await screen.findByTestId("recipebook-mobile-list-card-recipe-2");
    expect(within(listCard).getByRole("heading", { name: "김치볶음밥" })).toBeTruthy();
    expect(within(listCard).queryByRole("heading", { name: "재료" })).toBeNull();
    expect(within(listCard).queryByRole("heading", { name: "만들기" })).toBeNull();
    expect(within(listCard).queryByText("김치 200g")).toBeNull();
    expect(screen.queryByRole("button", { name: "된장찌개 제거" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "책" }));
    expect(screen.queryByTestId("recipe-item-recipe-2")).toBeNull();
  });

  it("shows no book-level rename/delete menu for system books", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-saved"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(screen.queryByLabelText("저장한 레시피 옵션 메뉴")).toBeNull();
  });

  it("opens the save modal directly from a reader recipe card", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-saved"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    const card = await screen.findByTestId("recipe-item-recipe-1");
    const user = userEvent.setup();

    await user.click(within(card).getByRole("button", { name: "저장하기" }));

    expect(
      await screen.findByRole("dialog", { name: "레시피 저장" }),
    ).toBeTruthy();
    expect(mockFetchSaveableRecipeBooks).toHaveBeenCalled();
  });

  it("opens the planner modal directly from a reader recipe card", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-saved"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    const card = await screen.findByTestId("recipe-item-recipe-1");
    const user = userEvent.setup();

    await user.click(within(card).getByRole("button", { name: "플래너에 추가" }));

    expect(
      await screen.findByRole("dialog", { name: "플래너에 추가" }),
    ).toBeTruthy();
    expect(mockFetchPlanner).toHaveBeenCalled();
  });

  it("renames a custom book from the book-level menu", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-custom"
        bookName="주말 파티"
        bookType="custom"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("주말 파티 옵션 메뉴"));
    await user.click(screen.getByRole("menuitem", { name: "이름 변경" }));

    const input = screen.getByDisplayValue("주말 파티");
    await user.clear(input);
    await user.type(input, "주말 모임");
    await user.click(screen.getByRole("button", { name: "완료" }));

    await waitFor(() => {
      expect(mockRenameRecipeBook).toHaveBeenCalledWith(
        "book-custom",
        "주말 모임",
      );
    });

    expect(await screen.findByText("레시피북 이름을 변경했어요")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "주말 모임" })).toBeTruthy();
  });

  it("deletes a custom book from the book-level menu and returns to mypage", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-custom"
        bookName="주말 파티"
        bookType="custom"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("주말 파티 옵션 메뉴"));
    await user.click(screen.getByRole("menuitem", { name: "삭제" }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }),
    );

    await waitFor(() => {
      expect(mockDeleteRecipeBook).toHaveBeenCalledWith("book-custom");
      expect(mockRouterReplace).toHaveBeenCalledWith("/mypage");
    });
  });

  it("links recipe cook actions to standalone cook mode and returns through recipe detail", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-my"
        bookName="내가 추가한 레시피"
        bookType="my_added"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const card1 = screen.getByTestId("recipe-item-recipe-1");
    const link = within(card1).getByRole("link", { name: "요리하기" });
    const href = link?.getAttribute("href") ?? "";
    expect(link).toBeTruthy();
    expect(href).toContain(
      "/cooking/recipes/recipe-1/cook-mode?servings=2",
    );
    const cookUrl = new URL(href, "https://homecook.test");
    expect(cookUrl.searchParams.get("returnSurface")).toBe("recipe.detail");
    const recipeReturnUrl = new URL(
      cookUrl.searchParams.get("returnTo") ?? "",
      "https://homecook.test",
    );
    expect(recipeReturnUrl.pathname).toBe("/recipe/recipe-1");
    expect(recipeReturnUrl.searchParams.get("returnTo")).toContain(
      "/mypage/recipe-books/book-my",
    );
    expect(recipeReturnUrl.searchParams.get("returnTo")).toContain("type=my_added");
    expect(recipeReturnUrl.searchParams.get("restore")).toBe("recipebook-tab");
  });

  // ─── Empty ──────────────────────────────────────────────────────────────────

  it("shows empty state when no items", async () => {
    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_EMPTY);

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    expect(
      await screen.findByText("아직 이 레시피북에 레시피가 없어요"),
    ).toBeTruthy();
    expect(screen.getByTestId("recipebook-detail-header")).toBeTruthy();
    expect(
      screen.getByText("저장한 레시피 · 왼쪽 목차와 오른쪽 책 페이지로 레시피를 읽어요."),
    ).toBeTruthy();
    expect(
      screen
        .getByText("아직 이 레시피북에 레시피가 없어요")
        .closest(".web-recipebook-detail-shell"),
    ).toBeTruthy();
  });

  it("keeps newly created custom empty books on the desktop detail frame", async () => {
    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_EMPTY);

    render(
      <RecipeBookDetailScreen
        bookId="book-custom"
        bookName="새 레시피북"
        bookType="custom"
        initialAuthenticated
      />,
    );

    expect(await screen.findByText("아직 이 레시피북에 레시피가 없어요")).toBeTruthy();
    expect(screen.getByTestId("recipebook-detail-header")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "새 레시피북 옵션 메뉴" }));
    expect(screen.getByRole("menuitem", { name: "이름 변경" })).toBeTruthy();
    expect(
      screen
        .getByText("새 레시피북 · 왼쪽 목차와 오른쪽 책 페이지로 레시피를 읽어요.")
        .closest(".web-recipebook-detail-shell"),
    ).toBeTruthy();
  });

  // ─── Error ──────────────────────────────────────────────────────────────────

  it("shows error state and retries on failure", async () => {
    mockFetchRecipeBookRecipes.mockResolvedValueOnce({
      success: false,
      data: null,
      error: { code: "FETCH_ERROR", message: "fail", fields: [] },
    });

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    expect(await screen.findByText("fail")).toBeTruthy();

    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_ITEMS);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByTestId("recipe-item-recipe-1")).toBeTruthy();
  });

  it("shows a not found error instead of the empty state for missing books", async () => {
    mockFetchRecipeBookRecipes.mockResolvedValueOnce({
      success: false,
      data: null,
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "레시피북을 찾을 수 없어요.",
        fields: [],
      },
    });

    render(
      <RecipeBookDetailScreen
        bookId="missing-book"
        bookName="없는 레시피북"
        bookType="saved"
        initialAuthenticated
      />,
    );

    const errorHeading = await screen.findByText("레시피북을 찾을 수 없어요.");
    expect(errorHeading).toBeTruthy();
    expect(screen.getByTestId("recipebook-detail-header")).toBeTruthy();
    expect(errorHeading.closest(".web-recipebook-detail-shell")).toBeTruthy();
    expect(screen.queryByText("아직 이 레시피북에 레시피가 없어요")).toBeNull();
  });

  it("loads the next page without duplicating recipes", async () => {
    mockFetchRecipeBookRecipes
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [
            {
              recipe_id: "recipe-1",
              title: "된장찌개",
              thumbnail_url: null,
              tags: ["한식"],
              added_at: "2026-04-30T09:00:00.000Z",
            },
            {
              recipe_id: "recipe-2",
              title: "김치볶음밥",
              thumbnail_url: null,
              tags: ["한식"],
              added_at: "2026-04-29T09:00:00.000Z",
            },
          ],
          next_cursor: "cursor-1",
          has_next: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [
            {
              recipe_id: "recipe-2",
              title: "김치볶음밥",
              thumbnail_url: null,
              tags: ["한식"],
              added_at: "2026-04-29T09:00:00.000Z",
            },
            {
              recipe_id: "recipe-3",
              title: "비빔국수",
              thumbnail_url: null,
              tags: ["면"],
              added_at: "2026-04-28T09:00:00.000Z",
            },
          ],
          next_cursor: null,
          has_next: false,
        },
        error: null,
      });

    class MockIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];

      constructor(callback: IntersectionObserverCallback) {
        triggerIntersection = () => {
          callback([{ isIntersecting: true } as IntersectionObserverEntry], this);
        };
      }

      disconnect = vi.fn();
      observe = vi.fn();
      takeRecords = vi.fn(() => []);
      unobserve = vi.fn();
    }

    globalThis.IntersectionObserver = MockIntersectionObserver;

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    expect(await screen.findByTestId("recipe-item-recipe-1")).toBeTruthy();
    await waitFor(() => {
      expect(triggerIntersection).toBeTruthy();
    });

    triggerIntersection?.();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "목록" }));
    expect(await screen.findByTestId("recipe-item-recipe-3")).toBeTruthy();
    expect(
      within(screen.getByTestId("recipebook-detail-list")).getAllByText(
        "김치볶음밥",
      ),
    ).toHaveLength(1);
    expect(mockFetchRecipeBookRecipes).toHaveBeenLastCalledWith("book-1", {
      cursor: "cursor-1",
      limit: 20,
    });
  });

  // ─── Remove button visibility ──────────────────────────────────────────────

  it("shows remove button for saved books with label '제거'", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(screen.getByRole("button", { name: "된장찌개 제거" }).className).toContain(
      "web-recipebook-recipe-remove-icon",
    );
    const user = userEvent.setup();
    const pageDots = screen.getByRole("group", { name: "페이지 선택" });
    await user.click(within(pageDots).getByRole("button", { name: "02쪽" }));
    expect(screen.getByRole("button", { name: "김치볶음밥 제거" }).className).toContain(
      "web-recipebook-recipe-remove-icon",
    );
  });

  it("shows remove button for liked books with label '좋아요 해제'", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-liked"
        bookName="좋아요한 레시피"
        bookType="liked"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(
      screen.getByRole("button", { name: "된장찌개 좋아요 해제" }).className,
    ).toContain("web-recipebook-recipe-remove-icon");
    const user = userEvent.setup();
    const pageDots = screen.getByRole("group", { name: "페이지 선택" });
    await user.click(within(pageDots).getByRole("button", { name: "02쪽" }));
    expect(
      screen.getByRole("button", { name: "김치볶음밥 좋아요 해제" }).className,
    ).toContain("web-recipebook-recipe-remove-icon");
  });

  it("hides remove button for my_added books", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-my"
        bookName="내가 추가한 레시피"
        bookType="my_added"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const removeButtons = screen.queryAllByRole("button", {
      name: /제거|좋아요 해제/,
    });
    expect(removeButtons.length).toBe(0);
  });

  // ─── Remove action ─────────────────────────────────────────────────────────

  it("removes item optimistically and shows success toast", async () => {
    mockRemoveRecipeBookRecipe.mockResolvedValue({
      success: true,
      data: { deleted: true },
      error: null,
    });

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    const removeBtn = screen.getByLabelText("된장찌개 제거");
    await user.click(removeBtn);
    expect(screen.getByRole("alertdialog", { name: "레시피를 제거할까요?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "제거" }));

    // Optimistic: item removed after confirming
    await waitFor(() => {
      expect(screen.queryByTestId("recipe-item-recipe-1")).toBeNull();
    });

    // Toast shows
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("레시피를 제거했어요")).toBeTruthy();

    expect(mockRemoveRecipeBookRecipe).toHaveBeenCalledWith(
      "book-1",
      "recipe-1",
    );
  });

  it("shows liked-specific toast when removing from liked book", async () => {
    mockRemoveRecipeBookRecipe.mockResolvedValue({
      success: true,
      data: { deleted: true },
      error: null,
    });

    render(
      <RecipeBookDetailScreen
        bookId="book-liked"
        bookName="좋아요한 레시피"
        bookType="liked"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    const removeBtn = screen.getByLabelText("된장찌개 좋아요 해제");
    await user.click(removeBtn);
    expect(screen.getByRole("alertdialog", { name: "레시피를 제거할까요?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "좋아요 해제" }));

    await waitFor(() => {
      expect(screen.getByText("좋아요를 해제했어요")).toBeTruthy();
    });
  });

  it("clears the pending toast timer on unmount", async () => {
    mockRemoveRecipeBookRecipe.mockResolvedValue({
      success: true,
      data: { deleted: true },
      error: null,
    });

    const { unmount } = render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("된장찌개 제거"));
    await user.click(screen.getByRole("button", { name: "제거" }));

    await waitFor(() => {
      expect(screen.getByText("레시피를 제거했어요")).toBeTruthy();
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it("rolls back item on remove failure", async () => {
    mockRemoveRecipeBookRecipe.mockResolvedValue({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", message: "서버 오류", fields: [] },
    });

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    const removeBtn = screen.getByLabelText("된장찌개 제거");
    await user.click(removeBtn);
    expect(screen.getByRole("alertdialog", { name: "레시피를 제거할까요?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "제거" }));

    // Wait for rollback
    await waitFor(() => {
      expect(screen.getByTestId("recipe-item-recipe-1")).toBeTruthy();
    });

    expect(screen.getByText("서버 오류")).toBeTruthy();
  });

  it("transitions to empty state after removing last item", async () => {
    mockFetchRecipeBookRecipes.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            recipe_id: "recipe-1",
            title: "된장찌개",
            thumbnail_url: null,
            tags: [],
            added_at: "2026-04-30T09:00:00.000Z",
          },
        ],
        next_cursor: null,
        has_next: false,
      },
      error: null,
    });
    mockRemoveRecipeBookRecipe.mockResolvedValue({
      success: true,
      data: { deleted: true },
      error: null,
    });

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("된장찌개 제거"));
    expect(screen.getByRole("alertdialog", { name: "레시피를 제거할까요?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "제거" }));

    expect(
      await screen.findByText("아직 이 레시피북에 레시피가 없어요"),
    ).toBeTruthy();
  });

  // ─── Header / Web navigation ───────────────────────────────────────────────

  it("shows the desktop reader header with the shared global navigation", async () => {
    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    const header = screen.getByTestId("recipebook-detail-header");
    expect(header).toBeTruthy();
    expect(within(header).getByRole("heading", { name: "레시피북 리더" })).toBeTruthy();
    expect(within(header).getByText(/저장한 레시피/)).toBeTruthy();
    const globalNav = screen.getByRole("navigation", { name: "데스크탑 주요 메뉴" });
    expect(globalNav).toBeTruthy();
    expect(
      within(globalNav).getByRole("link", { name: "마이페이지" }).getAttribute("aria-current"),
    ).toBe("page");
    expect(screen.queryByLabelText("뒤로 가기")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "레시피북 경로" })).toBeNull();
  });

  it("does not render the old desktop breadcrumb even with mypage return context", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        restore: "recipebook-tab",
        returnSurface: "mypage.recipebooks",
        returnTo: "/mypage",
      }),
    );

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(screen.queryByLabelText("뒤로 가기")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "레시피북 경로" })).toBeNull();
  });

  it("keeps stale return context out of the removed desktop breadcrumb", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        restore: "recipebook-tab",
        returnSurface: "mypage.recipebooks",
        returnTo: "/mypage/recipe-books/older-book?type=liked&name=좋아요한 레시피",
      }),
    );

    render(
      <RecipeBookDetailScreen
        bookId="book-1"
        bookName="저장한 레시피"
        bookType="saved"
        initialAuthenticated
      />,
    );

    await screen.findByTestId("recipe-item-recipe-1");

    expect(screen.queryByLabelText("뒤로 가기")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "레시피북 경로" })).toBeNull();
  });
});
