// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  RecipeFoodCatalogPicker,
  recipeIngredientFromCatalog,
} from "@/components/recipe/recipe-food-catalog-picker";
import { fetchFoodCatalogSearch, fetchFoodCatalogSource, type FoodCatalogProductData } from "@/lib/api/food-catalog-search";
import { fetchPantryList } from "@/lib/api/pantry";
vi.mock("@/lib/api/food-catalog-search", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/food-catalog-search")>(),
  fetchFoodCatalogSearch: vi.fn(),
  fetchFoodCatalogSource: vi.fn(),
}));
vi.mock("@/lib/api/pantry", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api/pantry")>(), fetchPantryList: vi.fn() }));
const keyboard = vi.hoisted(() => ({ open: false }));
vi.mock("@/components/shared/use-soft-keyboard-open", () => ({ useSoftKeyboardOpen: () => keyboard.open }));
const PRODUCT_A_ID = "550e8400-e29b-41d4-a716-446655440091";
const PRODUCT_B_ID = "550e8400-e29b-41d4-a716-446655440093";
const VERSION_A_ID = "550e8400-e29b-41d4-a716-446655440092";
const VERSION_B_ID = "550e8400-e29b-41d4-a716-446655440094";
const product = (linked: boolean): FoodCatalogProductData => ({ type: "food_product", id: linked ? PRODUCT_A_ID : PRODUCT_B_ID, name: linked ? "양조간장" : "미검수 간장", brand: "브랜드", recipe_ingredient_id: linked ? "550e8400-e29b-41d4-a716-446655440095" : null, nutrition_version_id: linked ? VERSION_A_ID : VERSION_B_ID, source_type: "public_dataset", visibility: "public", editable: false, basis_relations: [], nutrition: { basis: { amount: 15, unit: "ml" }, values: {}, calculation_status: "complete", calculation_quality: "direct", warnings: [], sources: [] } });
afterEach(() => { keyboard.open = false; cleanup(); vi.useRealTimers(); vi.clearAllMocks(); vi.mocked(fetchFoodCatalogSearch).mockReset(); vi.mocked(fetchFoodCatalogSource).mockReset(); vi.mocked(fetchPantryList).mockReset(); });
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
  it("accepts an unlinked public product without treating its label basis as actual quantity", () => {
    expect(recipeIngredientFromCatalog(product(false), 1)).toMatchObject({
      source_kind: "food_product", row_key: expect.any(String), ingredient_id: null,
      food_product_id: PRODUCT_B_ID, food_product_nutrition_version_id: VERSION_B_ID,
      amount: null, unit: "ml", display_text: "브랜드 · 미검수 간장",
    });
  });

  it("projects exact generic and product ingredient fields", () => {
    expect(recipeIngredientFromCatalog(ingredientResult("tofu", "두부").items[0]!, 3)).toEqual({
      source_kind: "ingredient", row_key: expect.any(String),
      ingredient_id: "tofu",
      standard_name: "두부",
      amount: 100,
      unit: "g",
      ingredient_type: "QUANT",
      scalable: true,
      display_text: "두부 100g",
      sort_order: 3,
    });
    expect(recipeIngredientFromCatalog(product(true), 4)).toEqual({
      source_kind: "food_product", row_key: expect.any(String), ingredient_id: null,
      standard_name: "브랜드 · 양조간장",
      amount: null,
      unit: "ml",
      ingredient_type: "QUANT",
      scalable: true,
      display_text: "브랜드 · 양조간장",
      sort_order: 4,
      food_product_id: PRODUCT_A_ID,
      food_product_nutrition_version_id: VERSION_A_ID,
    });
  });

  it("keeps the existing representative boundary for manually registered products", () => {
    const item = { ...product(true), source_type: "manual" as const };
    expect(recipeIngredientFromCatalog(item, 1)).toMatchObject({
      source_kind: "food_product", ingredient_id: item.recipe_ingredient_id,
      food_product_id: item.id, food_product_nutrition_version_id: item.nutrition_version_id, amount: null,
    });
    expect(recipeIngredientFromCatalog({ ...item, recipe_ingredient_id: null }, 1)).toBeNull();
  });

  it("hides the add footer while the keyboard is open and restores the selection after closing", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue(ingredientResult("tofu", "두부"));
    const onAdd = vi.fn(); const onClose = vi.fn();
    const view = render(<RecipeFoodCatalogPicker onAdd={onAdd} onClose={onClose} />);
    await userEvent.type(screen.getByRole("searchbox"), "두부");
    await userEvent.click(await screen.findByRole("checkbox", { name: "두부" }));
    keyboard.open = true;
    view.rerender(<RecipeFoodCatalogPicker onAdd={onAdd} onClose={onClose} />);
    expect(screen.queryByRole("button", { name: "선택한 재료 1개 추가" })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "두부" }).checked).toBe(true);
    keyboard.open = false;
    view.rerender(<RecipeFoodCatalogPicker onAdd={onAdd} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("keeps the mobile dialog focused until the user chooses its search input", () => {
    vi.useFakeTimers();
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue(ingredientResult("tofu", "두부"));
    render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(screen.getByRole("searchbox").classList.contains("text-base")).toBe(true);
  });

  it("follows the visible keyboard viewport and removes its listeners on close", async () => {
    vi.useFakeTimers();
    const viewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0, scale: 1 });
    const previous = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
    try {
      vi.mocked(fetchFoodCatalogSearch).mockResolvedValue(ingredientResult("tofu", "두부"));
      const view = render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
      const backdrop = screen.getByRole("dialog").parentElement!;
      expect(backdrop.style.getPropertyValue("--dialog-viewport-height")).toBe("812px");
      viewport.height = 410;
      viewport.offsetTop = 24;
      await act(async () => {
        viewport.dispatchEvent(new Event("resize"));
        await vi.advanceTimersByTimeAsync(20);
      });
      expect(backdrop.style.getPropertyValue("--dialog-viewport-height")).toBe("410px");
      expect(backdrop.style.getPropertyValue("--dialog-viewport-top")).toBe("24px");
      const remove = vi.spyOn(viewport, "removeEventListener");
      view.unmount();
      expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    } finally {
      Object.defineProperty(window, "visualViewport", { configurable: true, value: previous });
    }
  });
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
    expect(add).toHaveBeenCalledWith([expect.objectContaining({ ingredient_id: null, food_product_id: PRODUCT_A_ID, food_product_nutrition_version_id: VERSION_A_ID })], expect.any(Object));
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

  it("shows typed mixed results and keeps both linked and unlinked public product provenance", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [{ type: "ingredient", id: "tofu", standard_name: "두부", category: "콩", default_unit: "g" }, product(true), product(false)], next_cursor: null, has_next: false });
    const user = userEvent.setup(); const add = vi.fn(); render(<RecipeFoodCatalogPicker onAdd={add} onClose={vi.fn()} />);
    expect((await screen.findByRole("checkbox", { name: "브랜드 · 미검수 간장" }) as HTMLInputElement).disabled).toBe(false);
    await user.click(screen.getByRole("checkbox", { name: "브랜드 · 양조간장" }));
    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));
    expect(add).toHaveBeenCalledWith([expect.objectContaining({ ingredient_id: null, food_product_id: PRODUCT_A_ID, food_product_nutrition_version_id: VERSION_A_ID, amount: null, unit: "ml" })], expect.any(Object));
  });

  it.each([
    { id: "invalid" }, { nutrition_version_id: "invalid" },
    { nutrition: { ...product(false).nutrition, basis: { amount: 0, unit: "g" as const } } },
    { nutrition: { ...product(false).nutrition, values: { energy_kcal: { amount: -1, known_amount: -1, status: "complete" as const, display_mode: "total" as const } } } },
  ])("rejects invalid product data %o", (patch) => {
    expect(recipeIngredientFromCatalog({ ...product(false), ...patch }, 1)).toBeNull();
  });

  it("keeps unknown nutrients selectable and distinguishes source+component duplicates from another brand", async () => {
    const first = product(true);
    const second = { ...product(false), brand: "다른 업체", nutrition: { ...product(false).nutrition, calculation_status: "unavailable" as const } };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [first, second], next_cursor: null, has_next: false });
    const add = vi.fn();
    render(<RecipeFoodCatalogPicker onAdd={add} onClose={vi.fn()} componentLabel="소스" excludedIngredients={[
      { ingredient_id: null, food_product_id: first.id, food_product_nutrition_version_id: first.nutrition_version_id, component_label: "반죽" },
    ]} />);
    const firstCheckbox = await screen.findByRole<HTMLInputElement>("checkbox", { name: "브랜드 · 양조간장" });
    expect(firstCheckbox.disabled).toBe(false);
    await userEvent.click(firstCheckbox);
    await userEvent.click(screen.getByRole("checkbox", { name: "다른 업체 · 미검수 간장" }));
    await userEvent.click(screen.getByRole("button", { name: "선택한 재료 2개 추가" }));
    const [rows, contexts] = add.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows[0].row_key).not.toBe(rows[1].row_key);
    expect(rows.map((row: { amount: number | null }) => row.amount)).toEqual([null, null]);
    expect(contexts[rows[1].row_key].nutrition.values).toEqual({});
    expect(contexts[rows[1].row_key].brand).toBe("다른 업체");
  });

  it("blocks the same product in the same component even when its representative ingredient differs", async () => {
    const item = product(false);
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [item], next_cursor: null, has_next: false });
    render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} excludedIngredients={[
      { ingredient_id: "550e8400-e29b-41d4-a716-446655440095", food_product_id: item.id, food_product_nutrition_version_id: VERSION_A_ID, component_label: null },
    ]} />);
    expect((await screen.findByRole<HTMLInputElement>("checkbox", { name: "브랜드 · 미검수 간장" })).disabled).toBe(true);
  });
  it("surfaces failed search and retries instead of calling it an empty catalog", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockRejectedValueOnce(new Error("연결 실패")).mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    const user = userEvent.setup(); render(<RecipeFoodCatalogPicker onAdd={vi.fn()} onClose={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("연결 실패");
    expect(screen.queryByText(/검색 결과가 없어요/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await waitFor(() => expect(screen.getByText(/검색 결과가 없어요/)).toBeTruthy());
  });
  it("keeps generic exclusion distinct from products while loading another cursor", async () => {
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValueOnce({ items: [{ type: "ingredient", id: "soy", standard_name: "간장", category: "양념", default_unit: "g" }], next_cursor: "page-2", has_next: true })
      .mockResolvedValue({ items: [product(true)], next_cursor: null, has_next: false });
    const user = userEvent.setup(); render(<RecipeFoodCatalogPicker excludedIngredientIds={["soy"]} onAdd={vi.fn()} onClose={vi.fn()} />);
    expect((await screen.findByRole("checkbox", { name: "간장" }) as HTMLInputElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "검색 결과 더 보기" }));
    expect((await screen.findByRole("checkbox", { name: "브랜드 · 양조간장" }) as HTMLInputElement).disabled).toBe(false);
    expect(fetchFoodCatalogSearch).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: "page-2", types: ["ingredient", "food_product"] }));
  });

});

describe("owned pantry product selection", () => {
  const PANTRY_OLD = "550e8400-e29b-41d4-a716-446655440121";
  const PANTRY_OTHER = "550e8400-e29b-41d4-a716-446655440122";
  function pantry(items = [{ id: PANTRY_OLD, food_product_id: PRODUCT_A_ID, food_product_nutrition_version_id: VERSION_A_ID,
    name: "양조간장", brand: "브랜드", created_at: "2026-10-13T00:00:00Z" }]) {
    return { items: [], product_items: items };
  }
  function withEnergy(item: FoodCatalogProductData, amount: number): FoodCatalogProductData {
    return { ...item, nutrition: { ...item.nutrition, basis: { amount: 100, unit: "g" },
      values: { energy_kcal: { amount, known_amount: null, status: "complete", display_mode: "total" } } } };
  }
  it("distinguishes two owned versions of the same product and applies the chosen fixed pair with blank quantity", async () => {
    const old = withEnergy(product(true), 200);
    const newer = { ...withEnergy(old, 250), nutrition_version_id: VERSION_B_ID };
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    vi.mocked(fetchPantryList).mockResolvedValue(pantry([{ ...pantry().product_items[0] },
      { ...pantry().product_items[0], id: PANTRY_OTHER, food_product_nutrition_version_id: VERSION_B_ID, created_at: "2026-10-14T00:00:00Z" }]));
    vi.mocked(fetchFoodCatalogSource).mockImplementation(async (_type, _id, _signal, options) => options?.pantryItemId === PANTRY_OTHER ? newer : old);
    const add = vi.fn(); const close = vi.fn();
    render(<RecipeFoodCatalogPicker single replacementIngredient={{ ingredient_id: null, food_product_id: PRODUCT_A_ID,
      food_product_nutrition_version_id: VERSION_A_ID }} replacementProduct={old} onAdd={add} onClose={close} />);
    await userEvent.click(screen.getByRole("button", { name: "내 팬트리에서 선택" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: /브랜드 · 양조간장 · 보유 정보 2/ }));
    await screen.findByText(/선택한 고정 정보: 100g · 250kcal/);
    expect(screen.getByText(/기존 고정 정보: 100g · 200kcal/)).toBeTruthy();
    expect(screen.getAllByText("같은 제품의 다른 고정 정보")).toHaveLength(1);
    expect(screen.getByRole("dialog").textContent).not.toContain(VERSION_B_ID);
    expect(screen.getByRole("dialog").textContent).not.toContain(PRODUCT_A_ID);
    expect(add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "이 재료로 교체" }));
    await waitFor(() => expect(add).toHaveBeenCalledOnce());
    const [rows, contexts] = add.mock.calls[0];
    expect(rows[0]).toMatchObject({ ingredient_id: null, food_product_id: PRODUCT_A_ID,
      food_product_nutrition_version_id: VERSION_B_ID, amount: null, unit: "g" });
    expect(rows[0]).not.toHaveProperty("pantry_item_id");
    expect(contexts[rows[0].row_key].nutrition.values.energy_kcal.amount).toBe(250);
    expect(fetchFoodCatalogSource).toHaveBeenLastCalledWith("food_product", PRODUCT_A_ID, expect.any(AbortSignal), { pantryItemId: PANTRY_OTHER });
    expect(close).toHaveBeenCalledOnce();
  });
  it("selects at most one version per product while preserving other brand selections", async () => {
    const first = product(true); const second = { ...first, nutrition_version_id: VERSION_B_ID };
    vi.mocked(fetchPantryList).mockResolvedValue(pantry([{ ...pantry().product_items[0] },
      { ...pantry().product_items[0], id: PANTRY_OTHER, food_product_nutrition_version_id: VERSION_B_ID }]));
    vi.mocked(fetchFoodCatalogSource).mockImplementation(async (_type, _id, _signal, options) => options?.pantryItemId === PANTRY_OTHER ? second : first);
    const add = vi.fn(); render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} />);
    const firstCheckbox = await screen.findByRole<HTMLInputElement>("checkbox", { name: /보유 정보 1/ });
    await userEvent.click(firstCheckbox);
    await waitFor(() => expect(firstCheckbox.checked).toBe(true));
    await userEvent.click(screen.getByRole("checkbox", { name: /보유 정보 2/ }));
    await waitFor(() => expect(firstCheckbox.checked).toBe(false));
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /보유 정보 2/ }).checked).toBe(true);
    expect(screen.getByRole("button", { name: "선택한 재료 1개 추가" })).toBeTruthy();
  });
  it("shows an approved representative link as a substitute hint before applying and keeps cancellation unchanged", async () => {
    const old = product(true); const substitute = { ...product(false), name: "다른 양조간장", brand: "다른 업체", recipe_ingredient_id: old.recipe_ingredient_id };
    vi.mocked(fetchPantryList).mockResolvedValue(pantry([{ ...pantry().product_items[0], food_product_id: substitute.id,
      food_product_nutrition_version_id: substitute.nutrition_version_id, name: substitute.name, brand: substitute.brand }]));
    vi.mocked(fetchFoodCatalogSource).mockResolvedValue(substitute);
    const add = vi.fn(); const close = vi.fn();
    render(<RecipeFoodCatalogPicker initialSource="pantry" single replacementIngredient={{ ingredient_id: null, food_product_id: old.id,
      food_product_nutrition_version_id: old.nutrition_version_id }} replacementProduct={old} onAdd={add} onClose={close} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /다른 업체 · 다른 양조간장/ }));
    await screen.findByText("승인된 재료 연결의 대체 후보");
    expect(add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(close).toHaveBeenCalledOnce(); expect(add).not.toHaveBeenCalled();
    expect(old.nutrition_version_id).toBe(VERSION_A_ID);
  });
  it("keeps an unlinked public owned product selectable without a substitute recommendation", async () => {
    const item = product(false);
    vi.mocked(fetchPantryList).mockResolvedValue(pantry([{ ...pantry().product_items[0], food_product_id: item.id, food_product_nutrition_version_id: item.nutrition_version_id }]));
    vi.mocked(fetchFoodCatalogSource).mockResolvedValue(item);
    const add = vi.fn(); render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /보유 정보 1/ }));
    await userEvent.click(await screen.findByRole("button", { name: "선택한 재료 1개 추가" }));
    await waitFor(() => expect(add).toHaveBeenCalledOnce());
    expect(add.mock.calls[0][0][0].ingredient_id).toBeNull();
    expect(screen.queryByText("승인된 재료 연결의 대체 후보")).toBeNull();
  });
  it("does not silently substitute the current version for the owned fixed version", async () => {
    vi.mocked(fetchPantryList).mockResolvedValue(pantry());
    vi.mocked(fetchFoodCatalogSource).mockResolvedValue({ ...product(true), nutrition_version_id: VERSION_B_ID });
    const add = vi.fn(); render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /보유 정보 1/ }));
    await screen.findByText(/제품·고정 정보를 확인하지 못했어요/);
    expect(add).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: /보유 정보 1/ }).checked).toBe(false);
  });
  it("does not add a removed or foreign pantry entry during confirmation", async () => {
    vi.mocked(fetchPantryList).mockResolvedValue(pantry());
    vi.mocked(fetchFoodCatalogSource).mockResolvedValueOnce(product(true)).mockRejectedValueOnce(Object.assign(new Error("not found"), { status: 404, code: "RESOURCE_NOT_FOUND", fields: [] }));
    const add = vi.fn(); render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /보유 정보 1/ }));
    await userEvent.click(await screen.findByRole("button", { name: "선택한 재료 1개 추가" }));
    await screen.findByText(/원래 재료는 유지했으니 다시 시도/);
    expect(add).not.toHaveBeenCalled();
  });
  it("preserves a login-required read as a read action and never calls add on 401", async () => {
    vi.mocked(fetchPantryList).mockRejectedValue(Object.assign(new Error("unauthorized"), { status: 401, code: "UNAUTHORIZED", fields: [] }));
    const add = vi.fn(); const login = vi.fn(); render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} onRequireLogin={login} />);
    await screen.findByText(/내 팬트리는 로그인 후 선택/);
    expect(screen.queryByText(/내 팬트리에 선택할 제품이 없어요/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "로그인하고 이어서 선택" }));
    expect(login).toHaveBeenCalledOnce(); expect(add).not.toHaveBeenCalled();
  });
  it("shows read failure as retryable and preserves an actual empty pantry as empty", async () => {
    vi.mocked(fetchPantryList).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ items: [], product_items: [] });
    render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(/내 팬트리 제품을 불러오지 못했어요/);
    expect(screen.queryByText(/내 팬트리에 선택할 제품이 없어요/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByText(/내 팬트리에 선택할 제품이 없어요/);
  });
  it("ignores an aborted owned lookup after changing back to catalog search", async () => {
    const source = deferred<Awaited<ReturnType<typeof fetchFoodCatalogSource>>>();
    vi.mocked(fetchPantryList).mockResolvedValue(pantry()); vi.mocked(fetchFoodCatalogSource).mockReturnValue(source.promise);
    vi.mocked(fetchFoodCatalogSearch).mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    const add = vi.fn(); render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /보유 정보 1/ }));
    const signal = vi.mocked(fetchFoodCatalogSource).mock.calls[0][2];
    await userEvent.click(screen.getByRole("button", { name: "검색에서 선택" }));
    expect(signal?.aborted).toBe(true);
    await act(async () => source.resolve(product(true)));
    expect(screen.queryByRole("button", { name: "선택한 재료 1개 추가" })).toBeNull(); expect(add).not.toHaveBeenCalled();
  });
  it("keeps linked manual restrictions and same-source component duplicate protection", async () => {
    const item = { ...product(true), source_type: "manual" as const, recipe_ingredient_id: null };
    vi.mocked(fetchPantryList).mockResolvedValue(pantry()); vi.mocked(fetchFoodCatalogSource).mockResolvedValue(item);
    const add = vi.fn(); const view = render(<RecipeFoodCatalogPicker initialSource="pantry" onAdd={add} onClose={vi.fn()} />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /보유 정보 1/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("재료 연결 정보를 확인할 수 없어요");
    expect(add).not.toHaveBeenCalled(); view.unmount();
    render(<RecipeFoodCatalogPicker initialSource="pantry" excludedIngredients={[{ ingredient_id: null,
      food_product_id: PRODUCT_A_ID, food_product_nutrition_version_id: VERSION_B_ID, component_label: null }]} onAdd={add} onClose={vi.fn()} />);
    expect((await screen.findByRole<HTMLInputElement>("checkbox", { name: /보유 정보 1/ })).disabled).toBe(true);
  });
});
