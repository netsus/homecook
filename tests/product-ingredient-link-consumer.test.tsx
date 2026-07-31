// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeScreen } from "@/components/home/home-screen";
import { PantryScreen } from "@/components/pantry/pantry-screen";
import { MOCK_RECIPE_CARD } from "@/lib/mock/recipes";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";

let authOverride: boolean | null = null;

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => authOverride,
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
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

const GENERIC_ITEM = {
  id: "pantry-generic-1",
  ingredient_id: "ingredient-onion",
  standard_name: "양파",
  category: "채소",
  created_at: "2026-07-31T00:00:00.000Z",
};

const PRODUCT_ITEM = {
  id: "pantry-product-1",
  food_product_id: "product-cream-bread",
  food_product_nutrition_version_id: "nutrition-version-pinned-7",
  name: "연세우유 생크림빵",
  brand: "연세우유",
  created_at: "2026-07-31T01:00:00.000Z",
};

const FOOD_PRODUCT = {
  id: PRODUCT_ITEM.food_product_id,
  name: PRODUCT_ITEM.name,
  brand: PRODUCT_ITEM.brand,
  visibility: "public",
  source_type: "public_dataset",
  editable: false,
  nutrition_version_id: PRODUCT_ITEM.food_product_nutrition_version_id,
  basis_relations: [],
  nutrition: {
    basis: { amount: 100, unit: "g" },
    values: {},
    calculation_status: "complete",
    calculation_quality: "direct",
    warnings: [],
    sources: [],
  },
};

const PRODUCT_RECIPE = {
  ...MOCK_RECIPE_CARD,
  id: "recipe-product-only",
  title: "생크림빵 활용 토스트",
};

function installDesktopMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width") ? true : !query.includes("max-width"),
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

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      success: status >= 200 && status < 300,
      data: status >= 200 && status < 300 ? data : null,
      error:
        status >= 200 && status < 300
          ? null
          : { code: "INTERNAL_ERROR", message: "요청 실패", fields: [] },
    }),
  });
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input.toString();
}

describe("product ingredient link existing consumers", () => {
  beforeEach(() => {
    authOverride = null;
    installDesktopMatchMedia();
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "matchMedia");
    useDiscoveryFilterStore.setState({ appliedIngredientIds: [] });
    window.history.replaceState({}, "", "/");
  });

  it("renders a product-only HOME cleanout result once from the shared theme result without a raw pantry fallback", async () => {
    authOverride = false;
    const requestedUrls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);
        requestedUrls.push(url);

        if (url.startsWith("/api/v1/recipes/themes")) {
          return jsonResponse({
            themes: [
              {
                id: "pantry-cleanout",
                title: "냉장고 비우는 한 끼",
                description: "팬트리 매칭",
                recipes: [PRODUCT_RECIPE],
              },
            ],
          });
        }

        if (url.startsWith("/api/v1/tags")) {
          return jsonResponse({ items: [] });
        }

        if (url.startsWith("/api/v1/recipes")) {
          return jsonResponse({ items: [], next_cursor: null, has_next: false });
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<HomeScreen />);

    const cleanoutButton = await screen.findByRole("button", {
      name: /냉장고 비우는 한 끼/,
    });
    await userEvent.setup().click(cleanoutButton);

    expect(
      screen.getAllByText(PRODUCT_RECIPE.title, { exact: false }),
    ).toHaveLength(1);
    expect(
      requestedUrls.filter((url) => url.startsWith("/api/v1/recipes/themes")),
    ).toHaveLength(1);
    expect(
      requestedUrls.some((url) => url.startsWith("/api/v1/pantry")),
    ).toBe(false);
    expect(
      requestedUrls.some((url) => new URL(url, "http://localhost").searchParams.has("ingredient_ids")),
    ).toBe(false);
  });

  it("keeps an unlinked product fail-closed instead of guessing a HOME theme from its name", async () => {
    authOverride = false;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url.startsWith("/api/v1/recipes/themes")) {
          return jsonResponse({ themes: [] });
        }

        if (url.startsWith("/api/v1/tags")) {
          return jsonResponse({ items: [] });
        }

        if (url.startsWith("/api/v1/recipes")) {
          return jsonResponse({ items: [], next_cursor: null, has_next: false });
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<HomeScreen />);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /냉장고 비우는 한 끼/ }),
      ).toBeNull();
    });
    expect(screen.queryByText(PRODUCT_ITEM.name)).toBeNull();
  });

  it("displays generic and product pantry rows distinctly with the exact pinned version and no product delete fallback", async () => {
    authOverride = true;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry") {
          return jsonResponse({
            items: [GENERIC_ITEM],
            product_items: [PRODUCT_ITEM],
          });
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<PantryScreen initialAuthenticated />);

    expect(await screen.findByText(GENERIC_ITEM.standard_name)).toBeTruthy();
    expect(
      screen.getByLabelText(
        `${PRODUCT_ITEM.name} · ${PRODUCT_ITEM.brand} · 영양 버전 ${PRODUCT_ITEM.food_product_nutrition_version_id}`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "나의 팬트리 2개" }),
    ).toBeTruthy();

    await userEvent.setup().click(screen.getByRole("button", { name: "편집" }));

    expect(
      screen.queryByRole("checkbox", { name: `${PRODUCT_ITEM.name} 선택` }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: `${PRODUCT_ITEM.name} 삭제` }),
    ).toBeNull();
  });

  it("adds an exact product and pinned nutrition version through the existing add sheet", async () => {
    authOverride = true;
    let productWasAdded = false;
    const pantryPostBodies: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry" && init?.method === "POST") {
          pantryPostBodies.push(JSON.parse(String(init.body)));
          productWasAdded = true;
          return jsonResponse(
            {
              added: 0,
              items: [],
              product_added: 1,
              product_items: [PRODUCT_ITEM],
            },
            201,
          );
        }

        if (url === "/api/v1/pantry") {
          return jsonResponse({
            items: [],
            product_items: productWasAdded ? [PRODUCT_ITEM] : [],
          });
        }

        if (url.startsWith("/api/v1/ingredients")) {
          return jsonResponse({ items: [] });
        }

        if (url.startsWith("/api/v1/food-products")) {
          return jsonResponse({
            items: [FOOD_PRODUCT],
            next_cursor: null,
            has_next: false,
          });
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<PantryScreen initialAuthenticated />);

    expect(await screen.findByText("아직 등록한 재료가 없어요")).toBeTruthy();
    await userEvent.setup().click(
      screen.getAllByRole("button", { name: "재료 추가하기" })[0]!,
    );

    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    const searchbox = within(dialog).getByRole("textbox", { name: "재료명 검색" });
    await userEvent.setup().type(searchbox, "생크림빵");

    const productOption = await within(dialog).findByRole("checkbox", {
      name: `${FOOD_PRODUCT.name} · ${FOOD_PRODUCT.brand} · 영양 버전 ${FOOD_PRODUCT.nutrition_version_id}`,
    });
    await userEvent.setup().click(productOption);
    await userEvent.setup().click(
      within(dialog).getByRole("button", { name: "팬트리에 추가 (1)" }),
    );

    await waitFor(() => {
      expect(pantryPostBodies).toEqual([
        {
          product_items: [
            {
              food_product_id: FOOD_PRODUCT.id,
              food_product_nutrition_version_id:
                FOOD_PRODUCT.nutrition_version_id,
            },
          ],
        },
      ]);
    });
  });

  it("preserves unauthorized and error recovery surfaces for the existing PANTRY consumer", async () => {
    authOverride = false;
    const { rerender } = render(<PantryScreen />);

    expect(
      screen.getByRole("heading", { name: "이 화면은 로그인이 필요해요" }),
    ).toBeTruthy();

    authOverride = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(null, 500)),
    );
    rerender(<PantryScreen initialAuthenticated />);

    expect(await screen.findByText("팬트리를 불러올 수 없어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });
});
