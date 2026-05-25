// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantryScreen } from "@/components/pantry/pantry-screen";
import { getIngredientCategoryEmoji, INGREDIENT_CATEGORIES } from "@/lib/ingredient-categories";

const mockFetchPantryList = vi.fn();
const mockDeletePantryItems = vi.fn();
const mockAddPantryItems = vi.fn();
const mockFetchPantryBundles = vi.fn();
const mockFetchIngredients = vi.fn();
const VEGETABLE_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "vegetable")!.label;
const MEAT_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "meat")!.label;
const SEASONING_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "seasoning")!.label;

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

    mockFetchPantryList.mockResolvedValue({ items: MOCK_ITEMS });
    mockFetchIngredients.mockResolvedValue({ items: [] });
    mockFetchPantryBundles.mockResolvedValue({ bundles: [] });
  });

  it("shows the unauthorized gate when not authenticated", () => {
    render(<PantryScreen initialAuthenticated={false} />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();
    expect(screen.getByText(/팬트리 화면으로 바로 복귀/)).toBeTruthy();
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
    expect(screen.getByText("3개 재료")).toBeTruthy();
    expect(screen.queryByText("3개 재료 보유 중")).toBeNull();
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
    expect(
      screen.getByRole("button", { name: /제거하기/ }),
    ).toBeTruthy();
  });

  it("selects items and shows the delete confirm modal", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "편집" })[0]!);

    await user.click(screen.getByRole("checkbox", { name: "양파 선택" }));

    expect(screen.getByText("1개 선택됨")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /제거하기/ }));

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
    await user.click(screen.getByRole("button", { name: /제거하기/ }));
    const confirmButtons = screen.getAllByRole("button", { name: /삭제/ });
    const confirmDeleteButton = confirmButtons.find(
      (btn) => btn.textContent?.trim() === "삭제 (1)",
    )!;
    await user.click(confirmDeleteButton);

    await waitFor(() => {
      expect(screen.getByText("1개 재료가 삭제됐어요")).toBeTruthy();
    });
    expect(mockDeletePantryItems).toHaveBeenCalledWith(["i1"]);
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
    expect(ownedIngredient.textContent).toContain("보유중");

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

    await user.click(screen.getByRole("button", { name: "2개 팬트리에 추가" }));

    await waitFor(() => {
      expect(mockAddPantryItems).toHaveBeenCalledWith(["i10", "i11"]);
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
    expect(screen.getByRole("tab", { name: VEGETABLE_CATEGORY })).toBeTruthy();
    expect(screen.getByRole("tab", { name: SEASONING_CATEGORY })).toBeTruthy();
    expect(screen.getByRole("tab", { name: MEAT_CATEGORY })).toBeTruthy();
    expect(screen.getByText(getIngredientCategoryEmoji(VEGETABLE_CATEGORY))).toBeTruthy();
  });

  it("filters items by category without collapsing the category tabs", async () => {
    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: VEGETABLE_CATEGORY }));

    expect(screen.getByText("양파", { exact: false })).toBeTruthy();
    expect(screen.queryByText("마늘", { exact: false })).toBeNull();
    expect(screen.queryByText(/돼지고기/)).toBeNull();
    expect(screen.getByRole("tab", { name: "전체" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: VEGETABLE_CATEGORY })).toBeTruthy();
    expect(screen.getByRole("tab", { name: SEASONING_CATEGORY })).toBeTruthy();
    expect(screen.getByRole("tab", { name: MEAT_CATEGORY })).toBeTruthy();
    expect(mockFetchPantryList).toHaveBeenCalledTimes(1);
  });

  it("hides an owned desktop pantry card when toggled missing while missing items are hidden", async () => {
    mockDeletePantryItems.mockResolvedValue({ removed: 1 });
    mockFetchIngredients.mockResolvedValue({
      items: MOCK_ITEMS.map((item) => ({
        category: item.category,
        id: item.ingredient_id,
        standard_name: item.standard_name,
      })),
    });

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "양파 보유 해제" }));

    await waitFor(() => {
      expect(mockDeletePantryItems).toHaveBeenCalledWith(["i1"]);
    });
    expect(mockFetchIngredients).not.toHaveBeenCalled();
    expect(screen.getByText("양파를 미보유로 바꿨어요")).toBeTruthy();
    expect(
      (screen.getByRole("checkbox", { name: "없는 재료도 표시" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(screen.queryByRole("switch", { name: "양파 보유로 변경" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "양파 보유 해제" })).toBeNull();
  });

  it("rolls back missing display when an owned desktop pantry toggle fails", async () => {
    mockDeletePantryItems.mockRejectedValue(new Error("delete failed"));

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("양파", { exact: false });

    const user = userEvent.setup();
    await user.click(screen.getByRole("switch", { name: "양파 보유 해제" }));

    await waitFor(() => {
      expect(mockDeletePantryItems).toHaveBeenCalledWith(["i1"]);
    });
    await waitFor(() => {
      expect(screen.getByText("보유 상태를 바꾸지 못했어요. 다시 시도해 주세요")).toBeTruthy();
    });
    expect(
      (screen.getByRole("checkbox", { name: "없는 재료도 표시" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(mockFetchIngredients).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("switch", { name: "양파 보유 해제" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("keeps the desktop pantry card order stable while toggling ownership with missing items visible", async () => {
    let resolveDelete!: (value: { removed: number }) => void;
    let resolveAdd!: (value: { added: number; items: typeof MOCK_ITEMS }) => void;
    mockDeletePantryItems.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    mockAddPantryItems.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAdd = resolve;
        }),
    );
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

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "없는 재료도 표시" }));

    await screen.findByRole("switch", { name: "대파 보유로 변경" });
    expect(mockFetchIngredients).toHaveBeenCalledTimes(1);

    const getIngredientOrder = () =>
      screen
        .getAllByRole("switch")
        .map((card) =>
          card
            .getAttribute("aria-label")
            ?.replace(/ 보유(?: 해제|로 변경)$/, ""),
        );

    const initialOrder = getIngredientOrder();

    await user.click(screen.getByRole("switch", { name: "양파 보유 해제" }));

    expect(
      screen
        .getByRole("switch", { name: "양파 보유로 변경" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(getIngredientOrder()).toEqual(initialOrder);
    resolveDelete({ removed: 1 });

    await waitFor(() => {
      expect(mockDeletePantryItems).toHaveBeenCalledWith(["i1"]);
    });
    expect(mockFetchIngredients).toHaveBeenCalledTimes(1);
    expect(getIngredientOrder()).toEqual(initialOrder);

    await user.click(screen.getByRole("switch", { name: "양파 보유로 변경" }));

    expect(
      screen
        .getByRole("switch", { name: "양파 보유 해제" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(getIngredientOrder()).toEqual(initialOrder);
    resolveAdd({ added: 1, items: [MOCK_ITEMS[0]] });

    await waitFor(() => {
      expect(mockAddPantryItems).toHaveBeenCalledWith(["i1"]);
    });
    expect(mockFetchIngredients).toHaveBeenCalledTimes(1);
    expect(getIngredientOrder()).toEqual(initialOrder);
  });

  it("shows missing ingredients from the ingredient catalog when enabled", async () => {
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

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "없는 재료도 표시" }));

    expect(await screen.findByRole("switch", { name: "대파 보유로 변경" })).toBeTruthy();
    expect(screen.getByText("미보유")).toBeTruthy();
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

    await user.click(within(dialog).getByRole("tab", { name: "채소" }));

    expect(within(dialog).getByTestId("pantry-add-list-region")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: "대파" })).toBeTruthy();
    expect(within(dialog).queryByRole("checkbox", { name: "간장" })).toBeNull();
    expect(mockFetchIngredients).toHaveBeenCalledTimes(1);
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
