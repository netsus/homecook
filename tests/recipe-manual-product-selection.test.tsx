// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { fetchFoodCatalogSearch, type FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import { createManualRecipe } from "@/lib/api/manual-recipe";
import { fetchUserProfile } from "@/lib/api/mypage";
import { fetchPantryList } from "@/lib/api/pantry";
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/api/food-catalog-search", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api/food-catalog-search")>(), fetchFoodCatalogSearch: vi.fn(), fetchFoodCatalogSource: vi.fn(async () => null) }));
vi.mock("@/lib/api/mypage", () => ({ fetchUserProfile: vi.fn(async () => ({ id: "00000000-0000-4000-8000-000000000001" })) }));
vi.mock("@/lib/api/pantry", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api/pantry")>(), fetchPantryList: vi.fn() }));
vi.mock("@/lib/api/manual-recipe", () => ({
  createManualRecipe: vi.fn(), cancelRecipeImage: vi.fn(), uploadRecipeImage: vi.fn(),
  readManualRecipeCreateResult: vi.fn(async () => ({ success: true, data: { recipe: null }, error: null })),
}));
vi.mock("@/lib/api/recipe", () => ({ suggestRecipeTags: vi.fn(async () => ({ success: true, data: { suggested_tags: [], tags: [] }, error: null })) }));
vi.mock("@/lib/api/meal", () => ({ createMealSafe: vi.fn() }));
vi.mock("@/lib/api/cooking-methods", () => ({ fetchCookingMethods: vi.fn(async () => ({ success: true, error: null, data: { methods: [{ id: "method-prep", code: "prep", label: "준비", color_key: "gray", is_system: true }] } })) }));
const product: FoodCatalogSearchItem = {
  type: "food_product", id: "550e8400-e29b-41d4-a716-446655440091", name: "양조간장", brand: "브랜드",
  recipe_ingredient_id: null, nutrition_version_id: "550e8400-e29b-41d4-a716-446655440092", source_type: "public_dataset",
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
  vi.mocked(fetchUserProfile).mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001", nickname: "테스트", email: null,
    profile_image_url: null, social_provider: "google", settings: { screen_wake_lock: false } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("manual recipe catalog selection", () => {
  it.each([3, 4] as const)("returns to pantry-only editing at generation %i without creating or replaying a recipe", async restoredGeneration => {
    const profile = { id: "00000000-0000-4000-8000-000000000001", nickname: "테스트", email: null,
      profile_image_url: null, social_provider: "google" as const, settings: { screen_wake_lock: false }, account_generation: 3 };
    vi.mocked(fetchUserProfile).mockResolvedValue(profile);
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [product], has_next: false, next_cursor: null });
    vi.mocked(fetchPantryList).mockRejectedValueOnce(Object.assign(new Error("unauthorized"), { status: 401, code: "UNAUTHORIZED", fields: [] }))
      .mockResolvedValue({ items: [], product_items: [] });
    window.history.replaceState({}, "", "/menu/add/manual?date=2026-09-22&columnId=breakfast&slot=아침");
    const props = { planDate: "2026-09-22", columnId: "breakfast", slotName: "아침", initialAuthenticated: true };
    const user = userEvent.setup(); const view = render(<ManualRecipeCreateScreen {...props} />);
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "로그인 전 비공개 초안");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "브랜드 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.type(screen.getByRole("textbox", { name: "브랜드 · 양조간장 수량" }), "30");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(screen.getByRole("button", { name: "내 팬트리에서 선택" }));
    await screen.findByText(/내 팬트리는 로그인 후 선택/);
    await user.click(screen.getByRole("button", { name: "로그인하고 이어서 선택" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(String(navigation.push.mock.calls[0][0])).toContain("/login?reauthenticate=1&next=");
    const key = "homecook:manual-recipe-draft:00000000-0000-4000-8000-000000000001:2026-09-22:breakfast";
    const stored = JSON.parse(window.sessionStorage.getItem(key)!);
    expect(stored).toMatchObject({ title: "로그인 전 비공개 초안", accountGeneration: 3, resumePantry: true });
    const ingredient = stored.ingredients[0];
    expect(ingredient).toMatchObject({ amount: 30, unit: "ml", food_product_id: product.id, food_product_nutrition_version_id: product.nutrition_version_id });
    view.unmount(); vi.mocked(fetchUserProfile).mockResolvedValue({ ...profile, account_generation: restoredGeneration });
    render(<ManualRecipeCreateScreen {...props} />);
    if (restoredGeneration === 3) {
      await screen.findByRole("dialog", { name: "제품·재료 선택" });
      expect(screen.getByPlaceholderText("예: 김치찌개")).toHaveProperty("value", stored.title);
      expect(screen.getByRole<HTMLInputElement>("textbox", { name: "브랜드 · 양조간장 수량", hidden: true }).value).toBe("30");
      expect(screen.getByRole<HTMLButtonElement>("button", { name: "내 팬트리에서 선택" }).getAttribute("aria-pressed")).toBe("true");
    } else {
      await screen.findByText(/이전 초안을 자동으로 복원하지 않았어요/);
      expect(screen.queryByDisplayValue(stored.title)).toBeNull();
      expect(screen.queryByRole("dialog", { name: "제품·재료 선택" })).toBeNull();
      expect(JSON.parse(window.sessionStorage.getItem(key)!).title).toBe(stored.title);
    }
    expect(createManualRecipe).not.toHaveBeenCalled();
  });
  it("keeps quantity and unit on an ambiguous product conversion and explains it", async () => {
    const item: FoodCatalogSearchItem = { ...product, nutrition: { ...product.nutrition, basis: { amount: 100, unit: "g" } },
      basis_relations: [
        { from: { amount: 100, unit: "g" }, to: { amount: 100, unit: "ml" } },
        { from: { amount: 100, unit: "g" }, to: { amount: 1, unit: "package" } },
        { from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "ml" } },
      ] };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [item], has_next: false, next_cursor: null });
    const user = userEvent.setup(); render(<ManualRecipeCreateScreen planDate="2026-09-22" columnId="breakfast" slotName="아침" initialAuthenticated />);
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "원량 유지 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "브랜드 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "브랜드 · 양조간장 수량" });
    await user.type(amount, "30");
    const unit = screen.getByRole<HTMLSelectElement>("combobox", { name: "브랜드 · 양조간장 단위" });
    await user.selectOptions(unit, "ml");
    expect(amount.value).toBe("30");
    expect(screen.getByRole("alert").textContent).toContain("기존 분량과 단위를 유지했어요");
    expect(unit.value).toBe("g");
    await user.click(await screen.findByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "원량 그대로 준비해요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(createManualRecipe).toHaveBeenCalledOnce());
    expect(vi.mocked(createManualRecipe).mock.calls[0][0].ingredients[0]).toMatchObject({ amount: 30, unit: "g", food_product_id: product.id,
      food_product_nutrition_version_id: product.nutrition_version_id });
  });
  it.each([
    { name: "브랜드 · 양조간장", source: product, expected: { source_kind: "food_product", row_key: expect.any(String), ingredient_id: null, food_product_id: "550e8400-e29b-41d4-a716-446655440091", food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440092", amount: 30, unit: "ml" } },
    { name: "양파", source: { type: "ingredient", id: "onion", standard_name: "양파", category: "채소", default_unit: "g" } as FoodCatalogSearchItem, expected: { ingredient_id: "onion", amount: 100, unit: "g" } },
  ])("persists $name using the selected exact source", async ({ name, source, expected }) => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [source], has_next: false, next_cursor: null });
    const user = userEvent.setup(); render(<ManualRecipeCreateScreen planDate="2026-09-22" columnId="breakfast" slotName="아침" initialAuthenticated />);
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "테스트 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    if (source.type === "food_product") {
      expect(screen.queryByRole("button", { name: `${name} g` })).toBeNull();
      expect(screen.getByRole("textbox", { name: `${name} 수량` })).toHaveProperty("value", "");
      await user.type(screen.getByRole("textbox", { name: `${name} 수량` }), "30");
    }
    await user.click(await screen.findByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "재료를 준비해요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(createManualRecipe).toHaveBeenCalled());
    const body = vi.mocked(createManualRecipe).mock.calls[0][0];
    expect(body.ingredients[0]).toMatchObject(expected);
    expect(body.ingredients[0]).not.toHaveProperty("nutrition");
    expect(body.ingredients[0]).not.toHaveProperty("basis_relations");
    if (source.type === "ingredient") expect(body.ingredients[0].food_product_id).toBeUndefined();
  });

  it("requires actual quantity and preserves a pinned package quantity through draft remount", async () => {
    const packaged: FoodCatalogSearchItem = { ...product, nutrition: { ...product.nutrition,
      basis: { amount: 100, unit: "g" }, calculation_status: "unavailable" },
      basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }],
    };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [packaged], has_next: false, next_cursor: null });
    const user = userEvent.setup();
    const props = { planDate: "2026-09-22", columnId: "breakfast", slotName: "아침", initialAuthenticated: true };
    const first = render(<ManualRecipeCreateScreen {...props} />);
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "테스트 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "브랜드 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.click(await screen.findByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "원문 그대로 준비해요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(createManualRecipe).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "브랜드 · 양조간장 수량" })).toHaveProperty("value", "");
    await user.type(screen.getByRole("textbox", { name: "브랜드 · 양조간장 수량" }), "60");
    await user.selectOptions(screen.getByRole("combobox", { name: "브랜드 · 양조간장 단위" }), "package");
    expect(screen.getByRole("textbox", { name: "브랜드 · 양조간장 수량" })).toHaveProperty("value", "0.5");
    first.unmount();

    render(<ManualRecipeCreateScreen {...props} />);
    const amount = await screen.findByRole("textbox", { name: "브랜드 · 양조간장 수량" });
    expect(amount).toHaveProperty("value", "0.5");
    const unit = screen.getByRole<HTMLSelectElement>("combobox", { name: "브랜드 · 양조간장 단위" });
    expect(unit.value).toBe("package");
    expect(unit.options).toHaveLength(1);
    expect(screen.getByText(/기존 단위와 분량은 유지돼요/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(createManualRecipe).toHaveBeenCalledTimes(1));
    const body = vi.mocked(createManualRecipe).mock.calls[0][0];
    expect(body.ingredients[0]).toMatchObject({ ingredient_id: null, row_key: expect.any(String),
      food_product_id: product.id, food_product_nutrition_version_id: product.nutrition_version_id, amount: 0.5, unit: "package" });
    expect(body.steps[0].ingredients_used).toEqual([]);
    expect(body.steps[0].instruction).toBe("원문 그대로 준비해요");
  });

  it("shows disabled product writes honestly and restores the rejected draft for retry", async () => {
    const message = "지금은 선택한 제품 재료를 저장할 수 없어요. 입력 내용을 유지한 채 다시 시도해 주세요.";
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [product], has_next: false, next_cursor: null });
    vi.mocked(createManualRecipe).mockResolvedValueOnce({ success: false, data: null, error: {
      code: "VALIDATION_ERROR", message, fields: [{ field: "ingredients", reason: "product_reference_unavailable" }],
    } });
    const user = userEvent.setup();
    const props = { planDate: "2026-09-22", columnId: "breakfast", slotName: "아침", initialAuthenticated: true };
    const first = render(<ManualRecipeCreateScreen {...props} />);
    await user.type(screen.getByPlaceholderText("예: 김치찌개"), "보존할 제품 요리");
    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("checkbox", { name: "브랜드 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    await user.type(screen.getByRole("textbox", { name: "브랜드 · 양조간장 수량" }), "30");
    await user.click(await screen.findByRole("button", { name: "준비" }));
    await user.type(screen.getByLabelText("만들기 1 설명"), "원문 제품으로 준비해요");
    await user.click(screen.getByRole("button", { name: "+ 만들기 추가" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.queryByText(/재료 수량을 0보다 크게/)).toBeNull();
    expect(screen.queryByRole("button", { name: "저장 결과 확인" })).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "저장" }).disabled).toBe(false);
    const rejected = vi.mocked(createManualRecipe).mock.calls[0][0];
    first.unmount();

    render(<ManualRecipeCreateScreen {...props} />);
    expect(await screen.findByRole("textbox", { name: "브랜드 · 양조간장 수량" })).toHaveProperty("value", "30");
    expect(screen.getByPlaceholderText("예: 김치찌개")).toHaveProperty("value", "보존할 제품 요리");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(createManualRecipe).toHaveBeenCalledTimes(2));
    expect(vi.mocked(createManualRecipe).mock.calls[1][0]).toEqual(rejected);
    expect(rejected.ingredients[0]).toMatchObject({ ingredient_id: null, row_key: expect.any(String),
      food_product_id: product.id, food_product_nutrition_version_id: product.nutrition_version_id, amount: 30, unit: "ml" });
  });
});
