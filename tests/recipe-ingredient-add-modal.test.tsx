// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeIngredientAddModal } from "@/components/recipe/recipe-ingredient-add-modal";
import { fetchIngredients } from "@/lib/api/ingredients";

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

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
          { id: "ing-onion", standard_name: "양파", category: "채소" },
          { id: "ing-tofu", standard_name: "두부", category: "콩/두부" },
        ],
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders ingredient options as content-sized multi-select chips and adds them only after done", async () => {
    const onAdd = vi.fn();
    const user = userEvent.setup();

    render(<RecipeIngredientAddModal onAdd={onAdd} onClose={vi.fn()} />);

    const onionChip = await screen.findByRole("button", { name: "양파" });
    const tofuChip = screen.getByRole("button", { name: "두부" });

    expect(onionChip.className).toContain("inline-flex");
    expect(onionChip.className).not.toContain("w-full");

    await user.click(onionChip);
    await user.click(tofuChip);

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
});
