// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import {
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
} from "@/lib/ingredient-categories";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";
import { formatCount } from "@/lib/recipe";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";

const fetchJson = vi.fn();
const ONION_ID = "550e8400-e29b-41d4-a716-446655440010";
const GREEN_ONION_ID = "550e8400-e29b-41d4-a716-446655440011";
const BEEF_ID = "550e8400-e29b-41d4-a716-446655440012";
const VEGETABLE_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "vegetable")!.label;
const MEAT_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "meat")!.label;
const VEGETABLE_GROUP = INGREDIENT_CATEGORY_GROUP_OPTIONS.find(
  ({ value }) => value === "vegetable_mushroom",
)!;
const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

const INGREDIENT_ITEMS = [
  {
    id: ONION_ID,
    standard_name: "양파",
    category: VEGETABLE_CATEGORY,
  },
  {
    id: GREEN_ONION_ID,
    standard_name: "대파",
    category: VEGETABLE_CATEGORY,
  },
  {
    id: BEEF_ID,
    standard_name: "소고기",
    category: MEAT_CATEGORY,
  },
];

vi.mock("@/lib/api/fetch-json", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
  isApiFetchError: () => false,
}));

function installMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 1024px)" ? matches : !matches,
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

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

describe("home screen", () => {
  beforeEach(() => {
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    fetchJson.mockReset();
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        const url = new URL(input, "http://localhost:3000");
        const query = url.searchParams.get("q")?.trim() ?? "";
        const categoryGroupCode = url.searchParams.get("category_group_code");

        return Promise.resolve({
          items: INGREDIENT_ITEMS.filter((ingredient) => {
            const matchesCategory =
              !categoryGroupCode ||
              (categoryGroupCode === VEGETABLE_GROUP.value &&
                ingredient.category === VEGETABLE_CATEGORY);
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
    Reflect.deleteProperty(window, "matchMedia");
    vi.useRealTimers();
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    window.history.replaceState({}, "", "/");
  });

  it("renders the prototype HOME sections on initial load", async () => {
    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "오늘 뭐 먹지?" }),
    ).toBeTruthy();
    expect(screen.getByText(/요일 (아침|점심|오후|저녁|밤),/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "HOMECOOK" }).className).toContain(
      "text-[var(--brand)]",
    );
    expect(screen.getByText("레시피 제목으로 검색하거나, 재료로 좁혀 보세요.")).toBeTruthy();
    expect(screen.getByPlaceholderText("레시피 제목 검색")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /재료로 검색/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "전체" })).toBeNull();
    expect(screen.queryByRole("button", { name: "국물요리" })).toBeNull();
    expect(screen.queryByRole("button", { name: "양파" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "이번 주 인기 테마" }).className,
    ).toContain("text-[var(--foreground)]");
    expect(screen.queryByRole("link", { name: /이번 주 식단 플래너/ })).toBeNull();
    expect(screen.getByRole("link", { name: /식단 짜기/ }).getAttribute("href")).toBe("/planner");
    expect(screen.getByRole("link", { name: /장보기 준비/ }).getAttribute("href")).toBe("/shopping/flow");
    expect(screen.getByRole("link", { name: /레시피북/ }).getAttribute("href")).toBe("/mypage?tab=recipebooks");
    expect(screen.getByRole("link", { name: /성장 보기/ }).getAttribute("href")).toBe("/mypage");
    expect(screen.getByRole("navigation", { name: "HOME 하단 탭" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("home-result-status").textContent).toBe(
        `모든 레시피 ${getMockRecipeList().items.length}개가 표시됩니다.`,
      );
    });
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("href")).toBe("/pantry");
    expect(screen.getByRole("link", { name: "마이" }).getAttribute("href")).toBe("/mypage");
    expect(
      screen.getByRole("heading", { level: 2, name: "모든 레시피" }).className,
    ).toContain("text-[var(--foreground)]");
    expect(screen.queryByText(`(${getMockRecipeList().items.length})`)).toBeNull();
  });

  it("keeps the mobile meal greeting lighter than section titles", () => {
    expect(ruleBody(".home-mobile-discovery-kicker")).toContain("font-weight: 600;");
  });

  it("lets the mobile HOME view use the shared full app width", () => {
    const { container } = render(<HomeScreen />);
    const hasNarrowHomeFrame = Array.from(container.querySelectorAll("div")).some((element) =>
      element.className.toString().includes("max-w-[430px]"),
    );

    expect(hasNarrowHomeFrame).toBe(false);
  });

  it("reserves mobile loading rail heights to avoid Lighthouse layout shift", () => {
    expect(ruleBody(".home-mobile-tag-rail")).toContain("min-height: 40px;");
    expect(ruleBody(".home-mobile-theme-section")).toContain("min-height: 195px;");
    expect(ruleBody(".home-mobile-theme-rail")).toContain("min-height: 129px;");
  });

  it("adds left breathing room to web recipe card titles and metrics", () => {
    expect(ruleBody(".web-recipe-card-body")).toContain("padding: 12px 12px 8px;");
  });

  it("renders the desktop HOME discovery layout at the web breakpoint", async () => {
    installMatchMedia(true);

    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "오늘 뭐 먹지?" }),
    ).toBeTruthy();
    expect(screen.getByText(/요일 (아침|점심|오후|저녁|밤),/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /HOMECOOK/ })).toBeTruthy();
    expect(screen.getByPlaceholderText("레시피 제목 검색")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /재료로 검색/ }),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: "플래너" }).getAttribute("href")).toBe("/planner");
    expect(screen.queryByRole("button", { name: "국물요리" })).toBeNull();
    expect(screen.queryByRole("button", { name: "양파" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "홈 빠른 이동" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /장보기 준비/ }).getAttribute("href")).toBe("/shopping/flow");
    expect(
      screen.queryByRole("navigation", { name: "HOME 하단 탭" }),
    ).toBeNull();
    expect(
      await screen.findByRole("heading", { level: 2, name: "모든 레시피" }),
    ).toBeTruthy();
  });

  it("shows YouTube source as a web card image badge instead of bottom meta text", async () => {
    installMatchMedia(true);
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      return Promise.resolve({
        items: [
          {
            ...MOCK_RECIPE_CARD,
            id: "recipe-youtube",
            source_type: "youtube" as const,
            save_count: 20,
          },
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    const { container } = render(<HomeScreen />);

    await screen.findByText(MOCK_RECIPE_CARD.title);
    expect(container.querySelector(".web-recipe-card-badge")?.textContent).toBe("유튜브");
    expect(container.querySelector(".web-recipe-card-body")?.className).toContain(
      "web-recipe-card-body",
    );
    expect(container.querySelector(".web-recipe-card-meta")?.textContent).not.toContain("유튜브");
    expect(container.querySelector(".web-recipe-card-tags")?.textContent).toContain("한식");
    expect(container.querySelector(".web-recipe-card-tags")?.textContent).toContain("찌개");
  });

  it("keeps hydrated saved bookmarks visible after HOME reload", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      return Promise.resolve({
        items: [
          {
            ...MOCK_RECIPE_CARD,
            user_status: {
              is_saved: true,
              saved_book_ids: ["book-saved"],
            },
          },
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    const saveButton = await screen.findByRole("button", {
      name: `${MOCK_RECIPE_CARD.title} 저장`,
    });

    await waitFor(() => {
      expect(saveButton.getAttribute("aria-pressed")).toBe("true");
    });
  });

  it("removes the non-functional mobile recipe category chip rail", async () => {
    render(<HomeScreen />);

    await screen.findByRole("button", { name: /재료로 검색/ });
    expect(screen.queryByRole("button", { name: "국물요리" })).toBeNull();
    expect(screen.queryByRole("button", { name: "전체" })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "모든 레시피" })).toBeTruthy();
  });

  it("opens the ingredient modal from the more chip and applies modal filters", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: /재료로 검색/ }));
    const dialog = await screen.findByRole("dialog", { name: "재료로 검색" });

    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");

    const onionCheckbox = await screen.findByRole("checkbox", { name: "양파" });
    const ingredientGrid = onionCheckbox.closest("ul");
    const onionOption = onionCheckbox.closest("label");

    expect(onionCheckbox).toBeTruthy();
    expect(ingredientGrid?.className).toContain("grid-cols-2");
    expect(onionOption?.className).toContain("rounded-[var(--radius-card)]");
    expect(onionOption?.className).toContain("text-[15px]");
    expect(onionOption?.className).toContain("text-center");

    await user.click(screen.getByRole("button", { name: VEGETABLE_GROUP.label }));
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
            url.searchParams.get("category_group_code") === VEGETABLE_GROUP.value
          );
        }),
      ).toBe(true);
    });

    await user.click(screen.getByRole("checkbox", { name: "양파" }));
    const selectedOnionOption = screen
      .getByRole("checkbox", { name: "양파" })
      .closest("label");
    expect(selectedOnionOption?.className).toContain("bg-[var(--brand-soft)]");
    expect(screen.queryByText("1개 선택")).toBeNull();
    expect(screen.queryByText("1개 선택됨")).toBeNull();
    await user.click(screen.getByRole("button", { name: /적용/ }));

    await waitFor(() => {
      expect(window.location.search).toContain(`ingredient_ids=${ONION_ID}`);
    });
    const activeIngredientChip = screen.getByRole("button", { name: "재료 1개" });
    expect(activeIngredientChip.className).toContain("home-mobile-filter-chip-active");
    expect(screen.getByRole("button", { name: "초기화" }).className).toContain(
      "home-mobile-filter-reset",
    );
  });

  it("uses the narrower desktop ingredient modal with compact centered ingredient pills", async () => {
    const user = userEvent.setup();
    installMatchMedia(true);

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: /재료로 검색/ }));
    const dialog = await screen.findByRole("dialog", { name: "재료로 검색" });
    const onionCheckbox = await screen.findByRole("checkbox", { name: "양파" });
    const onionOption = onionCheckbox.closest("label");

    expect(dialog.className).toContain("web-dialog-narrow");
    expect(onionOption?.className).toContain("web-ingredient-option");
    expect(onionOption?.className).toContain("web-ingredient-option-card");
    expect(screen.queryByText("1개 선택됨")).toBeNull();
    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();

    await user.click(onionCheckbox);

    expect(onionOption?.className).toContain("web-ingredient-option-card");
    expect(onionOption?.className).toContain("web-ingredient-option-active");
  });

  it("updates the visible app recipe card view count when the recipe is opened", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await screen.findByRole("heading", { name: MOCK_RECIPE_CARD.title });
    expect(
      screen.getByText(`조회 ${formatCount(MOCK_RECIPE_CARD.view_count)}`),
    ).toBeTruthy();

    const recipeLinks = screen.getAllByRole("link", {
      name: MOCK_RECIPE_CARD.title,
    });
    recipeLinks[0]!.addEventListener("click", (event) => event.preventDefault());
    await user.click(recipeLinks[0]!);

    expect(
      screen.getByText(`조회 ${formatCount(MOCK_RECIPE_CARD.view_count + 1)}`),
    ).toBeTruthy();
  });

  it("clears the theme filter when the active theme card is tapped again", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const themeButton = await screen.findByRole("button", {
      name: /이번 주 인기 레시피/,
    });

    await user.click(themeButton);
    expect(
      screen.getByRole("heading", { level: 2, name: "이번 주 인기 레시피" }),
    ).toBeTruthy();

    await user.click(themeButton);
    expect(screen.getByRole("heading", { level: 2, name: "모든 레시피" })).toBeTruthy();
  });

  it("loads public tag chips and applies exact Korean tag filters", async () => {
    const user = userEvent.setup();

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({
          items: [
            {
              normalized_key: "한식",
              label: "한식",
              slug: null,
              kind: "semantic",
              is_system: true,
              theme_eligible: true,
              usage_count: 12,
            },
          ],
        });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      return Promise.resolve(getMockRecipeList());
    });

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "한식" }));

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("tag") === "한식";
        }),
      ).toBe(true);
    });
    expect(
      fetchJson.mock.calls.some(([input]) => {
        if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
          return false;
        }

        return new URL(input, "http://localhost:3000").searchParams.get("tag") === "hansik";
      }),
    ).toBe(false);
  });

  it("uses a tag-backed theme key for exact recipe filtering", async () => {
    const user = userEvent.setup();

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({
          themes: [
            {
              id: "theme-korean",
              title: "한식 인기",
              tag_key: "한식",
              tag_label: "한식",
              recipes: [MOCK_RECIPE_CARD],
            },
          ],
        });
      }

      return Promise.resolve(getMockRecipeList());
    });

    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: /한식 인기/ }));

    await waitFor(() => {
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("tag") === "한식";
        }),
      ).toBe(true);
    });
    expect(screen.getByRole("heading", { level: 2, name: "한식 인기" })).toBeTruthy();
  });

  it("opens the login gate from the recipe card save button for guests", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.click(
      await screen.findByRole("button", {
        name: `${MOCK_RECIPE_CARD.title} 저장`,
      }),
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("로그인이 필요한 작업이에요")).toBeTruthy();
    expect(useDiscoveryFilterStore.getState().appliedIngredientIds).toEqual([]);
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("keeps the search debounce at 300ms", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const searchInput = await screen.findByPlaceholderText("레시피 제목 검색");

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

  it("uses an inline SortDropdown with the approved MVP/prototype sort contract", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    const sortButton = await screen.findByRole("button", { name: /정렬 기준/i });
    expect(sortButton.textContent).toContain("조회수순");

    await user.click(sortButton);

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    expect(screen.getByText("최신순")).toBeTruthy();
    expect(screen.getByText("요리완료순")).toBeTruthy();
    expect(screen.queryByText("좋아요순")).toBeNull();

    await user.click(screen.getByText("최신순"));

    await waitFor(() => {
      expect(sortButton.textContent).toContain("최신순");
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("sort") === "latest";
        }),
      ).toBe(true);
    });
  });

  it("keeps themed recipes mounted and does not refetch themes when only sort changes", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await screen.findByRole("heading", {
      level: 2,
      name: "이번 주 인기 테마",
    });

    const initialThemeCalls = fetchJson.mock.calls.filter(([input]) => {
      return typeof input === "string" && input.startsWith("/api/v1/recipes/themes");
    }).length;

    await user.click(await screen.findByRole("button", { name: /정렬 기준/i }));
    await user.click(screen.getByText("저장순"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "이번 주 인기 테마" })).toBeTruthy();
      expect(
        fetchJson.mock.calls.some(([input]) => {
          if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
            return false;
          }

          const url = new URL(input, "http://localhost:3000");
          return url.searchParams.get("sort") === "save_count";
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
      await screen.findByRole("heading", { name: "조건에 맞는 레시피가 없어요" }),
    ).toBeTruthy();
    expect(
      screen.getByText("다른 키워드나 재료 조합으로 다시 찾아보세요."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "초기화" })).toBeTruthy();
    expect(screen.getByTestId("home-search-empty-state").className).toContain(
      "home-search-empty-state",
    );
    expect(screen.queryByText("비어 있어요")).toBeNull();
    expect(
      screen
        .getByRole("heading", { name: "조건에 맞는 레시피가 없어요" })
        .closest("[data-testid='home-search-empty-state']"),
    ).toBeTruthy();
  });

  it("shows the desktop empty state when web recipes and themes are empty", async () => {
    installMatchMedia(true);
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
      await screen.findByRole("heading", { name: "조건에 맞는 레시피가 없어요" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "초기화" })).toBeTruthy();
    expect(screen.getByTestId("home-search-empty-state").className).toContain(
      "home-search-empty-state",
    );
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
    const themeHeading = screen.getByRole("heading", {
      level: 2,
      name: "이번 주 인기 테마",
    });
    const errorHeading = screen.getByRole("heading", {
      name: "레시피를 불러오지 못했어요",
    });

    expect(
      themeHeading.compareDocumentPosition(errorHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "레시피를 불러오지 못했어요" })
        .closest("[data-state-kind='prototype-derived']")
        ?.getAttribute("data-state-tone"),
    ).toBe("error");
  });

  it("shows the desktop recipe error state with a retry action", async () => {
    installMatchMedia(true);
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      return Promise.reject(new Error("recipes failed"));
    });

    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { name: "레시피를 불러오지 못했어요" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("keeps the title search when clearing only the ingredient filter", async () => {
    const user = userEvent.setup();
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [ONION_ID] });

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

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "초기화" }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole("button", { name: "초기화" })[0]!);

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

  it("positions the ingredient filter action under the mobile search field", async () => {
    render(<HomeScreen />);

    const searchInput = await screen.findByPlaceholderText("레시피 제목 검색");
    const moreButton = screen.getByRole("button", { name: /재료로 검색/ });
    const searchBlock = searchInput.closest(".home-mobile-discovery-search");

    expect(screen.queryByRole("button", { name: "국물요리" })).toBeNull();
    expect(searchBlock).not.toBeNull();
    expect(searchBlock?.contains(moreButton)).toBe(true);
  });

  it("does not render header profile or cart icons", async () => {
    render(<HomeScreen />);

    await screen.findByRole("heading", { name: "HOMECOOK" });

    expect(screen.queryByRole("button", { name: "장보기" })).toBeNull();
    expect(screen.queryByText("채")).toBeNull();
  });
});
