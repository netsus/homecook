// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeCard } from "@/components/home/recipe-card";
import { MOCK_RECIPE_CARD } from "@/lib/mock/recipes";

describe("recipe card", () => {
  it("keeps discovery stats in a compact metadata row", () => {
    const { container } = render(<RecipeCard recipe={MOCK_RECIPE_CARD} />);

    const title = screen.getByRole("heading", { name: MOCK_RECIPE_CARD.title });
    const card = title.closest("a");

    expect(card).not.toBeNull();

    const metadataRow = container.querySelector(".recipe-card-meta-compact");
    expect(metadataRow).not.toBeNull();

    const rowScope = within(metadataRow as HTMLElement);
    expect(rowScope.getByText("조회")).toBeTruthy();
    expect(rowScope.getByText("좋아요")).toBeTruthy();
    expect(rowScope.getByText("저장")).toBeTruthy();
  });
});
