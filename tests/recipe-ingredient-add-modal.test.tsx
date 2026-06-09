// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import { fetchIngredients } from "@/lib/api/ingredients";
import { INGREDIENT_CATEGORIES } from "@/lib/ingredient-categories";

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

const VEGETABLE_CATEGORY = INGREDIENT_CATEGORIES.find(({ code }) => code === "vegetable")!.label;
const VEGETABLE_GROUP_LABEL = "채소/버섯";

function installMatchMedia(matchesDesktop = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("RecipeIngredientAddModal", () => {
  beforeEach(() => {
    installMatchMedia(false);
    vi.mocked(fetchIngredients).mockReset();
    vi.mocked(fetchIngredients).mockResolvedValue({
      success: true,
      data: {
        items: [
          { id: "ing-onion", standard_name: "양파", category: VEGETABLE_CATEGORY },
          { id: "ing-tofu", standard_name: "두부", category: "콩/두부" },
        ],
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders ingredient options as home-style grid cards and adds them only after done", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();

    render(<RecipeIngredientAddModal onAdd={onAdd} onClose={vi.fn()} />);

    const onionCheckbox = await screen.findByRole("checkbox", { name: "양파" });
    const tofuCheckbox = screen.getByRole("checkbox", { name: "두부" });
    const onionCard = onionCheckbox.closest("label");

    expect(onionCard?.className).toContain("rounded-[var(--radius-card)]");
    expect(onionCard?.className).not.toContain("inline-flex");

    await user.click(onionCheckbox);
    await user.click(tofuCheckbox);

    expect(onAdd).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "선택한 재료 2개 추가" }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith([
        expect.objectContaining({
          ingredient_id: "ing-onion",
          standard_name: "양파",
          amount: 100,
          unit: "g",
          display_text: "양파 100g",
        }),
        expect.objectContaining({
          ingredient_id: "ing-tofu",
          standard_name: "두부",
          amount: 100,
          unit: "g",
          display_text: "두부 100g",
        }),
      ]);
    });
  });

  it("renders desktop ingredient options like the home ingredient filter and keeps multi-selection", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();

    render(<RecipeIngredientAddModal onAdd={vi.fn()} onClose={vi.fn()} />);

    const onionCheckbox = await screen.findByRole("checkbox", { name: "양파" });
    const tofuCheckbox = screen.getByRole("checkbox", { name: "두부" });
    const onionCard = onionCheckbox.closest("label");

    expect(onionCard?.className).toContain("web-ingredient-option");
    expect(onionCard?.className).toContain("web-ingredient-option-card");
    expect(onionCard?.className).not.toContain("inline-flex");
    expect(screen.getByTestId("ingredient-list-region")).toBeTruthy();

    await user.click(onionCheckbox);
    await user.click(tofuCheckbox);

    expect((onionCheckbox as HTMLInputElement).checked).toBe(true);
    expect((tofuCheckbox as HTMLInputElement).checked).toBe(true);
    expect(
      screen.getByRole("button", { name: "선택한 재료 2개 추가" }),
    ).toBeTruthy();

    await user.click(onionCheckbox);

    expect((onionCheckbox as HTMLInputElement).checked).toBe(false);
    expect((tofuCheckbox as HTMLInputElement).checked).toBe(true);
    expect(
      screen.getByRole("button", { name: "선택한 재료 1개 추가" }),
    ).toBeTruthy();
    expect(screen.queryByText("1개 선택됨")).toBeNull();
  });

  it("can force the desktop picker presentation even on a narrow viewport", async () => {
    render(
      <RecipeIngredientAddModal
        onAdd={vi.fn()}
        onClose={vi.fn()}
        presentation="web"
      />,
    );

    expect(await screen.findByRole("dialog", { name: "재료로 검색" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "재료 추가" })).toBeNull();
  });

  it("shows the optional empty action when ingredient search has no results", async () => {
    vi.mocked(fetchIngredients).mockResolvedValueOnce({
      success: true,
      data: { items: [] },
      error: null,
    });
    const onEmptyAction = vi.fn();
    const user = userEvent.setup();

    render(
      <RecipeIngredientAddModal
        emptyActionLabel="새 재료로 등록"
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onEmptyAction={onEmptyAction}
      />,
    );

    expect(await screen.findByText("검색 결과가 없어요")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "새 재료로 등록" }));

    expect(onEmptyAction).toHaveBeenCalledTimes(1);
  });

  it("filters desktop ingredient categories locally without showing a new loading pass", async () => {
    installMatchMedia(true);
    const user = userEvent.setup();

    render(<RecipeIngredientAddModal onAdd={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("checkbox", { name: "양파" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "두부" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: VEGETABLE_GROUP_LABEL }));

    expect(screen.getByTestId("ingredient-list-region")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "양파" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "두부" })).toBeNull();
    expect(vi.mocked(fetchIngredients)).toHaveBeenCalledTimes(1);
  });
});
