// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeScreen } from "@/components/home/home-screen";
import {
  getMockRecipeList,
  getMockRecipeThemes,
  MOCK_RECIPE_CARD,
} from "@/lib/mock/recipes";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";

const fetchJson = vi.fn();
const ONION_ID = "550e8400-e29b-41d4-a716-446655440010";
const GREEN_ONION_ID = "550e8400-e29b-41d4-a716-446655440011";
const BEEF_ID = "550e8400-e29b-41d4-a716-446655440012";

const INGREDIENT_ITEMS = [
  {
    id: ONION_ID,
    standard_name: "양파",
    category: "채소",
  },
  {
    id: GREEN_ONION_ID,
    standard_name: "대파",
    category: "채소",
  },
  {
    id: BEEF_ID,
    standard_name: "소고기",
    category: "육류",
  },
];

vi.mock("@/lib/api/fetch-json", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

describe("home screen", () => {
  beforeEach(() => {
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    fetchJson.mockReset();
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        const url = new URL(input, "http://localhost:3000");
        const query = url.searchParams.get("q")?.trim() ?? "";
        const category = url.searchParams.get("category");

        return Promise.resolve({
          items: INGREDIENT_ITEMS.filter((ingredient) => {
            const matchesCategory = !category || ingredient.category === category;
            const matchesQuery =
              query.length === 0 || ingredient.standard_name.includes(query);

            return matchesCategory && matchesQuery;
          }),
        });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
      }

      return Promise.resolve(getMockRecipeList());
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    window.history.replaceState({}, "", "/");
  });

  it("renders the prototype HOME sections on initial load", async () => {
    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "오늘은 뭐 해먹지?" }),
    ).toBeTruthy();
    expect(screen.getByText("목요일 저녁,")).toBeTruthy();
    expect(screen.getByText("homecook_")).toBeTruthy();
    expect(screen.getByPlaceholderText("김치볶음밥, 된장찌개...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "양파" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "재료 더보기" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "테마별 레시피" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /이번 주 식단 플래너/ })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "HOME 하단 탭" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "모든 레시피" })).toBeTruthy();
  });

  it("applies inline ingredient chips to the URL and recipe query", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "양파" }));

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("ingredient_ids") === ONION_ID;
        }),
      ).toBe(true);
    });

    expect(window.location.search).toContain(`ingredient_ids=${ONION_ID}`);
    expect(screen.getByRole("button", { name: "초기화" })).toBeTruthy();
  });

  it("opens the ingredient modal from the more chip and applies modal filters", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "재료 더보기" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });

    expect(await screen.findByRole("checkbox", { name: "양파" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "채소" }));
    await user.type(screen.getByPlaceholderText("재료명으로 검색"), "파");

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/ingredients")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");

          return (
            url.searchParams.get("q") === "파" &&
            url.searchParams.get("category") === "채소"
          );
        }),
      ).toBe(true);
    });

    await user.click(screen.getByRole("checkbox", { name: "양파" }));
    expect(screen.getByText("1개 선택")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /적용/ }));

    await waitFor(() => {
      expect(window.location.search).toContain(`ingredient_ids=${ONION_ID}`);
    });
  });

  it("keeps the search debounce at 300ms", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const searchInput = await screen.findByPlaceholderText(
      "김치볶음밥, 된장찌개...",
    );

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(
          ([input]) => typeof input === "string" && input.startsWith("/api/v1/recipes?"),
        ),
      ).toBe(true);
    });
    fetchJson.mockClear();

    await user.type(searchInput, "김치");
    await new Promise((resolve) => {
      window.setTimeout(resolve, 250);
    });

    expect(
      fetchJson.mock.calls.some(([input]) => {
        if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
          return false;
        }

        const url = new URL(input, "http://localhost:3000");
        return url.searchParams.get("q") === "김치";
      }),
    ).toBe(false);

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("q") === "김치";
        }),
      ).toBe(true);
    }, { timeout: 1000 });
  });

  it("uses a custom sort menu so the selected option stays readable on mobile", async () => {
    const user = userEvent.setup();
    window.innerWidth = 390;
    window.dispatchEvent(new Event("resize"));

    render(<HomeScreen />);

    const sortButton = await screen.findByRole("button", { name: /정렬 기준/i });
    expect(sortButton.textContent).toContain("조회수순");

    await user.click(sortButton);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "정렬 기준" })).toBeTruthy();
    });

    const listbox = screen.getByRole("listbox", { name: "정렬 기준" });
    expect(listbox).toBeTruthy();

    await user.click(screen.getByRole("option", { name: "좋아요순" }));

    await waitFor(() => {
      expect(sortButton.textContent).toContain("좋아요순");
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("sort") === "like_count";
        }),
      ).toBe(true);
    });
  });

  it("keeps themed recipes mounted and does not refetch themes when only sort changes", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await screen.findByRole("heading", {
      level: 2,
      name: "테마별 레시피",
    });

    const initialThemeCalls = fetchJson.mock.calls.filter(([input]) => {
      return typeof input === "string" && input.startsWith("/api/v1/recipes/themes");
    }).length;

    await user.click(await screen.findByRole("button", { name: /정렬 기준/i }));
    await user.click(screen.getByRole("option", { name: "좋아요순" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "테마별 레시피" })).toBeTruthy();
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("sort") === "like_count";
        }),
      ).toBe(true);
    });

    const themeCallsAfterSort = fetchJson.mock.calls.filter(([input]) => {
      return typeof input === "string" && input.startsWith("/api/v1/recipes/themes");
    }).length;

    expect(themeCallsAfterSort).toBe(initialThemeCalls);
  });

  it("shows the empty state when recipes and themes are empty", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      return Promise.resolve({
        items: [],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "다른 조합을 찾아보세요" }),
    ).toBeTruthy();
  });

  it("keeps the recipe list visible when only themes fail", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.reject(new Error("themes failed"));
      }

      return Promise.resolve(getMockRecipeList());
    });

    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "모든 레시피" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "레시피를 불러오지 못했어요" }),
    ).toBeNull();
  });

  it("shows the recipe error state when recipe loading fails", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
      }

      return Promise.reject(new Error("recipes failed"));
    });

    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "레시피를 불러오지 못했어요" }),
    ).toBeTruthy();
  });

  it("keeps the title search when clearing only the ingredient filter", async () => {
    const user = userEvent.setup();

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      const url = new URL(input, "http://localhost:3000");

      if (url.searchParams.get("q")) {
        return Promise.resolve({
          items: [],
          next_cursor: null,
          has_next: false,
        });
      }

      return Promise.resolve({
        items: [MOCK_RECIPE_CARD],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    await user.type(
      await screen.findByPlaceholderText("김치볶음밥, 된장찌개..."),
      "김치",
    );

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("q") === "김치";
        }),
      ).toBe(true);
    });

    await user.click(screen.getByRole("button", { name: "양파" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "초기화" }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "초기화" })[0]!);

    expect(screen.getByPlaceholderText("김치볶음밥, 된장찌개...")).toHaveProperty(
      "value",
      "김치",
    );

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return (
            url.searchParams.get("q") === "김치" &&
            !url.searchParams.has("ingredient_ids")
          );
        }),
      ).toBe(true);
    });

    expect(window.location.search).toBe("");
  });
});
