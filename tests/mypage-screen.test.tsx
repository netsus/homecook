// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MypageScreen } from "@/components/mypage/mypage-screen";

const mockFetchUserProfile = vi.fn();
const mockFetchRecipeBooks = vi.fn();
const mockCreateRecipeBook = vi.fn();
const mockRenameRecipeBook = vi.fn();
const mockDeleteRecipeBook = vi.fn();
const mockFetchShoppingHistory = vi.fn();

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: (...args: unknown[]) => mockFetchUserProfile(...args),
  fetchRecipeBooks: (...args: unknown[]) => mockFetchRecipeBooks(...args),
  createRecipeBook: (...args: unknown[]) => mockCreateRecipeBook(...args),
  renameRecipeBook: (...args: unknown[]) => mockRenameRecipeBook(...args),
  deleteRecipeBook: (...args: unknown[]) => mockDeleteRecipeBook(...args),
  fetchShoppingHistory: (...args: unknown[]) => mockFetchShoppingHistory(...args),
  isMypageApiError: (error: unknown) => error instanceof Error && "status" in error,
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
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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
      title: "4/30 장보기",
      date_range_start: "2026-04-30",
      date_range_end: "2026-05-06",
      is_completed: true,
      item_count: 12,
      created_at: "2026-04-30T00:00:00Z",
    },
    {
      id: "list-2",
      title: "4/23 장보기",
      date_range_start: "2026-04-23",
      date_range_end: "2026-04-29",
      is_completed: false,
      item_count: 8,
      created_at: "2026-04-23T00:00:00Z",
    },
  ],
  next_cursor: null,
  has_next: false,
};

describe("MypageScreen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockFetchUserProfile.mockReset();
    mockFetchRecipeBooks.mockReset();
    mockCreateRecipeBook.mockReset();
    mockRenameRecipeBook.mockReset();
    mockDeleteRecipeBook.mockReset();
    mockFetchShoppingHistory.mockReset();

    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockFetchRecipeBooks.mockResolvedValue(MOCK_BOOKS);
    mockFetchShoppingHistory.mockResolvedValue(MOCK_SHOPPING_HISTORY);
  });

  it("shows the unauthorized gate when not authenticated", () => {
    render(<MypageScreen initialAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByText(/마이페이지로 바로 복귀/)).toBeTruthy();
  });

  it("shows profile and recipe books when authenticated", async () => {
    render(<MypageScreen initialAuthenticated />);

    expect(await screen.findByText("집밥러")).toBeTruthy();
    expect(screen.getByText("카카오 로그인")).toBeTruthy();
    expect(screen.getByTestId("mypage-profile")).toBeTruthy();

    expect(screen.getByText("내가 추가한 레시피")).toBeTruthy();
    expect(screen.getByText("저장한 레시피")).toBeTruthy();
    expect(screen.getByText("좋아요한 레시피")).toBeTruthy();
    expect(screen.getByText("주말 파티")).toBeTruthy();
  });

  it("displays system books with correct recipe counts", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const myAddedCard = screen.getByTestId("system-book-my_added");
    expect(myAddedCard.textContent).toContain("3");

    const savedCard = screen.getByTestId("system-book-saved");
    expect(savedCard.textContent).toContain("5");

    const likedCard = screen.getByTestId("system-book-liked");
    expect(likedCard.textContent).toContain("10");
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
  });

  it("shows empty state message when no custom books exist", async () => {
    mockFetchRecipeBooks.mockResolvedValue({
      books: MOCK_BOOKS.books.filter((b) => b.book_type !== "custom"),
    });

    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");
    expect(screen.getByText("아직 만든 레시피북이 없어요")).toBeTruthy();
  });

  it("system books do not show a context menu button", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const systemBookCard = screen.getByTestId("system-book-my_added");
    expect(systemBookCard.querySelector("[aria-haspopup='menu']")).toBeNull();
  });

  it("custom books show a context menu with rename and delete", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("주말 파티");

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

    await screen.findByText("주말 파티");

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

    await screen.findByText("주말 파티");

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

    await screen.findByText("주말 파티");

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

    await screen.findByText("집밥러");

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

    await screen.findByText("집밥러");

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "장보기 기록" }));

    expect(await screen.findByText("4/30 장보기")).toBeTruthy();
    expect(screen.getByText("4/23 장보기")).toBeTruthy();
    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.getByText("진행 중")).toBeTruthy();
    expect(screen.getByText(/12개 항목/)).toBeTruthy();
  });

  it("shows empty shopping history state with planner link", async () => {
    mockFetchShoppingHistory.mockResolvedValue({
      items: [],
      next_cursor: null,
      has_next: false,
    });

    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "장보기 기록" }));

    expect(await screen.findByText("저장된 장보기 기록이 없어요")).toBeTruthy();
    expect(screen.getByText("플래너로 이동")).toBeTruthy();
  });

  it("shows the tab bar with proper ARIA roles", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.getByRole("tablist")).toBeTruthy();
    const recipebookTab = screen.getByRole("tab", { name: "레시피북" });
    const shoppingTab = screen.getByRole("tab", { name: "장보기 기록" });

    expect(recipebookTab.getAttribute("aria-selected")).toBe("true");
    expect(shoppingTab.getAttribute("aria-selected")).toBe("false");
  });

  it("renders profile image with fallback initial when no image URL", async () => {
    mockFetchUserProfile.mockResolvedValue({
      ...MOCK_PROFILE,
      profile_image_url: null,
    });

    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    expect(screen.queryByRole("img")).toBeNull();
    const avatar = screen.getByTestId("profile-fallback-avatar");
    expect(avatar.textContent).toBe("집");
  });

  it("links system book cards to recipe-books detail page", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const myAddedCard = screen.getByTestId("system-book-my_added");
    expect(myAddedCard.getAttribute("href")).toBe("/recipe-books/book-my");
  });

  it("links shopping history cards to shopping detail page", async () => {
    render(<MypageScreen initialAuthenticated />);

    await screen.findByText("집밥러");

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "장보기 기록" }));

    const card = await screen.findByTestId("shopping-card-list-1");
    expect(card.getAttribute("href")).toBe("/shopping/lists/list-1");
  });
});
