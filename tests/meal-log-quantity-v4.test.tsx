// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogAddSheet } from "@/components/planner/meal-log-add-sheet";
import type { IngredientQuantityOptions } from "@/types/quantity-input";

const api = vi.hoisted(() => ({ catalog: vi.fn(), source: vi.fn(), recent: vi.fn(), cooked: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/api/food-catalog-search", () => ({ fetchFoodCatalogSearch: api.catalog, fetchFoodCatalogSource: api.source }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogRecent: api.recent, isMealLogApiError: () => false }));
vi.mock("@/lib/api/cooking", () => ({ fetchCookedBatches: api.cooked }));
vi.mock("@/lib/api/meal-log-preview", () => ({ fetchMealLogNutritionPreview: api.preview }));
const ingredient = "11111111-1111-4111-8111-111111111111";
const column = "22222222-2222-4222-8222-222222222222";
const options: IngredientQuantityOptions = { policy_version: "ingredient-units-v4", profile_id: "milk-v1", preparation_state: "raw", default_unit: "mL",
  choices: [{ unit: "mL", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "L", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "g", normalized: { amount: 1, unit: "g" }, quality: "direct", reason: null },
    { unit: "kg", normalized: { amount: 1_000, unit: "g" }, quality: "direct", reason: null }] };
const milk = { type: "ingredient", id: ingredient, standard_name: "일반 우유", category: "유제품", default_unit: "ml", quantity_options: options };
function open() {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<MealLogAddSheet columns={[{ id: column, name: "아침", sort_order: 0 }]} date="2026-10-14" initialColumnId={column}
    quantityV4Enabled onClose={vi.fn()} onSave={save} onUnauthorized={vi.fn()} />);
  return save;
}
async function selectMilk(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "제품·재료" }));
  await user.type(screen.getByPlaceholderText("제품·재료 이름을 입력해 주세요"), "우유");
  await user.click(await screen.findByRole("button", { name: /일반 우유/ }));
  return screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" });
}
describe("explicit quantity v4 meal input", () => {
  beforeEach(() => {
    api.catalog.mockResolvedValue({ items: [milk], has_next: false, next_cursor: null });
    api.source.mockResolvedValue(milk);
    api.recent.mockResolvedValue({ items: [], has_next: false, next_cursor: null });
    api.cooked.mockResolvedValue({ items: [], has_next: false, next_cursor: null });
    api.preview.mockResolvedValue({ nutrition: { calculation_status: "unavailable", calories_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, sodium_mg: null } });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });
  it("preserves initial source failure and retry after a successful catalog search", async () => {
    api.cooked.mockRejectedValueOnce(Object.assign(new Error("목록 읽기 실패"), { status: 409 }));
    const user = userEvent.setup(); const save = open();
    await screen.findByRole("button", { name: "음식 목록 다시 불러오기" });
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.type(screen.getByPlaceholderText("제품·재료 이름을 입력해 주세요"), "우유");
    await screen.findByRole("button", { name: /일반 우유/ });
    await user.click(screen.getByRole("tab", { name: "최근" }));
    expect(api.cooked).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("최근 기록한 음식이 없어요.")).toBeNull();
    expect(screen.queryByRole("button", { name: "음식 목록 다시 불러오기" })).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("목록 읽기 실패");
    await user.click(screen.getByRole("button", { name: "음식 목록 다시 불러오기" }));
    await screen.findByText("최근 기록한 음식이 없어요.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "음식 목록 다시 불러오기" })).toBeNull();
    expect(api.cooked).toHaveBeenCalledTimes(2); expect(save).not.toHaveBeenCalled();
  });
  it("clears only source failure after its retry succeeds while preserving a separate catalog error", async () => {
    api.cooked.mockRejectedValueOnce(new Error("목록 읽기 실패"));
    api.catalog.mockRejectedValueOnce(new Error("제품 검색 실패"));
    const user = userEvent.setup(); open();
    await screen.findByRole("button", { name: "음식 목록 다시 불러오기" });
    await user.click(screen.getByRole("tab", { name: "제품·재료" }));
    await user.type(screen.getByPlaceholderText("제품·재료 이름을 입력해 주세요"), "우유");
    await screen.findByText("제품 검색 실패");
    expect(screen.getByText("목록 읽기 실패")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "음식 목록 다시 불러오기" }));
    await waitFor(() => expect(screen.queryByText("목록 읽기 실패")).toBeNull());
    expect(screen.getByRole("alert").textContent).toBe("제품 검색 실패");
    expect(screen.queryByRole("button", { name: "음식 목록 다시 불러오기" })).toBeNull();
  });
  it("distinguishes an initial stale read from empty lists and retries only on an explicit click", async () => {
    api.cooked.mockRejectedValueOnce(Object.assign(new Error("세션을 다시 확인해 주세요."), { status: 409 }));
    const user = userEvent.setup(); const save = open();
    await screen.findByRole("alert");
    expect(screen.queryByText("최근 기록한 음식이 없어요.")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "요리한 음식" }));
    expect(screen.queryByText("표시할 요리한 음식이 없어요.")).toBeNull();
    expect(api.cooked).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "음식 목록 다시 불러오기" }));
    await screen.findByText("표시할 요리한 음식이 없어요.");
    expect(api.cooked).toHaveBeenCalledTimes(2); expect(api.recent).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
  it("keeps the original401 login callback instead of offering a read retry", async () => {
    api.cooked.mockRejectedValueOnce(Object.assign(new Error("로그인이 필요해요."), { status: 401 }));
    const unauthorized = vi.fn(); const save = vi.fn();
    render(<MealLogAddSheet columns={[{ id: column, name: "아침", sort_order: 0 }]} date="2026-10-14" initialColumnId={column}
      quantityV4Enabled onClose={vi.fn()} onSave={save} onUnauthorized={unauthorized} />);
    await waitFor(() => expect(unauthorized).toHaveBeenCalledWith(null, column));
    expect(screen.queryByRole("button", { name: "음식 목록 다시 불러오기" })).toBeNull();
    expect(screen.queryByText("최근 기록한 음식이 없어요.")).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
  it.each(["success", "401"])("disables repeated read retry and ignores its late %s after unmount", async response => {
    let resolve!: (value: { items: never[]; has_next: boolean; next_cursor: null }) => void;
    let reject!: (reason: Error) => void;
    api.cooked.mockRejectedValueOnce(new Error("음식 목록 실패"))
      .mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
    const user = userEvent.setup(); const unauthorized = vi.fn();
    const { unmount } = render(<MealLogAddSheet columns={[{ id: column, name: "아침", sort_order: 0 }]} date="2026-10-14" initialColumnId={column}
      quantityV4Enabled onClose={vi.fn()} onSave={vi.fn()} onUnauthorized={unauthorized} />);
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "음식 목록 다시 불러오기" }));
    await screen.findByRole("status", { name: "음식 목록 불러오는 중" });
    const retry = screen.getByRole<HTMLButtonElement>("button", { name: "음식 목록 다시 불러오기" });
    expect(retry.disabled).toBe(true); await user.click(retry);
    expect(api.cooked).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      if (response === "401") reject(Object.assign(new Error("로그인이 필요해요."), { status: 401 }));
      else resolve({ items: [], has_next: false, next_cursor: null });
    });
    expect(screen.queryByRole("dialog", { name: "먹은 음식 추가" })).toBeNull();
    expect(unauthorized).not.toHaveBeenCalled();
  });
  it("formats preview quantity without rounding the input, request or saved fraction", async () => {
    const user = userEvent.setup(); const save = open(); await selectMilk(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "단위" }), "L");
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" });
    await user.type(amount, "1/3");
    await user.selectOptions(screen.getByRole("combobox", { name: "단위" }), "mL");
    const converted = (1 / 3) * 1_000;
    await waitFor(() => expect(api.preview.mock.calls.at(-1)?.[0].quantity.amount).toBe(converted));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }).value).toBe(String(converted));
    const preview = screen.getByRole("region", { name: "입력한 양의 영양 미리보기" });
    expect(within(preview).getByText("333.333mL 기준")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(save.mock.calls[0][0]).toMatchObject({ amount: converted, unit: "mL", quantityInput: { raw_value: "1/3", raw_unit: "L" } });
  });
  it("keeps a positive tiny preview distinct from zero without changing its input", async () => {
    const user = userEvent.setup(); open(); const amount = await selectMilk(user);
    await user.type(amount, "0.000001"); await user.tab();
    const preview = await screen.findByRole("region", { name: "입력한 양의 영양 미리보기" });
    expect(within(preview).getByText("<0.001mL 기준")).toBeTruthy();
    expect(amount.value).toBe("0.000001");
    expect(api.preview.mock.calls.at(-1)?.[0].quantity.amount).toBe(0.000001);
  });
  it.each([true, false])("formats recent quantity while preserving exact selection and raw metadata (raw=%s)", async hasRaw => {
    const converted = (1 / 3) * 1_000;
    const raw = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "L", numerator: "1", denominator: "3",
      display_quantity: { amount: converted, unit: "mL" }, normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED", evidence_ids: [], source_versions: [], batch_basis: null };
    api.recent.mockResolvedValue({ items: [{ source: { type: "ingredient", id: ingredient }, source_version: "milk-v1", display_name: "일반 우유", display_brand: null,
      last_quantity: { amount: converted, unit: "mL" }, frequency: 1, ...(hasRaw ? { quantity_input: raw } : {}) }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); const save = open();
    const recent = await screen.findByRole("button", { name: /일반 우유/ });
    expect(within(recent).getByText(`재료 · 최근 ${hasRaw ? "1/3L" : "333.333mL"} · 1회 기록`)).toBeTruthy();
    await user.click(recent);
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" });
    expect(amount.value).toBe(String(converted));
    await user.click(amount); await user.tab(); await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(save.mock.calls[0][0]).toMatchObject({ amount: converted, unit: "mL" });
    if (hasRaw) expect(save.mock.calls[0][0].quantityInput).toMatchObject({ raw_value: "1/3", raw_unit: "L" });
  });
  it("starts verified milk at mL with blank amount, then sends exact fraction raw input", async () => {
    const user = userEvent.setup(); const save = open(); const amount = await selectMilk(user);
    expect(amount.value).toBe("");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "단위" }).value).toBe("mL");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
    await user.type(amount, "1/3"); await user.tab();
    expect(amount.value).toBe("1/3");
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(api.preview.mock.calls.at(-1)?.[0]).toMatchObject({ quantity: { amount: 1 / 3, unit: "mL" }, quantityInput: { raw_value: "1/3", raw_unit: "mL" } });
    await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ amount: 1 / 3, unit: "mL", quantityInput: { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "mL" } }), column, "2026-10-14");
  });
  it("preserves 200mL and selector focus when g lacks density, and converts L exactly", async () => {
    const user = userEvent.setup(); const save = open(); const amount = await selectMilk(user);
    await user.type(amount, "200");
    const unit = screen.getByRole<HTMLSelectElement>("combobox", { name: "단위" });
    await user.selectOptions(unit, "g");
    expect(unit.value).toBe("mL"); expect(amount.value).toBe("200"); expect(document.activeElement).toBe(unit);
    expect(screen.getByText("이 단위로 바꿀 환산 근거가 없어요. 원래 양과 단위를 유지했어요.")).toBeTruthy();
    await user.selectOptions(unit, "L");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }).value).toBe("0.2");
    await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(save.mock.calls[0][0]).toMatchObject({ amount: 0.2, unit: "L",
      quantityInput: { raw_value: "200", raw_unit: "mL" } });
  });
  it("allows choosing a unit while blank and never turns an invalid fraction into a quantity", async () => {
    const user = userEvent.setup(); const save = open(); await selectMilk(user);
    await user.selectOptions(screen.getByRole("combobox", { name: "단위" }), "L");
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" });
    expect(amount.value).toBe("");
    await user.type(amount, "1/0");
    expect(amount.value).toBe("1/0");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("preserves an unsupported recent amount and unit with a reason instead of discarding them", async () => {
    api.recent.mockResolvedValue({ items: [{ source: { type: "ingredient", id: ingredient }, display_name: "일반 우유", display_brand: null, last_quantity: { amount: 2, unit: "통" }, frequency: 1 }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); open();
    await user.click(await screen.findByRole("button", { name: /일반 우유/ }));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }).value).toBe("2");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "단위" }).value).toBe("통");
    expect(screen.getByText("이전 단위의 환산 근거를 확인할 수 없어요. 원래 양과 단위는 보존했어요. 음식을 다시 선택해 주세요.")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
  });
  it("preserves a recent amount when its pinned profile has changed and requires a new selection", async () => {
    api.recent.mockResolvedValue({ items: [{ source: { type: "ingredient", id: ingredient }, source_version: "milk-old-profile", display_name: "일반 우유", display_brand: null,
      last_quantity: { amount: 200, unit: "mL" }, frequency: 1 }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); open();
    await user.click(await screen.findByRole("button", { name: /일반 우유/ }));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }).value).toBe("200");
    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "단위" }).value).toBe("mL");
    expect(screen.getByText("이전 기록 이후 음식의 형태나 제품 규격이 달라졌어요. 원래 양은 보존했어요. 현재 정보를 확인한 뒤 다시 선택해 주세요.")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
    expect(api.preview).not.toHaveBeenCalled();
  });
  it("reuses a valid recent display quantity while keeping its original raw volume", async () => {
    api.recent.mockResolvedValue({ items: [{ source: { type: "ingredient", id: ingredient }, source_version: "milk-v1", display_name: "일반 우유", display_brand: null,
      last_quantity: { amount: 0.2, unit: "L" }, frequency: 1, quantity_input: { schema_version: "quantity-v4", raw_value: "200", raw_unit: "mL", numerator: "200", denominator: "1",
        display_quantity: { amount: 0.2, unit: "L" }, normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED", evidence_ids: [], source_versions: [], batch_basis: null } }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); const save = open();
    await user.click(await screen.findByRole("button", { name: /일반 우유/ }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }); expect(amount.value).toBe("0.2");
    await user.click(amount); await user.tab(); await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(save.mock.calls[0][0]).toMatchObject({ amount: 0.2, unit: "L", quantityInput: { raw_value: "200", raw_unit: "mL" } });
  });
  it("keeps a verified volume preference while explaining that an unavailable profile cannot be saved", async () => {
    api.catalog.mockResolvedValue({ items: [{ ...milk, quantity_options: undefined }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); const save = open(); const amount = await selectMilk(user);
    expect(amount.value).toBe(""); expect(screen.getByRole<HTMLInputElement>("textbox", { name: /^단위$/ }).value).toBe("mL");
    await user.type(amount, "200");
    expect(screen.getByText("이 음식의 검토된 단위·영양 근거를 아직 확인하지 못했어요. 원래 양과 단위는 보존했어요.")).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled(); expect(api.preview).not.toHaveBeenCalled();
  });
  it("uses the fixed1000g/four-serving batch for half-serving preview and preserves its revision", async () => {
    api.cooked.mockResolvedValue({ items: [{ id: ingredient, recipe_id: ingredient, recipe_title: "고정 배치", recipe_thumbnail_url: null,
      cooked_at: "2026-10-14T00:00:00Z", status: "leftover", weight_status: "known", batch_status: "available",
      remaining_weight_g: 1000, cooking_servings: 4, finished_weight_g: 1000, revision: 1, weight_source: "estimated" }], has_next: false, next_cursor: null });
    api.preview.mockResolvedValue({ nutrition: { calculation_status: "unavailable", calories_kcal: null, carbohydrate_g: null,
      protein_g: null, fat_g: null, sodium_mg: null, weight_basis: { schema_version: "cooked-weight-basis-v1", batch_id: ingredient,
        recipe_content_snapshot_id: ingredient, finished_weight_g: 1000, source: "historical_estimate", model_version: null,
        prediction_id: null, observation_id: null, batch_revision: 1 } } });
    const user = userEvent.setup(); const save = open();
    await user.click(screen.getByRole("tab", { name: "요리한 음식" }));
    await user.click(await screen.findByRole("button", { name: /고정 배치/ }));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }).value).toBe("");
    await user.selectOptions(screen.getByRole("combobox", { name: "단위" }), "인분");
    await user.click(screen.getByRole("button", { name: "1/2" }));
    expect(screen.getByText("조리 당시 4인분 · 전체 1,000g 기준이에요.")).toBeTruthy();
    expect(await screen.findByText("먹은 양은 입력한 인분 수량이에요. 영양 미리보기의 전체무게 기준은 1,000g이에요. 무게 근거: 이전 방식의 추정.")).toBeTruthy();
    await waitFor(() => expect(api.preview).toHaveBeenCalled());
    expect(api.preview.mock.calls.at(-1)?.[0]).toMatchObject({ quantity: { amount: 0.5, unit: "인분" },
      quantityInput: { raw_value: "1/2", raw_unit: "인분", expected_batch_revision: 1 } });
    await user.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(save.mock.calls[0][0]).toMatchObject({ amount: 0.5, unit: "인분", maxAmount: 4,
      quantityInput: { raw_value: "1/2", raw_unit: "인분", expected_batch_revision: 1 } });
  });
  it("does not invent100g for a legacy batch without a known weight in the new input flow", async () => {
    api.cooked.mockResolvedValue({ items: [{ id: ingredient, recipe_id: ingredient, recipe_title: "중량 미확인 이전 요리", recipe_thumbnail_url: null,
      cooked_at: "2026-10-14T00:00:00Z", status: "leftover", weight_status: null, batch_status: null,
      remaining_weight_g: null, cooking_servings: 4, finished_weight_g: null, revision: null, weight_source: null }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); const save = open(); await user.click(screen.getByRole("tab", { name: "요리한 음식" }));
    expect(await screen.findByText("중량 미확인 이전 요리")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /중량 미확인 이전 요리/ })).toBeNull();
    expect(screen.getByText(/무게 확인 불가/)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "먹은 양" })).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
  it("keeps a legacy recent batch amount but explains why the new flow cannot write it", async () => {
    api.cooked.mockResolvedValue({ items: [{ id: ingredient, recipe_id: ingredient, recipe_title: "중량 미확인 이전 요리", recipe_thumbnail_url: null,
      cooked_at: "2026-10-14T00:00:00Z", status: "leftover", weight_status: null, batch_status: null,
      remaining_weight_g: null, cooking_servings: 4, finished_weight_g: null, revision: null, weight_source: null }], has_next: false, next_cursor: null });
    api.recent.mockResolvedValue({ items: [{ source: { type: "cooked_batch", id: ingredient }, display_name: "중량 미확인 이전 요리", display_brand: null,
      last_quantity: { amount: 55, unit: "g" }, frequency: 1 }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); const save = open(); await user.click(await screen.findByRole("button", { name: /중량 미확인 이전 요리/ }));
    const amount = screen.getByRole<HTMLInputElement>("textbox", { name: "먹은 양" }); expect(amount.value).toBe("55");
    expect(screen.getByText("이전 요리의 중량 기준을 확인할 수 없어요. 원래 양과 단위는 보존했어요. 남은 요리에서 상태를 확인해 주세요.")).toBeTruthy();
    await user.click(amount); await user.tab(); expect(screen.getByRole<HTMLButtonElement>("button", { name: "기록 저장" }).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled(); expect(api.preview).not.toHaveBeenCalled();
  });
});
