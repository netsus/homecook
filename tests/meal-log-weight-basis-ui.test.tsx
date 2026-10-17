// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MealLogScreen } from "@/components/planner/meal-log-screen";
import type { MealLogDayData, MealLogNutritionEvidence } from "@/types/meal-log";
const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogDay: api.fetch, updateMealLogEntry: vi.fn(), createMealLogEntry: vi.fn(), deleteMealLogEntry: vi.fn(), isMealLogApiError: () => false }));
const batchId = "30000000-0000-4000-8000-000000000001";
const scalar: MealLogNutritionEvidence = { calculation_status: "complete", calories_kcal: 350, carbohydrate_g: 40, protein_g: 25, fat_g: 10, sodium_mg: 200 };
function day(nutrition: MealLogNutritionEvidence, date = "2026-09-07"): MealLogDayData {
  const entry = { id: "10000000-0000-4000-8000-000000000001", revision: 1, consumed_at: null, consumed_local_date: date, timezone_name_snapshot: "Asia/Seoul", meal_plan_column_id: "20000000-0000-4000-8000-000000000001", slot_name_snapshot: "아침", source: { type: "cooked_batch" as const, id: batchId }, quantity: { amount: 125, unit: "g" }, display_name: "저장된 요리", display_brand: null, nutrition, created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" };
  return { date, active_columns: [{ id: entry.meal_plan_column_id, name: "아침", sort_order: 0 }], active_sections: [{ meal_plan_column_id: entry.meal_plan_column_id, slot_name_snapshot: "아침", sort_order: 0, entries: [entry], subtotal: scalar, incomplete_count: 0 }], deleted_column_sections: [], entries: [entry], day_total: { ...scalar, incomplete_count: 0 } };
}
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "false"); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it("reads only the meal's frozen denominator/source/assumptions and leaves consumed nutrition unchanged", async () => {
  const nutrition: MealLogNutritionEvidence = { ...scalar, weight_basis: { schema_version: "cooked-weight-basis-v1", batch_id: batchId, recipe_content_snapshot_id: null, finished_weight_g: 200,
    source: "conditional_estimate", model_version: "historical-frozen-model", prediction_id: null, observation_id: null, batch_revision: 1 }, weight_assumption_codes: ["all_declared_inputs_retained"] };
  api.fetch.mockImplementation(async (date: string) => date === "2026-09-07" ? day(nutrition) : { ...day(scalar,date), active_sections: [], entries: [] });
  render(<MealLogScreen date="2026-09-07" onDateChange={vi.fn()} onUnauthorized={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "아침의 저장된 요리 식사 기록 상세" }));
  const detail = screen.getByRole("dialog", { name: "식사 기록 상세" });
  expect(within(detail).getByText("125g")).toBeTruthy();
  const basis = within(detail).getByRole("region", { name: "기록 당시 전체무게 근거" });
  expect(basis.textContent).toContain("200g"); expect(basis.textContent).toContain("조건별 추정"); expect(basis.textContent).toContain("가열 없는 섞기 단계");
  expect(within(detail).getByRole("region", { name: "기록한 음식 영양정보" }).textContent).toContain("350kcal");
  expect(api.fetch.mock.calls.every(([url]) => typeof url === "string" && /^\d{4}-\d{2}-\d{2}$/.test(url))).toBe(true);
});
it("keeps historical missing provenance missing and preserves the current detail availability gate", async () => {
  api.fetch.mockImplementation(async (date: string) => date === "2026-09-07" ? day(scalar) : { ...day(scalar,date), active_sections: [], entries: [] });
  render(<MealLogScreen date="2026-09-07" onDateChange={vi.fn()} onUnauthorized={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button", { name: "아침의 저장된 요리 식사 기록 상세" }));
  expect(screen.queryByRole("region", { name: "기록 당시 전체무게 근거" })).toBeNull();
});

it("explains the mass fallback on a frozen meal without implying the MIX model", async () => {
  const nutrition: MealLogNutritionEvidence={...scalar,weight_basis:{schema_version:"cooked-weight-basis-v1",batch_id:batchId,recipe_content_snapshot_id:null,finished_weight_g:225,source:"conditional_estimate",model_version:"ingredient-mass-75-v1",prediction_id:null,observation_id:null,batch_revision:1},weight_assumption_codes:["ingredient_mass_seventy_five_percent"]};
  api.fetch.mockImplementation(async(date:string)=>date==="2026-09-07"?day(nutrition):{...day(scalar,date),active_sections:[],entries:[]});
  render(<MealLogScreen date="2026-09-07" onDateChange={vi.fn()} onUnauthorized={vi.fn()} />);
  await userEvent.click(await screen.findByRole("button",{name:"아침의 저장된 요리 식사 기록 상세"}));
  const basis=screen.getByRole("region",{name:"기록 당시 전체무게 근거"});
  expect(basis.textContent).toContain("재료량 75% 추정");expect(basis.textContent).toContain("재료 무게 합계의 75%");expect(basis.textContent).not.toContain("가열 없는 섞기");
});
