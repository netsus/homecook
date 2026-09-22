// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantryAddSheet } from "@/components/pantry/pantry-add-sheet";

const mocks = vi.hoisted(() => ({
  ingredients: vi.fn(),
  products: vi.fn(),
  add: vi.fn(),
  mobile: true,
}));

vi.mock("@/lib/api/pantry", () => ({
  fetchIngredients: mocks.ingredients,
  addPantryItems: mocks.add,
}));
vi.mock("@/lib/api/food-product", () => ({ fetchFoodProducts: mocks.products }));
vi.mock("@/components/shared/use-mobile-viewport", () => ({
  useIsMobileViewport: () => mocks.mobile,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ingredients.mockResolvedValue({ items: [] });
  mocks.products.mockRejectedValue(new Error("temporary product lookup failure"));
});
afterEach(cleanup);

describe("pantry product search recovery", () => {
  it.each([true, false])("shows a retryable error instead of no results (mobile=%s)", async (mobile) => {
    mocks.mobile = mobile;
    render(<PantryAddSheet existingIngredientIds={[]} existingProductItems={[]} onAdd={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText("검색 결과가 없어요");

    fireEvent.change(screen.getByRole("textbox", { name: "재료명 검색" }), { target: { value: "간장" } });
    await screen.findByText("재료·제품 목록을 불러오지 못했어요");
    expect(screen.queryByText("검색 결과가 없어요")).toBeNull();
    expect(mocks.products).toHaveBeenCalledWith({ q: "간장", limit: 20 });

    mocks.products.mockResolvedValue({ items: [], has_next: false, next_cursor: null });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText("검색 결과가 없어요");
    await waitFor(() => expect(mocks.products).toHaveBeenCalledTimes(2));
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
