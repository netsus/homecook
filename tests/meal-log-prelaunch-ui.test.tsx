// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealLogScreen } from "@/components/planner/meal-log-screen";
import type { MealLogDayData, MealLogNutritionEvidence } from "@/types/meal-log";

const api = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/api/meal-log", () => ({ fetchMealLogDay: api.fetch, updateMealLogEntry: api.update, createMealLogEntry: vi.fn(), deleteMealLogEntry: vi.fn(), isMealLogApiError: () => false }));
const nutrition: MealLogNutritionEvidence = { calculation_status: "complete", calories_kcal: 350, carbohydrate_g: 40, protein_g: 25, fat_g: 10, sodium_mg: 200 };
function day(date = "2026-09-07"): MealLogDayData {
  if (date !== "2026-09-07") return { date, active_columns: [], active_sections: [], deleted_column_sections: [], entries: [], day_total: { ...nutrition, calories_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0, incomplete_count: 0 } };

  const entry = { id: "10000000-0000-4000-8000-000000000001", revision: 1, consumed_at: null, consumed_local_date: date, timezone_name_snapshot: "Asia/Seoul", meal_plan_column_id: "20000000-0000-4000-8000-000000000001", slot_name_snapshot: "아침", source: { type: "cooked_batch" as const, id: "30000000-0000-4000-8000-000000000001" }, quantity: { amount: 125, unit: "g" }, display_name: "나의 비공개 닭고기 덮밥", display_brand: null, nutrition, created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" };
  return { date, active_columns: [{ id: entry.meal_plan_column_id, name: "아침", sort_order: 0 }], active_sections: [{ meal_plan_column_id: entry.meal_plan_column_id, slot_name_snapshot: "아침", sort_order: 0, entries: [entry], subtotal: nutrition, incomplete_count: 0 }], deleted_column_sections: [], entries: [entry], day_total: { ...nutrition, calories_kcal: 700, incomplete_count: 0 } };
}
function selectedSummary() { return within(screen.getByRole("region", { name: "9월 7일 월요일 식사 기록" })).getByRole("region", { name: "하루 영양" }); }
async function findSelectedSummary() { await waitFor(() => expect(selectedSummary()).toBeTruthy()); return selectedSummary(); }
const props = { date: "2026-09-07", onDateChange: vi.fn(), onUnauthorized: vi.fn() };
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "false"); vi.clearAllMocks(); window.sessionStorage.clear(); api.fetch.mockImplementation(async (date: string) => day(date)); api.update.mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("prelaunch meal log presentation", () => {
  it("shows server daily calories and macros inside the selected day card, outside the compact date rail", async () => {
    render(<MealLogScreen {...props} />);
    const chip = await screen.findByRole("radio", { name: /9\/7 월요일 선택, 기록 있음/ });
    expect(within(chip).queryByText("700 kcal")).toBeNull();
    const summary = selectedSummary();
    expect(within(summary).getByText("700").className).toContain("text-[var(--brand-accent)]");
    expect(within(summary.querySelector("dl")!).getByText("40")).toBeTruthy();
    expect(within(summary.querySelector("dl")!).getByText("25")).toBeTruthy();
    expect(within(summary.querySelector("dl")!).getByText("10")).toBeTruthy();
  });
  it("shows daily nutrition as four always-visible tiles and consumed grams per food", async () => {
    render(<MealLogScreen {...props} />);
    const summary = await findSelectedSummary();
    expect(summary.closest("details")).toBeNull();
    expect(summary.querySelectorAll("dd")).toHaveLength(4);
    expect(within(summary).queryByRole("img")).toBeNull();
    expect(screen.getByLabelText("먹은 양 125g")).toBeTruthy();
    expect(within(summary).getByText("700")).toBeTruthy();
  });
  it("shows textual food macros with quantity and an icon delete action, without sodium or edit", async () => {
    render(<MealLogScreen {...props} />);
    const quantity = await screen.findByLabelText("먹은 양 125g");
    const row = quantity.closest("li")!;
    expect(quantity.textContent).toBe("125g");
    expect(row.textContent).not.toContain("요리한 음식");
    expect(row.querySelector("details")).toBeNull();
    expect(row.textContent).toContain("탄수화물 40g");
    expect(row.textContent).toContain("단백질 25g");
    expect(row.textContent).toContain("지방 10g");
    expect(within(row).queryByText(/나트륨/)).toBeNull();
    expect(within(row).queryByRole("button", { name: /식사 기록 수정/ })).toBeNull();
    expect(within(row).queryByRole("img", { name: /탄단지 열량 비율/ })).toBeNull();
    expect(within(row).getByRole("button", { name: /식사 기록 삭제/ }).textContent).toBe("");
    expect(within(row).getAllByRole("button")).toHaveLength(2);
  });
  it("keeps consumed quantity and calories directly with the food name", async () => {
    render(<MealLogScreen {...props} />);
    const food = await screen.findByRole("button", { name: /식사 기록 상세/ });
    expect(within(food).getByText("나의 비공개 닭고기 덮밥")).toBeTruthy();
    expect(within(food).getByLabelText("먹은 양 125g")).toBeTruthy();
    expect(within(food).getByText("350 kcal")).toBeTruthy();
    expect(within(food).getByText("350 kcal").className).toContain("text-[var(--brand-accent)]");
    expect(screen.getByText("25g").className).toContain("text-[var(--brand-accent)]");
    expect(screen.getAllByLabelText("먹은 양 125g")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /식사 기록 상세/, description: /125g.*350 kcal/ })).toBeTruthy();
  });
  it.each([
    ["complete", 0, 0, 0, 0, false],
    ["partial", 80, 10, null, 2, false],
    ["partial", 80, 10, 3, 2, false],
    ["unavailable", null, null, null, null, false],
  ] as const)("preserves %s entry nutrition including zero and unknown (%s kcal)", async (status, kcal, carbs, protein, fat, hasChart) => {
    api.fetch.mockImplementation(async (date: string) => {
      const data = day(date);
      if (data.entries[0]) data.entries[0].nutrition = { ...nutrition, calculation_status: status, calories_kcal: kcal, carbohydrate_g: carbs, protein_g: protein, fat_g: fat };
      return data;
    });
    render(<MealLogScreen {...props} />);
    const row = (await screen.findByLabelText("먹은 양 125g")).closest("li")!;
    expect(Boolean(within(row).queryByRole("img"))).toBe(hasChart);
    expect(row.textContent).toContain(kcal === null ? "정보 준비 중" : `${status === "partial" ? "최소 " : ""}${kcal} kcal`);
    expect(row.textContent).toContain(protein === null ? "단백질 정보 준비 중" : `단백질 ${protein}g`);
    expect(row.textContent).not.toContain("나트륨");
  });
  it("shows sodium only in food detail and restores focus when closed", async () => {
    const user = userEvent.setup();
    render(<MealLogScreen {...props} />);
    const invoker = await screen.findByRole("button", { name: /식사 기록 상세/ });
    expect(screen.queryByText(/나트륨/)).toBeNull();
    await user.click(invoker);
    expect(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByText("나트륨 200mg")).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(invoker));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("does not render a misleading macro chart when nutrition is unavailable", async () => {
    api.fetch.mockImplementation(async (date: string) => ({ ...day(date), day_total: { calculation_status: "unavailable", calories_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, sodium_mg: null, incomplete_count: 1 } }));
    render(<MealLogScreen {...props} />);
    const summary = await findSelectedSummary();
    expect(within(summary).queryByRole("img")).toBeNull();
    expect(within(summary).getAllByText("정보 없음")).toHaveLength(4);
    expect(within(summary).queryByText("0 kcal")).toBeNull();
  });
  it("opens detail before editing and returns focus to the food after cancel", async () => {
    const user = userEvent.setup();
    render(<MealLogScreen {...props} />);
    await screen.findByLabelText("먹은 양 125g");
    expect(screen.getAllByRole("button", { name: /식사 기록 상세/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /식사 기록 삭제/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /식사 기록 상세/ }).closest("details")).toBeNull();
    const edit = screen.getByRole("button", { name: /식사 기록 상세/ });
    await user.click(edit);
    await user.click(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "식사 기록 수정" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(document.activeElement).toBe(edit));
  });
  it("keeps cooked food editing in grams and sends entered grams unchanged", async () => {
    render(<MealLogScreen {...props} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /식사 기록 상세/ }));
    await user.click(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "식사 기록 수정" }));
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByRole("textbox", { name: "단위" }) as HTMLInputElement).readOnly).toBe(true);
    await user.clear(within(dialog).getByRole("spinbutton", { name: "실제 양" }));
    await user.type(within(dialog).getByRole("spinbutton", { name: "실제 양" }), "80.5");
    await user.click(within(dialog).getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ quantity: { amount: 80.5, unit: "g" } }), expect.any(String)));
  });
  it("shows public sample data without private requests and gates every mutation", async () => {
    const login = vi.fn();
    const user = userEvent.setup();
    render(<MealLogScreen {...props} guest onLoginRequired={login} />);
    expect(api.fetch).not.toHaveBeenCalled();
    const addButtons = await screen.findAllByRole("button", { name: /먹은 음식 추가/ });
    await user.click(addButtons[0]);
    expect(login).toHaveBeenCalledTimes(1);
    await user.click(screen.getAllByRole("button", { name: /식사 기록 상세/ })[0]);
    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/나트륨/)).toBeTruthy();
    await user.click(within(screen.getByRole("dialog", { name: "식사 기록 상세" })).getByRole("button", { name: "식사 기록 수정" }));
    await user.click(screen.getAllByRole("button", { name: /식사 기록 삭제/ })[0]);
    expect(login).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });
  it.each([true, false])("closes detail when guest changes from %s and never edits a prior audience entry", async (initialGuest) => {
    const user = userEvent.setup();
    const view = render(<MealLogScreen {...props} guest={initialGuest} onLoginRequired={vi.fn()} />);
    await user.click((await screen.findAllByRole("button", { name: /식사 기록 상세/ }))[0]);
    expect(screen.getByRole("dialog", { name: "식사 기록 상세" })).toBeTruthy();
    view.rerender(<MealLogScreen {...props} guest={!initialGuest} onLoginRequired={vi.fn()} />);
    await screen.findAllByRole("button", { name: /식사 기록 상세/ });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "식사 기록 수정" })).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
    if (initialGuest) expect(screen.getByText("나의 비공개 닭고기 덮밥")).toBeTruthy();
    else expect(screen.queryByText("나의 비공개 닭고기 덮밥")).toBeNull();
  });
  it("discards private pending responses when the visitor becomes a guest", async () => {
    const resolvers: Array<(value: MealLogDayData) => void> = [];
    api.fetch.mockImplementation(() => new Promise<MealLogDayData>((done) => { resolvers.push(done); }));
    const view = render(<MealLogScreen {...props} />);
    view.rerender(<MealLogScreen {...props} guest onLoginRequired={vi.fn()} />);
    await act(async () => resolvers.forEach((resolve) => resolve(day())));
    expect(screen.queryByText("나의 비공개 닭고기 덮밥")).toBeNull();
    expect(await screen.findAllByRole("button", { name: /먹은 음식 추가/ })).not.toHaveLength(0);
  });
  it("blocks guest food detail with an immediate login-page action during preparation", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    const foodLogin=vi.fn(); const mutationLogin=vi.fn();
    render(<MealLogScreen {...props} guest onFoodLoginRequired={foodLogin} onLoginRequired={mutationLogin} />);
    await userEvent.setup().click((await screen.findAllByRole("button",{name:/식사 기록 상세/}))[0]);
    expect(foodLogin).toHaveBeenCalledTimes(1);
    expect(mutationLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog",{name:"식사 기록 상세"})).toBeNull();
    expect(api.fetch).not.toHaveBeenCalled();
  });
  it("shows only a preparation notice to signed-in visitors instead of unfinished detail", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    render(<MealLogScreen {...props} />);
    await userEvent.setup().click(await screen.findByRole("button",{name:/식사 기록 상세/}));
    expect(screen.getByRole("heading",{name:"식사 상세는 준비 중이에요"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"식사 기록 수정"})).toBeNull();
    expect(screen.queryByText(/나트륨/)).toBeNull();
    expect(api.update).not.toHaveBeenCalled();
  });

  it("defers an old edit-return draft during preparation without dropping the draft or opening editing", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    const draft = { version: 1, action: "edit", date: "2026-09-07", entryId: "10000000-0000-4000-8000-000000000001", invoker: "entry-edit", draft: { amount: 80, unit: "g", columnId: "20000000-0000-4000-8000-000000000001" } };
    sessionStorage.setItem("homecook.meal-log-return-context.v1", JSON.stringify(draft));
    render(<MealLogScreen {...props} />);
    expect(await screen.findByRole("heading", { name: "식사 상세는 준비 중이에요" })).toBeTruthy();
    expect(screen.queryByRole("spinbutton", { name: "실제 양" })).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("homecook.meal-log-return-context.v1")!)).toEqual(draft);
    expect(api.update).not.toHaveBeenCalled();
  });

});
