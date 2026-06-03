// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("keeps owned count and missing ingredient chips in the same mobile row", async () => {
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

    const row = screen.getByTestId("pantry-ingredient-summary-row-recipe-1");
    expect(row.textContent).toContain("2/4개 보유");
    expect(row.textContent).toContain("간장");
    expect(row.textContent).toContain("고춧가루");
    expect(row.textContent).not.toContain("부족 ·");
  });

  it("moves the percentage inside a thicker mobile progress bar", async () => {
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

    const progress = screen.getByTestId("pantry-match-progress-recipe-1");
    expect(progress.className).toContain("h-5");
    expect(within(progress).getByText("50%")).toBeTruthy();
    expect(screen.queryByText("매칭 50%")).toBeNull();
  });

  it("uses brand tone instead of success green for high desktop web matches", async () => {
    vi.mocked(fetchPantryMatchRecipes).mockResolvedValueOnce({
      success: true,
      data: {
        items: [
          {
            id: "recipe-brand",
            title: "닭갈비",
            thumbnail_url: null,
            matched_ingredients: 9,
            total_ingredients: 10,
            match_score: 0.9,
            missing_ingredients: [],
          },
        ],
      },
      error: null,
    });

    render(
      <PantryMatchPicker
        isCreating={false}
        onClose={vi.fn()}
        onRecipeSelect={vi.fn()}
        onServingsCancel={vi.fn()}
        onServingsConfirm={vi.fn()}
        presentation="web"
        selectedRecipe={null}
      />,
    );

    await screen.findByText("닭갈비");

    const progress = screen.getByTestId("pantry-match-progress-recipe-brand");
    const progressFill = progress.querySelector(".web-picker-progress-fill");

    expect(within(progress).getByText("90%")).toBeTruthy();
    expect(progress.className).toContain("web-picker-progress-brand");
    expect(progress.className).not.toContain("web-picker-progress-success");
    expect(progressFill?.className).toContain("web-picker-progress-brand");
    expect(progressFill?.className).not.toContain("web-picker-progress-success");
  });

  it("uses the same brand, warning, and danger score tones on mobile pantry recommendations", async () => {
    vi.mocked(fetchPantryMatchRecipes).mockResolvedValueOnce({
      success: true,
      data: {
        items: [
          {
            id: "recipe-high",
            title: "고일치 레시피",
            thumbnail_url: null,
            matched_ingredients: 9,
            total_ingredients: 10,
            match_score: 0.9,
            missing_ingredients: [],
          },
          {
            id: "recipe-mid",
            title: "중간일치 레시피",
            thumbnail_url: null,
            matched_ingredients: 6,
            total_ingredients: 10,
            match_score: 0.6,
            missing_ingredients: [],
          },
          {
            id: "recipe-low",
            title: "낮은일치 레시피",
            thumbnail_url: null,
            matched_ingredients: 2,
            total_ingredients: 10,
            match_score: 0.2,
            missing_ingredients: [],
          },
        ],
      },
      error: null,
    });

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

    await screen.findByText("고일치 레시피");

    expect(screen.getByTestId("pantry-match-progress-recipe-high").className).toContain(
      "pantry-match-progress-brand",
    );
    expect(screen.getByTestId("pantry-match-progress-recipe-mid").className).toContain(
      "pantry-match-progress-warning",
    );
    expect(screen.getByTestId("pantry-match-progress-recipe-low").className).toContain(
      "pantry-match-progress-danger",
    );
    expect(screen.queryByText("선택")).toBeNull();
  });

  it("marks web pantry recommendation thumbnails with a rounded image class", async () => {
    const { container } = render(
      <PantryMatchPicker
        isCreating={false}
        onClose={vi.fn()}
        onRecipeSelect={vi.fn()}
        onServingsCancel={vi.fn()}
        onServingsConfirm={vi.fn()}
        presentation="web"
        selectedRecipe={null}
      />,
    );

    await screen.findByText("두부조림");

    const image = container.querySelector(".web-picker-pantry-thumb img");
    expect(image?.className).toContain("web-picker-pantry-thumb-image");
  });
});
