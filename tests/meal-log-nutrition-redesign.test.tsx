// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogScreen } from "@/components/planner/meal-log-screen";
import { MealLogDayNutritionDetail } from "@/components/planner/meal-log-day-nutrition-detail";
import { MealLogMacroBar } from "@/components/planner/meal-log-nutrition-chart";
import { mealLogMacroShares, mealLogAxisMaximum, scaleMealLogNutrition } from "@/lib/planner/meal-log-nutrition-presentation";
import type { MealLogDayData, MealLogEntry, MealLogNutritionEvidence } from "@/types/meal-log";
const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogDay: api.fetch, updateMealLogEntry: api.update, deleteMealLogEntry: api.remove, createMealLogEntry: vi.fn(), isMealLogApiError: (error: unknown) => Boolean(error && typeof error === "object" && "status" in error) }));
vi.mock("@/components/planner/meal-log-add-sheet", () => ({ MealLogAddSheet: ({ date, initialColumnId }: { date: string; initialColumnId: string }) => <div role="dialog" aria-label="먹은 음식 추가">{date} {initialColumnId}</div> }));
const nutrition: MealLogNutritionEvidence = { calculation_status: "complete", calories_kcal: 310, carbohydrate_g: 14, protein_g: 23, fat_g: 18, sodium_mg: 620 };
const entry: MealLogEntry = { id: "10000000-0000-4000-8000-000000000001", revision: 1, consumed_at: null, consumed_local_date: "2026-10-05", timezone_name_snapshot: "Asia/Seoul", meal_plan_column_id: "20000000-0000-4000-8000-000000000001", slot_name_snapshot: "점심", source: { type: "cooked_batch", id: "30000000-0000-4000-8000-000000000001" }, quantity: { amount: 300, unit: "g" }, display_name: "김치찌개", display_brand: null, nutrition, created_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-05T00:00:00Z" };
function day(record = entry): MealLogDayData { return { date: record.consumed_local_date, active_columns: [{ id: record.meal_plan_column_id!, name: "점심", sort_order: 0 }, { id: "empty", name: "저녁", sort_order: 1 }], active_sections: [{ meal_plan_column_id: record.meal_plan_column_id!, slot_name_snapshot: "점심", sort_order: 0, entries: [record], subtotal: record.nutrition, incomplete_count: 0 }], deleted_column_sections: [], entries: [record], day_total: { ...record.nutrition, incomplete_count: 0 } }; }
const props = { date: "2026-10-05", showDateNavigation: false, onDateChange: vi.fn(), onUnauthorized: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); api.fetch.mockImplementation(async (date: string) => ({ ...day(), date })); api.update.mockResolvedValue({ entry }); api.remove.mockResolvedValue({}); });
afterEach(cleanup);
describe("meal-log nutrition calculations", () => {
  it("uses precise 4/4/9 composition independent of label calories", () => {
    const shares = mealLogMacroShares(nutrition)!;
    expect(shares).toEqual([56 / 310, 92 / 310, 162 / 310]);
    expect(mealLogMacroShares({ ...nutrition, calories_kcal: 500 })).toEqual(shares);
    mealLogMacroShares(scaleMealLogNutrition(nutrition, 250 / 300))!.forEach((share, index) => expect(share).toBeCloseTo(shares[index], 12));
    expect(scaleMealLogNutrition(nutrition, 250 / 300).calories_kcal).toBeCloseTo(258.3333);
  });
  it("shows all known partial macros with an explicit qualified label", () => {
    const partial = { ...nutrition, calculation_status: "partial" as const, calories_kcal: 613, carbohydrate_g: 45, protein_g: 35, fat_g: 32 };
    expect(mealLogMacroShares(partial)).toEqual([180 / 608, 140 / 608, 288 / 608]);
    render(<MealLogMacroBar nutrition={partial} thin />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("확인된 탄단지 기준");
    expect(screen.getByText("확인된 탄단지 기준")).toBeTruthy();
    expect(screen.queryByText("일부 영양 정보 없음")).toBeNull();
    expect(partial.calculation_status).toBe("partial");
  });
  it("does not normalize missing, invalid, unavailable or zero macros into a full bar", () => {
    expect(mealLogMacroShares({ ...nutrition, calculation_status: "unavailable" })).toBeNull();
    expect(mealLogMacroShares({ ...nutrition, fat_g: null })).toBeNull();
    expect(mealLogMacroShares({ ...nutrition, fat_g: -1 })).toBeNull();
    expect(mealLogMacroShares({ ...nutrition, fat_g: Number.NaN })).toBeNull();
    expect(mealLogMacroShares({ ...nutrition, fat_g: 1e308 })).toBeNull();
    expect(mealLogMacroShares({ ...nutrition, fat_g: 0, carbohydrate_g: 0, protein_g: 0 })).toBeNull();
    render(<MealLogMacroBar nutrition={{ ...nutrition, calculation_status: "partial", fat_g: null }} thin />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("일부 영양 정보 없음")).toBeTruthy();
  });
  it("chooses a shared zero-based numeric scale and ignores unknown values", () => {
    expect(mealLogAxisMaximum([430, 620, 400, null])).toBe(800);
    expect(mealLogAxisMaximum([20, 33, 17])).toBe(40);
    expect(mealLogAxisMaximum([null, 0])).toBe(1);
  });
});
describe("meal-log redesigned detail flow", () => {
  it("compares meal values, distinguishes missing meals and opens the selected contributor", async () => {
    const user = userEvent.setup(); const open = vi.fn();
    render(<MealLogDayNutritionDetail day={day()} onClose={vi.fn()} onEntry={open} />);
    expect(screen.getByRole("heading", { name: "10월 5일" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "하루 영양" })).toBeNull();
    expect(screen.queryByText(/2026/)).toBeNull();
    const summary = screen.getByRole("region", { name: "하루 영양 합계" });
    expect(Array.from(summary.querySelectorAll("dt"), item => item.textContent)).toEqual(["탄", "단", "지"]);
    expect(screen.getByText("기록 없음")).toBeTruthy();
    expect(screen.queryByText(/1g당 4kcal/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "단백질" }));
    expect(screen.getByRole("img", { name: "끼니별 단백질 그래프" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /김치찌개/ })); expect(open).toHaveBeenCalledWith(entry);
    await user.click(screen.getByRole("button", { name: "영양 계산 기준" })); expect(screen.getByText(/1g당 4kcal/)).toBeTruthy();
  });
  it("renders selected date only and keeps four-pixel food bars", async () => {
    const view = render(<MealLogScreen {...props} />);
    await screen.findByText("김치찌개");
    expect(view.container.querySelectorAll("[data-planner-date]")).toHaveLength(1);
    const summary = screen.getByRole("region", { name: "하루 영양" });
    expect(within(summary).getByText("10월 5일")).toBeTruthy();
    expect(within(summary).queryByText("하루 영양")).toBeNull();
    expect(Array.from(summary.querySelectorAll("dt"), item => item.textContent)).toEqual(["탄", "단", "지"]);
    expect(summary.textContent).not.toContain("2026");
    const row = screen.getByRole("button", { name: /김치찌개 식사 기록 상세/ }).closest("li")!;
    expect(within(row).getByRole("img").style.height).toBe("4px");
    await userEvent.setup().click(screen.getByRole("button", { name: "하루 영양 상세 보기" }));
    expect(screen.getByRole("dialog", { name: "하루 영양 상세" })).toBeTruthy();
  });
  it("shows read-only entry detail, edits in a sheet, and preserves an uncertain retry key", async () => {
    const user = userEvent.setup(); render(<MealLogScreen {...props} />);
    await user.click(await screen.findByRole("button", { name: /김치찌개 식사 기록 상세/ }));
    const detail = screen.getByRole("dialog", { name: "식사 기록 상세" });
    expect(within(detail).getByRole("heading", { name: "10월 5일 점심" })).toBeTruthy();
    expect(within(detail).queryByRole("textbox")).toBeNull();
    await user.click(within(detail).getByRole("button", { name: "식사 기록 수정" }));
    const sheet = screen.getByRole("dialog", { name: "10월 5일 점심" });
    const input = within(sheet).getByRole("textbox", { name: "먹은 양" });
    await user.clear(input); await user.type(input, "250");
    api.update.mockRejectedValueOnce(new Error("잠시 후 다시 시도"));
    await user.click(within(sheet).getByRole("button", { name: "수정 저장" }));
    expect(await screen.findByText("잠시 후 다시 시도")).toBeTruthy();
    const firstKey = api.update.mock.calls[0][2];
    api.fetch.mockImplementation(async (date: string) => ({ ...day({ ...entry, revision: 2, quantity: { amount: 250, unit: "g" }, nutrition: scaleMealLogNutrition(nutrition, 250 / 300) }), date }));
    await user.click(within(sheet).getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "10월 5일 점심" })).toBeNull());
    expect(api.update.mock.calls[1][2]).toBe(firstKey);
    expect(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByText("250g")).toBeTruthy();
  });
  it("explains only the restored consumed amount for cooked sources", async () => {
    const user = userEvent.setup(); render(<MealLogScreen {...props} />);
    await user.click(await screen.findByRole("button", { name: /김치찌개 식사 기록 상세/ }));
    await user.click(screen.getByRole("button", { name: "기록 삭제" }));
    expect(screen.getByRole("dialog", { name: "10월 5일 점심" })).toBeTruthy();
    expect(screen.getByText("먹은 양 300g을 남은 요리에 돌려놓아요.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith(entry.id, 1, expect.any(String)));
  });
  it("does not claim pantry or leftover restoration for a product record", async () => {
    api.fetch.mockImplementation(async (date: string) => ({ ...day({ ...entry, source: { ...entry.source, type: "food_product" } }), date }));
    const user = userEvent.setup(); render(<MealLogScreen {...props} />);
    await user.click(await screen.findByRole("button", { name: /김치찌개 식사 기록 상세/ })); await user.click(screen.getByRole("button", { name: "기록 삭제" }));
    expect(screen.queryByText(/돌려놓아요/)).toBeNull();
  });
});


it("shows frozen AI notices in meal records, day totals and comparison detail", async () => {
  const aiEntry: MealLogEntry = { ...entry, nutrition: { ...nutrition, calculation_status: "partial", contains_ai_estimate: true } };
  api.fetch.mockImplementation(async (date: string) => ({ ...day(aiEntry), date }));
  const view = render(<MealLogScreen {...props} />);
  await screen.findByText("김치찌개");
  expect(within(screen.getByRole("region", { name: "하루 영양" })).getByText(/AI 추정값 포함/)).toBeTruthy();
  expect(within(screen.getByLabelText("점심의 김치찌개 영양정보")).getByText(/AI 추정값 포함/)).toBeTruthy();
  view.unmount();
  render(<MealLogDayNutritionDetail day={day(aiEntry)} onClose={vi.fn()} onEntry={vi.fn()} />);
  expect(within(screen.getByRole("region", { name: "하루 영양 합계" })).getByText(/AI 추정값 포함/)).toBeTruthy();
  expect(screen.queryByText("확인된 정보 기준")).toBeNull();
  expect(screen.getByRole("img", { name: "끼니별 열량 그래프" }).getAttribute("aria-describedby")).toBeTruthy();
});
