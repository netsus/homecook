// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingFlowScreen } from "@/components/shopping/shopping-flow-screen";

const mockPush = vi.fn();
const fetchShoppingPreview = vi.fn();
const createShoppingList = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/api/shopping", () => ({
  fetchShoppingPreview: () => fetchShoppingPreview(),
  createShoppingList: (body: unknown) => createShoppingList(body),
  isShoppingApiError: (error: unknown) =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>),
}));

function createPreviewData(meals: Array<{
  id: string;
  recipe_id: string;
  recipe_name: string;
  planned_servings: number;
}>) {
  return {
    eligible_meals: meals.map((meal) => ({
      ...meal,
      recipe_thumbnail: null,
      created_at: "2026-04-26T00:00:00.000Z",
    })),
  };
}

function createApiError(status: number, code: string, message: string) {
  const error = new Error(message) as Error & {
    status: number;
    code: string;
    fields: unknown[];
  };
  error.status = status;
  error.code = code;
  error.fields = [];
  return error;
}

describe("shopping flow screen", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchShoppingPreview.mockReset();
    createShoppingList.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe("loading state", () => {
    it("should show loading state on initial load", async () => {
      fetchShoppingPreview.mockReturnValue(
        new Promise(() => {
          /* never resolves */
        })
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      expect(
        screen.getByText("장볼 레시피를 불러오고 있어요")
      ).toBeTruthy();
      expect(screen.getByText("잠시만 기다려 주세요.")).toBeTruthy();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no eligible meals", async () => {
      fetchShoppingPreview.mockResolvedValue(createPreviewData([]));

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("장보기 대상이 없어요")).toBeTruthy();
      });

      expect(
        screen.getByText("플래너에 식사를 먼저 등록해 주세요.")
      ).toBeTruthy();
      expect(screen.getByText("플래너로 돌아가기")).toBeTruthy();
    });

    it("should navigate to planner when clicking back button", async () => {
      fetchShoppingPreview.mockResolvedValue(createPreviewData([]));

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("플래너로 돌아가기")).toBeTruthy();
      });

      const backButton = screen.getByText("플래너로 돌아가기");
      await userEvent.click(backButton);

      expect(mockPush).toHaveBeenCalledWith("/planner");
    });
  });

  describe("error state", () => {
    it("should show error state when API call fails", async () => {
      fetchShoppingPreview.mockRejectedValue(
        createApiError(500, "INTERNAL_ERROR", "서버 오류가 발생했어요.")
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(
          screen.getByText("장보기 목록을 불러오지 못했어요")
        ).toBeTruthy();
      });

      expect(screen.getByText("서버 오류가 발생했어요.")).toBeTruthy();
      expect(screen.getByText("다시 시도")).toBeTruthy();
    });

    it("should redirect to login on 401 error", async () => {
      fetchShoppingPreview.mockRejectedValue(
        createApiError(401, "UNAUTHORIZED", "로그인이 필요해요.")
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/login?next=/shopping/flow");
      });
    });

    it("should retry loading when clicking retry button", async () => {
      fetchShoppingPreview
        .mockRejectedValueOnce(
          createApiError(500, "INTERNAL_ERROR", "서버 오류가 발생했어요.")
        )
        .mockResolvedValueOnce(
          createPreviewData([
            {
              id: "meal-1",
              recipe_id: "recipe-1",
              recipe_name: "김치찌개",
              planned_servings: 2,
            },
          ])
        );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("다시 시도")).toBeTruthy();
      });

      const retryButton = screen.getByText("다시 시도");
      await userEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });
    });
  });

  describe("ready state", () => {
    it("should render eligible meals with correct initial state", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_name: "된장찌개",
            planned_servings: 4,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      expect(screen.getByText("된장찌개")).toBeTruthy();
      expect(screen.getAllByText(/인분/)).toHaveLength(6); // 2 cards × 3 mentions each
      expect(screen.getByText("장보기 목록 만들기")).toBeTruthy();
      expect(screen.getByText("장보기 목록 만들기")).not.toBe(true);
    });

    it("should toggle meal selection when clicking checkbox", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const checkbox = screen.getByLabelText("김치찌개 선택 해제");
      await userEvent.click(checkbox);

      expect(screen.getByLabelText("김치찌개 선택")).toBeTruthy();
      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(true);
    });

    it("should adjust shopping servings when clicking stepper buttons", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const plusButton = screen.getByLabelText("인분 늘리기");
      await userEvent.click(plusButton);

      await waitFor(() => {
        expect(screen.getByText("3")).toBeTruthy();
      });

      const minusButton = screen.getByLabelText("인분 줄이기");
      await userEvent.click(minusButton);

      await waitFor(() => {
        expect(screen.getByText("2")).toBeTruthy();
      });
    });

    it("should not allow servings below 1", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 1,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const minusButton = screen.getByLabelText("인분 줄이기") as HTMLButtonElement;
      expect(minusButton.disabled).toBe(true);
    });

    it("should disable create button when no meals selected", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const checkbox = screen.getByLabelText("김치찌개 선택 해제");
      await userEvent.click(checkbox);

      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe("create list", () => {
    it("should create shopping list and navigate to detail", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      createShoppingList.mockResolvedValue({
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00.000Z",
      });

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const createButton = screen.getByText("장보기 목록 만들기");
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(createShoppingList).toHaveBeenCalledWith({
          meal_configs: [
            {
              meal_id: "meal-1",
              shopping_servings: 2,
            },
          ],
        });
      });

      expect(mockPush).toHaveBeenCalledWith("/shopping/list-1");
    });

    it("should show creating state while creating list", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      createShoppingList.mockReturnValue(
        new Promise(() => {
          /* never resolves */
        })
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const createButton = screen.getByText("장보기 목록 만들기");
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText("장보기 목록을 만들고 있어요")
        ).toBeTruthy();
      });

      expect(
        screen.getByText("팬트리 재료를 확인 중이에요...")
      ).toBeTruthy();
    });

    it("should handle 409 conflict error", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      createShoppingList.mockRejectedValue(
        createApiError(
          409,
          "CONFLICT",
          "이미 다른 장보기 리스트에 포함된 식사가 있어요."
        )
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const createButton = screen.getByText("장보기 목록 만들기");
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(
          screen.getByText("이미 다른 장보기 리스트에 포함된 식사가 있어요.")
        ).toBeTruthy();
      });
    });

    it("should only submit selected meals", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_name: "된장찌개",
            planned_servings: 4,
          },
        ])
      );

      createShoppingList.mockResolvedValue({
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00.000Z",
      });

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      // Deselect second meal
      const checkbox = screen.getByLabelText("된장찌개 선택 해제");
      await userEvent.click(checkbox);

      const createButton = screen.getByText("장보기 목록 만들기");
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(createShoppingList).toHaveBeenCalledWith({
          meal_configs: [
            {
              meal_id: "meal-1",
              shopping_servings: 2,
            },
          ],
        });
      });
    });

    it("should submit adjusted servings", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      createShoppingList.mockResolvedValue({
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00.000Z",
      });

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      // Increase servings to 4
      const plusButton = screen.getByLabelText("인분 늘리기");
      await userEvent.click(plusButton);
      await userEvent.click(plusButton);

      await waitFor(() => {
        expect(screen.getByText("4")).toBeTruthy();
      });

      const createButton = screen.getByText("장보기 목록 만들기");
      await userEvent.click(createButton);

      await waitFor(() => {
        expect(createShoppingList).toHaveBeenCalledWith({
          meal_configs: [
            {
              meal_id: "meal-1",
              shopping_servings: 4,
            },
          ],
        });
      });
    });
  });

  describe("navigation", () => {
    it("should navigate back to planner when clicking back button", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      const backButton = screen.getByLabelText("뒤로 가기");
      await userEvent.click(backButton);

      expect(mockPush).toHaveBeenCalledWith("/planner");
    });
  });
});
