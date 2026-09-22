// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { fetchFoodCatalogSearch, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { createManualRecipe } from "@/lib/api/manual-recipe";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/api/food-catalog-search", () => ({ fetchFoodCatalogSearch: vi.fn() }));
vi.mock("@/lib/api/mypage", () => ({ fetchUserProfile: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })) }));
vi.mock("@/lib/api/manual-recipe", () => ({
  createManualRecipe: vi.fn(), cancelRecipeImage: vi.fn(), uploadRecipeImage: vi.fn(),
  readManualRecipeCreateResult: vi.fn(async () => ({ success: true, data: { recipe: null }, error: null })),
}));
vi.mock("@/lib/api/recipe", () => ({ suggestRecipeTags: vi.fn(async () => ({ success: true, data: { suggested_tags: [], tags: [] }, error: null })) }));
vi.mock("@/lib/api/meal", () => ({ createMealSafe: vi.fn() }));
vi.mock("@/lib/api/cooking-methods", () => ({ fetchCookingMethods: vi.fn(async () => ({ success: true, error: null, data: { methods: [{ id: "method-prep", code: "prep", label: "준비", color_key: "gray", is_system: true }] } })) }));
const product: FoodCatalogSearchItem = {
  type: "food_product", id: "product-soy", name: "양조간장", brand: "브랜드",
  recipe_ingredient_id: "soy", nutrition_version_id: "version-soy", source_type: "public_dataset",
  visibility: "public", editable: false, basis_relations: [], nutrition: {
    basis: { amount: 15, unit: "ml" }, values: {}, calculation_status: "complete",
    calculation_quality: "direct", warnings: [], sources: [],
  },
};
beforeEach(() => {
  window.localStorage.clear(); window.sessionStorage.clear();
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
  vi.mocked(createManualRecipe).mockResolvedValue({ success: true, error: null, data: {
    id: "recipe-product", title: "테스트 요리", source_type: "manual", created_by: "owner", base_servings: 1,
  } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("manual recipe catalog selection", () => {
  it.each([
    { name: "브랜드 · 양조간장", source: product, expected: { ingredient_id: "soy", food_product_id: "product-soy", food_product_nutrition_version_id: "version-soy", amount: 15, unit: "ml" } },
    { name: "양파", source: { type: "ingredient", id: "onion", standard_name: "양파", category: "채소", default_unit: "g" } as FoodCatalogSearchItem, expected: { ingredient_id: "onion", amount: 100, unit: "g" } },
  ])("persists $name using the selected exact source", async ({ name, source, expected }) => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [source], has_next: false, next_cursor: null });
    const user = userEvent.setup(); render(<ManualRecipeCreateScreen planDate="2026-09-22" columnId="breakfast" slotName="아침" initialAuthenticated />);
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "테스트 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    if (source.type === "food_product") expect(screen.queryByRole("button", { name: `${name} g` })).toBeNull();
    await user.click(await screen.findByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "재료를 준비해요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(createManualRecipe).toHaveBeenCalled());
    const body = vi.mocked(createManualRecipe).mock.calls[0][0];
    expect(body.ingredients[0]).toMatchObject(expected);
    if (source.type === "ingredient") expect(body.ingredients[0].food_product_id).toBeUndefined();
  });
});
