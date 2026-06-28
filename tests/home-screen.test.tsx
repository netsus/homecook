// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
import { E2E_AUTH_OVERRIDE_KEY } from "@/lib/auth/e2e-auth-override";
import { formatCount } from "@/lib/recipe";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import type { RecipeCardItem, RecipeThemesData } from "@/types/recipe";

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

function buildRecipeCard(
  overrides: Partial<RecipeCardItem> & Pick<RecipeCardItem, "id" | "title">,
): RecipeCardItem {
  return {
    ...MOCK_RECIPE_CARD,
    tags: ["한식", "간단", "저녁"],
    ...overrides,
  };
}

function mockAuthedProfileFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/v1/users/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              email: "home@example.com",
              id: "user-1",
              nickname: "김집밥",
              profile_image_url: null,
              settings: { screen_wake_lock: false },
              social_provider: "google",
            },
            error: null,
          }),
        });
      }

      if (url.endsWith("/api/v1/users/me/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              event_counts: {
                cooking_completed: 2,
                custom_book_created: 1,
                planner_registered_first: 1,
                planner_registered_repeat: 3,
                recipe_saved_distinct_ever: 4,
                shopping_completed: 1,
              },
              last_updated_at: "2026-06-21T00:00:00.000Z",
              level: {
                current_level: 3,
                current_level_start_xp: 100,
                next_level_start_xp: 250,
                progress_percent: 40,
                progress_ratio: 0.4,
                total_xp: 160,
                xp_into_current_level: 60,
                xp_to_next_level: 90,
              },
            },
            error: null,
          }),
        });
      }

      if (url.endsWith("/api/v1/users/me/gamification")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              achievement_album: {
                categories: [],
                summary: {
                  completed_category_count: 0,
                  earned_count: 0,
                  total_count: 0,
                },
              },
              badges: { earned: [], locked: [] },
              featured_badges: [],
              grade: {
                grade_key: "sprout_homecook",
                label: "새싹 집밥러",
                level_max: 4,
                level_min: 1,
              },
              last_updated_at: "2026-06-21T00:00:00.000Z",
              level: {
                current_level: 3,
                progress_percent: 40,
                total_xp: 160,
                xp_to_next_level: 90,
              },
              notifications: {
                archive_preview: [],
                priority_unseen: [
                  {
                    body: "레시피를 저장하면 첫 퀘스트가 진행돼요.",
                    category: "tutorial",
                    created_at: "2026-06-21T00:00:00.000Z",
                    delivery_channel: "toast",
                    group_key: null,
                    id: "notice-1",
                    notification_type: "xp_awarded",
                    payload: {},
                    priority: 10,
                    seen_at: null,
                    title: "튜토리얼 안내",
                    toast_eligible: true,
                  },
                ],
                unseen: [],
              },
              quests: {
                active: [
                  {
                    completed_at: null,
                    description: "마음에 드는 레시피를 저장해 보세요.",
                    dismissed_at: null,
                    is_new: true,
                    progress_current: 0,
                    progress_percent: 0,
                    progress_target: 1,
                    quest_key: "first_recipe_saved",
                    quest_type: "tutorial",
                    status: "active",
                    title: "첫 레시피 저장",
                  },
                ],
                completed_recent: [],
              },
              tutorial: {
                active_steps: [
                  {
                    achievement_key: "first_recipe_saved",
                    current: 0,
                    status: "active",
                    target: 1,
                    title: "첫 레시피 저장",
                  },
                ],
                category_key: "tutorial",
                completed_count: 0,
                total_count: 4,
              },
            },
            error: null,
          }),
        });
      }

      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }),
  );
}

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

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      return Promise.resolve(getMockRecipeList());
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
    vi.unstubAllGlobals();
    vi.useRealTimers();
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    window.localStorage.removeItem(E2E_AUTH_OVERRIDE_KEY);
    window.history.replaceState({}, "", "/");
  });

  it("renders the prototype HOME sections on initial load", async () => {
    render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "오늘 뭐 먹지?" }),
    ).toBeTruthy();
    expect(screen.getByText(/요일 (아침|점심|오후|저녁|밤),/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "집밥" }).className).toContain(
      "text-[var(--brand)]",
    );
    expect(screen.getByText("레시피 제목으로 검색하거나, 재료로 좁혀 보세요.")).toBeTruthy();
    expect(screen.getByPlaceholderText("레시피 제목 검색")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /재료로 검색/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "전체" })).toBeNull();
    expect(screen.queryByRole("button", { name: "국물요리" })).toBeNull();
    expect(screen.queryByRole("button", { name: "양파" })).toBeNull();
    expect(
      screen.getByRole("heading", { level: 2, name: "이번 주 추천 테마" }).className,
    ).toContain("home-mobile-theme-title");
    expect(ruleBody(".home-mobile-theme-title")).toContain("color: var(--foreground);");
    expect(screen.queryByRole("link", { name: /이번 주 식단 플래너/ })).toBeNull();
    expect(screen.getByRole("link", { name: /식단 짜기/ }).getAttribute("href")).toBe("/planner");
    expect(screen.getByRole("link", { name: /장보기 준비/ }).getAttribute("href")).toBe("/shopping/flow");
    expect(screen.getByRole("link", { name: /레시피북/ }).getAttribute("href")).toBe("/mypage?tab=recipebooks");
    expect(screen.getByRole("link", { name: /유튜브 가져오기/ }).getAttribute("href")).toBe("/menu/add/youtube");
    expect(screen.queryByRole("link", { name: /성장 보기/ })).toBeNull();
    expect(screen.getByRole("navigation", { name: "홈 하단 탭" })).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("home-result-status").textContent).toBe(
        `모든 레시피 ${getMockRecipeList().items.length}개가 표시돼요.`,
      );
    });
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("href")).toBe("/pantry");
    expect(screen.getByRole("link", { name: "마이" }).getAttribute("href")).toBe("/mypage");
    expect(
      screen.getByRole("heading", { level: 2, name: "모든 레시피" }).className,
    ).toContain("text-[var(--foreground)]");
    const quickLinks = screen.getByRole("navigation", { name: "홈 빠른 이동" });
    const themeHeading = screen.getByRole("heading", { level: 2, name: "이번 주 추천 테마" });
    const recipeHeading = screen.getByRole("heading", { level: 2, name: "모든 레시피" });

    expect(
      quickLinks.compareDocumentPosition(recipeHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      recipeHeading.compareDocumentPosition(themeHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(ruleBody(".home-mobile-theme-section")).toContain("min-height: 258px;");
    expect(ruleBody(".home-mobile-theme-rail")).toContain("min-height: 178px;");
  });

  it("styles the mobile recommended theme rail as a distinct full-width section", () => {
    expect(ruleBody(".home-mobile-theme-section-embedded")).toContain("margin: 8px -16px 10px;");
    expect(ruleBody(".home-mobile-theme-section")).toContain("border-top: 1px solid var(--line);");
    expect(ruleBody(".home-mobile-theme-section")).toContain("border-bottom: 1px solid var(--line);");
    expect(ruleBody(".home-mobile-theme-section")).toContain("background: var(--surface-fill);");
    expect(ruleBody(".home-mobile-theme-card")).toContain("width: min(64vw, 280px);");
    expect(ruleBody(".home-mobile-theme-card")).toContain("height: 174px;");
  });

  it("makes the web weekly theme cards large enough to read in the side rail", () => {
    expect(ruleBody(".web-theme-rail-side .web-theme-card")).toContain("aspect-ratio: 4 / 3;");
    expect(ruleBody(".web-theme-rail-side .web-theme-card")).toContain("min-height: 118px;");
    expect(ruleBody(".web-home-aside-top .web-theme-card-title")).toContain("font-size: 15px;");
  });

  it("moves the web recommended tags and weekly themes up beside the search row", async () => {
    installMatchMedia(true);

    render(<HomeScreen />);

    await screen.findByRole("heading", { level: 1, name: "오늘 뭐 먹지?" });

    const searchLayout = screen.getByTestId("web-discovery-search-layout");
    const contentGrid = document.querySelector(".web-home-content-grid");
    const sideRail = screen.getByTestId("web-home-side-rail-top");

    expect(searchLayout.contains(sideRail)).toBe(false);
    expect(contentGrid?.contains(sideRail)).toBe(true);
    expect(screen.getAllByRole("heading", { level: 2, name: "추천 태그" })).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 2, name: "이번 주 추천 테마" })).toHaveLength(1);
    expect(ruleBody(".web-discovery-search-layout")).toContain(
      "grid-template-columns: minmax(0, 880px);",
    );
    expect(ruleBody(".web-discovery-search-layout .web-discovery-search-row")).toContain("margin-top: 0;");
    expect(ruleBody(".web-home-content-grid")).toContain('grid-template-areas: "recipes aside";');
    expect(ruleBody(".web-home-content-grid")).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);",
    );
    expect(ruleBody(".web-home-aside-top")).toContain("margin-top: -166px;");
  });

  it("keeps the mobile search controls sticky under the app bar", () => {
    const searchRule = ruleBody(".home-mobile-discovery-search");

    expect(searchRule).toContain("position: sticky;");
    expect(searchRule).toContain("top: var(--control-height-xl);");
    expect(searchRule).toContain("z-index: 19;");
    expect(searchRule).toContain("background: var(--surface);");
    expect(searchRule).toContain("padding: 10px 20px 8px;");
    expect(searchRule).toContain("gap: 6px;");
    expect(searchRule).toContain("border-bottom: 0;");
  });

  it("groups the mobile tag filters with the sticky search surface", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(getMockRecipeThemes());
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({
          items: [
            { label: "국물요리", normalized_key: "국물요리" },
            { label: "냉털요리", normalized_key: "냉털요리" },
          ],
        });
      }

      return Promise.resolve(getMockRecipeList());
    });

    const { container } = render(<HomeScreen />);

    const searchInput = await screen.findByPlaceholderText("레시피 제목 검색");
    const tagButton = await screen.findByRole("button", { name: "국물요리" });
    const searchBlock = searchInput.closest(".home-mobile-discovery-search");
    const tagRail = tagButton.closest(".home-mobile-tag-rail");

    expect(searchBlock).not.toBeNull();
    expect(tagRail).not.toBeNull();
    expect(searchBlock?.contains(tagRail)).toBe(true);
    expect(container.querySelector(".home-mobile-filter-chip-row")).toBeNull();

    const searchRule = ruleBody(".home-mobile-discovery-search");
    const tagRailRule = ruleBody(".home-mobile-tag-rail");

    expect(searchRule).toContain("padding: 10px 20px 8px;");
    expect(searchRule).toContain("gap: 6px;");
    expect(searchRule).toContain("border-bottom: 0;");
    expect(tagRailRule).toContain("display: flex;");
    expect(tagRailRule).toContain("overflow-x: auto;");
    expect(tagRailRule).toContain("padding: 0 1px;");
    expect(tagRailRule).toContain("scroll-padding-inline: 1px;");
  });

  it("adds left breathing room to web recipe card titles and metrics", () => {
    expect(ruleBody(".web-recipe-card-body")).toContain("padding: 12px 12px 8px;");
  });

  it("summarizes web HOME tags instead of clipping a long tag chip", async () => {
    installMatchMedia(true);
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      return Promise.resolve({
        items: [
          buildRecipeCard({
            id: "recipe-many-tags",
            tags: ["이모카세두", "흑백요리사", "두부찌개", "초간단"],
            title: "태그가 많은 레시피",
          }),
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    const { container } = render(<HomeScreen />);

    await screen.findByText("태그가 많은 레시피");
    const tagRow = container.querySelector(".web-recipe-card-tags");

    expect(tagRow?.textContent).toContain("이모카세두");
    expect(tagRow?.textContent).not.toContain("흑백요리사");
    expect(tagRow?.textContent).not.toContain("두부찌개");
    expect(tagRow?.textContent).toContain("+3");
    expect(ruleBody(".web-recipe-card-tags")).toContain("flex-wrap: nowrap;");
    expect(ruleBody(".web-recipe-card-tags")).toContain("max-height: 24px;");
    expect(ruleBody(".web-recipe-card-tags")).toContain("overflow: hidden;");
    expect(ruleBody(".web-recipe-card-tag")).toContain("white-space: nowrap;");
    expect(ruleBody(".web-recipe-card-tag")).toContain("flex: 0 0 auto;");
    expect(ruleBody(".web-recipe-card-tag")).not.toContain("text-overflow: ellipsis;");
    expect(ruleBody(".web-recipe-card-tag-more")).toContain("color: var(--web-primary);");
    expect(ruleBody(".web-home-recipe-card .web-recipe-card")).toContain("height: 100%;");
  });

  it("reserves enough room for the web HOME +N tag summary on compact cards", async () => {
    installMatchMedia(true);
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      return Promise.resolve({
        items: [
          buildRecipeCard({
            id: "recipe-compact-tags",
            tags: ["생딸기", "우유", "설탕", "디저트", "간식", "냉장"],
            title: "오븐도 젤라틴도 필요 없는 딸기 우유 푸딩 만들기",
          }),
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    const { container } = render(<HomeScreen />);

    await screen.findByText("오븐도 젤라틴도 필요 없는 딸기 우유 푸딩 만들기");
    const tagRow = container.querySelector(".web-recipe-card-tags");
    const moreChip = container.querySelector(".web-recipe-card-tag-more");

    expect(tagRow?.textContent).toContain("생딸기");
    expect(tagRow?.textContent).toContain("우유");
    expect(tagRow?.textContent).not.toContain("설탕");
    expect(tagRow?.textContent).toContain("+4");
    expect(moreChip?.getAttribute("aria-label")).toBe("숨긴 태그 4개");
    expect(ruleBody(".web-recipe-card-tag-more")).toContain("min-width: 34px;");
    expect(ruleBody(".web-recipe-card-tag-more")).toContain("justify-content: center;");
  });

  it("loads the next recipe page from the home list cursor", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      const url = new URL(input, "http://localhost:3000");

      if (url.searchParams.get("cursor") === "cursor-page-2") {
        return Promise.resolve({
          items: [
            buildRecipeCard({
              id: "recipe-page-2",
              title: "두 번째 페이지 레시피",
            }),
          ],
          next_cursor: null,
          has_next: false,
        });
      }

      return Promise.resolve({
        items: [
          buildRecipeCard({
            id: "recipe-page-1",
            title: "첫 번째 페이지 레시피",
          }),
        ],
        next_cursor: "cursor-page-2",
        has_next: true,
      });
    });

    render(<HomeScreen />);

    expect(await screen.findByText("첫 번째 페이지 레시피")).toBeTruthy();
    expect(screen.getByText(/1개 표시 중/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByText("두 번째 페이지 레시피")).toBeTruthy();
    expect(screen.getByText(/2개 표시 중/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
    expect(
      fetchJson.mock.calls.some(([input]) => {
        if (typeof input !== "string" || !input.startsWith("/api/v1/recipes?")) {
          return false;
        }

        const url = new URL(input, "http://localhost:3000");
        return url.searchParams.get("cursor") === "cursor-page-2";
      }),
    ).toBe(true);
  });

  it("does not show misleading +N tags on mobile recipe cards", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({ themes: [] });
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      return Promise.resolve({
        items: [
          buildRecipeCard({
            id: "recipe-many-mobile-tags",
            tags: ["생딸기", "우유", "설탕", "디저트", "간식", "냉장"],
            title: "모바일 태그 많은 레시피",
          }),
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    await screen.findByText("모바일 태그 많은 레시피");
    expect(screen.getByText("생딸기")).toBeTruthy();
    expect(screen.queryByText("+3")).toBeNull();
  });

  it("inserts popular themes around the middle of the app recipe list", async () => {
    const recipes = [
      buildRecipeCard({ id: "recipe-1", title: "첫 번째 레시피" }),
      buildRecipeCard({ id: "recipe-2", title: "두 번째 레시피" }),
      buildRecipeCard({ id: "recipe-3", title: "세 번째 레시피" }),
      buildRecipeCard({ id: "recipe-4", title: "네 번째 레시피" }),
      buildRecipeCard({ id: "recipe-5", title: "다섯 번째 레시피" }),
    ];
    const themeData: RecipeThemesData = {
      themes: [
        {
          id: "theme-mid",
          recipes: [recipes[0]!],
          title: "중간 인기 테마",
        },
      ],
    };

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve(themeData);
      }

      if (input.startsWith("/api/v1/tags")) {
        return Promise.resolve({ items: [] });
      }

      return Promise.resolve({
        items: recipes,
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    const fourthRecipe = await screen.findByRole("heading", {
      level: 3,
      name: "네 번째 레시피",
    });
    const themeHeading = screen.getByRole("heading", {
      level: 2,
      name: "이번 주 추천 테마",
    });
    const fifthRecipe = screen.getByRole("heading", {
      level: 3,
      name: "다섯 번째 레시피",
    });

    expect(
      fourthRecipe.compareDocumentPosition(themeHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      themeHeading.compareDocumentPosition(fifthRecipe) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps mobile popular themes from duplicating visible tag filters", async () => {
    const recipe = buildRecipeCard({ id: "recipe-theme", title: "테마 확인 레시피" });

    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({
          themes: [
            {
              id: "korean",
              recipes: [recipe],
              tag_key: "한식",
              tag_label: "한식",
              title: "한식",
            },
            {
              id: "youtube",
              recipes: [recipe],
              title: "유튜브에서 가져온 레시피",
            },
          ],
        });
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

      return Promise.resolve({
        items: [
          buildRecipeCard({ id: "recipe-1", title: "첫 번째 레시피" }),
          buildRecipeCard({ id: "recipe-2", title: "두 번째 레시피" }),
          buildRecipeCard({ id: "recipe-3", title: "세 번째 레시피" }),
          buildRecipeCard({ id: "recipe-4", title: "네 번째 레시피" }),
          buildRecipeCard({ id: "recipe-5", title: "다섯 번째 레시피" }),
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    expect(await screen.findByRole("button", { name: "한식" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /한식\s*1개 레시피/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /유튜브에서 가져온 레시피\s*1개 레시피/ }),
    ).toBeTruthy();
  });

  it("renders the desktop HOME discovery layout at the web breakpoint", async () => {
    installMatchMedia(true);

    const { container } = render(<HomeScreen />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "오늘 뭐 먹지?" }),
    ).toBeTruthy();
    expect(screen.getByText(/요일 (아침|점심|오후|저녁|밤),/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "집밥" })).toBeTruthy();
    expect(screen.getByPlaceholderText("레시피 제목 검색")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /재료로 검색/ }),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: "플래너" }).getAttribute("href")).toBe("/planner");
    expect(screen.queryByRole("button", { name: "국물요리" })).toBeNull();
    expect(screen.queryByRole("button", { name: "양파" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "홈 빠른 이동" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /장보기 준비/ }).getAttribute("href")).toBe("/shopping/flow");
    expect(screen.getByRole("link", { name: /유튜브 가져오기/ }).getAttribute("href")).toBe("/menu/add/youtube");
    expect(screen.queryByRole("link", { name: /성장 보기/ })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "홈 하단 탭" }),
    ).toBeNull();
    expect(container.querySelector(".home-mobile-discovery-title")).toBeNull();
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

  it("filters unsafe recipe and theme labels before rendering public discovery content", async () => {
    fetchJson.mockImplementation((input: string) => {
      if (input.startsWith("/api/v1/ingredients")) {
        return Promise.resolve({ items: INGREDIENT_ITEMS });
      }

      if (input.startsWith("/api/v1/recipes/themes")) {
        return Promise.resolve({
          themes: [
            {
              id: "theme-bad",
              title: "토블론",
              recipes: [MOCK_RECIPE_CARD],
            },
            {
              id: "theme-safe",
              title: "든든한 집밥",
              recipes: [
                MOCK_RECIPE_CARD,
                {
                  ...MOCK_RECIPE_CARD,
                  id: "unsafe-theme-recipe",
                  title: "ㅏ;ㅣ;",
                },
              ],
            },
          ],
        });
      }

      return Promise.resolve({
        items: [
          MOCK_RECIPE_CARD,
          {
            ...MOCK_RECIPE_CARD,
            id: "unsafe-recipe",
            title: "ㄴㅇㄹㅇ",
          },
        ],
        next_cursor: null,
        has_next: false,
      });
    });

    render(<HomeScreen />);

    expect(await screen.findByText(MOCK_RECIPE_CARD.title)).toBeTruthy();
    expect(screen.queryByText("토블론")).toBeNull();
    expect(screen.queryByText("ㅏ;ㅣ;")).toBeNull();
    expect(screen.queryByText("ㄴㅇㄹㅇ")).toBeNull();
    expect(screen.getByText("든든한 집밥")).toBeTruthy();
  });

  it("moves filtered results directly under the search controls", async () => {
    const user = userEvent.setup();

    render(<HomeScreen />);

    await user.type(await screen.findByPlaceholderText("레시피 제목 검색"), "김치");

    expect(screen.queryByRole("navigation", { name: "홈 빠른 이동" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: "이번 주 추천 테마" })).toBeNull();
    await waitFor(() => {
      expect(
        screen.getAllByRole("status").some((status) =>
          status.textContent?.includes("검색 결과"),
        ),
      ).toBe(true);
    });
  });

  it("does not duplicate a selected tag as a separate reset row", async () => {
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
      expect(screen.getByTestId("home-result-status").textContent).toContain(
        "한식",
      );
    });
    expect(screen.getByRole("button", { name: "한식" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: "#한식" })).toBeNull();
    expect(screen.queryByRole("button", { name: "초기화" })).toBeNull();
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
    const categoryGroup = screen.getByRole("group", { name: "카테고리 선택" });
    const vegetableCategoryButton = screen.getByRole("button", {
      name: VEGETABLE_GROUP.label,
    });
    const onionCheckbox = await screen.findByRole("checkbox", { name: "양파" });
    const onionOption = onionCheckbox.closest("label");

    expect(dialog.className).toContain("web-dialog-narrow");
    expect(dialog.className).toContain("web-ingredient-picker-dialog");
    expect(categoryGroup.className).toContain("web-ingredient-category-rail");
    expect(vegetableCategoryButton.className).toContain("web-ingredient-category-chip");
    expect(ruleBody(".web-ingredient-category-rail")).toContain("overflow-x: auto;");
    expect(ruleBody(".web-ingredient-picker-dialog.web-dialog-narrow")).toContain(
      "width: min(600px, calc(100vw - 64px));",
    );
    expect(ruleBody(".web-ingredient-modal-grid")).toContain(
      "grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));",
    );
    expect(ruleBody(".web-ingredient-category-chip.web-chip")).toContain(
      "border-radius: var(--web-r-pill);",
    );
    expect(ruleBody(".web-ingredient-option")).toContain("padding: 10px 14px;");
    expect(ruleBody(".web-ingredient-option span:not(.visually-hidden)")).toContain(
      "overflow-wrap: anywhere;",
    );
    expect(ruleBody(".web-ingredient-option span:not(.visually-hidden)")).toContain(
      "white-space: normal;",
    );
    expect(ruleBody(".web-ingredient-option span:not(.visually-hidden)")).not.toContain(
      "text-overflow: ellipsis;",
    );
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
      name: /조회 많은 레시피/,
    });

    await user.click(themeButton);
    expect(
      screen.getByRole("heading", { level: 2, name: "조회 많은 레시피" }),
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
      name: "이번 주 추천 테마",
    });

    const initialThemeCalls = fetchJson.mock.calls.filter(([input]) => {
      return typeof input === "string" && input.startsWith("/api/v1/recipes/themes");
    }).length;

    await user.click(await screen.findByRole("button", { name: /정렬 기준/i }));
    await user.click(screen.getByText("저장순"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "이번 주 추천 테마" })).toBeTruthy();
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
      name: "이번 주 추천 테마",
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

  it("opens a mobile profile summary with records, level, notifications, and tutorial quest", async () => {
    window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, "authenticated");
    mockAuthedProfileFetch();

    const user = userEvent.setup();
    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "김집밥 프로필 요약 열기" }));
    const summary = await screen.findByRole("dialog", { name: "마이페이지 요약" });

    expect(within(summary).getByText("김집밥")).toBeTruthy();
    expect(within(summary).getByText("새싹 집밥러")).toBeTruthy();
    expect(within(summary).getByText("Lv.3")).toBeTruthy();
    expect(within(summary).getByText("요리기록")).toBeTruthy();
    expect(within(summary).getByText("플래너기록")).toBeTruthy();
    expect(within(summary).getByText("장보기기록")).toBeTruthy();
    expect(within(summary).getByText("튜토리얼 안내")).toBeTruthy();
    expect(within(summary).getByText("첫 레시피 저장")).toBeTruthy();
  });

  it("opens the web profile summary from the fixed top navigation avatar", async () => {
    installMatchMedia(true);
    window.localStorage.setItem(E2E_AUTH_OVERRIDE_KEY, "authenticated");
    mockAuthedProfileFetch();

    const user = userEvent.setup();
    render(<HomeScreen />);

    await user.click(await screen.findByRole("button", { name: "김집밥 프로필 요약 열기" }));
    const summary = await screen.findByRole("dialog", { name: "마이페이지 요약" });

    expect(within(summary).getByText("요리기록")).toBeTruthy();
    expect(within(summary).getByRole("button", { name: "알림 기록 보기" })).toBeTruthy();
    expect(within(summary).queryByRole("link", { name: "마이페이지로 이동" })).toBeNull();
  });
});
