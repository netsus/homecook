// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeDetailPersonalEditor } from "@/components/recipe/recipe-detail-personal-editor";
import { fetchFoodCatalogSearch } from "@/lib/api/food-catalog-search";
import { createPersonalRecipeFromSource } from "@/lib/api/personal-recipe";
import type { RecipeEditContext } from "@/types/recipe";
vi.mock("@/lib/api/food-catalog-search", () => ({ fetchFoodCatalogSearch: vi.fn() }));
vi.mock("@/lib/api/mypage", () => ({ fetchUserProfile: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("@/lib/api/personal-recipe", () => ({ createPersonalRecipeFromSource: vi.fn(), isPersonalRecipeApiError: () => false }));
const context: RecipeEditContext = { base_recipe_revision: 1, image_object_id: null, draft: { title: "버섯볶음", description: null, base_servings: 1,
  ingredients: [{ ingredient_id: "old", amount: 200, unit: "g", ingredient_type: "QUANT", display_text: null, component_label: null, scalable: true, food_product_id: null, food_product_nutrition_version_id: null }],
  steps: [{ step_number: 1, instruction: "볶아요", cooking_method_id: "fry", cooking_method_ids: ["fry"], ingredients_used: [{ ingredient_id: "old", amount: 200, unit: "g", cut_size: null }], component_label: null, heat_level: null, duration_seconds: null, duration_text: null }],
} };
beforeEach(() => {
  vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [{ type: "ingredient", id: "mushroom", standard_name: "양송이버섯", category: "채소", default_unit: "g" }], has_next: false, next_cursor: null });
  vi.mocked(createPersonalRecipeFromSource).mockResolvedValue({ id: "copy", revision: 1 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("recipe detail ingredient corrections", () => {
  it("shows the real ingredient name and persists a replacement including step references", async () => {
    const user = userEvent.setup(); render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("버섯")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "교체" }));
    await user.click(await screen.findByRole("checkbox", { name: "양송이버섯" }));
    await user.click(screen.getByRole("button", { name: "이 재료로 교체" }));
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    const payload = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0];
    expect(payload.draft.ingredients[0].ingredient_id).toBe("mushroom");
    expect(payload.draft.ingredients[0].amount).toBe(200);
    expect(payload.draft.steps[0].ingredients_used[0].ingredient_id).toBe("mushroom");
  });
  it("requires at least one ingredient after removing the last ingredient and supports adding a replacement", async () => {
    const user = userEvent.setup(); render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "버섯 삭제" }));
    expect((screen.getByRole("button", { name: "내 레시피로 저장" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양송이버섯" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    expect(vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft.steps[0].ingredients_used).toEqual([]);
  });
});
