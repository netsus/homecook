// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeBookDetailScreen } from "@/components/recipebook/recipebook-detail-screen";

const mockFetchRecipeBookRecipes = vi.fn();
const mockRemoveRecipeBookRecipe = vi.fn();
const mockRenameRecipeBook = vi.fn();
const mockDeleteRecipeBook = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipeBookRecipes: (...args: unknown[]) =>
    mockFetchRecipeBookRecipes(...args),
  removeRecipeBookRecipe: (...args: unknown[]) =>
    mockRemoveRecipeBookRecipe(...args),
}));

vi.mock("@/lib/api/mypage", () => ({
  renameRecipeBook: (...args: unknown[]) => mockRenameRecipeBook(...args),
  deleteRecipeBook: (...args: unknown[]) => mockDeleteRecipeBook(...args),
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
    mockRemoveRecipeBookRecipe.mockReset();
    mockRenameRecipeBook.mockReset();
    mockDeleteRecipeBook.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    mockFetchRecipeBookRecipes.mockResolvedValue(MOCK_ITEMS);
    mockRenameRecipeBook.mockResolvedValue({
      id: "book-custom",
      name: "주말 모임",
      book_type: "custom",
      recipe_count: 2,
      sort_order: 3,
    });
    mockDeleteRecipeBook.mockResolvedValue({ deleted: true });
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
    expect(screen.getByText("레시피를 불러오는 중")).toBeTruthy();
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
    expect(screen.getByTestId("recipe-item-recipe-2")).toBeTruthy();
    expect(within(screen.getByTestId("recipe-item-recipe-1")).getByText("한식 · 찌개")).toBeTruthy();
    expect(screen.getByTestId("recipebook-detail-header")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "저장한 레시피" })).toBeTruthy();

    const toc = screen.getByTestId("recipebook-detail-toc");
    expect(within(toc).getByRole("heading", { name: "목차" })).toBeTruthy();
    const firstTocLink = within(toc).getByRole("link", { name: /된장찌개/ });
    expect(firstTocLink.getAttribute("href")).toBe("#recipebook-recipe-recipe-1");
    expect(screen.getByTestId("recipe-item-recipe-1").id).toBe(
      "recipebook-recipe-recipe-1",
    );
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

    expect(screen.getAllByRole("heading", { name: "목차" }).length).toBeGreaterThan(0);
    const toc = screen.getByTestId("recipebook-detail-header");
    expect(within(toc).getByText("저장한 레시피 · 2개 레시피")).toBeTruthy();
    const firstTocLink = within(toc).getByRole("link", { name: /된장찌개/ });
    expect(firstTocLink.getAttribute("href")).toBe("#recipebook-recipe-recipe-1");
    expect(screen.getByTestId("recipe-item-recipe-1").id).toBe(
      "recipebook-recipe-recipe-1",
    );
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

  it("links recipe cards to RECIPE_DETAIL with the current book as the return target", async () => {
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
    const link = card1.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.getAttribute("href")).toContain("/recipe/recipe-1?");
    expect(link?.getAttribute("href")).toContain(
      "returnTo=%2Fmypage%2Frecipe-books%2Fbook-my",
    );
    expect(link?.getAttribute("href")).toContain("type%3Dmy_added");
    expect(link?.getAttribute("href")).toContain("restore=recipebook-tab");
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
    expect(screen.getByText("대표 0개 레시피 · 전체 0개")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "이름 변경" })).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "새 레시피북" })
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

    const removeButtons = screen.getAllByRole("button", { name: /제거/ });
    expect(removeButtons.length).toBe(2);
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

    const removeButtons = screen.getAllByRole("button", {
      name: /좋아요 해제/,
    });
    expect(removeButtons.length).toBe(2);
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

    // Optimistic: item removed immediately
    await waitFor(() => {
      expect(screen.queryByText("된장찌개")).toBeNull();
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

    await waitFor(() => {
      expect(screen.getByText("좋아요를 해제했어요")).toBeTruthy();
    });
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

    expect(
      await screen.findByText("아직 이 레시피북에 레시피가 없어요"),
    ).toBeTruthy();
  });

  // ─── Header / Back link ─────────────────────────────────────────────────────

  it("shows header with book name and back link to mypage", async () => {
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

    const backLink = screen.getByLabelText("뒤로 가기");
    expect(backLink.getAttribute("href")).toBe("/mypage");
  });

  it("preserves mypage recipebook return context in the desktop breadcrumb", async () => {
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

    const backLink = screen.getByLabelText("뒤로 가기");
    expect(backLink.getAttribute("href")).toBe(
      "/mypage?returnSurface=mypage.recipebooks&restore=recipebook-tab",
    );
  });

  it("ignores stale return context in the desktop mypage breadcrumb", async () => {
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

    const backLink = screen.getByLabelText("뒤로 가기");
    expect(backLink.getAttribute("href")).toBe("/mypage");
  });
});
