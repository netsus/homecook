import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchFoodCatalogSearch,
  fetchFoodCatalogSource,
  isFoodCatalogSearchApiError,
} from "@/lib/api/food-catalog-search";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prepared food unified search client", () => {
  it("keeps the existing source URL unchanged with an omitted or empty options object", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true,
      data: { items: [], next_cursor: null, has_next: false }, error: null })));
    vi.stubGlobal("fetch", fetchMock);
    await fetchFoodCatalogSource("food_product", "product-1");
    await fetchFoodCatalogSource("food_product", "product-1", undefined, {});
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/food-catalog/search?source_type=food_product&source_id=product-1",
      "/api/v1/food-catalog/search?source_type=food_product&source_id=product-1",
    ]);
  });
  it("sends only the explicit pantry item lookup, encodes it, and preserves the abort signal", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true,
      data: { items: [], next_cursor: null, has_next: false }, error: null })));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const options = { pantryItemId: "fixture+/&=", ownerId: "not-a-client-authority", nutritionVersionId: "not-forwarded" };
    await fetchFoodCatalogSource("food_product", "product-1", controller.signal, options);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/food-catalog/search?source_type=food_product&source_id=product-1&pantry_item_id=fixture%2B%2F%26%3D");
    expect(init?.signal).toBe(controller.signal);
  });
  it("resolves a current source by identity without historical name or search filters", async () => {
    const item = { type: "ingredient", id: "ingredient-1", standard_name: "새 재료 이름", category: "채소", default_unit: "g" };
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ success: true, data: { items: [item], next_cursor: null, has_next: false }, error: null })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchFoodCatalogSource("ingredient", "ingredient-1")).resolves.toEqual(item);
    const url = new URL(String(fetchMock.mock.calls[0]![0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ source_type: "ingredient", source_id: "ingredient-1" });
  });

  it("keeps HOME recipe-only without mounting a food-product search consumer", () => {
    const homeSource = readFileSync("components/home/home-screen.tsx", "utf8");

    expect(homeSource).toContain('import { fetchRecipeTags } from "@/lib/api/recipe"');
    expect(homeSource).not.toMatch(/food-catalog-search|food-product-picker|fetchFoodCatalogSearch/);
  });

  it("serializes only official query, type, source, cursor, and limit fields", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [{
          type: "ingredient",
          id: "ingredient-1",
          standard_name: "연세 크림",
          category: "유제품",
        }],
        next_cursor: "opaque+/=",
        has_next: true,
      },
      error: null,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchFoodCatalogSearch({
      q: " 연세크림빵 ",
      types: ["ingredient", "food_product"],
      source: "community",
      cursor: "opaque+/=",
      limit: 20,
    });

    const [path] = fetchMock.mock.calls[0];
    const url = new URL(String(path), "http://localhost");
    expect(url.pathname).toBe("/api/v1/food-catalog/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "연세크림빵",
      types: "ingredient,food_product",
      source: "community",
      cursor: "opaque+/=",
      limit: "20",
    });
    expect(result).toMatchObject({
      items: [{ type: "ingredient", id: "ingredient-1" }],
      next_cursor: "opaque+/=",
      has_next: true,
    });
  });

  it("preserves the official error envelope without leaking a result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: false,
      data: null,
      error: {
        code: "INVALID_SEARCH_FILTER",
        message: "검색 조건을 확인해 주세요.",
        fields: [{ field: "cursor", reason: "invalid_cursor" }],
      },
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })));

    const error = await fetchFoodCatalogSearch({
      types: ["food_product"],
      cursor: "bad",
    }).catch((caught) => caught);

    expect(isFoodCatalogSearchApiError(error)).toBe(true);
    expect(error).toMatchObject({
      status: 400,
      code: "INVALID_SEARCH_FILTER",
      fields: [{ field: "cursor", reason: "invalid_cursor" }],
    });
  });

  it("returns an actual ranked zero result as a successful empty page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: {
        items: [],
        next_cursor: null,
        has_next: false,
      },
      error: null,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchFoodCatalogSearch({
      q: "결과 없는 검색어",
      types: ["food_product"],
    })).resolves.toEqual({
      items: [],
      next_cursor: null,
      has_next: false,
    });
  });
});
