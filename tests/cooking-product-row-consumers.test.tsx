// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import { ConsumedIngredientSheet } from "@/components/cooking/consumed-ingredient-sheet";
import { formatIngredientAmountOnly } from "@/components/cooking/cook-mode-step-model";
import type { CookingModeIngredient, CookingModeRecipe, CookingModeStep } from "@/types/cooking";

vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));

const ROW_A = "550e8400-e29b-41d4-a716-446655440081";
const ROW_B = "550e8400-e29b-41d4-a716-446655440082";
const PRODUCT_A = "550e8400-e29b-41d4-a716-446655440091";
const VERSION_A = "550e8400-e29b-41d4-a716-446655440092";
const PRODUCT_B = "550e8400-e29b-41d4-a716-446655440093";
const VERSION_B = "550e8400-e29b-41d4-a716-446655440094";

function ingredient(overrides: Partial<CookingModeIngredient>): CookingModeIngredient {
  return { ingredient_id: "soy", standard_name: "간장", amount: 30, unit: "g", display_text: null, ingredient_type: "QUANT", scalable: true, ...overrides };
}
function step(overrides: Partial<CookingModeStep>): CookingModeStep {
  return { step_number: 1, instruction: "업체 A 간장 10g과 업체 B 간장 20g을 넣어요.", cooking_method: { code: "prep", label: "준비", color_key: "gray" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null, ...overrides };
}
function recipe(ingredients: CookingModeIngredient[], steps: CookingModeStep[]): CookingModeRecipe {
  return { id: "recipe", title: "간장 요리", cooking_servings: 3, ingredients, steps };
}
afterEach(() => { cleanup(); Reflect.deleteProperty(window, "matchMedia"); });

describe("cooking product row readers", () => {
  it("shows the already-scaled actual product quantity without interpreting the raw brand label as an amount", () => {
    expect(formatIngredientAmountOnly(ingredient({ food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A,
      amount: 0.5, unit: "package", display_text: "업체 A · 간장" }))).toBe("0.5package");
  });

  it("keeps generic original quantity text, to-taste and unknown product text unchanged", () => {
    expect(formatIngredientAmountOnly(ingredient({ standard_name: "간장", display_text: "간장 4큰술" }))).toBe("4큰술");
    expect(formatIngredientAmountOnly(ingredient({ food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A,
      ingredient_type: "TO_TASTE", display_text: "업체 A · 간장" }))).toBe("적당량");
    expect(formatIngredientAmountOnly(ingredient({ food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A,
      amount: null, display_text: "미확인 원문" }))).toBe("미확인 원문");
    expect(formatIngredientAmountOnly(ingredient({ food_product_id: PRODUCT_A, food_product_nutrition_version_id: null,
      display_text: "미확인 원문" }))).toBe("미확인 원문");
  });

  it("renders nullable product rows separately and binds the step highlight to the actual row", () => {
    const data = recipe([
      ingredient({ row_key: ROW_A, ingredient_id: null, food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A, standard_name: "업체 A 간장", display_text: "업체 A · 간장", amount: 60 }),
      ingredient({ row_key: ROW_B, ingredient_id: null, food_product_id: PRODUCT_B, food_product_nutrition_version_id: VERSION_B, standard_name: "업체 B 간장" }),
    ], [step({ ingredients_used: [{ row_key: ROW_A, ingredient_id: null }] })]);
    render(<CookModeWholeBoard recipe={data} density="mobile" />);
    expect(screen.getByTestId(`cook-mode-ingredient-${ROW_A}`).textContent).toContain("60g");
    expect(screen.getByTestId(`cook-mode-ingredient-${ROW_B}`).textContent).toContain("업체 B 간장");
    const instruction = screen.getByTestId("cook-mode-step-copy-1");
    expect(instruction.textContent).toBe(data.steps[0].instruction);
    expect(within(instruction).getByTestId("cook-mode-step-ingredient-highlight").textContent).toBe("업체 A 간장");
  });

  it("uses only an exact product version pair and never a newer version", () => {
    const data = recipe([
      ingredient({ ingredient_id: null, food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A, standard_name: "업체 A 간장" }),
      ingredient({ ingredient_id: null, food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_B, standard_name: "업체 B 간장" }),
    ], [step({ ingredients_used: [{ ingredient_id: null, food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A }] })]);
    render(<CookModeWholeBoard recipe={data} density="desktop" />);
    expect(within(screen.getByTestId("cook-mode-step-copy-1")).getByTestId("cook-mode-step-ingredient-highlight").textContent).toBe("업체 A 간장");
  });

  it("preserves an ambiguous legacy instruction and does not select the last matching brand", () => {
    const data = recipe([
      ingredient({ food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A, standard_name: "업체 A 간장" }),
      ingredient({ food_product_id: PRODUCT_B, food_product_nutrition_version_id: VERSION_B, standard_name: "업체 B 간장" }),
    ], [step({ ingredients_used: [{ ingredient_id: "soy" }] })]);
    render(<CookModeWholeBoard recipe={data} density="desktop" />);
    const instruction = screen.getByTestId("cook-mode-step-copy-1");
    expect(instruction.textContent).toBe(data.steps[0].instruction);
    expect(within(instruction).queryByTestId("cook-mode-step-ingredient-highlight")).toBeNull();
  });

  it("keeps a legacy generic reference when its component identifies one row", () => {
    const data = recipe([
      ingredient({ component_label: "소스", standard_name: "업체 A 간장" }),
      ingredient({ component_label: "반죽", standard_name: "업체 B 간장" }),
    ], [step({ component_label: "소스", ingredients_used: [{ ingredient_id: "soy" }] })]);
    render(<CookModeWholeBoard recipe={data} density="desktop" />);
    expect(within(screen.getByTestId("cook-mode-step-copy-1")).getByTestId("cook-mode-step-ingredient-highlight").textContent).toBe("업체 A 간장");
  });

  it("does not fall back from a missing explicit row key to a generic or product match", () => {
    const data = recipe([ingredient({ standard_name: "업체 A 간장" })], [step({ ingredients_used: [{ row_key: ROW_B, ingredient_id: "soy" }] })]);
    render(<CookModeWholeBoard recipe={data} density="mobile" />);
    expect(within(screen.getByTestId("cook-mode-step-copy-1")).queryByTestId("cook-mode-step-ingredient-highlight")).toBeNull();
  });

  it.each([false, true])("keeps nullable product rows visible without mixing their UUIDs into legacy consumption (mobile=%s)", async (mobile) => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
    const onConfirm = vi.fn();
    render(<ConsumedIngredientSheet ingredients={[
      ingredient({ ingredient_id: "soy", standard_name: "일반 간장" }),
      ingredient({ row_key: ROW_A, ingredient_id: null, source_kind: "food_product", food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A, standard_name: "업체 A 간장", display_text: "업체 A · 간장" }),
      ingredient({ row_key: ROW_B, ingredient_id: null, source_kind: "food_product", food_product_id: PRODUCT_B, food_product_nutrition_version_id: VERSION_B, standard_name: "업체 B 간장" }),
    ]} onClose={vi.fn()} onSkip={vi.fn()} onConfirm={onConfirm} />);
    const first = screen.getByRole<HTMLButtonElement>("checkbox", { name: /업체 A 간장/ });
    const second = screen.getByRole<HTMLButtonElement>("checkbox", { name: /업체 B 간장/ });
    expect(first.disabled).toBe(true);
    expect(second.disabled).toBe(true);
    expect(first.getAttribute("data-testid")).not.toBe(second.getAttribute("data-testid"));
    expect(first.textContent).toContain("30g");
    expect(screen.getAllByText("이전 요리 완료 화면에서는 제품별 팬트리 소진을 선택할 수 없어요.")).toHaveLength(2);
    await userEvent.click(first);
    await userEvent.click(screen.getByTestId("consumed-confirm-button"));
    expect(onConfirm).toHaveBeenCalledWith(["soy"]);
    expect(onConfirm.mock.calls[0][0]).not.toContain(ROW_A);
    expect(onConfirm.mock.calls[0][0]).not.toContain(PRODUCT_B);
  });

  it("preserves the legacy generic ID for linked products and does not introduce pantry/product matching", async () => {
    const onConfirm = vi.fn();
    render(<ConsumedIngredientSheet ingredients={[
      ingredient({ row_key: ROW_A, ingredient_id: "soy", food_product_id: PRODUCT_A, food_product_nutrition_version_id: VERSION_A, standard_name: "기존 연결 제품" }),
    ]} onClose={vi.fn()} onSkip={vi.fn()} onConfirm={onConfirm} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("consumed-confirm-button"));
    expect(onConfirm).toHaveBeenLastCalledWith(["soy"]);
    await user.click(screen.getByRole("checkbox", { name: /기존 연결 제품/ }));
    await user.click(screen.getByTestId("consumed-confirm-button"));
    expect(onConfirm).toHaveBeenLastCalledWith([]);
  });
});
