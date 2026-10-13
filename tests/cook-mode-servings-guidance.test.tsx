// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Responsive Playwright tests verify CSS; Vitest exercises the view behavior.
vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));
import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import { SnapshotV2CookModeView } from "@/components/cooking/snapshot-v2-cook-mode-view";
import type { CookingModeRecipe } from "@/types/cooking";

const recipe: CookingModeRecipe = {
  id: "scaled-recipe", title: "두부찌개", cooking_servings: 3,
  ingredients: [{ ingredient_id: "water", standard_name: "물", amount: 600, unit: "mL", display_text: "물 600mL", ingredient_type: "QUANT", scalable: true }],
  steps: [{ step_number: 1, instruction: "물 400mL와 고춧가루 2스푼을 넣고 10분간 끓여요. 180도로 2번 나누어 조리해요.", cooking_method: { code: "BOIL", label: "끓이기", color_key: "orange" }, ingredients_used: [{ ingredient_id: "water", amount: 400, unit: "mL" }], heat_level: null, duration_seconds: 600, duration_text: "10분" }],
};
const copy = "재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다";

afterEach(cleanup);

describe("cooking servings guidance", () => {
  it.each(["mobile", "desktop"] as const)("explains the scaled table without rewriting instructions on %s", (density) => {
    render(<CookModeWholeBoard density={density} recipe={recipe} />);
    const note = screen.getByTestId("cook-mode-servings-note");
    const step = screen.getByTestId("cook-mode-step-copy-1");
    expect(note.textContent?.trim()).toBe(copy);
    expect(note.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("600mL")).toBeTruthy();
    expect(step.textContent).toBe(recipe.steps[0].instruction);
    expect(screen.queryByText(/원본.*인분/)).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it.each(["in_progress", "completed", "cancelled"] as const)("keeps snapshot %s quantities and guidance immutable", (status) => {
    const before = JSON.stringify(recipe);
    render(<SnapshotV2CookModeView data={{ session_id: "snapshot", contract_version: "snapshot_v2", mode: "standalone", status, recipe, pantry_candidates: [] }} onCancel={() => undefined} onComplete={() => undefined} />);
    expect(screen.getByTestId("cook-mode-servings-note").textContent?.trim()).toBe(copy);
    expect(screen.getByTestId("cook-mode-step-copy-1").textContent).toBe(recipe.steps[0].instruction);
    expect(screen.queryByRole("button", { name: "요리 완료" }) !== null).toBe(status === "in_progress");
    expect(JSON.stringify(recipe)).toBe(before);
  });
});
