// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FoodProductPicker } from "@/components/planner/food-product-picker";
import { PRODUCT_PLANNER_RETURN_CONTEXT_KEY, readProductPlannerReturnContext } from "@/lib/planner/product-planner-return-context";
import type { FoodProductData } from "@/types/food-product";
import { buildCompatibleFoodProductUnits, formatFoodProductExpectedEnergy, getFoodProductCoreNutritionLines } from "@/lib/planner/product-planner-entry-presentation";

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/api/food-product", () => ({ fetchFoodProducts: api.list,
  isFoodProductApiError: (error: unknown) => Boolean(error && typeof error === "object" && "status" in error) }));
vi.mock("@/lib/api/product-planner-entry", () => ({ createProductPlannerEntry: api.create,
  isProductPlannerEntryApiError: (error: unknown) => Boolean(error && typeof error === "object" && "status" in error) }));
const productId = "c8000000-0000-4000-8000-000000000800";
const version = "c8000000-0000-4000-8000-000000000801";
const product: FoodProductData = { id: productId, name: "고정 규격 제품", brand: "fixture", source_type: "public_dataset", visibility: "public", editable: false,
  nutrition_version_id: version, basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }],
  nutrition: { basis: { amount: 100, unit: "g" }, values: { energy_kcal: { amount: 240, known_amount: null, status: "complete", display_mode: "total" } },
    calculation_status: "complete", calculation_quality: "direct", warnings: [], sources: [] } };
function open() {
  const complete = vi.fn();
  const view = render(<FoodProductPicker columnId="column-1" planDate="2026-10-14" slotName="아침" onClose={vi.fn()} onComplete={complete} />);
  return { complete, ...view };
}
const raw = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", expected_product_nutrition_version_id: version };
describe("explicit product planner quantity v4", () => {
  beforeEach(() => {
    api.list.mockReset().mockResolvedValue({ items: [product], quantity_policy: "quantity-v4", next_cursor: null, has_next: false });
    api.create.mockReset().mockResolvedValue({ id: "fixture-entry" });
    window.sessionStorage.clear();
  });
  afterEach(() => cleanup());
  it("offers only the exact converter paths and keeps legacy direct options separate", () => {
    const bridge: FoodProductData = { ...product, nutrition: { ...product.nutrition, basis: { amount: 1, unit: "serving" } }, basis_relations: [
      { from: { amount: 1, unit: "serving" }, to: { amount: 60, unit: "g" } }, { from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } },
    ] };
    expect(buildCompatibleFoodProductUnits(bridge)).toEqual(["serving", "g"]);
    expect(buildCompatibleFoodProductUnits(bridge, true)).toEqual(["serving", "package", "g"]);
    expect(formatFoodProductExpectedEnergy(bridge, { amount: 1 / 3, unit: "package" }, true)).toBe("예상 열량 160 kcal");
    const ambiguous = { ...bridge, basis_relations: [...bridge.basis_relations, { from: { amount: 1, unit: "package" as const }, to: { amount: 2, unit: "serving" as const } }] };
    expect(buildCompatibleFoodProductUnits(ambiguous, true)).toEqual(["serving"]);
    expect(formatFoodProductExpectedEnergy(ambiguous, { amount: 100, unit: "g" }, true)).toBe("예상 열량 정보 준비 중");
    expect(getFoodProductCoreNutritionLines(ambiguous, { amount: 100, unit: "g" }, true).every(text => text.includes("정보 준비 중"))).toBe(true);
  });
  it("starts blank and preserves1/3 package when converting to40g and explicitly saving", async () => {
    const user = userEvent.setup(); const { complete } = open();
    await user.click(await screen.findByRole("button", { name: "고정 규격 제품 선택" }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "완제품 수량" });
    expect(amount.value).toBe("");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "아침에 완제품 추가" }).disabled).toBe(true);
    const unit = screen.getByRole("combobox", { name: "완제품 수량 단위" });
    await user.selectOptions(unit, "package"); await user.click(screen.getByRole("button", { name: "1/3" }));
    await user.selectOptions(unit, "g"); expect(amount.value).toBe("40");
    expect(api.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    expect(api.create).toHaveBeenCalledExactlyOnceWith({ product_id: productId, plan_date: "2026-10-14", column_id: "column-1",
      quantity: { amount: 40, unit: "g" }, quantity_input: raw });
    expect(complete).toHaveBeenCalledWith({ id: "fixture-entry" });
  });
  it("shows a uniquely bridged package and scales the same selected version before saving", async () => {
    const bridge: FoodProductData = { ...product, nutrition: { ...product.nutrition, basis: { amount: 1, unit: "serving" } }, basis_relations: [
      { from: { amount: 1, unit: "serving" }, to: { amount: 60, unit: "g" } }, { from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } },
    ] };
    api.list.mockResolvedValue({ items: [bridge], quantity_policy: "quantity-v4", next_cursor: null, has_next: false });
    const user = userEvent.setup(); open(); await user.click(await screen.findByRole("button", { name: "고정 규격 제품 선택" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "완제품 수량 단위" }), "package"); await user.click(screen.getByRole("button", { name: "1/3" }));
    expect(screen.getByTestId("food-product-selection-summary").textContent).toContain("예상 열량 160 kcal");
    await user.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    expect(api.create.mock.calls[0][0]).toMatchObject({ quantity: { amount: 1 / 3, unit: "package" }, quantity_input: raw });
  });
  it("does not expose an ambiguous direct-and-bridge unit while the amount is still blank", async () => {
    api.list.mockResolvedValue({ items: [{ ...product, nutrition: { ...product.nutrition, basis: { amount: 1, unit: "serving" } }, basis_relations: [
      { from: { amount: 1, unit: "serving" }, to: { amount: 60, unit: "g" } }, { from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } },
      { from: { amount: 1, unit: "package" }, to: { amount: 2, unit: "serving" } },
    ] }], quantity_policy: "quantity-v4", next_cursor: null, has_next: false });
    const user = userEvent.setup(); open(); await user.click(await screen.findByRole("button", { name: "고정 규격 제품 선택" }));
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "완제품 수량 단위" }).value).toBe("serving");
    expect(screen.getAllByRole<HTMLOptionElement>("option").map(option => option.value)).toEqual(["serving"]);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "완제품 수량" }).value).toBe("");
    expect(api.create).not.toHaveBeenCalled();
  });
  it("returns from login with the original fraction and waits for a new explicit save", async () => {
    api.create.mockRejectedValueOnce({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요해요.", fields: [] });
    const user = userEvent.setup(); const first = open();
    await user.click(await screen.findByRole("button", { name: "고정 규격 제품 선택" }));
    const unit = screen.getByRole("combobox", { name: "완제품 수량 단위" });
    await user.selectOptions(unit, "package"); await user.click(screen.getByRole("button", { name: "1/3" })); await user.selectOptions(unit, "g");
    await user.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    await waitFor(() => expect(readProductPlannerReturnContext()).toMatchObject({ quantityAmount: "40", quantityUnit: "g", quantityInput: raw }));
    first.unmount(); open();
    const amount = await screen.findByRole<HTMLInputElement>("textbox", { name: "완제품 수량" });
    expect(amount.value).toBe("40"); expect(api.create).toHaveBeenCalledTimes(1); expect(api.list).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    expect(api.create).toHaveBeenCalledTimes(2); expect(api.create.mock.calls[1][0]).toMatchObject({ quantity_input: raw, quantity: { amount: 40, unit: "g" } });
    await waitFor(() => expect(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)).toBeNull());
  });
  it("keeps the selected version on auth return and displays409 without replacing the quantity", async () => {
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({ version: 1, kind: "picker", planDate: "2026-10-14", columnId: "column-1", slotName: "아침",
      query: "", source: "all", productId, quantityAmount: "40", quantityUnit: "g", quantityInput: raw }));
    api.list.mockResolvedValue({ items: [{ ...product, nutrition_version_id: "c8000000-0000-4000-8000-000000000802" }], quantity_policy: "quantity-v4", next_cursor: null, has_next: false });
    api.create.mockRejectedValue({ status: 409, code: "NUTRITION_VERSION_CONFLICT", message: "선택했던 영양 버전이 달라졌어요.", fields: [] });
    const user = userEvent.setup(); const { complete } = open();
    expect(await screen.findByText("선택했던 제품의 규격이 달라졌어요. 입력한 양은 보존했어요. 현재 정보를 다시 확인해 주세요.")).toBeTruthy();
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "완제품 수량" }); expect(amount.value).toBe("40");
    expect(api.create).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "아침에 완제품 추가" }));
    expect((await screen.findByRole("alert")).textContent).toBe("선택했던 영양 버전이 달라졌어요.");
    expect(api.create.mock.calls[0][0].quantity_input).toEqual(raw); expect(amount.value).toBe("40"); expect(complete).not.toHaveBeenCalled();
  });
  it("preserves a v4 auth draft when capability becomes OFF instead of saving through the legacy fallback", async () => {
    const oldRaw = { ...raw, raw_value: "5/6" };
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({ version: 1, kind: "picker", planDate: "2026-10-14", columnId: "column-1", slotName: "아침",
      query: "", source: "all", productId, quantityAmount: "100", quantityUnit: "g", quantityInput: oldRaw }));
    api.list.mockResolvedValue({ items: [product], next_cursor: null, has_next: false });
    open(); const amount = await screen.findByRole<HTMLInputElement>("spinbutton", { name: "완제품 수량" });
    expect(amount.value).toBe("100"); expect(amount.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "아침에 완제품 추가" }).disabled).toBe(true);
    expect(screen.getByText("현재 새 단위 입력을 사용할 수 없어요. 이전 입력은 보존했어요. 제품을 다시 선택해 주세요.")).toBeTruthy();
    expect(readProductPlannerReturnContext()).toMatchObject({ quantityInput: oldRaw, quantityAmount: "100", quantityUnit: "g" });
    expect(api.create).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "고정 규격 제품 선택" }));
    expect(amount.value).toBe("100"); expect(amount.disabled).toBe(false); expect(readProductPlannerReturnContext()).toBeNull();
  });
  it("preserves the returned unit when the current version no longer has its relationship", async () => {
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({ version: 1, kind: "picker", planDate: "2026-10-14", columnId: "column-1", slotName: "아침",
      query: "", source: "all", productId, quantityAmount: "40", quantityUnit: "g", quantityInput: raw }));
    api.list.mockResolvedValue({ items: [{ ...product, nutrition_version_id: "c8000000-0000-4000-8000-000000000802", basis_relations: [],
      nutrition: { ...product.nutrition, basis: { amount: 100, unit: "ml" } } }], quantity_policy: "quantity-v4", next_cursor: null, has_next: false });
    open(); const amount = await screen.findByRole<HTMLInputElement>("textbox", { name: "완제품 수량" });
    expect(amount.value).toBe("40"); expect(amount.disabled).toBe(true);
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "완제품 수량 단위" }).value).toBe("g");
    expect(screen.getByText("이전 단위의 환산 근거를 확인할 수 없어요. 원래 양과 단위를 보존했어요. 제품을 다시 선택해 주세요.")).toBeTruthy();
    expect(api.create).not.toHaveBeenCalled(); expect(readProductPlannerReturnContext()).toMatchObject({ quantityInput: raw });
  });
});
