// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecipeFoodCatalogPicker } from "@/components/recipe/recipe-food-catalog-picker";
import { fetchFoodCatalogSearch, type FoodCatalogProductData } from "@/lib/api/food-catalog-search";
vi.mock("@/lib/api/food-catalog-search", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/food-catalog-search")>(),
  fetchFoodCatalogSearch: vi.fn(),
}));
const product = (linked: boolean): FoodCatalogProductData => ({ type: "food_product", id: linked ? "p1" : "p2", name: linked ? "양조간장" : "미검수 간장", brand: "브랜드", recipe_ingredient_id: linked ? "soy" : null, nutrition_version_id: "v1", source_type: "public_dataset", visibility: "public", editable: false, basis_relations: [], nutrition: { basis: { amount: 15, unit: "ml" }, values: {}, calculation_status: "complete", calculation_quality: "direct", warnings: [], sources: [] } });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.mocked(fetchFoodCatalogSearch).mockReset(); });
type SearchResult = Awaited<ReturnType<typeof fetchFoodCatalogSearch>>;
const ingredientResult = (id: string, name: string): SearchResult => ({ items: [{ type: "ingredient", id, standard_name: name, category: "기타", default_unit: "g" }], next_cursor: null, has_next: false });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
async function advanceSearch(milliseconds = 250) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}
describe("recipe food catalog picker", () => {
  it("keeps an unavailable search retryable without claiming the account is under maintenance", async () => {
    vi.useFakeTimers();
    const unavailable = Object.assign(new Error("계정 정비 작업 중이에요."), {
      status: 503, code: "ACCOUNT_LIFECYCLE_MAINTENANCE", fields: [],
    });
    vi.mocked(fetchFoodCatalogSearch).mockRejectedValueOnce(unavailable)
      .mockResolvedValue(ingredientResult("cheese", "치즈"));
    render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "곰곰 치즈" } });
    await advanceSearch();
    expect(screen.getByRole("alert").textContent).toContain("검색을 완료하지 못했어요");
    expect(screen.queryByText(/계정 정비/)).toBeNull();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("곰곰 치즈");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await advanceSearch();
    expect(screen.getByRole("checkbox", { name: "치즈" })).toBeTruthy();
  });
  it("searches the latest Korean input after a pause without compositionend or Enter", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue(ingredientResult("tofu", "두부"));
    render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "두" } });
    await advanceSearch(100);
    fireEvent.change(input, { target: { value: "두부" } });
    await advanceSearch(249);
    expect(fetchFoodCatalogSearch).not.toHaveBeenCalled();
    await advanceSearch(1);
    expect(fetchFoodCatalogSearch).toHaveBeenCalledOnce();
    expect(fetchFoodCatalogSearch).toHaveBeenCalledWith(expect.objectContaining({ q: "두부" }));
    expect(screen.getByRole("checkbox", { name: "두부" })).toBeTruthy();
    expect((input as HTMLInputElement).value).toBe("두부");
    fireEvent.compositionEnd(input);
    await advanceSearch();
    expect(fetchFoodCatalogSearch).toHaveBeenCalledOnce();
  });

  it("aborts an earlier composing query and ignores its late response", async () => {
    vi.useFakeTimers();
    const oldSearch = deferred<SearchResult>();
    vi.mocked(fetchFoodCatalogSearch).mockImplementation(({ q }) => q === "두" ? oldSearch.promise : Promise.resolve(ingredientResult("tofu", "두부")));
    render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "두" } });
    await advanceSearch();
    const oldSignal = vi.mocked(fetchFoodCatalogSearch).mock.calls[0][0].signal;
    fireEvent.change(input, { target: { value: "두부" } });
    expect(oldSignal?.aborted).toBe(true);
    await advanceSearch();
    expect(screen.getByRole("checkbox", { name: "두부" })).toBeTruthy();
    await act(async () => { oldSearch.resolve(ingredientResult("milk", "두유")); });
    expect(screen.queryByRole("checkbox", { name: "두유" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "두부" })).toBeTruthy();
  });

  it("retries composing searches while preserving selection and excluded ingredients", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValueOnce({ items: [product(true)], next_cursor: null, has_next: false })
      .mockRejectedValueOnce(new Error("연결 실패"))
      .mockResolvedValue(ingredientResult("tofu", "두부"));
    const add = vi.fn();
    render(<RecipeFoodCatalogPicker excludedIngredientIds={["tofu"]} onAdd={add} onClose={vi.fn()} />);
    await advanceSearch();
    fireEvent.click(screen.getByRole("checkbox", { name: "브랜드 · 양조간장" }));
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "두부" } });
    await advanceSearch();
    expect(screen.getByRole("alert").textContent).toContain("연결 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await advanceSearch();
    expect((screen.getByRole("checkbox", { name: "두부" }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "브랜드 · 양조간장 선택 해제" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    expect(add).toHaveBeenCalledWith([expect.objectContaining({ ingredient_id: "soy", food_product_id: "p1", food_product_nutrition_version_id: "v1" })]);
  });

  it("ignores a late older page after composing changes the search", async () => {
    vi.useFakeTimers();
    const oldPage = deferred<SearchResult>();
    vi.mocked(fetchFoodCatalogSearch).mockImplementation(({ q, cursor }) => cursor
      ? oldPage.promise
      : Promise.resolve(q ? ingredientResult("tofu", "두부") : { ...ingredientResult("soy", "간장"), next_cursor: "page-2", has_next: true }));
    render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    await advanceSearch();
    fireEvent.click(screen.getByRole("button", { name: "검색 결과 더 보기" }));
    const input = screen.getByRole("searchbox", { name: "제품·재료 검색" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "두부" } });
    await advanceSearch();
    await act(async () => { oldPage.resolve(ingredientResult("milk", "두유")); });
    expect(screen.getByRole("checkbox", { name: "두부" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "두유" })).toBeNull();
    expect(screen.queryByRole("button", { name: "검색 결과 더 보기" })).toBeNull();
  });

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
