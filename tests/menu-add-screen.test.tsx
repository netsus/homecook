// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import * as mealApi from "@/lib/api/meal";
import * as recipeApi from "@/lib/api/recipe";

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/api/leftovers", () => ({
  fetchLeftovers: vi.fn(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipes: vi.fn(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({
  fetchCookingMethods: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { methods: [] },
      error: null,
    }),
  ),
}));

vi.mock("@/lib/api/youtube-import", () => ({
  validateYoutubeUrl: vi.fn(),
  extractYoutubeRecipe: vi.fn(),
  registerYoutubeRecipe: vi.fn(),
}));

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "550e8400-e29b-41d4-a716-446655440050",
  slotName: "아침",
  initialAuthenticated: true,
} as const;

function installMatchMedia(matchesDesktop = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
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

describe("MenuAddScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(leftoversApi.fetchLeftovers).mockReset();
    vi.mocked(mealApi.createMealSafe).mockReset();
    vi.mocked(recipeApi.fetchRecipes).mockReset();
    vi.mocked(recipeApi.fetchRecipes).mockResolvedValue({
      success: true,
      data: {
        has_next: false,
        items: [],
        next_cursor: null,
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens a YouTube entry sheet before continuing to the import route", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");

    expect((youtubeButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(youtubeButton);

    const dialog = screen.getByRole("dialog", { name: "유튜브에서 가져오기" });
    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(mockRouterPush).not.toHaveBeenCalled();

    await user.type(
      within(dialog).getByLabelText("유튜브 링크"),
      "https://www.youtube.com/watch?v=recipe12345",
    );
    const continueLink = within(dialog).getByRole("link", {
      name: "가져오기 화면 열기",
    }) as HTMLAnchorElement;
    const pushedHref = continueLink.getAttribute("href") ?? "";

    expect(pushedHref).toContain("/menu/add/youtube?");
    expect(pushedHref).toContain(`date=${DEFAULT_PROPS.planDate}`);
    expect(pushedHref).toContain(`columnId=${DEFAULT_PROPS.columnId}`);
    expect(pushedHref).toContain(`slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`);
    expect(pushedHref).toContain(
      `youtubeUrl=${encodeURIComponent("https://www.youtube.com/watch?v=recipe12345")}`,
    );
    expect(pushedHref).toContain("returnTo=");
  });

  // ─── Wave1 acceptance tests ─────────────────────────────────────────────────

  it("renders the mobile option list with correct data-testids (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const grid = screen.getByTestId("menu-add-option-grid");
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("flex");

    // All six Wave1 options should be present.
    expect(screen.getByTestId("menu-add-option-search")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-recipebook")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-pantry")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-leftover")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-youtube")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-manual")).toBeTruthy();
  });

  it("opens and focuses the mobile recipe search picker from the search option tile (Wave1)", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-search"));

    expect(screen.getByRole("heading", { name: "검색으로 추가" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("레시피 검색"));
  });

  it("uses a larger clear magnifier in the mobile recipe search field", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-search"));

    const icon = screen.getByTestId("recipe-search-submit-icon");
    const iconClass = icon.getAttribute("class") ?? "";
    expect(iconClass).toContain("h-7");
    expect(iconClass).toContain("w-7");
    expect(iconClass).not.toContain("rotate-[-12deg]");
  });

  it("shows the mobile target context instead of the legacy secondary heading (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    expect(screen.getByText("대상")).toBeTruthy();
    expect(screen.getByText("4/18 아침")).toBeTruthy();
    expect(screen.queryByText("다른 방법으로 추가")).toBeNull();
  });

  it("opens the requested picker when source is provided by the planner sheet", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="leftover" />);

    const screenView = await screen.findByTestId("leftover-picker-screen");

    expect(screenView).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "남은 요리에서 추가" })).toBeNull();
    expect(leftoversApi.fetchLeftovers).toHaveBeenCalledWith("leftover");
  });

  it("returns from the leftover picker back button to the option list", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-leftover"));

    const pickerScreen = await screen.findByTestId("leftover-picker-screen");
    await user.click(within(pickerScreen).getByTestId("leftover-picker-back"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.queryByTestId("leftover-picker-screen")).toBeNull();
  });

  it("uses matching typography for YouTube and manual option tiles", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const recipeBookButton = screen.getByTestId("menu-add-option-recipebook");
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");
    const manualButton = screen.getByTestId("menu-add-option-manual");

    expect(youtubeButton.className).toBe(recipeBookButton.className);
    expect(manualButton.className).toBe(recipeBookButton.className);
  });

  it("keeps the desktop option rail visible while opening manual recipe create in the right panel", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-manual"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.getByTestId("manual-recipe-embedded")).toBeTruthy();
    expect(screen.getByLabelText("요리 이름")).toBeTruthy();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("keeps the mobile manual option routed to the standalone create screen", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-manual"));

    const pushedHref = mockRouterPush.mock.calls.at(-1)?.[0] as string;
    expect(pushedHref).toContain("/menu/add/manual?");
    expect(pushedHref).toContain(`date=${DEFAULT_PROPS.planDate}`);
    expect(pushedHref).toContain(`columnId=${DEFAULT_PROPS.columnId}`);
    expect(pushedHref).toContain(`slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`);
  });

  it("keeps the desktop option rail visible while opening YouTube import in the right panel", async () => {
    installMatchMedia(true);

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-youtube"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(screen.getByTestId("youtube-import-embedded")).toBeTruthy();
    expect(screen.getByLabelText("유튜브 URL")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "유튜브에서 가져오기" })).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("keeps the desktop option rail visible while opening leftovers in the right panel", async () => {
    installMatchMedia(true);
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-leftover"));

    expect(screen.getByTestId("menu-add-option-grid")).toBeTruthy();
    expect(await screen.findByTestId("leftover-picker-web")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "남은 요리에서 추가" })).toBeNull();
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("returns from a source picker to the planner meal-add modal context", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        restore: "meal-add-modal",
        returnSurface: "planner.meal-add-modal",
        returnTo: `/planner?date=${DEFAULT_PROPS.planDate}&columnId=${DEFAULT_PROPS.columnId}&slot=${DEFAULT_PROPS.slotName}`,
      }),
    );

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="search" />);

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("뒤로"));

    const replacedHref = mockRouterReplace.mock.calls.at(-1)?.[0] as string;
    expect(replacedHref).toContain("/planner?");
    expect(replacedHref).toContain(`date=${DEFAULT_PROPS.planDate}`);
    expect(replacedHref).toContain(`columnId=${DEFAULT_PROPS.columnId}`);
    expect(replacedHref).toContain("returnSurface=planner.meal-add-modal");
    expect(replacedHref).toContain("restore=meal-add-modal");
  });

  it("renders each option with emoji, label, and subtitle (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    // Check leftover option has all parts
    const leftoverBtn = screen.getByTestId("menu-add-option-leftover");
    expect(leftoverBtn.textContent).toContain("🍱");
    expect(leftoverBtn.textContent).toContain("남은요리");
    expect(leftoverBtn.textContent).toContain("남은 요리에서 추가");

    // Check manual option
    const manualBtn = screen.getByTestId("menu-add-option-manual");
    expect(manualBtn.textContent).toContain("✏️");
    expect(manualBtn.textContent).toContain("직접 등록");
    expect(manualBtn.textContent).toContain("레시피 직접 작성");
  });

  it("adds a leftover dish to the current planner slot", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({
      items: [
        {
          id: "leftover-1",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          status: "leftover",
          cooked_at: "2026-04-17T00:00:00.000Z",
          eaten_at: null,
          cooking_servings: 2,
          source_meal_label: "저녁",
          source_planned_servings: 2,
        },
      ],
    });
    vi.mocked(mealApi.createMealSafe).mockResolvedValue({
      success: true,
      data: {
        id: "meal-1",
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        status: "registered",
        is_leftover: true,
        leftover_dish_id: "leftover-1",
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /남은요리/ }));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });
    expect(screen.getByText("4/17 저녁 2인분")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => {
      expect(screen.getByText("계획 인분 입력")).toBeTruthy();
    });
    await user.click(
      within(screen.getByRole("dialog", { name: "계획 인분 입력" })).getByRole(
        "button",
        { name: "추가" },
      ),
    );

    await waitFor(() => {
      expect(mealApi.createMealSafe).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        leftover_dish_id: "leftover-1",
      });
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      `/planner/${DEFAULT_PROPS.planDate}/${DEFAULT_PROPS.columnId}?slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`,
    );
  });

  it("shows fallback metadata for leftover dishes without source meal data", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({
      items: [
        {
          id: "leftover-1",
          recipe_id: "recipe-1",
          recipe_title: "된장찌개",
          recipe_thumbnail_url: null,
          status: "leftover",
          cooked_at: "2026-04-17T00:00:00.000Z",
          eaten_at: null,
          cooking_servings: 0,
          source_meal_label: null,
          source_planned_servings: null,
        },
      ],
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="leftover" />);

    expect(await screen.findByText("된장찌개")).toBeTruthy();
    expect(screen.getByText("4/17 끼니 미상 인분 미상")).toBeTruthy();
  });
});
