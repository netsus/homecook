// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MealAddOptionsSheet } from "@/components/planner/meal-add-options-sheet";
import { MealAddPickerFlow } from "@/components/planner/meal-add-picker-flow";
const api = vi.hoisted(() => ({ search: vi.fn(), create: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/api/recipe", () => ({ fetchRecipes: api.search, fetchRecipePreview: api.preview }));
vi.mock("@/lib/api/meal", () => ({ createMealSafe: api.create }));
const recipe = { id: "recipe-a", title: "김치찌개", base_servings: 2, thumbnail_url: null, tags: [], source_type: "system", view_count: 0, save_count: 0, like_count: 0 };
beforeEach(() => {
  api.preview.mockResolvedValue({ ...recipe, ingredients: [], nutrition: { base_servings: 2, values: {}, calculation_status: "unavailable" } });
  api.search.mockResolvedValue({ success: true, data: { items: [recipe], has_next: false, next_cursor: null } });
  api.create.mockResolvedValue({ success: false, error: { message: "잠시 후 다시 시도해 주세요." } });
});
afterEach(cleanup);
const openPicker = (onClose = vi.fn()) => render(<MealAddPickerFlow columnId="column" entryMode="search" onClose={onClose} onComplete={vi.fn()} planDate="2026-10-06" slotName="점심" />);
describe("planner addition inside one sheet", () => {
  it("keeps all five recipe entry routes and target context", () => {
    render(<MealAddOptionsSheet title="계획에 추가" targetLabel="10/6 점심" onClose={vi.fn()} onPickerSelect={vi.fn()} routeHrefFor={mode => `/${mode}`} />);
    for (const id of ["search", "recipebook", "pantry", "youtube", "manual"]) expect(screen.getByTestId(`meal-add-option-${id}`)).toBeTruthy();
    expect(screen.queryByTestId("meal-add-option-product")).toBeNull();
    expect(screen.getByTestId("meal-add-target-badge").textContent).toBe("10/6 점심");
    expect(document.body.style.overflow).toBe("hidden");
  });
  it("keeps the accessible step name while showing only back and target context", async () => {
    openPicker();
    const dialog = screen.getByRole("dialog", { name: "검색으로 추가" });
    const heading = screen.getByRole("heading", { name: "검색으로 추가" });
    expect(heading.className).toBe("sr-only");
    const badge = screen.getByTestId("meal-add-target-badge");
    expect(badge.textContent).toBe("10/6 점심");
    expect(badge.parentElement?.querySelector("button")?.getAttribute("aria-label")).toBe("뒤로 가기");
    fireEvent.click(await screen.findByRole("button", { name: "김치찌개 선택" }));
    expect(screen.getByRole("dialog", { name: "계획에 추가" })).toBe(dialog);
    expect(screen.getByRole("heading", { name: "계획에 추가" }).className).toBe("sr-only");
  });
  it("replaces source content with quantity and retains query and draft on back", async () => {
    openPicker();
    const input = screen.getByRole("textbox", { name: "레시피 검색" });
    fireEvent.change(input, { target: { value: "김치" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: "김치찌개 선택" }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByRole("textbox", { name: "레시피 검색" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "인분 늘리기" }));
    fireEvent.click(screen.getByRole("button", { name: "레시피 바꾸기" }));
    expect((screen.getByRole("textbox", { name: "레시피 검색" }) as HTMLInputElement).value).toBe("김치");
    fireEvent.click(screen.getByRole("button", { name: "김치찌개 선택" }));
    expect(screen.getByLabelText("3인분")).toBeTruthy();
  });
  it("scales selected ingredients and nutrition from authoritative preview without inventing missing values", async () => {
    api.preview.mockResolvedValue({ ...recipe,
      ingredients: [{ id: "rice", standard_name: "쌀", ingredient_type: "QUANT", amount: 200, unit: "g", scalable: true }, { id: "salt", standard_name: "소금", ingredient_type: "QUANT", amount: 2, unit: "g", scalable: false }],
      nutrition: { base_servings: 2, values: { energy_kcal: { amount: 500, known_amount: 500, status: "complete" } }, scalable_values: { energy_kcal: 400 }, fixed_values: { energy_kcal: 100 }, calculation_status: "complete" },
    });
    openPicker();
    fireEvent.click(await screen.findByRole("button", { name: "김치찌개 선택" }));
    expect(await screen.findByText("500 kcal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "인분 늘리기" }));
    expect(screen.getByText("700 kcal")).toBeTruthy();
    fireEvent.click(screen.getByText("재료 2개 보기"));
    expect(screen.getByText("쌀 300g")).toBeTruthy();
    expect(screen.getByText("소금 2g")).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith("recipe-a", expect.any(AbortSignal));
  });
  it("reuses the attempt key only while retrying the same logical body", async () => {
    api.create.mockClear(); openPicker();
    fireEvent.click(await screen.findByRole("button", { name: "김치찌개 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "추가하기" }));
    await screen.findByRole("alert");
    const originalKey = api.create.mock.calls[0]![1];
    fireEvent.click(screen.getByRole("button", { name: "추가하기" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    expect(api.create.mock.calls[1]![1]).toBe(originalKey);
    fireEvent.click(screen.getByRole("button", { name: "인분 늘리기" }));
    fireEvent.click(screen.getByRole("button", { name: "추가하기" }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(3));
    expect(api.create.mock.calls[2]![1]).not.toBe(originalKey);
  });
  it("keeps the quantity and target after failure and asks once before discarding edited input", async () => {
    const close = vi.fn(); openPicker(close);
    fireEvent.click(await screen.findByRole("button", { name: "김치찌개 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "인분 늘리기" }));
    fireEvent.click(screen.getByRole("button", { name: "추가하기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("잠시 후");
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ planned_servings: 3, plan_date: "2026-10-06", column_id: "column" }), expect.any(String));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("변경사항을 버릴까요?")).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(screen.getByLabelText("3인분")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "변경사항 버리기" }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });
});
