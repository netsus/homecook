// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeCard } from "@/components/home/recipe-card";
import { MOCK_RECIPE_CARD } from "@/lib/mock/recipes";
import type { RecipeCardItem } from "@/types/recipe";

describe("recipe card", () => {
  it("renders title, meta row, and tag pills in prototype parity layout", () => {
    render(<RecipeCard recipe={MOCK_RECIPE_CARD} />);

    const title = screen.getByRole("heading", { name: MOCK_RECIPE_CARD.title });
    const card = title.closest("a");

    expect(card).not.toBeNull();

    // Title is rendered as h3
    expect(title.tagName).toBe("H3");

    // Meta row contains servings info
    const cardScope = within(card as HTMLElement);
    expect(
      cardScope.getByText(
        new RegExp(`기본 ${MOCK_RECIPE_CARD.base_servings}인`),
      ),
    ).toBeTruthy();

    // Tags are rendered as pills
    expect(cardScope.getByText(MOCK_RECIPE_CARD.tags[0])).toBeTruthy();
  });

  it("renders source badges with localized Korean labels instead of raw enums", () => {
    const variants: RecipeCardItem[] = [
      {
        ...MOCK_RECIPE_CARD,
        id: "recipe-system",
        source_type: "system",
        save_count: 50, // below threshold so source badge shows
      },
      {
        ...MOCK_RECIPE_CARD,
        id: "recipe-youtube",
        source_type: "youtube",
        save_count: 50,
      },
      {
        ...MOCK_RECIPE_CARD,
        id: "recipe-manual",
        source_type: "manual",
        save_count: 50,
      },
    ];

    const { container, rerender } = render(<RecipeCard recipe={variants[0]} />);
    let cardScope = within(container.firstElementChild as HTMLElement);
    expect(cardScope.getByText("집밥 추천")).toBeTruthy();
    expect(cardScope.queryByText(/^system$/i)).toBeNull();

    rerender(<RecipeCard recipe={variants[1]} />);
    cardScope = within(container.firstElementChild as HTMLElement);
    expect(cardScope.getByText("유튜브")).toBeTruthy();
    expect(cardScope.queryByText(/^youtube$/i)).toBeNull();

    rerender(<RecipeCard recipe={variants[2]} />);
    cardScope = within(container.firstElementChild as HTMLElement);
    expect(cardScope.getByText("직접 등록")).toBeTruthy();
    expect(cardScope.queryByText(/^manual$/i)).toBeNull();
  });
});
