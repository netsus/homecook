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
  afterEach(() => {
    cleanup();
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    window.history.replaceState({}, "", "/");
  });

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
    vi.useRealTimers();
  });

  it("shows themed sections together with the recipe list on initial load", async () => {
    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "이번 주 인기 레시피" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "모든 레시피" }),
    ).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /집밥 김치찌개/i }).length).toBe(2);
  });

  it("uses a custom sort menu so the selected option stays readable on mobile", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const sortButton = await screen.findByRole("button", { name: /정렬 기준/i });
    expect(sortButton.textContent).toContain("조회수순");

    await user.click(sortButton);

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

  it("shows the empty state when both recipes and themes are empty", async () => {
    fetchJson.mockImplementation((input: string) => {
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

  it("opens the ingredient modal, keeps q + category ingredient queries, and applies the filter", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "재료로 검색" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });

    expect(
      await screen.findByRole("checkbox", { name: "양파" }),
    ).toBeTruthy();

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
    await user.click(screen.getByRole("button", { name: "적용" }));

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
    expect(screen.getByRole("button", { name: "재료로 검색 (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "필터 초기화" })).toBeTruthy();
  });

  it("filters the recipe list without removing the section shell", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
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

    const searchInput = await screen.findByPlaceholderText("레시피 제목 검색");
    await userEvent.type(searchInput, "없는");

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "검색 결과" }),
      ).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "다른 조합을 찾아보세요" }),
      ).toBeTruthy();
    });
  });

  it("keeps the title search when clearing only the ingredient filter", async () => {
    const user = userEvent.setup();

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({
          items: [
            {
              id: ONION_ID,
              standard_name: "양파",
              category: "채소",
            },
          ],
        });
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

    await user.type(
      await screen.findByPlaceholderText("레시피 제목 검색"),
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

    await user.click(screen.getByRole("button", { name: "재료로 검색" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.click(screen.getByRole("button", { name: "적용" }));

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "필터 초기화" })).toHaveLength(2);
    });

    await user.click(screen.getAllByRole("button", { name: "필터 초기화" })[0]);

    expect(screen.getByPlaceholderText("레시피 제목 검색")).toHaveProperty(
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

  it("discards unapplied draft selections when the modal closes", async () => {
    const user = userEvent.setup();

    useDiscoveryFilterStore.setState({ appliedIngredientIds: [ONION_ID] });

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "재료로 검색 (1)" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });

    expect(await screen.findByRole("checkbox", { name: "양파" })).toHaveProperty(
      "checked",
      true,
    );

    await user.click(screen.getByRole("checkbox", { name: "소고기" }));
    expect(screen.getByRole("checkbox", { name: "소고기" })).toHaveProperty(
      "checked",
      true,
    );

    await user.click(screen.getByRole("button", { name: "닫기" }));
    await user.click(screen.getByRole("button", { name: "재료로 검색 (1)" }));

    expect(await screen.findByRole("checkbox", { name: "양파" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("checkbox", { name: "소고기" })).toHaveProperty(
      "checked",
      false,
    );
  });

  it("keeps keyboard focus trapped inside the ingredient modal", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "재료로 검색" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });

    const closeButton = screen.getByRole("button", { name: "닫기" });
    const applyButton = screen.getByRole("button", { name: "적용" });

    expect(document.activeElement).toBe(closeButton);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(applyButton);

    await user.tab();
    expect(document.activeElement).toBe(closeButton);
  });

  it("resets modal query and category when reopening while keeping applied selections", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "재료로 검색" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });
    const searchInput = screen.getByPlaceholderText("재료명으로 검색");

    await user.click(screen.getByRole("button", { name: "채소" }));
    await user.type(searchInput, "양");
    await user.click(await screen.findByRole("checkbox", { name: "양파" }));
    await user.clear(searchInput);
    await user.click(screen.getByRole("button", { name: "육류" }));
    await user.type(searchInput, "소");
    await user.click(await screen.findByRole("checkbox", { name: "소고기" }));
    await user.click(screen.getByRole("button", { name: "적용" }));

    await user.click(screen.getByRole("button", { name: "재료로 검색 (2)" }));

    const reopenedSearchInput = screen.getByPlaceholderText("재료명으로 검색");
    expect(reopenedSearchInput).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: "전체" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    expect(await screen.findByRole("checkbox", { name: "양파" })).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("checkbox", { name: "소고기" })).toHaveProperty(
      "checked",
      true,
    );
  });

  it("shows the ingredient error state and retries with the same q + category", async () => {
    const user = userEvent.setup();
    const failedQueries = new Set<string>();

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        const url = new URL(input, "http://localhost:3000");
        const queryKey = `${url.searchParams.get("q") ?? ""}|${url.searchParams.get("category") ?? ""}`;

        if (queryKey === "양|채소" && !failedQueries.has(queryKey)) {
          failedQueries.add(queryKey);
          return Promise.reject(new Error("ingredients failed"));
        }

        return Promise.resolve({
          items: [
            {
              id: ONION_ID,
              standard_name: "양파",
              category: "채소",
            },
          ],
        });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
      }

      return Promise.resolve(getMockRecipeList());
    });

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "재료로 검색" }));
    await screen.findByRole("dialog", { name: "재료로 검색" });
    await user.click(screen.getByRole("button", { name: "채소" }));
    await user.type(screen.getByPlaceholderText("재료명으로 검색"), "양");

    expect(
      await screen.findByRole("heading", {
        name: "재료 목록을 불러오지 못했어요",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "적용" })).toHaveProperty(
      "disabled",
      true,
    );

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("checkbox", { name: "양파" })).toBeTruthy();
    expect(
      fetchJson.mock.calls.filter(([input]) => {
        if (typeof input !== "string" || !input.startsWith("/api/v1/ingredients")) {
          return false;
        }

        const url = new URL(input, "http://localhost:3000");

        return (
          url.searchParams.get("q") === "양" &&
          url.searchParams.get("category") === "채소"
        );
      }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("removes mirrored ingredient_ids from the URL on a fresh mount with no applied filter", async () => {
    window.history.replaceState({}, "", `/?ingredient_ids=${ONION_ID}`);

    render(<HomeScreen />);

    await waitFor(() => {
      expect(window.location.search).toBe("");
    });
  });
});
