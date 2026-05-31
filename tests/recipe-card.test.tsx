// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeCard } from "@/components/home/recipe-card";
import { MOCK_RECIPE_CARD } from "@/lib/mock/recipes";
import type { RecipeCardItem } from "@/types/recipe";

describe("recipe card", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders title, web-parity meta row, and tag pills in prototype parity layout", () => {
    render(<RecipeCard recipe={MOCK_RECIPE_CARD} />);

    const title = screen.getByRole("heading", { name: MOCK_RECIPE_CARD.title });
    const titleLink = title.closest("a");

    expect(titleLink).not.toBeNull();

    // Title is rendered as h3
    expect(title.tagName).toBe("H3");

    // Meta row matches the web card: views and saves, without servings.
    expect(screen.getByTestId("recipe-card-bookmark")).toBeTruthy();
    expect(screen.getByText(new RegExp(`조회`))).toBeTruthy();
    expect(screen.getByText(new RegExp(`저장`))).toBeTruthy();
    expect(screen.queryByText(new RegExp(`기본 ${MOCK_RECIPE_CARD.base_servings}인`))).toBeNull();

    // Tags are rendered as pills
    expect(screen.getByText(MOCK_RECIPE_CARD.tags[0])).toBeTruthy();
  });

  it("renders the popular badge without the old red MVP badge treatment", () => {
    render(
      <RecipeCard
        recipe={{
          ...MOCK_RECIPE_CARD,
          save_count: 150,
          thumbnail_url: null,
        }}
      />,
    );

    expect(screen.getByText("인기")).toBeTruthy();
    expect(screen.getAllByTestId("recipe-card-bookmark")).toHaveLength(1);
  });

  it("calls the card save action without navigating the detail link", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();

    render(<RecipeCard onSave={onSave} recipe={MOCK_RECIPE_CARD} />);

    await user.click(
      screen.getByRole("button", { name: `${MOCK_RECIPE_CARD.title} 저장` }),
    );

    expect(onSave).toHaveBeenCalledWith(MOCK_RECIPE_CARD);
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

  it("centers source badge text inside the badge container", () => {
    render(
      <RecipeCard
        recipe={{
          ...MOCK_RECIPE_CARD,
          source_type: "manual",
          save_count: 50,
        }}
      />,
    );

    const badge = screen.getByText("직접 등록");

    expect(badge.className).toContain("inline-flex");
    expect(badge.className).toContain("items-center");
    expect(badge.className).toContain("justify-center");
  });

  it("adds the same pressed visual affordance as the web card", () => {
    const { container } = render(<RecipeCard recipe={MOCK_RECIPE_CARD} />);
    const card = container.querySelector("article");
    const imageLayer = container.querySelector("[data-slot='recipe-card-image-layer']");

    expect(card?.className).toContain("active:scale-[0.99]");
    expect(imageLayer?.className).toContain("group-hover:scale-105");
    expect(imageLayer?.className).toContain("group-active:scale-105");
  });
});
