// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { fetchPantryMatchRecipes } from "@/lib/api/recipe";

vi.mock("@/lib/api/recipe", () => ({
  fetchPantryMatchRecipes: vi.fn(),
}));

describe("PantryMatchPicker", () => {
  beforeEach(() => {
    vi.mocked(fetchPantryMatchRecipes).mockReset();
    vi.mocked(fetchPantryMatchRecipes).mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: "recipe-1",
            title: "두부조림",
            thumbnail_url: null,
            matched_ingredients: 2,
            total_ingredients: 4,
            match_score: 0.5,
            missing_ingredients: [
              { id: "ing-1", standard_name: "간장" },
              { id: "ing-2", standard_name: "고춧가루" },
            ],
          },
        ],
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps missing ingredient label and chips aligned in the mobile picker", async () => {
    render(
      <PantryMatchPicker
        isCreating={false}
        onClose={vi.fn()}
        onRecipeSelect={vi.fn()}
        onServingsCancel={vi.fn()}
        onServingsConfirm={vi.fn()}
        presentation="screen"
        selectedRecipe={null}
      />,
    );

    await screen.findByText("두부조림");

    const row = screen.getByTestId("pantry-missing-ingredients-row-recipe-1");
    expect(row.className).toContain("items-center");
    expect(row.textContent).toContain("부족");
    expect(row.textContent).toContain("간장");
    expect(row.textContent).toContain("고춧가루");
  });
});
