// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantryAddSheet } from "@/components/pantry/pantry-add-sheet";
import type { FoodProductData } from "@/types/food-product";

const mocks = vi.hoisted(() => ({
  ingredients: vi.fn(),
  products: vi.fn(),
  add: vi.fn(),
  mobile: true,
}));

vi.mock("@/lib/api/pantry", () => ({ fetchIngredients: mocks.ingredients, addPantryItems: mocks.add }));
vi.mock("@/lib/api/food-product", () => ({ fetchFoodProducts: mocks.products }));
vi.mock("@/components/shared/use-mobile-viewport", () => ({ useIsMobileViewport: () => mocks.mobile }));

function product(id: string, name: string, brand: string | null, source_type: FoodProductData["source_type"] = "public_dataset"): FoodProductData {
  return {
    id,
    name,
    brand,
    source_type,
    visibility: source_type === "manual" ? "private" : "public",
    editable: source_type === "manual",
    nutrition_version_id: `version-${id}`,
    basis_relations: [],
    nutrition: {
      basis: { amount: 100, unit: "g" },
      values: {},
      calculation_status: "unavailable",
      calculation_quality: null,
      warnings: [],
      sources: [],
    },
  };
}

async function searchProducts(items: FoodProductData[], existingProductItems: Array<{ food_product_id: string; food_product_nutrition_version_id: string }> = []) {
  mocks.products.mockResolvedValue({ items });
  render(<PantryAddSheet existingIngredientIds={[]} existingProductItems={existingProductItems} onAdd={vi.fn()} onClose={vi.fn()} />);
  await screen.findByText("검색 결과가 없어요");
  fireEvent.change(screen.getByRole("textbox", { name: "재료명 검색" }), { target: { value: "제품" } });
  const cards = await screen.findAllByRole("checkbox", { name: new RegExp(items[0].name) });
  return cards[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ingredients.mockResolvedValue({ items: [] });
  mocks.add.mockResolvedValue({ added: 0, product_added: 1 });
});
afterEach(cleanup);

describe("pantry registered company badges", () => {
  it.each([true, false])("shows the reviewed badge, exposes the original after selection, and keeps pinned identity (mobile=%s)", async (mobile) => {
    mocks.mobile = mobile;
    const item = product("sempyo", "폰타나시저드레싱", "샘표식품(주)영동공장");
    const original = JSON.stringify(item);
    const card = await searchProducts([item]);
    expect(within(card).getByText("샘표")).toBeTruthy();
    expect(card.textContent).not.toContain(item.brand);
    expect(card.textContent).not.toContain("영양 버전");
    expect(card.getAttribute("aria-label")).toBe("폰타나시저드레싱 · 등록업체 샘표식품(주)영동공장 · 선택 안 됨");
    expect(card.getAttribute("aria-label")).not.toContain(item.nutrition_version_id);
    expect(within(card).queryByText("📦")).toBeNull();
    expect(screen.getByText(/배지는 등록업체명/)).toBeTruthy();

    fireEvent.click(card);
    expect(card.getAttribute("aria-checked")).toBe("true");
    expect(card.getAttribute("aria-label")).toContain("선택됨");
    const selected = screen.getByTestId("pantry-add-selected-ingredients");
    expect(within(selected).getByText("등록업체 샘표식품(주)영동공장")).toBeTruthy();
    const remove = within(selected).getByRole("button", { name: /샘표식품\(주\)영동공장.*선택 해제/ });
    expect(remove.getAttribute("title")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "팬트리에 추가 (1)" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith([], [{ food_product_id: "sempyo", food_product_nutrition_version_id: "version-sempyo" }]));
    expect(JSON.stringify(item)).toBe(original);
  });

  it.each([true, false])("keeps equal aliases separate, uses the actual company, and excludes an owned pinned version (mobile=%s)", async (mobile) => {
    mocks.mobile = mobile;
    const first = product("first", "같은제품", "샘표식품(주)");
    const second = product("second", "같은제품", "샘표식품(주) 이천공장");
    const outsourced = product("outsourced", "샘표우리엄마콩자반", "양포식품(주)");
    await searchProducts([first, second, outsourced], [{ food_product_id: "first", food_product_nutrition_version_id: "version-first" }]);
    const owned = screen.getByRole("checkbox", { name: "같은제품 · 등록업체 샘표식품(주) · 보유중" });
    expect(owned.hasAttribute("disabled")).toBe(true);
    const available = screen.getByRole("checkbox", { name: "같은제품 · 등록업체 샘표식품(주) 이천공장 · 선택 안 됨" });
    const card = screen.getByRole("checkbox", { name: /샘표우리엄마콩자반/ });
    expect(within(card).getByText("양포식품")).toBeTruthy();
    expect(within(card).queryByText("샘표")).toBeNull();
    fireEvent.click(available);
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "팬트리에 추가 (2)" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith([], [
      { food_product_id: "second", food_product_nutrition_version_id: "version-second" },
      { food_product_id: "outsourced", food_product_nutrition_version_id: "version-outsourced" },
    ]));
  });

  it.each([true, false])("provides a missing-company fallback and leaves private manual brands untouched (mobile=%s)", async (mobile) => {
    mocks.mobile = mobile;
    const missing = product("missing", "업체미등록제품", null);
    const manual = product("manual", "개인제품", "샘표식품(주)영동공장", "manual");
    await searchProducts([missing, manual]);
    const missingCard = screen.getByRole("checkbox", { name: /업체미등록제품 · 등록업체 정보 없음/ });
    expect(within(missingCard).getByText("제품")).toBeTruthy();
    fireEvent.click(missingCard);
    expect(within(screen.getByTestId("pantry-add-selected-ingredients")).getByText("등록업체 정보 없음")).toBeTruthy();
    const manualCard = screen.getByRole("checkbox", { name: /개인제품 · 샘표식품\(주\)영동공장/ });
    expect(within(manualCard).getByText("📦")).toBeTruthy();
    expect(within(manualCard).getByText(manual.brand ?? "")).toBeTruthy();
    expect(within(manualCard).queryByText("샘표")).toBeNull();
    expect(manualCard.textContent).not.toContain("version-manual");
  });

  it.each([true, false])("hides meaningless company notation after legal cleanup without changing the source (mobile=%s)", async (mobile) => {
    mocks.mobile = mobile;
    const item = product("placeholder", "업체확인대기제품", "(주)-");
    const card = await searchProducts([item]);
    expect(within(card).getByText("제품")).toBeTruthy();
    expect(card.getAttribute("aria-label")).toBe("업체확인대기제품 · 등록업체 정보 없음 · 선택 안 됨");
    fireEvent.click(card);
    expect(within(screen.getByTestId("pantry-add-selected-ingredients")).getByText("등록업체 정보 없음")).toBeTruthy();
    expect(item.brand).toBe("(주)-");
  });
});
