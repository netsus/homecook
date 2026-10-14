// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeDetailPersonalEditor } from "@/components/recipe/recipe-detail-personal-editor";
import { fetchFoodCatalogSearch, type FoodCatalogProductData } from "@/lib/api/food-catalog-search";
import { createPersonalRecipeFromSource } from "@/lib/api/personal-recipe";
import type { RecipeEditContext } from "@/types/recipe";
vi.mock("@/lib/api/food-catalog-search", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api/food-catalog-search")>(), fetchFoodCatalogSearch: vi.fn(), fetchFoodCatalogSource: vi.fn(async () => null) }));
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

  it("preserves a fork product draft and releases saving when product writes are disabled", async () => {
    const message = "지금은 선택한 제품 재료를 저장할 수 없어요. 입력 내용을 유지한 채 다시 시도해 주세요.";
    const rowKey = "550e8400-e29b-41d4-a716-446655440081";
    const productContext: RecipeEditContext = { ...context, draft: { ...context.draft,
      ingredients: [{ ...context.draft.ingredients[0], source_kind: "food_product", row_key: rowKey,
        ingredient_id: null, food_product_id: "550e8400-e29b-41d4-a716-446655440091",
        food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440092", display_text: "원문 업체 · 간장", amount: 30 }],
      steps: [{ ...context.draft.steps[0], ingredients_used: [{ row_key: rowKey, ingredient_id: null, amount: 30, unit: "g", cut_size: null }] }],
    } };
    vi.mocked(createPersonalRecipeFromSource).mockRejectedValueOnce(Object.assign(new Error(message), {
      status: 422, code: "RECIPE_PRODUCT_UNAVAILABLE", fields: [],
    }));
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<RecipeDetailPersonalEditor editContext={productContext} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={onSaved} />);
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain("수량을 0보다 크게");
    expect(screen.getByRole("textbox", { name: "재료 1 수량" })).toHaveProperty("value", "30");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "내 레시피로 저장" }).disabled).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "copy", revision: 1 }));
    expect(createPersonalRecipeFromSource).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(createPersonalRecipeFromSource).mock.calls) expect(call[0].draft).toEqual(productContext.draft);
  });

  it("requires at least one ingredient after removing the last ingredient and supports adding a replacement", async () => {
    const user = userEvent.setup(); render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "버섯 삭제" }));
    expect((screen.getByRole("button", { name: "내 레시피로 저장" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "양송이버섯" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    expect(screen.getByTestId("recipe-editor-ingredient-1").querySelector('[data-recipe-change="추가"]')).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "재료 1 수량" }), "100");
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalled());
    expect(vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft.steps[0].ingredients_used).toEqual([]);
  });

  it("keeps the original quantity and unit when density evidence is missing", async () => {
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={context} ingredientNames={{ old: "버섯" }} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    const unit = screen.getByRole("combobox", { name: "재료 1 단위" });
    const amount = screen.getByRole("textbox", { name: "재료 1 수량" });
    const row = screen.getByTestId("recipe-editor-ingredient-1");
    expect(row.querySelector("[data-recipe-change]")).toBeNull();
    await user.selectOptions(unit, "큰술");
    expect((amount as HTMLInputElement).value).toBe("200");
    expect((unit as HTMLSelectElement).value).toBe("g");
    expect(screen.getByRole("alert").textContent).toContain("기존 분량과 단위를 유지");
    expect(row.querySelector("[data-recipe-change]")).toBeNull();
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
    expect(saved.ingredients).toEqual(context.draft.ingredients.map((item) => ({ ...item, source_kind: "ingredient", row_key: expect.any(String) })));
    expect(saved.title).toBe("버섯볶음 수정");
    expect(saved.base_servings).toBe(2);
    expect(saved.steps[0].instruction).toBe("새로 볶아요");
    expect(saved.steps[0].ingredients_used).toEqual(context.draft.steps[0].ingredients_used.map((item) => ({ ...item, row_key: saved.ingredients[0].row_key })));
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
    const saved = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft;
    expect(saved.ingredients).toEqual(grouped.draft.ingredients.map((item) => ({ ...item, source_kind: "ingredient", row_key: expect.any(String) })));
    expect(saved.ingredients[0].row_key).not.toBe(saved.ingredients[1].row_key);
    expect(saved.steps).toEqual(grouped.draft.steps.map((step, index) => ({ ...step, ingredients_used: step.ingredients_used.map((item) => ({ ...item, row_key: saved.ingredients[index].row_key })) })));
  });

  it("adds a public product with blank quantity and converts only its pinned package relation", async () => {
    const item: FoodCatalogProductData = {
      type: "food_product", id: "550e8400-e29b-41d4-a716-446655440091", nutrition_version_id: "550e8400-e29b-41d4-a716-446655440092",
      name: "양조간장", brand: "원문 업체", recipe_ingredient_id: null, visibility: "public", source_type: "public_dataset", editable: false,
      basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }],
      nutrition: { basis: { amount: 100, unit: "g" }, values: {}, calculation_status: "unavailable", calculation_quality: null, warnings: [], sources: [] },
    };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [item], has_next: false, next_cursor: null });
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={context} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "원문 업체 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "재료 2 수량" });
    expect(amount.value).toBe("");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "내 레시피로 저장" }).disabled).toBe(true);
    const unit = screen.getByRole("combobox", { name: "재료 2 단위" });
    expect(within(unit).queryByRole("option", { name: "ml" })).toBeNull();
    await user.type(amount, "60");
    await user.selectOptions(unit, "package");
    expect(amount.value).toBe("0.5");
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft;
    expect(saved.ingredients[1]).toMatchObject({ ingredient_id: null, source_kind: "food_product", row_key: expect.any(String),
      food_product_id: item.id, food_product_nutrition_version_id: item.nutrition_version_id, amount: 0.5, unit: "package", display_text: "원문 업체 · 양조간장" });
    expect(saved.ingredients[1]).not.toHaveProperty("nutrition");
    expect(saved.steps[0].instruction).toBe("볶아요");
    expect(saved.steps[0].ingredients_used[0].row_key).toBe(saved.ingredients[0].row_key);
  });

  it("deletes only the selected product row reference and restores it without treating null IDs as duplicates", async () => {
    const firstKey = "550e8400-e29b-41d4-a716-446655440081";
    const secondKey = "550e8400-e29b-41d4-a716-446655440082";
    const grouped: RecipeEditContext = { ...context, draft: { ...context.draft,
      ingredients: [
        { ...context.draft.ingredients[0], row_key: firstKey, ingredient_id: null, display_text: "업체 A 간장", food_product_id: "550e8400-e29b-41d4-a716-446655440091", food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440092" },
        { ...context.draft.ingredients[0], row_key: secondKey, ingredient_id: null, display_text: "업체 B 간장", food_product_id: "550e8400-e29b-41d4-a716-446655440093", food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440094" },
      ],
      steps: [{ ...context.draft.steps[0], ingredients_used: [
        { row_key: firstKey, ingredient_id: null, amount: 10, unit: "g", cut_size: null },
        { row_key: secondKey, ingredient_id: null, amount: 20, unit: "g", cut_size: null },
      ] }],
    } };
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={grouped} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "업체 A 간장 삭제" }));
    await user.click(screen.getByRole("button", { name: "업체 A 간장 삭제 취소" }));
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft;
    expect(saved.steps[0].ingredients_used).toEqual(grouped.draft.steps[0].ingredients_used);
    expect(saved.ingredients.map((row) => row.row_key)).toEqual([firstKey, secondKey]);
    expect(saved.ingredients.map((row) => row.amount)).toEqual([200, 200]);
  });

  it("preserves the row reference but requires new quantity when replacing a pinned product version", async () => {
    const key = "550e8400-e29b-41d4-a716-446655440081";
    const id = "550e8400-e29b-41d4-a716-446655440091";
    const nextVersion = "550e8400-e29b-41d4-a716-446655440094";
    const current: RecipeEditContext = { ...context, draft: { ...context.draft,
      ingredients: [{ ...context.draft.ingredients[0], row_key: key, ingredient_id: null, display_text: "업체 A 간장", food_product_id: id, food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440092" }],
      steps: [{ ...context.draft.steps[0], ingredients_used: [{ row_key: key, ingredient_id: null, amount: 200, unit: "g", cut_size: null }] }],
    } };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [{
      type: "food_product", id, nutrition_version_id: nextVersion, recipe_ingredient_id: null,
      name: "간장", brand: "업체 A", source_type: "public_dataset", visibility: "public", editable: false, basis_relations: [],
      nutrition: { basis: { amount: 100, unit: "g" }, values: {}, calculation_status: "unavailable", calculation_quality: null, sources: [], warnings: [] },
    }], has_next: false, next_cursor: null });
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={current} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "교체" }));
    await user.click(await screen.findByRole("checkbox", { name: "업체 A · 간장" }));
    await user.click(screen.getByRole("button", { name: "이 재료로 교체" }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "재료 1 수량" });
    expect(amount.value).toBe("");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "내 레시피로 저장" }).disabled).toBe(true);
    await user.type(amount, "30");
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft;
    expect(saved.ingredients[0]).toMatchObject({ row_key: key, ingredient_id: null, food_product_id: id, food_product_nutrition_version_id: nextVersion, amount: 30, unit: "g" });
    expect(saved.steps[0].ingredients_used[0]).toEqual({ row_key: key, ingredient_id: null, amount: null, unit: null, cut_size: null });
    expect(saved.steps[0].instruction).toBe("볶아요");
  });
  it("keeps the same product/version quantity and unit when pinned conversion evidence conflicts", async () => {
    const id = "550e8400-e29b-41d4-a716-446655440091";
    const version = "550e8400-e29b-41d4-a716-446655440092";
    const item: FoodCatalogProductData = { type: "food_product", id, nutrition_version_id: version, recipe_ingredient_id: null,
      name: "간장", brand: "업체 A", source_type: "public_dataset", visibility: "public", editable: false,
      basis_relations: [
        { from: { amount: 100, unit: "g" }, to: { amount: 100, unit: "ml" } },
        { from: { amount: 100, unit: "g" }, to: { amount: 1, unit: "package" } },
        { from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "ml" } },
      ], nutrition: { basis: { amount: 100, unit: "g" }, values: {}, calculation_status: "partial", calculation_quality: null, warnings: [], sources: [] } };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [item], has_next: false, next_cursor: null });
    const user = userEvent.setup();
    render(<RecipeDetailPersonalEditor editContext={context} mode="fork" recipeId="recipe" onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "교체" }));
    await user.click(await screen.findByRole("checkbox", { name: "업체 A · 간장" }));
    await user.click(screen.getByRole("button", { name: "이 재료로 교체" }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "재료 1 수량" });
    await user.type(amount, "30");
    const unit = screen.getByRole<HTMLSelectElement>("combobox", { name: "재료 1 단위" });
    await user.selectOptions(unit, "ml");
    expect(amount.value).toBe("30"); expect(unit.value).toBe("g");
    expect(screen.getByText(/단위 전환 근거를 확인하지 못해 기존 분량과 단위를 유지/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "내 레시피로 저장" }));
    await waitFor(() => expect(createPersonalRecipeFromSource).toHaveBeenCalledOnce());
    expect(vi.mocked(createPersonalRecipeFromSource).mock.calls[0][0].draft.ingredients[0]).toMatchObject({
      food_product_id: id, food_product_nutrition_version_id: version, amount: 30, unit: "g",
    });
  });
});
