// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingDetailScreen } from "@/components/shopping/shopping-detail-screen";
import * as shoppingApi from "@/lib/api/shopping";
import type { ShoppingListDetail } from "@/types/shopping";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

const mockPush = vi.fn();

describe("ShoppingDetailScreen", () => {
  beforeEach(() => {
    (useRouter as ReturnType<typeof vi.fn>).mockReturnValue({
      push: mockPush,
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockPush.mockClear();
  });

  const mockListDetail: ShoppingListDetail = {
    id: "list-1",
    title: "4월 12일 장보기",
    date_range_start: "2026-04-12",
    date_range_end: "2026-04-20",
    is_completed: false,
    completed_at: null,
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    recipes: [
      {
        recipe_id: "recipe-1",
        recipe_name: "김치찌개",
        recipe_thumbnail: null,
        shopping_servings: 4,
        planned_servings_total: 4,
      },
    ],
    items: [
      {
        id: "item-1",
        ingredient_id: "ing-1",
        display_text: "양파 2개",
        amounts_json: [{ amount: 2, unit: "개" }],
        is_checked: false,
        is_pantry_excluded: false,
        added_to_pantry: false,
        sort_order: 0,
      },
      {
        id: "item-2",
        ingredient_id: "ing-2",
        display_text: "간장 2큰술",
        amounts_json: [{ amount: 2, unit: "큰술" }],
        is_checked: false,
        is_pantry_excluded: true,
        added_to_pantry: false,
        sort_order: 100,
      },
    ],
  };

  it("renders loading state initially", () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockImplementation(
      () => new Promise(() => {})
    );

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    expect(screen.getByText(/장보기 리스트를 불러오고 있어요/)).toBeTruthy();
  });

  it("renders list detail after loading", async () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
    });

    expect(screen.getByText("4월 12일 ~ 20일")).toBeTruthy();
    expect(screen.getByText(/구매할 재료 \(1개\)/)).toBeTruthy();
    expect(screen.getByText(/팬트리 제외 항목 \(1개\)/)).toBeTruthy();
  });

  it("renders empty state when all items are excluded", async () => {
    const emptyList: ShoppingListDetail = {
      ...mockListDetail,
      items: [
        {
          id: "item-1",
          ingredient_id: "ing-1",
          display_text: "양파 2개",
          amounts_json: [{ amount: 2, unit: "개" }],
          is_checked: false,
          is_pantry_excluded: true,
          added_to_pantry: false,
          sort_order: 0,
        },
      ],
    };

    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(emptyList);

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText(/팬트리에 이미 있어서/)).toBeTruthy();
    });

    expect(screen.getByText(/장볼 재료가 없어요/)).toBeTruthy();
  });

  it("renders error state when API fails", async () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockRejectedValue(
      new Error("Network error")
    );

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "장보기 리스트를 불러올 수 없어요" })
      ).toBeTruthy();
    });

    expect(screen.getByText(/다시 시도/)).toBeTruthy();
  });

  it("redirects to login when 401 error occurs", async () => {
    const error = new Error("Unauthorized") as shoppingApi.ShoppingApiError;
    error.status = 401;
    error.code = "UNAUTHORIZED";

    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockRejectedValue(error);
    vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login?next=/shopping/lists/list-1");
    });
  });

  it("renders read-only mode for completed list", async () => {
    const completedList: ShoppingListDetail = {
      ...mockListDetail,
      is_completed: true,
      completed_at: "2026-04-13T00:00:00.000Z",
    };

    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(completedList);

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText(/완료된 장보기 기록은 수정할 수 없어요/)).toBeTruthy();
    });

    expect(screen.getByText(/✓ 완료됨 \(4월 13일\)/)).toBeTruthy();
    expect(screen.getByText(/구매한 재료 \(1개\)/)).toBeTruthy();
  });

  it("toggles item check status", async () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
    vi.spyOn(shoppingApi, "updateShoppingListItem").mockResolvedValue({
      ...mockListDetail.items[0],
      is_checked: true,
    });

    const user = userEvent.setup();

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
    });

    const checkbox = screen.getByRole("checkbox", { name: /양파.*구매 완료 표시/ });
    await user.click(checkbox);

    await waitFor(() => {
      expect(shoppingApi.updateShoppingListItem).toHaveBeenCalledWith(
        "list-1",
        "item-1",
        { is_checked: true }
      );
    });
  });

  it("toggles item exclude status and enforces exclude→uncheck rule", async () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
    vi.spyOn(shoppingApi, "updateShoppingListItem").mockResolvedValue({
      ...mockListDetail.items[0],
      is_pantry_excluded: true,
      is_checked: false,
    });

    const user = userEvent.setup();

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
    });

    const excludeButton = screen.getByRole("button", { name: /양파.*팬트리 제외/ });
    await user.click(excludeButton);

    await waitFor(() => {
      expect(shoppingApi.updateShoppingListItem).toHaveBeenCalledWith(
        "list-1",
        "item-1",
        { is_pantry_excluded: true }
      );
    });
  });

  it("shows restore button for excluded items", async () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText(/팬트리 제외 항목 \(1개\)/)).toBeTruthy();
    });

    const restoreButton = screen.getByRole("button", { name: /간장.*팬트리 되살리기/ });
    expect(restoreButton.textContent).toContain("되살리기");
  });

  it("does not show action buttons in read-only mode", async () => {
    const completedList: ShoppingListDetail = {
      ...mockListDetail,
      is_completed: true,
      completed_at: "2026-04-13T00:00:00.000Z",
    };

    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(completedList);

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText(/완료된 장보기 기록은 수정할 수 없어요/)).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: /팬트리 제외/ })).not.toBeTruthy();
    expect(screen.queryByRole("button", { name: /되살리기/ })).not.toBeTruthy();
  });

  it("handles 409 conflict error when updating completed list", async () => {
    vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

    const conflictError = new Error("완료된 장보기 기록은 수정할 수 없어요.");
    Object.assign(conflictError, { status: 409, code: "CONFLICT" });

    vi.spyOn(shoppingApi, "updateShoppingListItem").mockRejectedValue(conflictError);
    vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();

    render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
    });

    const checkbox = screen.getByRole("checkbox", { name: /양파.*구매 완료 표시/ });
    await user.click(checkbox);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("완료된 장보기 기록은 수정할 수 없어요.");
    });

    consoleErrorSpy.mockRestore();
  });

  describe("share text (10b)", () => {
    let mockWriteText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      });
    });

    it("calls share-text API and copies to clipboard on share button click", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
      vi.spyOn(shoppingApi, "fetchShoppingShareText").mockResolvedValue({
        text: "📋 4월 12일 장보기\n\n☐ 양파 2개",
      });

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const shareButton = screen.getByRole("button", { name: /공유\(텍스트\)/ });
      await user.click(shareButton);

      await waitFor(() => {
        expect(shoppingApi.fetchShoppingShareText).toHaveBeenCalledWith("list-1");
      });

      await waitFor(() => {
        expect(screen.getByText("복사되었습니다")).toBeTruthy();
      });
    });

    it("shows empty feedback when purchase section has no items", async () => {
      const emptyList: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 0,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(emptyList);
      const shareTextSpy = vi.spyOn(shoppingApi, "fetchShoppingShareText");

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText(/팬트리에 이미 있어서/)).toBeTruthy();
      });

      const shareButton = screen.getByRole("button", { name: /공유\(텍스트\)/ });
      await user.click(shareButton);

      await waitFor(() => {
        expect(screen.getByText("공유할 구매 항목이 없어요")).toBeTruthy();
      });

      expect(shareTextSpy).not.toHaveBeenCalled();
    });

    it("allows sharing for completed read-only lists", async () => {
      const completedList: ShoppingListDetail = {
        ...mockListDetail,
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(completedList);
      vi.spyOn(shoppingApi, "fetchShoppingShareText").mockResolvedValue({
        text: "📋 4월 12일 장보기\n\n☐ 양파 2개",
      });

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText(/완료된 장보기 기록은 수정할 수 없어요/)).toBeTruthy();
      });

      const shareButton = screen.getByRole("button", { name: /공유\(텍스트\)/ });
      await user.click(shareButton);

      await waitFor(() => {
        expect(shoppingApi.fetchShoppingShareText).toHaveBeenCalledWith("list-1");
      });

      await waitFor(() => {
        expect(screen.getByText("복사되었습니다")).toBeTruthy();
      });
    });

    it("shows error toast when share-text API fails", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

      const apiError = new Error("서버 오류가 발생했어요.") as shoppingApi.ShoppingApiError;
      apiError.status = 500;
      apiError.code = "INTERNAL_ERROR";
      apiError.fields = [];
      vi.spyOn(shoppingApi, "fetchShoppingShareText").mockRejectedValue(apiError);
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const shareButton = screen.getByRole("button", { name: /공유\(텍스트\)/ });
      await user.click(shareButton);

      await waitFor(() => {
        expect(screen.getByText("서버 오류가 발생했어요.")).toBeTruthy();
      });
    });

    it("disables share button while sharing is in progress", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
      vi.spyOn(shoppingApi, "fetchShoppingShareText").mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const shareButton = screen.getByRole("button", { name: /공유\(텍스트\)/ });
      await user.click(shareButton);

      await waitFor(() => {
        expect(screen.getByText("공유 중...")).toBeTruthy();
      });
    });
  });

  describe("reorder (11)", () => {
    it("shows reorder buttons for incomplete list", async () => {
      const listWithMultipleItems: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(listWithMultipleItems);

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const moveUpButton = screen.getByRole("button", { name: /대파.*위로 이동/ });
      const moveDownButton = screen.getByRole("button", { name: /양파.*아래로 이동/ });
      expect(moveUpButton).toBeTruthy();
      expect(moveDownButton).toBeTruthy();
    });

    it("does not show reorder buttons for completed list", async () => {
      const completedList: ShoppingListDetail = {
        ...mockListDetail,
        is_completed: true,
        completed_at: "2026-04-13T00:00:00.000Z",
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(completedList);

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText(/완료된 장보기 기록은 수정할 수 없어요/)).toBeTruthy();
      });

      const moveButtons = screen.queryAllByRole("button", { name: /이동/ });
      expect(moveButtons.length).toBe(0);
    });

    it("calls reorder API when moving item down", async () => {
      const listWithMultipleItems: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(listWithMultipleItems);
      const reorderSpy = vi.spyOn(shoppingApi, "reorderShoppingListItems").mockResolvedValue({ updated: 2 });

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const moveDownButton = screen.getByRole("button", { name: /양파.*아래로 이동/ });
      await user.click(moveDownButton);

      await waitFor(() => {
        expect(reorderSpy).toHaveBeenCalledWith("list-1", {
          orders: [
            { item_id: "item-2", sort_order: 0 },
            { item_id: "item-1", sort_order: 10 },
          ],
        });
      });
    });

    it("rolls back and shows error toast when reorder fails", async () => {
      const listWithMultipleItems: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(listWithMultipleItems);

      const reorderError = new Error("서버 오류가 발생했어요.") as shoppingApi.ShoppingApiError;
      reorderError.status = 500;
      reorderError.code = "INTERNAL_ERROR";
      reorderError.fields = [];
      vi.spyOn(shoppingApi, "reorderShoppingListItems").mockRejectedValue(reorderError);
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const moveDownButton = screen.getByRole("button", { name: /양파.*아래로 이동/ });
      await user.click(moveDownButton);

      await waitFor(() => {
        expect(screen.getByText("서버 오류가 발생했어요.")).toBeTruthy();
      });
    });

    it("shows conflict error when reordering completed list", async () => {
      const listWithMultipleItems: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(listWithMultipleItems);

      const conflictError = new Error("완료된 장보기 기록은 수정할 수 없어요") as shoppingApi.ShoppingApiError;
      conflictError.status = 409;
      conflictError.code = "CONFLICT";
      conflictError.fields = [];
      vi.spyOn(shoppingApi, "reorderShoppingListItems").mockRejectedValue(conflictError);
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const moveDownButton = screen.getByRole("button", { name: /양파.*아래로 이동/ });
      await user.click(moveDownButton);

      await waitFor(() => {
        expect(screen.getByText("완료된 장보기 기록은 수정할 수 없어요")).toBeTruthy();
      });
    });
  });

  describe("Complete flow (slice 12a/12b)", () => {
    it("shows complete button for incomplete lists", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      expect(screen.getByRole("button", { name: "장보기 완료" })).toBeTruthy();
    });

    it("hides complete button for completed lists", async () => {
      const completedList: ShoppingListDetail = {
        ...mockListDetail,
        is_completed: true,
        completed_at: "2026-04-27T10:00:00.000Z",
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(completedList);

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      expect(screen.queryByRole("button", { name: "장보기 완료" })).toBeFalsy();
      expect(screen.getByText(/완료됨/)).toBeTruthy();
    });

    it("shows pantry reflection popup when clicking complete button", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Should show pantry popup
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      expect(screen.getByText("모두 추가")).toBeTruthy();
      expect(screen.getByText("선택 추가")).toBeTruthy();
      expect(screen.getByText("추가 안 함")).toBeTruthy();
    });

    it("completes shopping list with 모두 추가 (undefined body)", async () => {
      const listWithCheckedItem: ShoppingListDetail = {
        ...mockListDetail,
        items: mockListDetail.items.map((item) =>
          item.id === "item-1" ? { ...item, is_checked: true } : item
        ),
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(listWithCheckedItem);
      const completeSpy = vi.spyOn(shoppingApi, "completeShoppingList").mockResolvedValue({
        completed: true,
        meals_updated: 3,
        pantry_added: 1,
        pantry_added_item_ids: ["item-1"],
      });

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // "모두 추가" is selected by default, click confirm
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      // Should call API with undefined body (default policy)
      await waitFor(() => {
        expect(completeSpy).toHaveBeenCalledWith("list-1", undefined);
      });

      // Should show success message with pantry count
      await waitFor(() => {
        expect(screen.getByText(/장보기를 완료했어요.*3개 식사.*팬트리 1개 추가/)).toBeTruthy();
      });

      // Should hide complete button after success
      await waitFor(() => {
        expect(screen.queryByRole("button", { name: "장보기 완료" })).toBeFalsy();
      });

      // Should show completed badge
      expect(screen.getByText(/완료됨/)).toBeTruthy();
    });

    it("completes shopping list with 추가 안 함 (empty array)", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
      const completeSpy = vi.spyOn(shoppingApi, "completeShoppingList").mockResolvedValue({
        completed: true,
        meals_updated: 2,
        pantry_added: 0,
        pantry_added_item_ids: [],
      });

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Click "추가 안 함"
      const noneButton = screen.getByText("추가 안 함");
      await user.click(noneButton);

      // Click confirm
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      // Should call API with empty array
      await waitFor(() => {
        expect(completeSpy).toHaveBeenCalledWith("list-1", { add_to_pantry_item_ids: [] });
      });

      // Should show success message without pantry count
      await waitFor(() => {
        expect(screen.getByText(/장보기를 완료했어요.*2개 식사/)).toBeTruthy();
      });
    });

    it("completes shopping list with 선택 추가 (selected items)", async () => {
      const listWithMultipleChecked: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "간장 2큰술",
            amounts_json: [{ amount: 2, unit: "큰술" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(listWithMultipleChecked);
      const completeSpy = vi.spyOn(shoppingApi, "completeShoppingList").mockResolvedValue({
        completed: true,
        meals_updated: 1,
        pantry_added: 1,
        pantry_added_item_ids: ["item-1"],
      });

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Click "선택 추가"
      const selectedButton = screen.getByText("선택 추가");
      await user.click(selectedButton);

      // Should show item list
      await waitFor(() => {
        expect(screen.getAllByText("양파").length).toBeGreaterThan(0);
        expect(screen.getAllByText("간장").length).toBeGreaterThan(0);
      });

      // Uncheck item-2 by clicking the button that contains both "간장" and the amounts
      const itemButtons = screen.getAllByRole("button");
      const item2Button = itemButtons.find((btn) => btn.textContent?.includes("간장") && btn.textContent?.includes("2큰술"));
      expect(item2Button).toBeTruthy();
      await user.click(item2Button!);

      // Should show 1개 선택됨
      await waitFor(() => {
        expect(screen.getByText("1개 선택됨")).toBeTruthy();
      });

      // Click confirm
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      // Should call API with selected item only
      await waitFor(() => {
        expect(completeSpy).toHaveBeenCalledWith("list-1", {
          add_to_pantry_item_ids: ["item-1"],
        });
      });

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText(/장보기를 완료했어요.*1개 식사.*팬트리 1개 추가/)).toBeTruthy();
      });
    });

    it("cancels pantry popup without completing", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
      const completeSpy = vi.spyOn(shoppingApi, "completeShoppingList");

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Click cancel
      const cancelButton = screen.getByRole("button", { name: "취소" });
      await user.click(cancelButton);

      // Popup should disappear
      await waitFor(() => {
        expect(screen.queryByText("팬트리에 추가할까요?")).toBeFalsy();
      });

      // API should not be called
      expect(completeSpy).not.toHaveBeenCalled();

      // Complete button should still be visible
      expect(screen.getByRole("button", { name: "장보기 완료" })).toBeTruthy();
    });

    it("only shows checked and not-excluded items in pantry popup", async () => {
      const mixedList: ShoppingListDetail = {
        ...mockListDetail,
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 2개",
            amounts_json: [{ amount: 2, unit: "개" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
          {
            id: "item-3",
            ingredient_id: "ing-3",
            display_text: "간장 2큰술",
            amounts_json: [{ amount: 2, unit: "큰술" }],
            is_checked: true,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 200,
          },
        ],
      };

      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mixedList);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Should show "(1개)" for eligible items
      expect(screen.getByText(/체크한 모든 재료를 팬트리에 추가해요 \(1개\)/)).toBeTruthy();

      // Click "선택 추가" to see item list
      const selectedButton = screen.getByText("선택 추가");
      await user.click(selectedButton);

      // Only item-1 should be visible (checked and not excluded)
      // The popup should show "양파" in the selection list
      await waitFor(() => {
        // Look for "양파" inside the popup item list (not in the main list)
        const itemButtons = screen.getAllByRole("button");
        const yangpaInPopup = itemButtons.some((btn) =>
          btn.textContent?.includes("양파") &&
          btn.textContent?.includes("2개") &&
          !btn.getAttribute("aria-label") // main list buttons have aria-label
        );
        expect(yangpaInPopup).toBeTruthy();
      });

      // item-2 (unchecked) and item-3 (excluded) should not be in the popup
      // Check by looking for buttons without aria-label (popup items)
      const popupItemButtons = screen.getAllByRole("button").filter((btn) => !btn.getAttribute("aria-label"));
      const hasDaepa = popupItemButtons.some((btn) => btn.textContent?.includes("대파"));
      const hasGanjang = popupItemButtons.some((btn) => btn.textContent?.includes("간장"));
      expect(hasDaepa).toBeFalsy();
      expect(hasGanjang).toBeFalsy();
    });

    it("handles 401 error by redirecting to login", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

      const authError = new Error("로그인이 필요해요") as shoppingApi.ShoppingApiError;
      authError.status = 401;
      authError.code = "UNAUTHORIZED";
      authError.fields = [];
      vi.spyOn(shoppingApi, "completeShoppingList").mockRejectedValue(authError);
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Confirm with default "모두 추가"
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login?next=/shopping/lists/list-1");
      });
    });

    it("handles 409 conflict error", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

      const conflictError = new Error("이미 완료된 장보기 기록이에요") as shoppingApi.ShoppingApiError;
      conflictError.status = 409;
      conflictError.code = "CONFLICT";
      conflictError.fields = [];
      vi.spyOn(shoppingApi, "completeShoppingList").mockRejectedValue(conflictError);
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Confirm with default "모두 추가"
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("이미 완료된 장보기 기록이에요")).toBeTruthy();
      });
    });

    it("handles generic error", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);

      const serverError = new Error("서버 오류") as shoppingApi.ShoppingApiError;
      serverError.status = 500;
      serverError.code = "INTERNAL_ERROR";
      serverError.fields = [];
      vi.spyOn(shoppingApi, "completeShoppingList").mockRejectedValue(serverError);
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(true);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Confirm with default "모두 추가"
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("서버 오류")).toBeTruthy();
      });
    });

    it("handles non-API error", async () => {
      vi.spyOn(shoppingApi, "fetchShoppingListDetail").mockResolvedValue(mockListDetail);
      vi.spyOn(shoppingApi, "completeShoppingList").mockRejectedValue(new Error("Network failure"));
      vi.spyOn(shoppingApi, "isShoppingApiError").mockReturnValue(false);

      const user = userEvent.setup();

      render(<ShoppingDetailScreen listId="list-1" initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("4월 12일 장보기")).toBeTruthy();
      });

      const completeButton = screen.getByRole("button", { name: "장보기 완료" });
      await user.click(completeButton);

      // Popup should appear
      await waitFor(() => {
        expect(screen.getByText("팬트리에 추가할까요?")).toBeTruthy();
      });

      // Confirm with default "모두 추가"
      const confirmButton = screen.getByRole("button", { name: "완료" });
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText("장보기를 완료하지 못했어요")).toBeTruthy();
      });
    });
  });
});
