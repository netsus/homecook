// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const PREVIOUS_VERSION_PRODUCT_ITEM = {
  ...PRODUCT_ITEM,
  id: "pantry-product-previous-version",
  food_product_nutrition_version_id: "nutrition-version-pinned-6",
};

const OLD_SEARCH_PRODUCT = {
  ...FOOD_PRODUCT,
  id: "product-old-search",
  name: "느린 이전 제품",
  nutrition_version_id: "nutrition-version-old-search",
};

const NEW_SEARCH_PRODUCT = {
  ...FOOD_PRODUCT,
  id: "product-new-search",
  name: "최신 검색 제품",
  nutrition_version_id: "nutrition-version-new-search",
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input.toString();
}

async function openAndSelectExactProduct() {
  const user = userEvent.setup();
  await user.click(
    screen.getAllByRole("button", { name: "재료 추가하기" })[0]!,
  );

  const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "재료명 검색" }),
    "생크림빵",
  );
  await user.click(
    await within(dialog).findByRole("checkbox", {
      name: `${FOOD_PRODUCT.name} · ${FOOD_PRODUCT.brand} · 영양 버전 ${FOOD_PRODUCT.nutrition_version_id}`,
    }),
  );

  return { dialog, user };
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

  it("keeps the HOME retry error visible when a selected cached theme request fails", async () => {
    authOverride = false;
    const recipeResponse =
      createDeferred<Awaited<ReturnType<typeof jsonResponse>>>();

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

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
          return recipeResponse.promise;
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<HomeScreen />);

    await userEvent.setup().click(
      await screen.findByRole("button", { name: /냉장고 비우는 한 끼/ }),
    );
    await act(async () => {
      recipeResponse.resolve(await jsonResponse(null, 500));
    });

    expect(
      await screen.findByRole("heading", { name: "레시피를 불러오지 못했어요" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
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

  it("ignores a late add success from a closed sheet instead of closing or refreshing the reopened cycle", async () => {
    authOverride = true;
    const staleAddResponse = createDeferred<unknown>();
    let pantryReadCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry" && init?.method === "POST") {
          return staleAddResponse.promise;
        }

        if (url === "/api/v1/pantry") {
          pantryReadCount += 1;
          return jsonResponse({ items: [], product_items: [] });
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

    await screen.findByText("아직 등록한 재료가 없어요");
    const firstCycle = await openAndSelectExactProduct();
    await firstCycle.user.click(
      within(firstCycle.dialog).getByRole("button", {
        name: "팬트리에 추가 (1)",
      }),
    );
    const pendingAddButton = within(firstCycle.dialog).getByRole("button", {
      name: "팬트리에 추가 (1)",
    });
    expect(pendingAddButton.textContent).toBe("추가 중...");
    expect((pendingAddButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      within(firstCycle.dialog).getByRole("button", { name: "닫기" }),
    );
    const reopenedDialog = (await openAndSelectExactProduct()).dialog;
    expect(pantryReadCount).toBe(1);

    await act(async () => {
      staleAddResponse.resolve(
        await jsonResponse(
          {
            added: 0,
            items: [],
            product_added: 1,
            product_items: [PRODUCT_ITEM],
          },
          201,
        ),
      );
    });

    expect(screen.getByRole("dialog", { name: "재료 추가" })).toBe(
      reopenedDialog,
    );
    expect(
      within(reopenedDialog).getByRole("button", {
        name: "팬트리에 추가 (1)",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByText("1개 재료가 팬트리에 추가됐어요"),
    ).toBeNull();
    expect(pantryReadCount).toBe(1);
  });

  it("ignores a late add failure from a closed sheet while the reopened cycle can add once normally", async () => {
    authOverride = true;
    const staleAddResponse = createDeferred<unknown>();
    const pantryPostBodies: unknown[] = [];
    let pantryPostCount = 0;
    let pantryReadCount = 0;
    let productWasAdded = false;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry" && init?.method === "POST") {
          pantryPostCount += 1;
          pantryPostBodies.push(JSON.parse(String(init.body)));
          if (pantryPostCount === 1) {
            return staleAddResponse.promise;
          }
          if (pantryPostCount === 2) {
            return Promise.reject(new Error("active add failed"));
          }

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
          pantryReadCount += 1;
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

    await screen.findByText("아직 등록한 재료가 없어요");
    const firstCycle = await openAndSelectExactProduct();
    await firstCycle.user.click(
      within(firstCycle.dialog).getByRole("button", {
        name: "팬트리에 추가 (1)",
      }),
    );
    fireEvent.click(
      within(firstCycle.dialog).getByRole("button", { name: "닫기" }),
    );

    const reopenedCycle = await openAndSelectExactProduct();
    await act(async () => {
      staleAddResponse.reject(new Error("stale add failed"));
    });

    expect(
      screen.getByRole("dialog", { name: "재료 추가" }),
    ).toBe(reopenedCycle.dialog);
    expect(
      within(reopenedCycle.dialog).queryByRole("alert"),
    ).toBeNull();
    expect(
      within(reopenedCycle.dialog).getByRole("button", {
        name: "팬트리에 추가 (1)",
      }),
    ).toBeTruthy();
    expect(pantryReadCount).toBe(1);

    await reopenedCycle.user.click(
      within(reopenedCycle.dialog).getByRole("button", {
        name: "팬트리에 추가 (1)",
      }),
    );
    expect(
      (await within(reopenedCycle.dialog).findByRole("alert")).textContent,
    ).toBe("추가에 실패했어요. 다시 시도해 주세요.");
    const retryButton = within(reopenedCycle.dialog).getByRole("button", {
      name: "팬트리에 추가 (1)",
    });
    expect(retryButton.textContent).toBe("팬트리에 추가 (1)");
    expect((retryButton as HTMLButtonElement).disabled).toBe(false);

    await reopenedCycle.user.click(retryButton);

    expect(
      await screen.findByText("1개 재료가 팬트리에 추가됐어요"),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "재료 추가" })).toBeNull();
    expect(
      await screen.findByLabelText(
        `${PRODUCT_ITEM.name} · ${PRODUCT_ITEM.brand} · 영양 버전 ${PRODUCT_ITEM.food_product_nutrition_version_id}`,
      ),
    ).toBeTruthy();
    expect(pantryReadCount).toBe(2);
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
      {
        product_items: [
          {
            food_product_id: FOOD_PRODUCT.id,
            food_product_nutrition_version_id:
              FOOD_PRODUCT.nutrition_version_id,
          },
        ],
      },
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

  it("disables an add option only when its exact product and nutrition version pair already exists", async () => {
    authOverride = true;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry") {
          return jsonResponse({
            items: [],
            product_items: [PRODUCT_ITEM],
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

    await screen.findByLabelText(
      `${PRODUCT_ITEM.name} · ${PRODUCT_ITEM.brand} · 영양 버전 ${PRODUCT_ITEM.food_product_nutrition_version_id}`,
    );
    await userEvent.setup().click(
      screen.getByRole("button", { name: /재료 추가/ }),
    );

    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    await userEvent.setup().type(
      within(dialog).getByRole("textbox", { name: "재료명 검색" }),
      "생크림빵",
    );

    const exactPairOption = await within(dialog).findByRole("checkbox", {
      name: `${FOOD_PRODUCT.name} · ${FOOD_PRODUCT.brand} · 영양 버전 ${FOOD_PRODUCT.nutrition_version_id}`,
    });
    expect((exactPairOption as HTMLButtonElement).disabled).toBe(true);
  });

  it("allows the same product at a different nutrition version and submits that exact pair", async () => {
    authOverride = true;
    const pantryPostBodies: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry" && init?.method === "POST") {
          pantryPostBodies.push(JSON.parse(String(init.body)));
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
            product_items: [PREVIOUS_VERSION_PRODUCT_ITEM],
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

    await screen.findByLabelText(
      `${PREVIOUS_VERSION_PRODUCT_ITEM.name} · ${PREVIOUS_VERSION_PRODUCT_ITEM.brand} · 영양 버전 ${PREVIOUS_VERSION_PRODUCT_ITEM.food_product_nutrition_version_id}`,
    );
    await userEvent.setup().click(
      screen.getByRole("button", { name: /재료 추가/ }),
    );

    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    await userEvent.setup().type(
      within(dialog).getByRole("textbox", { name: "재료명 검색" }),
      "생크림빵",
    );

    const differentVersionOption = await within(dialog).findByRole("checkbox", {
      name: `${FOOD_PRODUCT.name} · ${FOOD_PRODUCT.brand} · 영양 버전 ${FOOD_PRODUCT.nutrition_version_id}`,
    });
    expect((differentVersionOption as HTMLButtonElement).disabled).toBe(false);
    await userEvent.setup().click(differentVersionOption);
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

  it("removes stale product search results immediately when switching to an ingredient category", async () => {
    authOverride = true;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry") {
          return jsonResponse({ items: [], product_items: [] });
        }

        if (url.startsWith("/api/v1/ingredients")) {
          return jsonResponse({
            items: [
              {
                id: "ingredient-green-onion",
                standard_name: "대파",
                category: "채소",
              },
            ],
          });
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

    await screen.findByText("아직 등록한 재료가 없어요");
    await userEvent.setup().click(
      screen.getAllByRole("button", { name: "재료 추가하기" })[0]!,
    );

    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    const searchbox = within(dialog).getByRole("textbox", {
      name: "재료명 검색",
    });
    await userEvent.setup().type(searchbox, "생크림빵");
    expect(
      await within(dialog).findByRole("checkbox", {
        name: `${FOOD_PRODUCT.name} · ${FOOD_PRODUCT.brand} · 영양 버전 ${FOOD_PRODUCT.nutrition_version_id}`,
      }),
    ).toBeTruthy();

    fireEvent.change(searchbox, { target: { value: "" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "채소/버섯" }),
    );

    expect(
      within(dialog).queryByRole("checkbox", {
        name: `${FOOD_PRODUCT.name} · ${FOOD_PRODUCT.brand} · 영양 버전 ${FOOD_PRODUCT.nutrition_version_id}`,
      }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("checkbox", { name: "대파" }),
    ).toBeTruthy();
  });

  it("keeps the newest exact product result when older search and category responses finish late", async () => {
    authOverride = true;
    const oldIngredientResponse = createDeferred<unknown>();
    const oldProductResponse = createDeferred<unknown>();
    const categoryIngredientResponse = createDeferred<unknown>();
    const newIngredientResponse = createDeferred<unknown>();
    const newProductResponse = createDeferred<unknown>();
    let blankIngredientRequestCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry") {
          return jsonResponse({ items: [], product_items: [] });
        }

        if (url.startsWith("/api/v1/ingredients")) {
          const query = new URL(url, "http://homecook.test").searchParams.get("q");
          if (query === "이전") {
            return oldIngredientResponse.promise;
          }
          if (query === "최신") {
            return newIngredientResponse.promise;
          }

          blankIngredientRequestCount += 1;
          return blankIngredientRequestCount === 1
            ? jsonResponse({
                items: [
                  {
                    id: "ingredient-green-onion",
                    standard_name: "대파",
                    category: "채소",
                  },
                ],
              })
            : categoryIngredientResponse.promise;
        }

        if (url.startsWith("/api/v1/food-products")) {
          const query = new URL(url, "http://homecook.test").searchParams.get("q");
          if (query === "이전") {
            return oldProductResponse.promise;
          }
          if (query === "최신") {
            return newProductResponse.promise;
          }
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("아직 등록한 재료가 없어요");
    await userEvent.setup().click(
      screen.getAllByRole("button", { name: "재료 추가하기" })[0]!,
    );

    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    const searchbox = within(dialog).getByRole("textbox", {
      name: "재료명 검색",
    });

    fireEvent.change(searchbox, { target: { value: "이전" } });
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) =>
          requestUrl(input).includes("q=%EC%9D%B4%EC%A0%84"),
        ),
      ).toBe(true);
    });

    fireEvent.change(searchbox, { target: { value: "" } });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "채소/버섯" }),
    );
    await waitFor(() => {
      expect(blankIngredientRequestCount).toBe(2);
    });

    fireEvent.change(searchbox, { target: { value: "최신" } });
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) =>
          requestUrl(input).includes("q=%EC%B5%9C%EC%8B%A0"),
        ),
      ).toBe(true);
    });

    await act(async () => {
      newIngredientResponse.resolve(
        await jsonResponse({ items: [] }),
      );
      newProductResponse.resolve(
        await jsonResponse({
          items: [NEW_SEARCH_PRODUCT],
          next_cursor: null,
          has_next: false,
        }),
      );
    });

    const newestOption = await within(dialog).findByRole("checkbox", {
      name: `${NEW_SEARCH_PRODUCT.name} · ${NEW_SEARCH_PRODUCT.brand} · 영양 버전 ${NEW_SEARCH_PRODUCT.nutrition_version_id}`,
    });
    expect((newestOption as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      oldIngredientResponse.resolve(await jsonResponse({ items: [] }));
      oldProductResponse.resolve(
        await jsonResponse({
          items: [OLD_SEARCH_PRODUCT],
          next_cursor: null,
          has_next: false,
        }),
      );
      categoryIngredientResponse.resolve(
        await jsonResponse({
          items: [
            {
              id: "ingredient-green-onion",
              standard_name: "대파",
              category: "채소",
            },
          ],
        }),
      );
    });

    expect(
      within(dialog).getByRole("checkbox", {
        name: `${NEW_SEARCH_PRODUCT.name} · ${NEW_SEARCH_PRODUCT.brand} · 영양 버전 ${NEW_SEARCH_PRODUCT.nutrition_version_id}`,
      }),
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole("checkbox", {
        name: `${OLD_SEARCH_PRODUCT.name} · ${OLD_SEARCH_PRODUCT.brand} · 영양 버전 ${OLD_SEARCH_PRODUCT.nutrition_version_id}`,
      }),
    ).toBeNull();
  });

  it("ignores late ingredient and product completion after the add sheet closes", async () => {
    authOverride = true;
    const lateIngredientResponse = createDeferred<unknown>();
    const lateProductResponse = createDeferred<unknown>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    let blankIngredientRequestCount = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = requestUrl(input);

        if (url === "/api/v1/pantry") {
          return jsonResponse({ items: [], product_items: [] });
        }

        if (url === "/api/v1/ingredients") {
          blankIngredientRequestCount += 1;
          return jsonResponse({
            items:
              blankIngredientRequestCount === 1
                ? []
                : [
                    {
                      id: "ingredient-reopened",
                      standard_name: "다시 연 재료",
                      category: "기타",
                    },
                  ],
          });
        }

        if (url.includes("/api/v1/ingredients?q=")) {
          return lateIngredientResponse.promise;
        }

        if (url.startsWith("/api/v1/food-products")) {
          return lateProductResponse.promise;
        }

        throw new Error(`unexpected request: ${url}`);
      }),
    );

    render(<PantryScreen initialAuthenticated />);

    await screen.findByText("아직 등록한 재료가 없어요");
    await userEvent.setup().click(
      screen.getAllByRole("button", { name: "재료 추가하기" })[0]!,
    );

    const dialog = await screen.findByRole("dialog", { name: "재료 추가" });
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "재료명 검색" }),
      { target: { value: "느린" } },
    );
    await waitFor(() => {
      expect(
        vi.mocked(fetch).mock.calls.some(([input]) =>
          requestUrl(input).includes("q=%EB%8A%90%EB%A6%B0"),
        ),
      ).toBe(true);
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "재료 추가" })).toBeNull();

    await userEvent.setup().click(
      screen.getAllByRole("button", { name: "재료 추가하기" })[0]!,
    );
    const reopenedDialog = await screen.findByRole("dialog", {
      name: "재료 추가",
    });
    expect(
      await within(reopenedDialog).findByRole("checkbox", {
        name: "다시 연 재료",
      }),
    ).toBeTruthy();
    const errorCountBeforeLateCompletion = consoleError.mock.calls.length;

    await act(async () => {
      lateIngredientResponse.resolve(await jsonResponse({ items: [] }));
      lateProductResponse.resolve(
        await jsonResponse({
          items: [OLD_SEARCH_PRODUCT],
          next_cursor: null,
          has_next: false,
        }),
      );
    });

    expect(
      within(reopenedDialog).getByRole("checkbox", { name: "다시 연 재료" }),
    ).toBeTruthy();
    expect(
      within(reopenedDialog).queryByRole("checkbox", {
        name: `${OLD_SEARCH_PRODUCT.name} · ${OLD_SEARCH_PRODUCT.brand} · 영양 버전 ${OLD_SEARCH_PRODUCT.nutrition_version_id}`,
      }),
    ).toBeNull();
    expect(consoleError.mock.calls).toHaveLength(
      errorCountBeforeLateCompletion,
    );
    consoleError.mockRestore();
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
