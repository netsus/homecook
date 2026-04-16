// @vitest-environment jsdom

import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RecipeCard } from "@/components/home/recipe-card";
import { MOCK_RECIPE_CARD } from "@/lib/mock/recipes";
import type { RecipeCardItem } from "@/types/recipe";

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
    const servingsBadge = titleScope.getByText(
      `기본 ${MOCK_RECIPE_CARD.base_servings}인분`,
    );

    expect(servingsBadge).toBeTruthy();
    expect(servingsBadge.className).toContain("bg-[color:rgba(255,108,60,0.08)]");
    expect(servingsBadge.className).toContain("text-[#c84316]");
    expect(servingsBadge.className).toContain("border-[color:rgba(255,108,60,0.14)]");

    const statsScope = within(statsRow as HTMLElement);
    expect(statsScope.getByText("조회")).toBeTruthy();
    expect(statsScope.getByText("좋아요")).toBeTruthy();
    expect(statsScope.getByText("저장")).toBeTruthy();

    const tagScope = within(tagRow as HTMLElement);
    expect(tagScope.getByText(`#${MOCK_RECIPE_CARD.tags[0]}`)).toBeTruthy();
  });

  it("renders source badges with localized Korean labels instead of raw enums", () => {
    const variants: RecipeCardItem[] = [
      {
        ...MOCK_RECIPE_CARD,
        id: "recipe-system",
        source_type: "system",
      },
      {
        ...MOCK_RECIPE_CARD,
        id: "recipe-youtube",
        source_type: "youtube",
      },
      {
        ...MOCK_RECIPE_CARD,
        id: "recipe-manual",
        source_type: "manual",
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
