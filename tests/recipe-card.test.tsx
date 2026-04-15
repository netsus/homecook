// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeCard } from "@/components/home/recipe-card";
import { MOCK_RECIPE_CARD } from "@/lib/mock/recipes";

describe("recipe card", () => {
  it("moves tags above the title and keeps servings beside the recipe name", () => {
    const { container } = render(<RecipeCard recipe={MOCK_RECIPE_CARD} />);

    const title = screen.getByRole("heading", { name: MOCK_RECIPE_CARD.title });
    const card = title.closest("a");

    expect(card).not.toBeNull();

    const titleRow = container.querySelector(".recipe-card-title-row");
    const statsRow = container.querySelector(".recipe-card-stats-pills");
    const tagRow = container.querySelector(".recipe-card-tags-heading");

    expect(titleRow).not.toBeNull();
    expect(statsRow).not.toBeNull();
    expect(tagRow).not.toBeNull();

    expect(
      (tagRow as HTMLElement).compareDocumentPosition(titleRow as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const titleScope = within(titleRow as HTMLElement);
    expect(titleScope.getByText(`기본 ${MOCK_RECIPE_CARD.base_servings}인분`)).toBeTruthy();

    const statsScope = within(statsRow as HTMLElement);
    expect(statsScope.getByText("조회")).toBeTruthy();
    expect(statsScope.getByText("좋아요")).toBeTruthy();
    expect(statsScope.getByText("저장")).toBeTruthy();

    const tagScope = within(tagRow as HTMLElement);
    expect(tagScope.getByText(`#${MOCK_RECIPE_CARD.tags[0]}`)).toBeTruthy();
  });
});
