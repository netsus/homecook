// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShoppingFlowScreen } from "@/components/shopping/shopping-flow-screen";

const mockPush = vi.fn();
const fetchShoppingPreview = vi.fn();
const createShoppingList = vi.fn();
const fetchShoppingListDetail = vi.fn();
const updateShoppingListItem = vi.fn();
const completeShoppingList = vi.fn();
const fetchShoppingShareText = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/api/shopping", () => ({
  fetchShoppingPreview: () => fetchShoppingPreview(),
  createShoppingList: (body: unknown) => createShoppingList(body),
  fetchShoppingListDetail: (listId: string) => fetchShoppingListDetail(listId),
  updateShoppingListItem: (
    listId: string,
    itemId: string,
    body: unknown,
  ) => updateShoppingListItem(listId, itemId, body),
  completeShoppingList: (listId: string, body: unknown) =>
    completeShoppingList(listId, body),
  fetchShoppingShareText: (listId: string) => fetchShoppingShareText(listId),
  isShoppingApiError: (error: unknown) =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>),
}));

function createPreviewData(meals: Array<{
  id: string;
  column_id?: string;
  created_at?: string;
  plan_date?: string;
  recipe_id: string;
  recipe_name: string;
  planned_servings: number;
}>) {
  return {
    eligible_meals: meals.map((meal) => ({
      ...meal,
      column_id: meal.column_id ?? "column-breakfast",
      plan_date: meal.plan_date ?? "2026-04-26",
      recipe_thumbnail: null,
      created_at: meal.created_at ?? `${meal.plan_date ?? "2026-04-26"}T00:00:00.000Z`,
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

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
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

function createShoppingDetail({
  isChecked = false,
  isPantryExcluded = false,
}: {
  isChecked?: boolean;
  isPantryExcluded?: boolean;
} = {}) {
  return {
    id: "list-1",
    title: "장보기 목록",
    date_range_start: "2026-04-26",
    date_range_end: "2026-04-26",
    is_completed: false,
    completed_at: null,
    created_at: "2026-04-26T00:00:00.000Z",
    updated_at: "2026-04-26T00:00:00.000Z",
    recipes: [],
    items: [
      {
        id: "item-1",
        ingredient_id: "ingredient-1",
        display_text: "양파 2개",
        amounts_json: [{ amount: 2, unit: "개" }],
        is_checked: isChecked,
        is_pantry_excluded: isPantryExcluded,
        added_to_pantry: false,
        sort_order: 0,
      },
    ],
  };
}

describe("shopping flow screen", () => {
  beforeEach(() => {
    mockPush.mockReset();
    fetchShoppingPreview.mockReset();
    createShoppingList.mockReset();
    fetchShoppingListDetail.mockReset();
    updateShoppingListItem.mockReset();
    completeShoppingList.mockReset();
    fetchShoppingShareText.mockReset();
    setMatchMedia(false);
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
      expect(screen.getByTestId("shopping-flow-state-shell").className).toContain(
        "bg-[var(--wave1-surface)]",
      );
    });
  });

  describe("empty state", () => {
    it("should show empty state when no eligible meals", async () => {
      fetchShoppingPreview.mockResolvedValue(createPreviewData([]));

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("장보기 대상이 없어요")).toBeTruthy();
      });

      expect(screen.getByText("플래너에 식사를 먼저 등록해 주세요.")).toBeTruthy();
      expect(screen.queryByText(/이미 장보기·요리 흐름에 들어간 식사는 제외/)).toBeNull();
      expect(screen.getByText("플래너로 돌아가기")).toBeTruthy();
      expect(screen.getByTestId("shopping-flow-state-shell").className).toContain(
        "bg-[var(--wave1-surface)]",
      );
      expect(
        screen
          .getByRole("heading", { name: "장보기 대상이 없어요" })
          .closest("[data-state-tone='empty']")
          ?.className,
      ).toContain("shopping-flow-blue-state");
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
            column_id: "column-breakfast",
            plan_date: "2026-04-26",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
          {
            id: "meal-2",
            column_id: "column-dinner",
            plan_date: "2026-04-27",
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
      expect(screen.queryByText("합산 계획 2인분")).toBeNull();
      expect(screen.queryByText("합산 계획 4인분")).toBeNull();
      expect(screen.queryByText("계획 2인분")).toBeNull();
      expect(screen.queryByText("대상 식사 2개")).toBeNull();
      expect(screen.getByText("2인분")).toBeTruthy();
      expect(screen.getByText("4인분")).toBeTruthy();
      expect(screen.getByRole("heading", { name: "4월 26일 일요일" })).toBeTruthy();
      expect(screen.getByRole("heading", { name: "4월 27일 월요일" })).toBeTruthy();
      expect(screen.getByRole("link", { name: "김치찌개" }).getAttribute("href")).toBe(
        "/planner/2026-04-26/column-breakfast?returnTo=%2Fshopping%2Fflow",
      );
      expect(screen.getAllByText("장보기 목록 만들기")).toHaveLength(1);
      const selectAllControl = screen.getByRole("checkbox", { name: "전체 선택" });
      expect((selectAllControl as HTMLButtonElement).disabled).toBe(false);
      expect(selectAllControl.getAttribute("aria-checked")).toBe("true");
      expect(screen.queryByText("2개 선택 · 총 6인분")).toBeNull();
      expect(screen.getByText("2개 · 6인분")).toBeTruthy();
      expect(screen.getByText("장보기 목록으로 만들어요.")).toBeTruthy();
      expect(screen.getByTestId("shopping-multi-meal-hint").textContent).toBe(
        "여러 끼니를 한번에 장보기할 수 있어요",
      );
      expect(screen.queryByText("진행할 장보기")).toBeNull();
      expect(screen.queryByRole("navigation", { name: "장보기 경로" })).toBeNull();
      expect(screen.queryByText(/^#\d+$/)).not.toBeTruthy();
      expect(screen.queryByText(/[🍳🍚🥘🍽️]/u)).not.toBeTruthy();
      expect(screen.getByTestId("shopping-create-button").textContent).toBe(
        "장보기 목록 만들기"
      );
    });

    it("should keep duplicate recipe meals separated by registered meal", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            column_id: "column-breakfast",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 3,
          },
          {
            id: "meal-2",
            column_id: "column-dinner",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 3,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getAllByText("김치찌개")).toHaveLength(2);
      });

      expect(screen.getAllByText("김치찌개")).toHaveLength(2);
      expect(screen.queryByText("식사 등록 완료")).toBeNull();
      expect(screen.queryByText("대상 식사 2개")).toBeNull();
      expect(screen.queryByText("합산 계획 6인분")).toBeNull();
      expect(screen.queryByText("합산 6인분")).toBeNull();
      expect(screen.getByText("아침")).toBeTruthy();
      expect(screen.getByText("저녁")).toBeTruthy();
      expect(screen.queryByText("장보기 기준 인분")).toBeNull();
      expect(screen.queryByLabelText("6인분")).toBeNull();
      expect(screen.queryByLabelText("인분 늘리기")).toBeNull();
      expect(
        screen.getByText(/같은 재료는 장보기 목록에서 자동으로 합산돼요/)
      ).toBeTruthy();
    });

    it("should constrain the content width for readable local browser testing", async () => {
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

      expect(screen.getByTestId("shopping-flow-shell").className).toContain("max-w-");
    });

    it("keeps the planner tab active in desktop shopping prep navigation", async () => {
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

      const activeLink = screen
        .getByRole("navigation", { name: "데스크탑 주요 메뉴" })
        .querySelector('a[aria-current="page"]');
      expect(activeLink?.textContent).toContain("플래너");
    });

    it("should toggle meal selection when clicking the recipe card", async () => {
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

      await userEvent.click(screen.getByTestId("shopping-recipe-card-meal-1"));
      expect(screen.getByLabelText("김치찌개 선택")).toBeTruthy();
      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(true);

      await userEvent.click(screen.getByTestId("shopping-recipe-card-meal-1"));
      expect(screen.getByLabelText("김치찌개 선택 해제")).toBeTruthy();
      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(false);
    });

    it("should keep the card selected when clicking the recipe title link", async () => {
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

      const link = screen.getByRole("link", { name: "김치찌개" });
      link.addEventListener("click", (event) => event.preventDefault(), { once: true });
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(screen.getByLabelText("김치찌개 선택 해제")).toBeTruthy();
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

    it("should sort recipe cards by planner date ascending", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-late",
            column_id: "column-dinner",
            created_at: "2026-04-24T00:00:00.000Z",
            plan_date: "2026-04-28",
            recipe_id: "recipe-late",
            recipe_name: "늦은 식사",
            planned_servings: 2,
          },
          {
            id: "meal-early",
            column_id: "column-breakfast",
            created_at: "2026-04-29T00:00:00.000Z",
            plan_date: "2026-04-26",
            recipe_id: "recipe-early",
            recipe_name: "이른 식사",
            planned_servings: 2,
          },
        ])
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("이른 식사")).toBeTruthy();
      });

      const dateHeadings = screen
        .getAllByRole("heading", { level: 3 })
        .filter((heading) => /^\d+월 \d+일 [일월화수목금토]요일$/.test(heading.textContent ?? ""));
      expect(dateHeadings.map((heading) => heading.textContent)).toEqual([
        "4월 26일 일요일",
        "4월 28일 화요일",
      ]);
    });

    it("should keep date-only planner labels stable across host timezones", async () => {
      const originalTimezone = process.env.TZ;
      process.env.TZ = "America/Los_Angeles";
      try {
        fetchShoppingPreview.mockResolvedValue(
          createPreviewData([
            {
              id: "meal-date-only",
              column_id: "column-breakfast",
              plan_date: "2026-04-26",
              recipe_id: "recipe-date-only",
              recipe_name: "날짜 전용 식사",
              planned_servings: 2,
            },
          ]),
        );

        render(<ShoppingFlowScreen initialAuthenticated={true} />);

        await waitFor(() => {
          expect(screen.getByText("날짜 전용 식사")).toBeTruthy();
        });

        expect(
          screen.getByRole("heading", { name: "4월 26일 일요일" }),
        ).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "4월 25일 토요일" })).toBeNull();
      } finally {
        process.env.TZ = originalTimezone;
      }
    });

    it("should select and clear every recipe without changing servings in the shopping flow", async () => {
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

      expect(screen.queryByText("장보기 기준 인분")).toBeNull();
      expect(screen.queryByLabelText("인분 늘리기")).toBeNull();
      expect(screen.queryByLabelText("인분 줄이기")).toBeNull();

      const allToggle = screen.getByRole("checkbox", { name: "전체 선택" });
      expect(allToggle.getAttribute("aria-checked")).toBe("true");

      await userEvent.click(allToggle);
      expect(screen.getByLabelText("김치찌개 선택")).toBeTruthy();
      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(true);
      expect(allToggle.getAttribute("aria-checked")).toBe("false");

      await userEvent.click(allToggle);
      expect(screen.getByLabelText("김치찌개 선택 해제")).toBeTruthy();
      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(false);
      expect(allToggle.getAttribute("aria-checked")).toBe("true");
    });

    it("shows selected meal count and servings on the app shopping preparation screen", async () => {
      setMatchMedia(true);
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
            recipe_name: "달걀찜",
            planned_servings: 1,
          },
        ]),
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      expect(screen.getByText("2개 · 3인분")).toBeTruthy();
      const allToggle = screen.getByRole("checkbox", { name: "전체 선택" });
      expect(allToggle.getAttribute("aria-checked")).toBe("true");

      await userEvent.click(allToggle);

      expect(screen.getByText("0개 · 0인분")).toBeTruthy();
      expect(allToggle.getAttribute("aria-checked")).toBe("false");
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

      expect(mockPush).toHaveBeenCalledWith("/shopping/lists/list-1");
    });

    it("should navigate to the improved detail screen after app shopping list creation", async () => {
      setMatchMedia(true);
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ]),
      );

      createShoppingList.mockResolvedValue({
        id: "list-1",
        title: "장보기 목록",
        is_completed: false,
        created_at: "2026-04-26T00:00:00.000Z",
      });
      fetchShoppingListDetail.mockResolvedValue(createShoppingDetail());

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      await userEvent.click(screen.getByText("장보기 목록 만들기"));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/shopping/lists/list-1");
      });
      expect(fetchShoppingListDetail).not.toHaveBeenCalled();
    });

    it("should show an 안내 modal instead of navigating when all needed ingredients are already in pantry", async () => {
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
            recipe_name: "달걀찜",
            planned_servings: 1,
          },
        ])
      );

      createShoppingList.mockResolvedValue({
        id: null,
        title: "6월 5일 장보기",
        is_completed: true,
        completed_without_list: true,
        completed_at: "2026-06-05T09:00:00.000Z",
        created_at: "2026-06-05T09:00:00.000Z",
        meals_updated: 2,
        pantry_item_count: 3,
      });

      const user = userEvent.setup();

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      await user.click(screen.getByText("장보기 목록 만들기"));

      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "살 재료가 없어요" })).toBeTruthy();
      });

      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining("/shopping/lists/"));
      expect(
        screen.getByText("선택한 끼니의 재료가 모두 팬트리에 있어 장보기 완료로 바꿨어요."),
      ).toBeTruthy();
      expect(screen.getByText("2개 끼니 · 3개 재료")).toBeTruthy();

      await user.click(screen.getByRole("button", { name: "플래너로 돌아가기" }));

      expect(mockPush).toHaveBeenCalledWith("/planner");
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

    it("should submit duplicate recipe meals as separate meal configs", async () => {
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 5,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 8,
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
        expect(screen.getAllByText("김치찌개")).toHaveLength(2);
      });

      await userEvent.click(screen.getByText("장보기 목록 만들기"));

      await waitFor(() => {
        expect(createShoppingList).toHaveBeenCalledWith({
          meal_configs: [
            {
              meal_id: "meal-1",
              shopping_servings: 5,
            },
            {
              meal_id: "meal-2",
              shopping_servings: 8,
            },
          ],
        });
      });
    });

    it("should remove meal/status copy from mobile rows and show meal slot", async () => {
      setMatchMedia(true);
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            column_id: "column-breakfast",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
          {
            id: "meal-2",
            column_id: "column-dinner",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ]),
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getAllByText("김치찌개")).toHaveLength(2);
      });

      expect(screen.getByRole("heading", { name: "장보기 준비" })).toBeTruthy();
      expect(screen.queryByText(/식사/)).toBeNull();
      expect(screen.queryByText(/장보기 대기/)).toBeNull();
      expect(screen.getByText("아침 · 2인분")).toBeTruthy();
      expect(screen.getByText("저녁 · 2인분")).toBeTruthy();
    });

    it("should toggle mobile meal selection when clicking the row", async () => {
      setMatchMedia(true);
      fetchShoppingPreview.mockResolvedValue(
        createPreviewData([
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            planned_servings: 2,
          },
        ]),
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      await userEvent.click(screen.getByTestId("shopping-mobile-recipe-row-meal-1"));
      expect(screen.getByLabelText("김치찌개 선택")).toBeTruthy();
      expect((screen.getByText("장보기 목록 만들기") as HTMLButtonElement).disabled).toBe(true);
    });

    it("should restore a checked item when mobile pantry exclusion fails", async () => {
      setMatchMedia(true);
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
      fetchShoppingListDetail.mockResolvedValue(
        createShoppingDetail({ isChecked: true })
      );
      updateShoppingListItem.mockRejectedValue(
        createApiError(500, "INTERNAL_ERROR", "저장하지 못했어요.")
      );

      render(<ShoppingFlowScreen initialAuthenticated={true} />);

      await waitFor(() => {
        expect(screen.getByText("김치찌개")).toBeTruthy();
      });

      await userEvent.click(screen.getByText("장보기 목록 만들기"));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/shopping/lists/list-1");
      });

      expect(fetchShoppingListDetail).not.toHaveBeenCalled();
      expect(updateShoppingListItem).not.toHaveBeenCalled();
    });
  });

  describe("navigation", () => {
    it("should navigate back to planner when clicking the mobile back button", async () => {
      setMatchMedia(true);
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
