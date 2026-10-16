// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecipeDetailPersonalEditor } from "@/components/recipe/recipe-detail-personal-editor";
import type { RecipeEditContext } from "@/types/recipe";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), context: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/api/mypage", () => ({ fetchUserProfile: mocks.profile }));
vi.mock("@/lib/api/recipe-quantity-context", () => ({ fetchRecipeQuantityContexts: mocks.context }));
vi.mock("@/lib/api/personal-recipe", () => ({ createPersonalRecipeFromSource: mocks.save, isPersonalRecipeApiError: () => false }));
vi.mock("@/components/recipe/recipe-ingredient-add-modal", () => ({ RecipeIngredientAddModal: () => null }));
vi.mock("@/components/recipe/recipe-future-impact-save-flow", () => ({ RecipeFutureImpactSaveFlow: () => null }));
const hash = "a".repeat(64);
const draft: RecipeEditContext = { base_recipe_revision: 1, image_object_id: null, draft: {
  title: "QA 원분수", description: null, base_servings: 2, ingredients: [{ row_key: "row", ingredient_id: "milk",
    food_product_id: null, food_product_nutrition_version_id: null,
    amount: 1 / 3, unit: "L", ingredient_type: "QUANT", scalable: true, display_text: "우유", component_label: null,
    quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "L", expected_context_sha256: hash } }], steps: [] } };
function mount() { return render(<RecipeDetailPersonalEditor editContext={draft} mode="edit" recipeId="recipe"
  onClose={vi.fn()} onSaved={vi.fn()} />); }
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
afterEach(cleanup);
describe("editor owner readiness before explicit quantity read", () => {
  beforeEach(() => { mocks.profile.mockReset(); mocks.context.mockReset(); mocks.save.mockReset(); });
  it("blocks fast clicks while owner is loading, then allows an explicit read without automatic save", async () => {
    const pending = deferred<{ id: string; account_generation: number }>();
    mocks.profile.mockReturnValueOnce(pending.promise).mockResolvedValue({ id: "owner", account_generation: 3 });
    mocks.context.mockResolvedValue({ subject: { owner_uuid: "owner", account_generation: 3 }, items: [{
      ...draft.draft.ingredients[0], context: { ready: true, context_sha256: hash, options: { choices: [{ unit: "L" }] } } }] });
    mount();
    const button = screen.getByRole("button", { name: "재료 1 수량 정보 다시 확인" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button);
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect((screen.getByLabelText("재료 1 수량") as HTMLInputElement).value).toBe("1/3");
    await act(async () => pending.resolve({ id: "owner", account_generation: 3 }));
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(mocks.context).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.context).toHaveBeenCalledOnce());
    await waitFor(() => expect((screen.getByLabelText("재료 1 수량") as HTMLInputElement).disabled).toBe(false));
    expect(mocks.profile).toHaveBeenCalledTimes(3); expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.queryByText(/초안을 작성한 계정 정보를 확인하지/)).toBeNull();
  });
  it("keeps failed owner verification fail-closed and preserves the raw draft", async () => {
    mocks.profile.mockRejectedValue(new Error("unavailable")); mount();
    const button = screen.getByRole("button", { name: "재료 1 수량 정보 다시 확인" }) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false)); fireEvent.click(button);
    expect(await screen.findByText(/초안을 작성한 계정 정보를 확인하지/)).toBeTruthy();
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect((screen.getByLabelText("재료 1 수량") as HTMLInputElement).value).toBe("1/3");
  });
});
