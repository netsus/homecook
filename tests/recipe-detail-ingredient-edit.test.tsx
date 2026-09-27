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
vi.mock("@/lib/api/personal-recipe", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api/personal-recipe")>(), createPersonalRecipeFromSource: vi.fn() }));
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
  it("does not save a blank or zero ingredient amount and keeps decimal typing intact", async () => {
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "재료 1 수량" });
    const save = screen.getByRole<HTMLButtonElement>("button", { name: "내 레시피로 저장" });
    await user.clear(amount);
    expect(amount.value).toBe(""); expect(save.disabled).toBe(true);
    await user.type(amount, "0"); expect(save.disabled).toBe(true);
    await user.clear(amount); await user.type(amount, "12.");
    expect(amount.value).toBe("12.");
    await user.type(amount, "5"); await user.click(save);
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft.ingredients[0].amount).toBe(12.5);
  });
  it("shows the real ingredient name and persists a replacement including step references", async () => {
    const user = userEvent.setup(); render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText("버섯")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "교체" }));
    await user.click(await screen.findByRole("checkbox", { name: "양송이버섯" }));
    await user.click(screen.getByRole("button", { name: "이 재료로 교체" }));
    expect(screen.getByTestId("recipe-editor-ingredient-1").querySelector('[data-recipe-change="교체"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    const payload = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0];
    expect(payload.draft.ingredients[0].ingredient_id).toBe("mushroom");
    expect(payload.draft.ingredients[0].amount).toBe(200);
    expect(payload.draft.steps[0].ingredients_used[0].ingredient_id).toBe("mushroom");
  });
  it("explains a rejected field, preserves the edited draft and focuses the error", async () => {
    const user = userEvent.setup();
    vi.mocked(createPersonalRecipeFromSource).mockRejectedValueOnce(Object.assign(new Error("요청 값을 확인해 주세요."), {
      status: 422, code: "VALIDATION_ERROR", fields: [{ field: "draft.ingredients[0].amount", reason: "positive_number_required" }],
    }));
    const onSaved = vi.fn();
    render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={onSaved} />);
    const amount = screen.getByRole("textbox", { name: "재료 1 수량" });
    await user.clear(amount); await user.type(amount, "123");
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("버섯: 수량을 0보다 크게 입력해 주세요.");
    expect(document.activeElement).toBe(alert);
    expect((amount as HTMLInputElement).value).toBe("123");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("requires at least one ingredient after removing the last ingredient and supports adding a replacement", async () => {
    const user = userEvent.setup(); render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "버섯 삭제" }));
    expect((screen.getByRole("button", { name: "내 레시피로 저장" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양송이버섯" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    expect(screen.getByTestId("recipe-editor-ingredient-1").querySelector('[data-recipe-change="추가"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    expect(vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft.steps[0].ingredients_used).toEqual([]);
  });

  it("offers supported units without changing quantity and clears row markers when restored to its opening values", async () => {
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    const unit = screen.getByRole("combobox", { name: "재료 1 단위" });
    const amount = screen.getByRole("textbox", { name: "재료 1 수량" });
    const row = screen.getByTestId("recipe-editor-ingredient-1");
    expect(row.querySelector("[data-recipe-change]")).toBeNull();
    await user.selectOptions(unit, "큰술");
    expect((amount as HTMLInputElement).value).toBe("200");
    expect(row.querySelector('[data-recipe-change="수정"]')).toBeTruthy();
    await user.selectOptions(unit, "g");
    expect(row.querySelector("[data-recipe-change]")).toBeNull();
  });

  it("keeps a legacy source unit selectable and product units fixed", () => {
    const legacy = { ...context, draft: { ...context.draft, ingredients: [{ ...context.draft.ingredients[0], unit: "줌" }] } };
    const view = render(<RecipeDetailPersonalEditor editContext={legacy} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect((screen.getByRole("combobox", { name: "재료 1 단위" }) as HTMLSelectElement).value).toBe("줌");
    expect(screen.getByRole("option", { name: "줌" })).toBeTruthy();
    view.unmount();
    const product = { ...context, draft: { ...context.draft, ingredients: [{ ...context.draft.ingredients[0], unit: "ml", food_product_id: "product", food_product_nutrition_version_id: "version" }] } };
    render(<RecipeDetailPersonalEditor editContext={product} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    const unit = screen.getByRole("combobox", { name: "재료 1 단위" }) as HTMLSelectElement;
    expect(unit.disabled).toBe(true);
    expect(unit.value).toBe("ml");
    expect(screen.queryByRole("option", { name: "g" })).toBeNull();
  });

  it("undoes removal and step references without losing edits made after deletion", async () => {
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "버섯 삭제" }));
    expect(screen.getByText("삭제됨")).toBeTruthy();
    const title = screen.getByRole("textbox", { name: "레시피 제목" });
    await user.type(title, " 수정");
    expect(title.closest("label")?.querySelector('[data-recipe-change="수정"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "기준 인분 늘리기" }));
    expect(screen.getByRole("heading", { name: "기준 인분 수정" })).toBeTruthy();
    const instruction = screen.getByRole("textbox", { name: "단계 1" });
    await user.clear(instruction); await user.type(instruction, "새로 볶아요");
    expect(instruction.closest("label")?.querySelector('[data-recipe-change="수정"]')).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "버섯 삭제 취소" }));
    expect(screen.queryByText("삭제됨")).toBeNull();
    expect(screen.getByTestId("recipe-editor-ingredient-1").querySelector("[data-recipe-change]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    const saved = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft;
    expect(saved.ingredients).toEqual(context.draft.ingredients);
    expect(saved.title).toBe("버섯볶음 수정");
    expect(saved.base_servings).toBe(2);
    expect(saved.steps[0].instruction).toBe("새로 볶아요");
    expect(saved.steps[0].ingredients_used).toEqual(context.draft.steps[0].ingredients_used);
  });

  it("preserves separate component portions and stable row markers across delete and undo", async () => {
    const user = userEvent.setup();
    const grouped = { ...context, draft: { ...context.draft,
      ingredients: [
        { ...context.draft.ingredients[0], component_label: "푸딩" },
        { ...context.draft.ingredients[0], amount: 30, component_label: "소스" },
      ],
      steps: [
        { ...context.draft.steps[0], component_label: "푸딩" },
        { ...context.draft.steps[0], step_number: 2, component_label: "소스" },
      ],
    } };
    render(<RecipeDetailPersonalEditor editContext={grouped} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getAllByRole("button", { name: "버섯 삭제" })[0]);
    expect(screen.getByText("소스")).toBeTruthy();
    expect(screen.getByTestId("recipe-editor-ingredient-1").querySelector("[data-recipe-change]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "버섯 삭제 취소" }));
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    expect(vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft).toEqual(grouped.draft);
  });
});
