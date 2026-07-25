// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FoodProductPicker } from "@/components/planner/food-product-picker";
import type { FoodProductData } from "@/types/food-product";

const fetchFoodProducts = vi.fn();

vi.mock("@/lib/api/food-product", () => ({
  fetchFoodProducts: (...args: unknown[]) => fetchFoodProducts(...args),
  createFoodProduct: vi.fn(),
  isFoodProductApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

vi.mock("@/lib/api/product-planner-entry", () => ({
  createProductPlannerEntry: vi.fn(),
  isProductPlannerEntryApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
}));

function createProduct(): FoodProductData {
  return {
    id: "product-1",
    name: "플레인 요거트",
    brand: "무먹 식품",
    visibility: "private",
    source_type: "manual",
    editable: true,
    nutrition_version_id: "version-1",
    basis_relations: [],
    nutrition: {
      basis: { amount: 1, unit: "serving" },
      values: {
        energy_kcal: {
          amount: 105,
          known_amount: null,
          status: "complete",
          display_mode: "total",
        },
      },
      calculation_status: "complete",
      calculation_quality: "direct",
      warnings: [],
      sources: [],
    },
  };
}

function renderPicker() {
  render(
    <FoodProductPicker
      columnId="column-1"
      onClose={() => undefined}
      onComplete={() => undefined}
      planDate="2026-07-17"
      slotName="아침"
    />,
  );
}

describe("prepared food catalog search debounce and Korean IME", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchFoodProducts.mockReset();
    fetchFoodProducts.mockResolvedValue({
      items: [createProduct()],
      next_cursor: null,
      has_next: false,
    });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("debounces typed queries for 250ms and requests only the latest value", async () => {
    renderPicker();
    await act(async () => Promise.resolve());
    expect(fetchFoodProducts).toHaveBeenCalledTimes(1);

    const input = screen.getByRole("searchbox", { name: "완제품 검색" });
    fireEvent.change(input, { target: { value: "연" } });
    fireEvent.change(input, { target: { value: "연세" } });
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(fetchFoodProducts).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetchFoodProducts).toHaveBeenCalledTimes(2);
    expect(fetchFoodProducts).toHaveBeenLastCalledWith({
      q: "연세",
      source: "all",
      limit: 20,
    });
  });

  it("does not request Korean IME intermediates and requests once on composition end", async () => {
    renderPicker();
    await act(async () => Promise.resolve());
    const input = screen.getByRole("searchbox", { name: "완제품 검색" });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㅇ" } });
    fireEvent.change(input, { target: { value: "연" } });
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchFoodProducts).toHaveBeenCalledTimes(1);

    fireEvent.compositionEnd(input, { data: "세", target: { value: "연세" } });
    await act(async () => Promise.resolve());
    expect((input as HTMLInputElement).value).toBe("연세");
    expect(fetchFoodProducts).toHaveBeenCalledTimes(2);
    expect(fetchFoodProducts).toHaveBeenLastCalledWith({
      q: "연세",
      source: "all",
      limit: 20,
    });

    const valueTracker = (input as HTMLInputElement & {
      _valueTracker?: { setValue: (value: string) => void };
    })._valueTracker;
    valueTracker?.setValue("연");
    fireEvent.change(input, { target: { value: "연세" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    expect(fetchFoodProducts).toHaveBeenCalledTimes(2);
  });

  it("reissues the committed query when typing returns to the same value", async () => {
    renderPicker();
    await act(async () => Promise.resolve());
    const input = screen.getByRole("searchbox", { name: "완제품 검색" });

    fireEvent.change(input, { target: { value: "연" } });
    fireEvent.change(input, { target: { value: "" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));

    expect(fetchFoodProducts).toHaveBeenCalledTimes(2);
    expect(fetchFoodProducts).toHaveBeenLastCalledWith({
      q: "",
      source: "all",
      limit: 20,
    });
  });
});
