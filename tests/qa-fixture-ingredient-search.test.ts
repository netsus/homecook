import type { Page, Route } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { getMockIngredientList, getQaFixturePantryItems } from "@/lib/mock/recipes";
import { installPantryShoppingVisualRoutes } from "./e2e/helpers/mock-routes";

describe("QA ingredient search parity", () => {
  it.each(["대 파", "대\u200b파", "대\u2060 파", "대　파", "대파"])(
    "finds the same ingredient and pantry item for %s",
    (query) => {
      expect(getMockIngredientList(query)).toEqual(getMockIngredientList("대파"));
      expect(getQaFixturePantryItems({ q: query })).toEqual(getQaFixturePantryItems({ q: "대파" }));
    },
  );

  it("preserves declared aliases, result order, and category filtering", () => {
    const all = getMockIngredientList().items;
    const expected = all.filter((item) => ["양파", "대파"].includes(item.standard_name));
    expect(getMockIngredientList(" 파 ").items).toEqual(expected);
    expect(getMockIngredientList("\u200b").items).toEqual(all);
    expect(getMockIngredientList("대 파", "채소").items.map((item) => item.standard_name)).toEqual(["대파"]);
    expect(getMockIngredientList("대 파", "육류").items).toEqual([]);
    expect(getQaFixturePantryItems({ q: "대 파", category: "육류" }).items).toEqual([]);
  });
});

describe("visual pantry mock search parity", () => {
  async function request(pattern: string, query: string, category?: string) {
    const handlers = new Map<string, (route: Route) => Promise<void>>();
    const page = {
      route: async (url: string, handler: (route: Route) => Promise<void>) => {
        handlers.set(url, handler);
      },
    } as unknown as Page;
    await installPantryShoppingVisualRoutes(page);
    const params = new URLSearchParams({ q: query });
    if (category) params.set("category", category);
    let items: { id: string; standard_name: string; category: string }[] = [];
    await handlers.get(pattern)!({
      request: () => ({
        url: () => `http://localhost/api/v1/${pattern.includes("ingredients") ? "ingredients" : "pantry"}?${params}`,
        method: () => "GET",
      }),
      fulfill: async ({ json }: { json: { data: { items: typeof items } } }) => {
        items = json.data.items;
      },
    } as unknown as Route);
    return items;
  }

  it.each(["**/api/v1/pantry**", "**/api/v1/ingredients**"])(
    "normalizes both query and stored name in %s without changing order or category",
    async (pattern) => {
      const all = await request(pattern, "");
      expect(await request(pattern, "대\u200b 파")).toEqual(all.filter((item) => item.standard_name === "대파"));
      expect(await request(pattern, "다진마늘")).toEqual(all.filter((item) => item.standard_name === "다진 마늘"));
      expect(await request(pattern, "\u2060")).toEqual(all);
      expect(await request(pattern, "대 파", "육류")).toEqual([]);
      expect(await request(pattern, " 파 ", "채소")).toEqual(
        all.filter((item) => item.category === "채소" && ["양파", "대파"].includes(item.standard_name)),
      );
    },
  );
});
