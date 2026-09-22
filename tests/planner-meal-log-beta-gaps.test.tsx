// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogAddSheet } from "@/components/planner/meal-log-add-sheet";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), source: vi.fn(), recent: vi.fn(), batches: vi.fn() }));
vi.mock("@/lib/api/food-catalog-search", () => ({ fetchFoodCatalogSearch: mocks.catalog, fetchFoodCatalogSource: mocks.source }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogRecent: mocks.recent, isMealLogApiError: () => false }));
vi.mock("@/lib/api/cooking", () => ({ fetchCookedBatches: mocks.batches }));
const page = (items: unknown[]) => ({ items, has_next: false, next_cursor: null });
const product = {
  type: "food_product", id: "product-1", name: "요거트", brand: null,
  source_type: "manual", visibility: "private", editable: true,
  nutrition_version_id: "version-1", nutrition: { basis: { amount: 1, unit: "serving" } },
  basis_relations: [{ from: { amount: 1, unit: "serving" }, to: { amount: 150, unit: "g" } }],
};
const recent = (type = "food_product", id = "product-1", name = "요거트", unit = "serving") => ({
  source: { type, id }, display_name: name, display_brand: null,
  last_quantity: { amount: 2, unit }, frequency: 3,
});
function open() {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<MealLogAddSheet columns={[{ id: "col", name: "아침", sort_order: 0 }]} date="2026-09-22" initialColumnId="col" onClose={vi.fn()} onUnauthorized={vi.fn()} onSave={onSave} />);
  return onSave;
}
async function flush() { await act(async () => Promise.resolve()); }
beforeEach(() => {
  vi.useFakeTimers();
  mocks.catalog.mockReset().mockResolvedValue(page([product]));
  mocks.source.mockReset().mockResolvedValue(product);
  mocks.recent.mockReset().mockResolvedValue(page([recent()]));
  mocks.batches.mockReset().mockResolvedValue(page([]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("meal log beta source selection", () => {
  it("restores approved units for a recent product while retaining its last quantity", async () => {
    const onSave = open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    fireEvent.click(screen.getByRole("button", { name: /요거트/ })); await flush();
    expect(mocks.source).toHaveBeenCalledWith("food_product", "product-1");
    expect((screen.getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value).toBe("2");
    expect((screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox", { name: "단위" }), { target: { value: "g" } });
    expect((screen.getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value).toBe("300");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" })); await flush();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 300, unit: "g", id: "product-1" }), "col", "2026-09-22");
  });

  it("keeps cooked recent foods only on the cooked tab", async () => {
    mocks.recent.mockResolvedValue(page([recent(), recent("cooked_batch", "batch-1", "어제 카레", "g")]));
    open(); await flush();
    expect(screen.getByRole("button", { name: /어제 카레/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /요거트/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    expect(screen.getByRole("button", { name: /요거트/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /어제 카레/ })).toBeNull();
  });

  it("does not restore a deleted, inaccessible, or mismatched catalog source", async () => {
    mocks.source.mockResolvedValue(null);
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    fireEvent.click(screen.getByRole("button", { name: /요거트/ })); await flush();
    expect(screen.queryByRole("button", { name: "기록 저장" })).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("does not invent a conversion for a no longer supported recent unit", async () => {
    mocks.recent.mockResolvedValue(page([recent("food_product", "product-1", "요거트", "개")]));
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    fireEvent.click(screen.getByRole("button", { name: /요거트/ })); await flush();
    expect(screen.queryByRole("button", { name: "기록 저장" })).toBeNull();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("suppresses IME intermediate text and searches 250ms after composition finishes", async () => {
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㅇ" } });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.catalog).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input, { target: { value: "요거트" } });
    await act(async () => vi.advanceTimersByTimeAsync(249));
    expect(mocks.catalog).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
    expect(mocks.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ q: "요거트" }));
  });
  it("restores ingredient grams and kilograms from the fresh catalog", async () => {
    mocks.recent.mockResolvedValue(page([recent("ingredient", "ingredient-1", "쌀", "kg")]));
    mocks.source.mockResolvedValue({ type: "ingredient", id: "ingredient-1", standard_name: "쌀", default_unit: "개" });
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    fireEvent.click(screen.getByRole("button", { name: /쌀/ })); await flush();
    fireEvent.change(screen.getByRole("combobox", { name: "단위" }), { target: { value: "g" } });
    expect((screen.getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value).toBe("2000");
  });

  it("finds a renamed recent source by identity without searching its historical name", async () => {
    mocks.source.mockResolvedValue({ ...product, name: "새 이름 요거트" });
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    fireEvent.click(screen.getByRole("button", { name: /요거트/ })); await flush();
    expect(mocks.source).toHaveBeenCalledWith("food_product", "product-1");
    expect(mocks.catalog).not.toHaveBeenCalled();
    expect(screen.getByText("새 이름 요거트", { selector: "footer p" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "단위" })).toBeTruthy();
  });

  it("discards a recent source lookup after changing tabs", async () => {
    let finish!: (value: unknown) => void;
    mocks.source.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    fireEvent.click(screen.getByRole("button", { name: /요거트/ })); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "요리한 음식" }));
    await act(async () => { finish(product); });
    expect(screen.queryByRole("button", { name: "기록 저장" })).toBeNull();
  });

  it("aborts and ignores older search responses even when the transport resolves them", async () => {
    let finish!: (value: unknown) => void;
    mocks.catalog.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(page([{ ...product, name: "새 검색 결과" }]));
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.change(input, { target: { value: "예전" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    const oldSignal = mocks.catalog.mock.calls[0][0].signal as AbortSignal;
    fireEvent.change(input, { target: { value: "새 검색" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    await act(async () => { finish(page([{ ...product, name: "오래된 결과" }])); });
    expect(oldSignal.aborted).toBe(true);
    expect(screen.getByRole("button", { name: /새 검색 결과/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /오래된 결과/ })).toBeNull();
  });

  it("does not append pagination from the old query to new search results", async () => {
    let finish!: (value: unknown) => void;
    mocks.catalog.mockResolvedValueOnce({ items: [product], has_next: true, next_cursor: "more" })
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(page([{ ...product, id: "new", name: "우유" }]));
    open(); await flush();
    fireEvent.click(screen.getByRole("tab", { name: "제품·재료" }));
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.change(input, { target: { value: "요거트" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    fireEvent.click(screen.getByRole("button", { name: "제품·재료 더 불러오기" }));
    fireEvent.change(input, { target: { value: "우유" } });
    await act(async () => vi.advanceTimersByTimeAsync(250));
    await act(async () => { finish(page([{ ...product, id: "old-page", name: "옛 추가결과" }])); });
    expect(screen.getByRole("button", { name: /우유/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /옛 추가결과/ })).toBeNull();
  });

  it("rehydrates approved units after login before allowing the preserved draft to save", async () => {
    let finish!: (value: unknown) => void;
    mocks.source.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MealLogAddSheet columns={[{ id: "col", name: "아침", sort_order: 0 }]} date="2026-09-22" initialColumnId="col"
      initialSelection={{ type: "food_product", id: "product-1", name: "예전 이름", brand: null, amount: 2, unit: "serving" }}
      onClose={vi.fn()} onUnauthorized={vi.fn()} onSave={vi.fn()} />);
    await flush();
    expect((screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish(product); });
    fireEvent.change(screen.getByRole("combobox", { name: "단위" }), { target: { value: "g" } });
    expect((screen.getByRole("spinbutton", { name: "실제 양" }) as HTMLInputElement).value).toBe("300");
    expect((screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled).toBe(false);
  });

});
