// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeFoodCatalogPicker } from "@/components/recipe/recipe-food-catalog-picker";
import { fetchFoodCatalogSearch, type FoodCatalogProductData } from "@/lib/api/food-catalog-search";
vi.mock("@/lib/api/food-catalog-search", () => ({ fetchFoodCatalogSearch: vi.fn() }));
const product = (linked: boolean): FoodCatalogProductData => ({ type: "food_product", id: linked ? "p1" : "p2", name: linked ? "양조간장" : "미검수 간장", brand: "브랜드", recipe_ingredient_id: linked ? "soy" : null, nutrition_version_id: "v1", source_type: "public_dataset", visibility: "public", editable: false, basis_relations: [], nutrition: { basis: { amount: 15, unit: "ml" }, values: {}, calculation_status: "complete", calculation_quality: "direct", warnings: [], sources: [] } });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("recipe food catalog picker", () => {
  it("shows typed mixed results and sends only approved product provenance", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [{ type: "ingredient", id: "tofu", standard_name: "두부", category: "콩", default_unit: "g" }, product(true), product(false)], next_cursor: null, has_next: false });
    const user = userEvent.setup(); const add = vi.fn(); render(<RecipeFoodCatalogPicker onAdd={add} onClose={vi.fn()} />);
    expect((await screen.findByRole("checkbox", { name: "브랜드 · 미검수 간장" }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "브랜드 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    expect(add).toHaveBeenCalledWith([expect.objectContaining({ ingredient_id: "soy", food_product_id: "p1", food_product_nutrition_version_id: "v1", amount: 15, unit: "ml" })]);
  });
  it("surfaces failed search and retries instead of calling it an empty catalog", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockRejectedValueOnce(new Error("연결 실패")).mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    const user = userEvent.setup(); render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("연결 실패");
    expect(screen.queryByText(/검색 결과가 없어요/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByText(/검색 결과가 없어요/)).toBeTruthy());
  });
  it("uses one cursor for more results and prevents adding an existing canonical ingredient", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValueOnce({ items: [{ type: "ingredient", id: "soy", standard_name: "간장", category: "양념", default_unit: "g" }], next_cursor: "page-2", has_next: true })
      .mockResolvedValue({ items: [product(true)], next_cursor: null, has_next: false });
    const user = userEvent.setup(); render(<RecipeFoodCatalogPicker excludedIngredientIds={["soy"]} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect((await screen.findByRole("checkbox", { name: "간장" }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "검색 결과 더 보기" }));
    expect((await screen.findByRole("checkbox", { name: "브랜드 · 양조간장" }) as HTMLInputElement).disabled).toBe(true);
    expect(fetchFoodCatalogSearch).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "page-2", types: ["ingredient", "food_product"] }));
  });

});
