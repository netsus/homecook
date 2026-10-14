// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealScreen } from "@/components/planner/meal-screen";
import { PRODUCT_PLANNER_RETURN_CONTEXT_KEY, readProductPlannerReturnContext } from "@/lib/planner/product-planner-return-context";
import type { MealProductPlannerEntryData } from "@/types/product-planner-entry";
import type { QuantityInputDraft } from "@/types/quantity-input";

const api = vi.hoisted(() => ({ meals: vi.fn(), patch: vi.fn(), replace: vi.fn(), params: vi.fn(() => new URLSearchParams()), redirect: vi.fn((url: string) => { throw Error("NEXT_REDIRECT:" + url); }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/planner/2026-10-14/column-1", useSearchParams: () => api.params(),
  useRouter: () => ({ push: vi.fn(), replace: api.replace }), redirect: api.redirect }));
vi.mock("@/lib/auth/e2e-auth-override", () => ({ readE2EAuthOverride: () => true, readE2EAuthOverrideCookie: () => "guest", withE2EAuthOverrideHeaders: (init: RequestInit) => init }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/lib/server/recipe-snapshot-entrypoint", () => ({ readRecipeSnapshotUiMode: async () => "legacy_v1" }));
vi.mock("@/lib/server/planner-meal-nutrition-view", () => ({ loadPlannerMealNutritionForServer: async () => ({}) }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => false }));
vi.mock("@/lib/api/meal", () => ({ fetchMeals: api.meals, deleteMeal: vi.fn(), updateMealServings: vi.fn(), isMealApiError: () => false }));
vi.mock("@/lib/api/product-planner-entry", () => ({ updateProductPlannerEntryQuantity: api.patch, deleteProductPlannerEntry: vi.fn(),
  isProductPlannerEntryApiError: (value: unknown) => Boolean(value && typeof value === "object" && "status" in value) }));
vi.mock("@/components/planner/use-planner-nutrition-summary", () => ({ usePlannerNutritionSummary: () => ({ data: null, status: "empty", error: null, retry: vi.fn() }) }));
vi.mock("@/components/auth/social-login-buttons", () => ({ SocialLoginButtons: ({ nextPath }: { nextPath: string }) => <div data-testid="edit-login-return" data-path={nextPath} /> }));

const version = "c8000000-0000-4000-8000-000000000801";
const raw: QuantityInputDraft = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", expected_product_nutrition_version_id: version };
const props = { planDate: "2026-10-14", columnId: "column-1", slotName: "아침", initialAuthenticated: true };
function entry(): MealProductPlannerEntryData {
  return { entry_type: "product", id: "entry-1", product_id: "product-1", product_name: "고정 규격 제품", product_brand: "fixture", quantity: { amount: 40, unit: "g" },
    quantity_policy: "quantity-v4", quantity_input: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "package", numerator: "1", denominator: "3", normalized: { amount: 40, unit: "g" }, display_quantity: { amount: 40, unit: "g" }, quality: "direct", reason: null, evidence_ids: [], source_versions: [version], batch_basis: null },
    workflow_status: null, product_nutrition_version_id: version, basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }],
    nutrition: { basis: { amount: 100, unit: "g" }, values: { energy_kcal: { amount: 96, known_amount: null, status: "complete", display_mode: "total" } }, calculation_status: "complete", calculation_quality: "direct", warnings: [], sources: [] } };
}
async function open() {
  const view = render(<MealScreen {...props} />);
  await userEvent.click(await screen.findByRole("button", { name: "수량 변경" }));
  return { view, dialog: screen.getByRole("dialog", { name: "완제품 수량 변경" }) };
}
function fields(dialog: HTMLElement) {
  return { input: within(dialog).getByRole<HTMLInputElement>("textbox", { name: "완제품 변경 수량" }), unit: within(dialog).getByRole<HTMLSelectElement>("combobox", { name: "완제품 변경 수량 단위" }), save: within(dialog).getByRole<HTMLButtonElement>("button", { name: "수량 변경" }) };
}
describe("fixed product planner quantity edit v4", () => {
  beforeEach(() => { api.meals.mockReset().mockResolvedValue({ items: [], product_entries: [entry()] }); api.patch.mockReset().mockResolvedValue(entry()); api.replace.mockReset(); api.params.mockReset().mockReturnValue(new URLSearchParams()); sessionStorage.clear(); });
  afterEach(cleanup);
  it("reads the frozen original fraction after OFF and prevents metadata from activating editing", async () => {
    const saved = entry(); delete saved.quantity_policy; api.meals.mockResolvedValue({ items: [], product_entries: [saved] });
    const { dialog } = await open();
    expect(screen.getByTestId("product-planner-entry-entry-1").textContent).toContain("원입력 1/3팩");
    const input = within(dialog).getByRole<HTMLInputElement>("spinbutton", { name: "완제품 변경 수량" });
    expect(input.value).toBe("40"); expect(input.disabled).toBe(true); expect(fieldsSave(dialog).disabled).toBe(true);
    expect(within(dialog).getByText("현재 새 단위 입력을 사용할 수 없어요. 원래 양과 단위를 보존했어요.")).toBeTruthy();
    expect(api.patch).not.toHaveBeenCalled();
  });
  it("preserves physical quantity and original raw when switching the saved version's units", async () => {
    const { dialog } = await open(); const { input, unit, save } = fields(dialog);
    expect(input.value).toBe("40"); await userEvent.selectOptions(unit, "package");
    expect(Number(input.value)).toBeCloseTo(1 / 3, 14); await userEvent.selectOptions(unit, "g"); expect(Number(input.value)).toBeCloseTo(40, 12);
    expect(api.patch).not.toHaveBeenCalled(); await userEvent.click(save);
    expect(api.patch).toHaveBeenCalledExactlyOnceWith("entry-1", { quantity: { amount: 40, unit: "g" }, quantity_input: raw });
  });
  it("stores a fresh fraction with the saved version, separately from its displayed grams", async () => {
    const { dialog } = await open(); const { input, unit, save } = fields(dialog);
    await userEvent.selectOptions(unit, "package"); await userEvent.click(within(dialog).getByRole("button", { name: "1/4" }));
    expect(input.value).toBe("1/4"); await userEvent.selectOptions(unit, "g"); expect(input.value).toBe("30");
    await userEvent.click(save);
    expect(api.patch).toHaveBeenCalledExactlyOnceWith("entry-1", { quantity: { amount: 30, unit: "g" }, quantity_input: { ...raw, raw_value: "1/4" } });
  });
  it("preserves unsupported original units rather than selecting a fallback", async () => {
    const saved = entry(); saved.basis_relations = []; saved.nutrition.basis = { amount: 100, unit: "ml" };
    api.meals.mockResolvedValue({ items: [], product_entries: [saved] }); const { dialog } = await open(); const { input, unit, save } = fields(dialog);
    expect(input.value).toBe("40"); expect(unit.value).toBe("g"); expect(input.disabled).toBe(true); expect(save.disabled).toBe(true);
    expect(within(dialog).getByText("이전 단위의 환산 근거를 확인할 수 없어요. 원래 양과 단위를 보존했어요.")).toBeTruthy(); expect(api.patch).not.toHaveBeenCalled();
  });
  it("keeps old payload editing and leaves legacy quantity_input absent", async () => {
    const saved = entry(); delete saved.quantity_policy; delete saved.quantity_input;
    api.meals.mockResolvedValue({ items: [], product_entries: [saved] }); const { dialog } = await open();
    const input = within(dialog).getByRole<HTMLInputElement>("spinbutton", { name: "완제품 변경 수량" });
    await userEvent.clear(input); await userEvent.type(input, "50"); await userEvent.click(fieldsSave(dialog));
    expect(api.patch).toHaveBeenCalledExactlyOnceWith("entry-1", { quantity: { amount: 50, unit: "g" } });
  });
  it("keeps a legacy quantity when its conversion cannot survive the existing four-decimal storage", async () => {
    const saved = entry(); delete saved.quantity_policy; delete saved.quantity_input;
    saved.quantity = { amount: 0.0001, unit: "g" };
    saved.basis_relations = [{ from: { amount: 1, unit: "package" }, to: { amount: 100000, unit: "g" } }];
    api.meals.mockResolvedValue({ items: [], product_entries: [saved] }); const { dialog } = await open();
    const input = within(dialog).getByRole<HTMLInputElement>("spinbutton", { name: "완제품 변경 수량" });
    const unit = within(dialog).getByRole<HTMLSelectElement>("combobox", { name: "완제품 변경 수량 단위" });
    await userEvent.selectOptions(unit, "package");
    expect(input.value).toBe("0.0001"); expect(unit.value).toBe("g");
    expect(within(dialog).getByText("현재 입력 방식으로 이 양을 정확히 옮길 수 없어요. 원래 양과 단위를 유지했어요.")).toBeTruthy();
    expect(api.patch).not.toHaveBeenCalled();
  });
  it("cancel and close repeated edits preserve the saved original without requests", async () => {
    const { dialog } = await open(); await userEvent.click(within(dialog).getByRole("button", { name: "1/4" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await userEvent.click(screen.getByRole("button", { name: "수량 변경" })); const again = screen.getByRole("dialog", { name: "완제품 수량 변경" });
    expect(fields(again).input.value).toBe("40"); expect(within(again).getByText("원입력 1/3팩")).toBeTruthy();
    await userEvent.click(within(again).getByRole("button", { name: "닫기" })); expect(api.patch).not.toHaveBeenCalled();
  });
  it("retries a failed explicit save with the same raw input and prevents concurrent requests", async () => {
    api.patch.mockRejectedValueOnce({ status: 500, code: "INTERNAL_ERROR", message: "잠시 실패했어요." });
    const { dialog } = await open(); const { save } = fields(dialog); await userEvent.click(save);
    await within(dialog).findByText("잠시 실패했어요.");
    let resolve!: (saved: MealProductPlannerEntryData) => void; api.patch.mockReturnValueOnce(new Promise<MealProductPlannerEntryData>(r => { resolve = r; }));
    fireEvent.click(save); fireEvent.click(save);
    expect(api.patch).toHaveBeenCalledTimes(2); expect(api.patch.mock.calls[0]).toEqual(api.patch.mock.calls[1]); expect(save.disabled).toBe(true);
    resolve(entry()); await waitFor(() => expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull());
  });
  it("preserves an explicit401 return and waits for another save after restoring the original units", async () => {
    api.patch.mockRejectedValueOnce({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요해요." });
    const { dialog, view } = await open(); const { save } = fields(dialog); await userEvent.click(save);
    await screen.findByTestId("edit-login-return"); expect(readProductPlannerReturnContext()).toMatchObject({ kind: "meal-entry", action: "edit", quantityAmount: "40", quantityUnit: "g", quantityInput: raw });
    view.unmount(); render(<MealScreen {...props} />); const restored = await screen.findByRole("dialog", { name: "완제품 수량 변경" });
    expect(fields(restored).input.value).toBe("40"); expect(api.patch).toHaveBeenCalledTimes(1);
    await userEvent.click(fields(restored).save); expect(api.patch).toHaveBeenCalledTimes(2); expect(api.patch.mock.calls[0]).toEqual(api.patch.mock.calls[1]);
  });
  it("blocks a mismatched restored saved version without retargeting its original input", async () => {
    sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({ version: 1, kind: "meal-entry", planDate: props.planDate, columnId: props.columnId, slotName: props.slotName, entryId: "entry-1", action: "edit", quantityAmount: "40", quantityUnit: "g", quantityInput: { ...raw, expected_product_nutrition_version_id: "c8000000-0000-4000-8000-000000000802" } }));
    render(<MealScreen {...props} />); const dialog = await screen.findByRole("dialog", { name: "완제품 수량 변경" });
    expect(fields(dialog).input.value).toBe("40"); expect(fields(dialog).save.disabled).toBe(true); expect(readProductPlannerReturnContext()).toMatchObject({ quantityInput: { expected_product_nutrition_version_id: "c8000000-0000-4000-8000-000000000802" } }); expect(api.patch).not.toHaveBeenCalled();
  });
  it("ends a v4 resume safely when storage cannot retain the original fraction, including stale storage and reload", async () => {
    api.patch.mockRejectedValueOnce({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요해요." });
    const { dialog, view } = await open(); const { unit, save } = fields(dialog);
    await userEvent.selectOptions(unit, "package"); await userEvent.click(within(dialog).getByRole("button", { name: "1/4" })); await userEvent.selectOptions(unit, "g");
    const originalSet = Storage.prototype.setItem;
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) {
      if (key === PRODUCT_PLANNER_RETURN_CONTEXT_KEY) throw new DOMException("fixture quota", "QuotaExceededError");
      return originalSet.call(this, key, value);
    });
    try {
      await userEvent.click(save); const login = await screen.findByTestId("edit-login-return");
      const next = new URL(login.getAttribute("data-path")!, "http://localhost");
      expect(next.searchParams.get("productQuantityResume")).toBe("unavailable");
      for (const key of ["productAmount", "productUnit", "raw_value", "raw_unit", "owner"]) expect(next.searchParams.has(key)).toBe(false);
      const stale = { version: 1, kind: "meal-entry", planDate: props.planDate, columnId: props.columnId, slotName: props.slotName, entryId: "entry-1", action: "edit", quantityAmount: "30", quantityUnit: "g", quantityInput: { ...raw, raw_value: "1/4" } };
      originalSet.call(sessionStorage, PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify(stale));
      view.unmount(); api.params.mockReturnValue(next.searchParams); const restored = render(<MealScreen {...props} />);
      await screen.findByText("로그인 전 원입력을 보관하지 못했어요. 계획은 그대로예요. 수량 변경을 다시 열어 입력해 주세요.");
      expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull(); expect(api.patch).toHaveBeenCalledTimes(1);
      expect(readProductPlannerReturnContext()).toBeNull(); expect(screen.getByTestId("product-planner-entry-entry-1").textContent).toContain("원입력 1/3팩");
      expect(new URL(api.replace.mock.lastCall![0], "http://localhost").searchParams.has("productQuantityResume")).toBe(false);
      restored.unmount(); render(<MealScreen {...props} />); await screen.findByTestId("product-planner-entry-entry-1");
      expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull(); expect(api.patch).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "수량 변경" })); const fresh = screen.getByRole("dialog", { name: "완제품 수량 변경" });
      expect(fields(fresh).input.value).toBe("40"); expect(within(fresh).getByText("원입력 1/3팩")).toBeTruthy();
    } finally { storage.mockRestore(); }
  });
  it("keeps the unavailable marker when stale storage cannot be cleared so reload never restores it", async () => {
    const stale = { version: 1, kind: "meal-entry", planDate: props.planDate, columnId: props.columnId, slotName: props.slotName, entryId: "entry-1", action: "edit", quantityAmount: "30", quantityUnit: "g", quantityInput: { ...raw, raw_value: "1/4" } };
    sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify(stale));
    api.params.mockReturnValue(new URLSearchParams({ productAction: "edit", productEntryId: "entry-1", productQuantityResume: "unavailable" }));
    const originalRemove = Storage.prototype.removeItem;
    const storage = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(function(this: Storage, key) {
      if (key === PRODUCT_PLANNER_RETURN_CONTEXT_KEY) throw new DOMException("fixture write denied", "SecurityError");
      return originalRemove.call(this, key);
    });
    try {
      const view = render(<MealScreen {...props} />); await screen.findByText("로그인 전 원입력을 보관하지 못했어요. 계획은 그대로예요. 수량 변경을 다시 열어 입력해 주세요.");
      expect(api.replace).not.toHaveBeenCalled(); expect(readProductPlannerReturnContext()).toEqual(stale);
      expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull(); expect(api.patch).not.toHaveBeenCalled();
      view.unmount(); render(<MealScreen {...props} />); await screen.findByTestId("product-planner-entry-entry-1");
      expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull(); expect(api.patch).not.toHaveBeenCalled();
    } finally { storage.mockRestore(); }
  });
  it.each([ ["edit", "unavailable", true], ["edit", "unknown", false], ["delete", "unavailable", false] ] as const)("keeps only the exact failed-v4 marker through a guest server redirect %s/%s", async (action, marker, allowed) => {
    api.redirect.mockClear();
    const { default: Page } = await import("@/app/planner/[date]/[columnId]/page");
    await expect(Page({ params: Promise.resolve({ date: props.planDate, columnId: props.columnId }),
      searchParams: Promise.resolve({ slot: props.slotName, productAction: action, productEntryId: "entry-1", productQuantityResume: marker }) })).rejects.toThrow("NEXT_REDIRECT:");
    const redirectPath = new URL(api.redirect.mock.lastCall![0], "http://localhost");
    const next = new URL(redirectPath.searchParams.get("next")!, "http://localhost");
    expect(next.searchParams.get("productAction")).toBe(action);
    expect(next.searchParams.get("productEntryId")).toBe("entry-1");
    expect(next.searchParams.get("productQuantityResume")).toBe(allowed ? "unavailable" : null);
  });
  it("turns a DB policy OFF409 into a preserved read-only draft", async () => {
    api.patch.mockRejectedValue({ status: 409, code: "UNIT_POLICY_INACTIVE", message: "새 단위 입력은 아직 사용할 수 없어요." });
    const { dialog } = await open(); const { input, save } = fields(dialog); await userEvent.click(save);
    await within(dialog).findByText("새 단위 입력은 아직 사용할 수 없어요."); expect(input.value).toBe("40"); expect(input.disabled).toBe(true); expect(save.disabled).toBe(true); expect(api.patch).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await userEvent.click(screen.getByRole("button", { name: "수량 변경" }));
    const reopened = screen.getByRole("dialog", { name: "완제품 수량 변경" });
    expect(within(reopened).getByRole<HTMLInputElement>("spinbutton", { name: "완제품 변경 수량" }).disabled).toBe(true);
    expect(fieldsSave(reopened).disabled).toBe(true); expect(api.patch).toHaveBeenCalledTimes(1);
  });
});
function fieldsSave(dialog: HTMLElement) { return within(dialog).getByRole<HTMLButtonElement>("button", { name: "수량 변경" }); }
