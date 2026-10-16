// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogAddSheet, type MealLogSourceSelection } from "@/components/planner/meal-log-add-sheet";
import type { FoodCatalogSearchItem } from "@/lib/api/food-catalog-search";
import type { MealLogRecentItem } from "@/types/meal-log";
import type { IngredientQuantityOptions } from "@/types/quantity-input";

const api = vi.hoisted(() => ({ catalog: vi.fn(), source: vi.fn(), recent: vi.fn(), cooked: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/api/food-catalog-search", () => ({ fetchFoodCatalogSearch: api.catalog, fetchFoodCatalogSource: api.source }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogRecent: api.recent, isMealLogApiError: () => false }));
vi.mock("@/lib/api/cooking", () => ({ fetchCookedBatches: api.cooked }));
vi.mock("@/lib/api/meal-log-preview", () => ({ fetchMealLogNutritionPreview: api.preview }));
const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const options: IngredientQuantityOptions = { policy_version: "ingredient-units-v4", profile_id: id(2), preparation_state: "raw", default_unit: "mL",
  choices: ["mL", "L"].map(unit => ({ unit, normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" })) };
const milk: FoodCatalogSearchItem = { type: "ingredient", id: id(1), standard_name: "우유", category: "유제품", default_unit: "ml", quantity_options: options };
const product: FoodCatalogSearchItem = { type: "food_product", id: id(3), name: "제품 우유", brand: "저장 업체", source_type: "public_dataset", visibility: "public", editable: false,
  nutrition_version_id: id(4), basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "ml" } }],
  nutrition: { basis: { amount: 100, unit: "ml" }, values: {}, calculation_status: "unavailable", calculation_quality: null, warnings: [], sources: [] } };
function recent(source: FoodCatalogSearchItem = milk, changes: Partial<MealLogRecentItem> = {}): MealLogRecentItem {
  return { source: { type: source.type, id: source.id }, display_name: "저장한 우유", display_brand: null,
    source_version: source.type === "food_product" ? source.nutrition_version_id : source.quantity_options?.profile_id,
    last_quantity: { amount: .2, unit: source.type === "food_product" ? "package" : "L" }, frequency: 2, ...changes };
}
const empty = { items: [], has_next: false, next_cursor: null };
function open(initialSelection?: MealLogSourceSelection) {
  const save = vi.fn().mockResolvedValue(undefined), close = vi.fn();
  const view = render(<MealLogAddSheet columns={[{ id: id(5), name: "아침", sort_order: 0 }]} date="2026-10-15" initialColumnId={id(5)}
    initialSelection={initialSelection} quantityV4Enabled onClose={close} onSave={save} onUnauthorized={vi.fn()} />);
  return { save, close, ...view };
}
async function search(user: ReturnType<typeof userEvent.setup>, name = "우유") {
  await user.click(screen.getByRole("tab", { name: "제품·재료" }));
  await user.type(screen.getByPlaceholderText("제품·재료 이름을 입력해 주세요"), name);
  await user.click(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}
function unit() { return screen.getByRole<HTMLSelectElement>("combobox", { name: "단위" }); }
function amount() { return screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }); }
beforeEach(() => {
  api.catalog.mockResolvedValue({ ...empty, items: [milk] }); api.source.mockResolvedValue(milk);
  api.recent.mockResolvedValue({ ...empty, items: [recent()] }); api.cooked.mockResolvedValue(empty);
  api.preview.mockResolvedValue({ nutrition: { calculation_status: "unavailable", calories_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, sodium_mg: null } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("new meal catalog selection uses only valid saved meal units", () => {
  it.each([milk, product])("suggests the same fixed $type saved unit while leaving the new quantity blank", async source => {
    api.catalog.mockResolvedValue({ ...empty, items: [source] }); api.recent.mockResolvedValue({ ...empty, items: [recent(source)] });
    const user = userEvent.setup(), view = open();
    await screen.findByRole("button", { name: /저장한 우유/ });
    await search(user, source.type === "ingredient" ? source.standard_name : source.name);
    expect(unit().value).toBe(source.type === "ingredient" ? "L" : "package");
    expect(amount().value).toBe("");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
    expect(view.save).not.toHaveBeenCalled(); expect(api.preview).not.toHaveBeenCalled();
    expect(api.source).not.toHaveBeenCalled(); expect(api.recent).toHaveBeenCalledTimes(1);
  });

  it.each([
    { title: "other source ID", value: recent(milk, { source: { type: "ingredient", id: id(8) } }) },
    { title: "other source type", value: recent(milk, { source: { type: "food_product", id: milk.id } }) },
    { title: "old profile", value: recent(milk, { source_version: id(9) }) },
    { title: "missing version", value: recent(milk, { source_version: undefined }) },
    { title: "unsupported unit", value: recent(milk, { last_quantity: { amount: 2, unit: "통" } }) },
  ])("keeps the current default for $title", async ({ value }) => {
    api.recent.mockResolvedValue({ ...empty, items: [value] });
    const user = userEvent.setup(); open(); await screen.findByRole("button", { name: /저장한 우유/ });
    await search(user); expect(unit().value).toBe("mL"); expect(amount().value).toBe("");
  });

  it("does not reuse a different fixed product version", async () => {
    api.catalog.mockResolvedValue({ ...empty, items: [product] }); api.recent.mockResolvedValue({ ...empty, items: [recent(product, { source_version: id(9) })] });
    const user = userEvent.setup(); open(); await screen.findByRole("button", { name: /저장한 우유/ });
    await search(user, "제품 우유"); expect(unit().value).toBe("ml"); expect(amount().value).toBe("");
  });

  it("does not treat an unknown current product version as a known match", async () => {
    api.catalog.mockResolvedValue({ ...empty, items: [{ ...product, nutrition_version_id: "" }] });
    api.recent.mockResolvedValue({ ...empty, items: [recent(product, { source_version: "" })] });
    const user = userEvent.setup(); open(); await screen.findByRole("button", { name: /저장한 우유/ });
    await search(user, "제품 우유"); expect(unit().value).toBe("ml"); expect(amount().value).toBe("");
  });

  it("keeps the known milk default and blocked state when its profile is unavailable", async () => {
    api.catalog.mockResolvedValue({ ...empty, items: [{ ...milk, quantity_options: undefined }] });
    const user = userEvent.setup(); open(); await screen.findByRole("button", { name: /저장한 우유/ });
    await search(user); expect(screen.getByRole<HTMLInputElement>("textbox", { name: "단위" }).value).toBe("mL");
    expect(amount().value).toBe(""); expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
  });

  it("uses the saved display unit but requires a new raw amount before saving", async () => {
    api.recent.mockResolvedValue({ ...empty, items: [recent(milk, { quantity_input: {
      schema_version: "quantity-v4", raw_value: "200", raw_unit: "mL", numerator: "200", denominator: "1",
      display_quantity: { amount: .2, unit: "L" }, normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED",
      evidence_ids: [], source_versions: [], batch_basis: null } })] });
    const user = userEvent.setup(), view = open();
    await screen.findByRole("button", { name: /저장한 우유/ }); await search(user);
    expect(unit().value).toBe("L"); expect(amount().value).toBe("");
    await user.type(amount(), "1/4"); await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(view.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: .25, unit: "L",
      quantityInput: { schema_version: "quantity-v4", raw_value: "1/4", raw_unit: "L" } }), id(5), "2026-10-15");
  });

  it("preserves legacy source defaults when quantity-v4 is disabled", async () => {
    const user = userEvent.setup();
    render(<MealLogAddSheet columns={[{ id: id(5), name: "아침", sort_order: 0 }]} date="2026-10-15" initialColumnId={id(5)}
      quantityV4Enabled={false} onClose={vi.fn()} onSave={vi.fn()} onUnauthorized={vi.fn()} />);
    await screen.findByRole("button", { name: /저장한 우유/ }); await search(user);
    expect(unit().value).toBe("mL"); expect(amount().value).toBe("1");
  });

  it("never overwrites an edited draft when recent data finishes loading", async () => {
    let finish!: (value: { items: MealLogRecentItem[]; has_next: boolean; next_cursor: null }) => void;
    api.recent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const user = userEvent.setup(); open(); await search(user);
    await user.selectOptions(unit(), "L"); await user.type(amount(), "1/3");
    await act(async () => finish({ ...empty, items: [recent(milk, { last_quantity: { amount: 200, unit: "mL" } })] }));
    expect(amount().value).toBe("1/3"); expect(unit().value).toBe("L");
  });

  it("preserves the original draft amount, unit and raw fraction during initial restoration", async () => {
    const view = open({ type: "ingredient", id: milk.id, name: "우유", brand: null, amount: 1 / 3, unit: "L", unitOptions: ["mL", "L"],
      ingredientOptions: options, quantityInput: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "L" } });
    await waitFor(() => expect(api.source).toHaveBeenCalledWith("ingredient", milk.id));
    expect(amount().value).toBe("1/3"); expect(unit().value).toBe("L");
    expect(view.save).not.toHaveBeenCalled();
  });

  it.each(["cancel", "failed save"])("does not remember an uncommitted unit after %s", async mode => {
    const user = userEvent.setup(), view = open(); await screen.findByRole("button", { name: /저장한 우유/ }); await search(user);
    await user.selectOptions(unit(), "mL"); await user.type(amount(), "200");
    if (mode === "cancel") {
      await user.click(screen.getByRole("button", { name: "취소" }));
      await user.click(screen.getByRole("button", { name: "변경사항 버리기" }));
      expect(view.close).toHaveBeenCalledTimes(1); view.unmount(); open();
      await screen.findByRole("button", { name: /저장한 우유/ }); await search(user);
    } else {
      view.save.mockRejectedValueOnce(new Error("저장 실패")); await user.click(screen.getByRole("button", { name: "기록 저장" }));
      await screen.findByRole("alert"); await user.click(screen.getByRole("button", { name: "음식 선택으로 돌아가기" }));
      await user.click(await screen.findByRole("button", { name: /^우유/ }));
    }
    expect(unit().value).toBe("L"); expect(amount().value).toBe("");
  });
});
