// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantryScreen } from "@/components/pantry/pantry-screen";
import {
  getIngredientCategoryEmoji,
  INGREDIENT_CATEGORIES,
  INGREDIENT_CATEGORY_GROUP_OPTIONS,
} from "@/lib/ingredient-categories";

const mockFetchPantryList = vi.fn();
const mockDeletePantryItems = vi.fn();
const mockAddPantryItems = vi.fn();
const mockFetchPantryBundles = vi.fn();
const mockFetchIngredients = vi.fn();
const mockFetchPantryMatchRecipes = vi.fn();
const mockFetchPlannerColumns = vi.fn();
const mockCreateMealSafe = vi.fn();
const VEGETABLE_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "vegetable")!.label;
const MEAT_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "meat")!.label;
const SEASONING_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "seasoning")!.label;
const VEGETABLE_GROUP_LABEL = "채소/버섯";
const PANTRY_CATEGORY_GROUP_LABELS = INGREDIENT_CATEGORY_GROUP_OPTIONS
  .filter((category) => category.category_group_code)
  .map((category) => category.label);

vi.mock("@/lib/api/pantry", () => ({
  fetchPantryList: (...args: unknown[]) => mockFetchPantryList(...args),
  deletePantryItems: (...args: unknown[]) => mockDeletePantryItems(...args),
  addPantryItems: (...args: unknown[]) => mockAddPantryItems(...args),
  fetchPantryBundles: (...args: unknown[]) => mockFetchPantryBundles(...args),
  fetchIngredients: (...args: unknown[]) => mockFetchIngredients(...args),
  isPantryApiError: (error: unknown) => error instanceof Error && "status" in error,
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

vi.mock("@/lib/api/recipe", () => ({
  fetchPantryMatchRecipes: (...args: unknown[]) => mockFetchPantryMatchRecipes(...args),
}));

vi.mock("@/lib/api/planner", () => ({
  fetchPlannerColumns: (...args: unknown[]) => mockFetchPlannerColumns(...args),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: (...args: unknown[]) => mockCreateMealSafe(...args),
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

const MOCK_ITEMS = [
  {
    id: "p1",
    ingredient_id: "i1",
    standard_name: "양파",
    category: VEGETABLE_CATEGORY,
    created_at: "2026-04-29T00:00:00Z",
  },
  {
    id: "p2",
    ingredient_id: "i2",
    standard_name: "마늘",
    category: SEASONING_CATEGORY,
    created_at: "2026-04-29T01:00:00Z",
  },
  {
    id: "p3",
    ingredient_id: "i3",
    standard_name: "돼지고기",
    category: MEAT_CATEGORY,
    created_at: "2026-04-29T02:00:00Z",
  },
];

describe("PantryScreen", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  beforeEach(() => {
    installMatchMedia(false);
    mockFetchPantryList.mockReset();
    mockDeletePantryItems.mockReset();
    mockAddPantryItems.mockReset();
    mockFetchPantryBundles.mockReset();
    mockFetchIngredients.mockReset();
    mockFetchPantryMatchRecipes.mockReset();
    mockFetchPlannerColumns.mockReset();
    mockCreateMealSafe.mockReset();

    mockFetchPantryList.mockResolvedValue({ items: MOCK_ITEMS });
    mockFetchIngredients.mockResolvedValue({ items: [] });
    mockFetchPantryBundles.mockResolvedValue({ bundles: [] });
    mockFetchPantryMatchRecipes.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: "recipe-1",
            title: "두부조림",
            thumbnail_url: null,
            matched_ingredients: 2,
            total_ingredients: 4,
            match_score: 0.5,
            missing_ingredients: [
              { id: "ing-1", standard_name: "간장" },
              { id: "ing-2", standard_name: "고춧가루" },
            ],
          },
        ],
      },
      error: null,
    });
    mockFetchPlannerColumns.mockResolvedValue({
      columns: [
        { id: "breakfast", name: "아침", display_order: 1 },
        { id: "dinner", name: "저녁", display_order: 2 },
      ],
    });
    mockCreateMealSafe.mockResolvedValue({
      success: true,
      data: { meal_id: "meal-1" },
      error: null,
    });
  });

  it("shows the unauthorized gate when not authenticated", () => {
    render(<PantryScreen initialAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByText(/보유 재료를 등록하면 장보기 목록에서 자동으로 제외/)).toBeTruthy();
  });

  it("keeps the mobile bottom tab visible on the unauthorized gate", async () => {
    installMatchMedia(true);

    render(<PantryScreen initialAuthenticated={false} />);

    expect(
      await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "팬트리 하단 탭" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the pantry item list when authenticated", async () => {
    render(<PantryScreen initialAuthenticated />);

    expect(await screen.findByText("양파", { exact: false })).toBeTruthy();
    expect(screen.getByText("마늘", { exact: false })).toBeTruthy();
    expect(screen.getByText(/돼지고기/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "나의 팬트리 3개" })).toBeTruthy();
    expect(screen.queryByText("3개 재료 보유 중")).toBeNull();
    expect(screen.queryByText("3개 표시")).toBeNull();
  });

  it("groups the desktop all pantry tab by category and omits duplicate status text inside ingredient cards", async () => {
    render(<PantryScreen initialAuthenticated />);

    const vegetableSection = await screen.findByTestId(
      "web-pantry-category-section-vegetable_mushroom",
    );
    const seasoningSection = screen.getByTestId(
      "web-pantry-category-section-seasoning_condiment",
    );
    const proteinSection = screen.getByTestId(
      "web-pantry-category-section-protein",
    );

    expect(within(vegetableSection).getByRole("heading", { name: "채소/버섯" })).toBeTruthy();
    expect(within(vegetableSection).getByText("양파")).toBeTruthy();
    expect(within(seasoningSection).getByText("마늘")).toBeTruthy();
    expect(within(proteinSection).getByText("돼지고기")).toBeTruthy();
    expect(screen.getByTestId("web-pantry-card-i1").textContent).not.toContain("채소/버섯");
    expect(screen.getByTestId("web-pantry-card-copy-i1")).toBeTruthy();
    expect(screen.getByTestId("web-pantry-card-i1").textContent).not.toContain("보유 중");
  });

  it("uses the theme color for the mobile pantry screen title", async () => {
    installMatchMedia(true);

    render(<PantryScreen initialAuthenticated />);

    expect((await screen.findByRole("heading", { name: "팬트리" })).className).toContain(
      "text-[var(--brand)]",
    );
  });

  it("shows the desktop loading skeleton inside the web pantry shell", () => {
    mockFetchPantryList.mockReturnValue(new Promise(() => {}));

    render(<PantryScreen initialAuthenticated />);

    expect(screen.getByTestId("pantry-skeleton")).toBeTruthy();
    expect(screen.getByRole("link", { name: "마이페이지" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "마이" })).toBeNull();
  });

  it("keeps the mobile bottom tab visible while pantry items load", () => {
    installMatchMedia(true);
    mockFetchPantryList.mockReturnValue(new Promise(() => {}));

    render(<PantryScreen initialAuthenticated />);

    expect(screen.getByRole("navigation", { name: "팬트리 하단 탭" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("shows the empty state when pantry has no items", async () => {
    mockFetchPantryList.mockResolvedValue({ items: [] });

    render(<PantryScreen initialAuthenticated />);

    expect(
      await screen.findByText(/아직 등록한 재료가 없어요/),
    ).toBeTruthy();
  });

  it("shows the error state and retries on failure", async () => {
    mockFetchPantryList.mockRejectedValueOnce(new Error("fail"));

    render(<PantryScreen initialAuthenticated />);

    expect(
      await screen.findByText("팬트리를 불러올 수 없어요"),
    ).toBeTruthy();

    mockFetchPantryList.mockResolvedValue({ items: MOCK_ITEMS });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("양파", { exact: false })).toBeTruthy();
  });

  it("enters select mode and shows the delete action bar", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "편집" })[0]!);

    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
    expect(screen.getByText("0개 선택됨")).toBeTruthy();
    expect(screen.getByRole("button", { name: "제거하기" })).toBeTruthy();
  });

  it("selects items and shows the delete confirm modal", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "편집" })[0]!);

    await user.click(screen.getByRole("checkbox", { name: "양파 선택" }));

    expect(screen.getByText("1개 선택됨")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "제거하기" }));

    expect(
      screen.getByText("재료를 삭제할까요?"),
    ).toBeTruthy();
  });

  it("deletes selected items and shows success toast", async () => {
    mockDeletePantryItems.mockResolvedValue({ removed: 1 });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "편집" })[0]!);

    await user.click(screen.getByRole("checkbox", { name: "양파 선택" }));
    await user.click(screen.getByRole("button", { name: "제거하기" }));
    const confirmButtons = screen.getAllByRole("button", { name: "삭제 (1)" });
    const confirmDeleteButton = confirmButtons[confirmButtons.length - 1]!;
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(screen.getByText("1개 재료가 삭제됐어요")).toBeTruthy();
    });
    expect(mockDeletePantryItems).toHaveBeenCalledWith(["i1"]);
  });

  it("keeps mobile search and edit controls in one stable toolbar", async () => {
    installMatchMedia(true);
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const toolbar = screen.getByTestId("pantry-mobile-filter-toolbar");
    expect(within(toolbar).getByRole("searchbox", { name: "팬트리 재료 검색" })).toBeTruthy();
    expect(within(toolbar).getByRole("button", { name: "편집" })).toBeTruthy();
    expect(within(toolbar).queryByRole("checkbox", { name: "전체선택" })).toBeNull();

    const user = userEvent.setup();
    await user.click(within(toolbar).getByRole("button", { name: "편집" }));

    expect(screen.getByRole("button", { name: "편집 취소" })).toBeTruthy();
    expect(within(toolbar).getByRole("checkbox", { name: "전체선택" })).toBeTruthy();
    expect(within(toolbar).queryByRole("button", { name: "편집" })).toBeNull();
  });

  it("filters pantry items locally without reloading the pantry list", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "양");

    expect(screen.getByText("양파", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/돼지고기/)).toBeNull();
    expect(mockFetchPantryList).toHaveBeenCalledTimes(1);
  });

  it("adds only newly selected ingredients from the add sheet", async () => {
    installMatchMedia(true);
    mockFetchIngredients.mockResolvedValue({
      items: [
        { id: "i1", standard_name: "양파", category: "채소" },
        { id: "i4", standard_name: "대파", category: "채소" },
      ],
    });
    mockAddPantryItems.mockResolvedValue({ added: 1 });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가/ }));
    const addDialog = await screen.findByRole("dialog", { name: "재료 추가" });

    expect(addDialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");

    const ownedIngredient = await screen.findByRole("checkbox", { name: /양파/ });
    expect((ownedIngredient as HTMLButtonElement).disabled).toBe(true);
    expect(ownedIngredient.getAttribute("data-owned")).toBe("true");
    expect(ownedIngredient.className).toContain("opacity-60");
    expect(ownedIngredient.textContent).not.toContain("보유중");

    await user.click(screen.getByRole("checkbox", { name: "대파" }));
    await user.click(screen.getByRole("button", { name: "팬트리에 추가 (1)" }));

    await waitFor(() => {
      expect(mockAddPantryItems).toHaveBeenCalledWith(["i4"]);
    });
  });

  it("adds only selected missing bundle ingredients", async () => {
    installMatchMedia(true);
    mockFetchPantryBundles.mockResolvedValue({
      bundles: [
        {
          id: "b1",
          name: "기본 야채",
          display_order: 1,
          ingredients: [
            {
              ingredient_id: "i1",
              is_in_pantry: true,
              standard_name: "양파",
            },
            {
              ingredient_id: "i4",
              is_in_pantry: false,
              standard_name: "대파",
            },
            {
              ingredient_id: "i5",
              is_in_pantry: false,
              standard_name: "감자",
            },
          ],
        },
      ],
    });
    mockAddPantryItems.mockResolvedValue({ added: 2 });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "묶음으로 추가" }));
    const bundleDialog = await screen.findByRole("dialog", {
      name: "묶음으로 재료 추가",
    });

    expect(bundleDialog.getAttribute("data-app-overlay-shell")).toBe(
      "bottom-sheet",
    );

    await user.click(screen.getByRole("button", { name: /기본 야채/ }));
    await user.click(screen.getByRole("button", { name: "2개 팬트리에 추가" }));

    await waitFor(() => {
      expect(mockAddPantryItems).toHaveBeenCalledWith(["i4", "i5"]);
    });
  });

  it("scopes bundle selection to the expanded bundle", async () => {
    mockFetchPantryBundles.mockResolvedValue({
      bundles: [
        {
          id: "b1",
          name: "조미료 모음",
          display_order: 1,
          ingredients: [
            {
              ingredient_id: "i10",
              is_in_pantry: false,
              standard_name: "간장",
            },
            {
              ingredient_id: "i11",
              is_in_pantry: false,
              standard_name: "된장",
            },
            {
              ingredient_id: "i2",
              is_in_pantry: true,
              standard_name: "마늘",
            },
          ],
        },
        {
          id: "b2",
          name: "기본 야채",
          display_order: 2,
          ingredients: [
            {
              ingredient_id: "i20",
              is_in_pantry: false,
              standard_name: "당근",
            },
          ],
        },
      ],
    });
    mockAddPantryItems.mockResolvedValue({ added: 2 });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "묶음으로 추가" }));
    await screen.findByRole("dialog", { name: "묶음으로 재료 추가" });

    expect(screen.getByText(/추가 가능 2개/)).toBeTruthy();
    expect(screen.getByText(/보유중 1개/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /조미료 모음/ }));

    const ownedBundleIngredient = await screen.findByRole("checkbox", {
      name: /마늘 보유중/,
    });
    expect((ownedBundleIngredient as HTMLButtonElement).disabled).toBe(true);
    expect(ownedBundleIngredient.getAttribute("data-owned")).toBe("true");
    expect(ownedBundleIngredient.className).toContain("opacity-60");

    await user.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(
      (screen.getByRole("button", { name: "재료 선택" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "묶음 전체 선택" }));
    await user.click(screen.getByRole("button", { name: "2개 팬트리에 추가" }));

    await waitFor(() => {
      expect(mockAddPantryItems).toHaveBeenCalledWith(["i10", "i11"]);
    });
  });

  it("lets users clear and reselect all missing bundle ingredients", async () => {
    installMatchMedia(true);
    mockFetchPantryBundles.mockResolvedValue({
      bundles: [
        {
          id: "b1",
          name: "기본 양념",
          display_order: 1,
          ingredients: [
            {
              ingredient_id: "i10",
              is_in_pantry: false,
              standard_name: "간장",
            },
            {
              ingredient_id: "i11",
              is_in_pantry: false,
              standard_name: "된장",
            },
            {
              ingredient_id: "i12",
              is_in_pantry: false,
              standard_name: "고추장",
            },
            {
              ingredient_id: "i2",
              is_in_pantry: true,
              standard_name: "마늘",
            },
          ],
        },
      ],
    });
    mockAddPantryItems.mockResolvedValue({ added: 3 });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "묶음으로 추가" }));
    await screen.findByRole("dialog", { name: "묶음으로 재료 추가" });
    await user.click(screen.getByRole("button", { name: /기본 양념/ }));

    await user.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(
      (screen.getByRole("button", {
        name: "추가할 재료를 선택해 주세요",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "묶음 전체 선택" }));
    await user.click(screen.getByRole("button", { name: "3개 팬트리에 추가" }));

    await waitFor(() => {
      expect(mockAddPantryItems).toHaveBeenCalledWith(["i10", "i11", "i12"]);
    });
  });

  it("keeps the add sheet open and shows feedback when add fails", async () => {
    mockFetchIngredients.mockResolvedValue({
      items: [{ id: "i4", standard_name: "대파", category: "채소" }],
    });
    mockAddPantryItems.mockRejectedValue(new Error("fail"));

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가하기/ }));

    expect(await screen.findByRole("dialog", { name: "재료 추가" })).toBeTruthy();

    await user.click(await screen.findByRole("checkbox", { name: "대파" }));
    await user.click(screen.getByRole("button", { name: "팬트리에 추가 (1)" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "추가에 실패했어요. 다시 시도해 주세요.",
    );
    expect(screen.getByRole("dialog", { name: "재료 추가" })).toBeTruthy();
  });

  it("keeps the bundle picker open and shows feedback when bundle add fails", async () => {
    mockFetchPantryBundles.mockResolvedValue({
      bundles: [
        {
          id: "b1",
          name: "기본 야채",
          display_order: 1,
          ingredients: [
            {
              ingredient_id: "i4",
              is_in_pantry: false,
              standard_name: "대파",
            },
          ],
        },
      ],
    });
    mockAddPantryItems.mockRejectedValue(new Error("fail"));

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "묶음으로 추가" }));

    expect(
      await screen.findByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /기본 야채/ }));
    await user.click(screen.getByRole("button", { name: "1개 팬트리에 추가" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "추가에 실패했어요. 다시 시도해 주세요.",
    );
    expect(
      screen.getByRole("dialog", { name: "묶음으로 재료 추가" }),
    ).toBeTruthy();
  });

  it("shows category filter chips from the item list", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    expect(screen.getByRole("tab", { name: "전체" })).toBeTruthy();
    PANTRY_CATEGORY_GROUP_LABELS.forEach((category) => {
      expect(screen.getByRole("tab", { name: category })).toBeTruthy();
    });
    expect(screen.getByText(getIngredientCategoryEmoji(VEGETABLE_CATEGORY))).toBeTruthy();
  });

  it("uses the canonical DB category rail and only owned count on mobile", async () => {
    installMatchMedia(true);

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    expect(screen.getByText("냉장고에 있는 재료")).toBeTruthy();
    expect(screen.queryByText(/29개/)).toBeNull();
    PANTRY_CATEGORY_GROUP_LABELS.forEach((category) => {
      expect(screen.getByRole("tab", { name: category })).toBeTruthy();
    });
  });

  it("filters items by category without collapsing the category tabs", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: VEGETABLE_GROUP_LABEL }));

    expect(screen.getByText("양파", { exact: false })).toBeTruthy();
    expect(screen.queryByText("마늘", { exact: false })).toBeNull();
    expect(screen.queryByText(/돼지고기/)).toBeNull();
    expect(screen.getByRole("tab", { name: "전체" })).toBeTruthy();
    PANTRY_CATEGORY_GROUP_LABELS.forEach((category) => {
      expect(screen.getByRole("tab", { name: category })).toBeTruthy();
    });
    expect(mockFetchPantryList).toHaveBeenCalledTimes(1);
  });

  it("selects and clears every pantry item from the desktop select-all checkbox", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "편집" })[0]!);

    const selectAll = screen.getByRole("checkbox", { name: "전체선택" });
    expect(selectAll.getAttribute("aria-checked")).toBe("false");

    await user.click(selectAll);
    expect(selectAll.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("3개 선택됨")).toBeTruthy();
    expect(screen.getByRole("button", { name: "제거하기" })).toBeTruthy();

    await user.click(selectAll);
    expect(selectAll.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("0개 선택됨")).toBeTruthy();
  });

  it("selects every mobile pantry item without duplicating selected count text", async () => {
    installMatchMedia(true);

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    const toolbar = screen.getByTestId("pantry-mobile-filter-toolbar");
    await user.click(within(toolbar).getByRole("button", { name: "편집" }));
    await user.click(within(toolbar).getByRole("checkbox", { name: "전체선택" }));

    expect(screen.getByText("3개 선택됨")).toBeTruthy();
    expect(screen.getByRole("button", { name: "제거하기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /제거하기 \(/ })).toBeNull();
  });

  it("shows only owned pantry items without missing ingredient toggles on desktop", async () => {
    mockFetchIngredients.mockResolvedValue({
      items: [
        ...MOCK_ITEMS.map((item) => ({
          category: item.category,
          id: item.ingredient_id,
          standard_name: item.standard_name,
        })),
        { id: "i4", standard_name: "대파", category: "채소" },
      ],
    });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    expect(screen.getByRole("article", { name: "양파 재료" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "없는 재료도 표시" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("대파")).toBeNull();
    expect(mockFetchIngredients).not.toHaveBeenCalled();
  });

  it("opens delete confirmation from a mobile single-item delete action", async () => {
    installMatchMedia(true);

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "양파 삭제" }));

    expect(screen.getByText("재료를 삭제할까요?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "삭제 (1)" })).toBeTruthy();
  });

  it("shows the search input with a searchbox role", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    expect(screen.getByRole("searchbox")).toBeTruthy();
  });

  it("shows a reset action when pantry search has no results", async () => {
    mockFetchPantryList.mockResolvedValueOnce({ items: MOCK_ITEMS });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "없는");

    expect(
      await screen.findByText('"없는"에 해당하는 재료가 없어요'),
    ).toBeTruthy();
    expect(screen.getByText("검색어 지우기")).toBeTruthy();
  });

  it("filters add sheet ingredients by category", async () => {
    mockFetchIngredients.mockResolvedValue({
      items: [
        { id: "i4", standard_name: "대파", category: "채소" },
        { id: "i10", standard_name: "간장", category: "양념" },
      ],
    });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가하기/ }));
    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    expect(within(dialog).getByTestId("pantry-add-list-region")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "대파" })).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "간장" })).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: VEGETABLE_GROUP_LABEL }));

    expect(within(dialog).getByTestId("pantry-add-list-region")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "대파" })).toBeTruthy();
    expect(within(dialog).queryByRole("checkbox", { name: "간장" })).toBeNull();
    expect(mockFetchIngredients).toHaveBeenCalledTimes(1);
  });

  it("keeps desktop pantry add ingredient cards free of owned or category helper text", async () => {
    mockFetchIngredients.mockResolvedValue({
      items: [
        { id: "i1", standard_name: "양파", category: "채소" },
        { id: "i4", standard_name: "대파", category: "채소" },
        { id: "i10", standard_name: "간장", category: "양념" },
      ],
    });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가하기/ }));
    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });

    const ownedIngredient = within(dialog).getByRole("checkbox", { name: "양파 보유중" });
    const newIngredient = within(dialog).getByRole("checkbox", { name: "대파" });
    const seasoningIngredient = within(dialog).getByRole("checkbox", { name: "간장" });

    expect((ownedIngredient as HTMLButtonElement).disabled).toBe(true);
    expect(ownedIngredient.getAttribute("data-owned")).toBe("true");
    expect(ownedIngredient.textContent).toBe("양파");
    expect(newIngredient.textContent).toBe("대파");
    expect(seasoningIngredient.textContent).toBe("간장");
    expect(within(dialog).queryByText("보유중")).toBeNull();
  });

  it("shows mobile add sheet search icon, canonical tabs, selected chips, and category sections", async () => {
    installMatchMedia(true);
    mockFetchIngredients.mockResolvedValue({
      items: [
        { id: "i4", standard_name: "대파", category: "채소" },
        { id: "i10", standard_name: "간장", category: "양념" },
        { id: "i30", standard_name: "우유", category: "유제품" },
      ],
    });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가/ }));
    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });

    expect(within(dialog).getByTestId("pantry-add-mobile-search-icon")).toBeTruthy();
    PANTRY_CATEGORY_GROUP_LABELS.forEach((category) => {
      expect(within(dialog).getByRole("tab", { name: category })).toBeTruthy();
    });
    expect(within(dialog).getByRole("heading", { name: "채소/버섯" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "양념/조미" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "유제품/대체유" })).toBeTruthy();

    await user.click(within(dialog).getByRole("checkbox", { name: "대파" }));
    const selectedChip = within(dialog).getByRole("button", { name: "대파 선택 해제" });
    expect(selectedChip).toBeTruthy();

    await user.click(selectedChip);
    expect(within(dialog).queryByRole("button", { name: "대파 선택 해제" })).toBeNull();
  });

  it("uses the same empty bundle picker title and centered copy on desktop and app", async () => {
    mockFetchPantryBundles.mockResolvedValue({ bundles: [] });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "묶음으로 추가" }));
    const desktopDialog = await screen.findByRole("dialog", { name: "묶음으로 재료 추가" });

    expect(within(desktopDialog).getByRole("heading", { name: "묶음으로 재료 추가" })).toBeTruthy();
    expect(within(desktopDialog).getByText("등록된 묶음이 없어요")).toBeTruthy();
    expect(within(desktopDialog).getByText("묶음이 준비되면 여기서 한 번에 추가할 수 있어요")).toBeTruthy();
  });

  it("opens pantry recipe recommendations and adds a selected recipe to planner", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "팬트리 추천" }));

    expect(await screen.findByText("두부조림")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "두부조림 선택" }));

    expect(await screen.findByRole("dialog", { name: "플래너에 추가" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /저녁에 추가/ }));

    await waitFor(() => {
      expect(mockCreateMealSafe).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        plan_date: expect.any(String),
        column_id: "dinner",
        planned_servings: 2,
      });
    });
    expect(await screen.findByText(/저녁에 추가됐어요/)).toBeTruthy();
  });

  it("shows add sheet load error state and retries", async () => {
    mockFetchIngredients
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({
        items: [{ id: "i4", standard_name: "대파", category: "채소" }],
      });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /재료 추가하기/ }));

    expect(
      await screen.findByText("재료 목록을 불러오지 못했어요"),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("checkbox", { name: "대파" })).toBeTruthy();
  });
});
