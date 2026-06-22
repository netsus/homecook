// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import type { RecipeBookSummary } from "@/types/recipe";

const fetchRecipeBooks = vi.fn();

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipeBooks: (...args: unknown[]) => fetchRecipeBooks(...args),
}));

const BOOKS: RecipeBookSummary[] = [
  {
    book_type: "custom",
    cover_color_key: "sand",
    cover_image_url: "https://example.com/weekend-cover.jpg",
    id: "book-custom",
    name: "주말 파티",
    recipe_count: 4,
    sort_order: 4,
  },
  {
    book_type: "saved",
    cover_color_key: null,
    cover_image_url: null,
    id: "book-saved",
    name: "저장한 레시피",
    recipe_count: 0,
    sort_order: 1,
  },
];

function mockRecipeBooks(books: RecipeBookSummary[] = BOOKS) {
  fetchRecipeBooks.mockResolvedValue({
    success: true,
    data: { books },
    error: null,
  });
}

describe("RecipeBookSelector", () => {
  beforeEach(() => {
    fetchRecipeBooks.mockReset();
    mockRecipeBooks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders web recipebooks as book-shaped cards with shared cover color and image rules", async () => {
    const onBookSelect = vi.fn();

    render(
      <RecipeBookSelector
        onBookSelect={onBookSelect}
        onClose={vi.fn()}
        presentation="web"
      />,
    );

    const grid = await screen.findByTestId("recipebook-selector-web-grid");
    const customCard = within(grid).getByTestId("recipebook-selector-web-book-book-custom");
    const customCover = within(customCard).getByTestId(
      "recipebook-selector-web-cover-image-book-custom",
    );
    const savedCard = within(grid).getByTestId("recipebook-selector-web-book-book-saved");
    const savedCover = within(savedCard).getByTestId(
      "recipebook-selector-web-cover-image-book-saved",
    );

    expect(customCard.className).toContain("web-recipebook-book-card");
    expect(customCard.className).toContain("web-recipebook-book-card-sand");
    expect(customCover.getAttribute("style")).toContain(
      'background-image: url("https://example.com/weekend-cover.jpg")',
    );
    expect(savedCard.className).toContain("web-recipebook-book-card-sky");
    expect(savedCover.getAttribute("style")).toContain("background-image: url(");
    expect(customCard.textContent).not.toContain("🍳");

    await userEvent.click(customCard);

    expect(onBookSelect).toHaveBeenCalledWith(BOOKS[0]);
  });

  it("keeps sheet recipebooks as efficient rows but replaces temporary emoji with compact book covers", async () => {
    render(
      <RecipeBookSelector
        onBookSelect={vi.fn()}
        onClose={vi.fn()}
        presentation="sheet"
      />,
    );

    const customRow = await screen.findByTestId("recipebook-selector-row-book-custom");
    const customMiniCover = within(customRow).getByTestId(
      "recipebook-selector-mini-cover-book-custom",
    );
    const customMiniImage = within(customMiniCover).getByTestId(
      "recipebook-selector-mini-cover-image-book-custom",
    );
    const savedRow = screen.getByTestId("recipebook-selector-row-book-saved");
    const savedMiniCover = within(savedRow).getByTestId(
      "recipebook-selector-mini-cover-book-saved",
    );

    expect(customRow.tagName).toBe("BUTTON");
    expect(customMiniCover.className).toContain("planner-recipebook-mini-cover");
    expect(customMiniCover.className).toContain("mobile-recipebook-book-card-sand");
    expect(customMiniImage.getAttribute("style")).toContain(
      'background-image: url("https://example.com/weekend-cover.jpg")',
    );
    expect(savedMiniCover.className).toContain("mobile-recipebook-book-card-sky");
    expect(customRow.textContent).not.toContain("🍳");
  });

  it("shows app screen recipebook rows with cover image and cover-tone color", async () => {
    render(
      <RecipeBookSelector
        onBookSelect={vi.fn()}
        onClose={vi.fn()}
        presentation="screen"
        slotLabel="4/18 아침"
      />,
    );

    const customRow = await screen.findByTestId("recipebook-selector-row-book-custom");
    const customMiniCover = within(customRow).getByTestId(
      "recipebook-selector-mini-cover-book-custom",
    );
    const customMiniImage = within(customMiniCover).getByTestId(
      "recipebook-selector-mini-cover-image-book-custom",
    );
    const savedRow = screen.getByTestId("recipebook-selector-row-book-saved");

    expect(screen.getByRole("heading", { name: "레시피북에서 추가" })).toBeTruthy();
    expect(screen.getByText("4/18 아침")).toBeTruthy();
    expect(customRow.className).toContain("planner-recipebook-selector-row");
    expect(customRow.className).toContain("planner-recipebook-selector-row-sand");
    expect(customMiniCover.className).toContain("mobile-recipebook-book-card-sand");
    expect(customMiniImage.getAttribute("style")).toContain(
      'background-image: url("https://example.com/weekend-cover.jpg")',
    );
    expect(savedRow.className).toContain("planner-recipebook-selector-row-sky");
  });

  it("uses the same covered recipebook rows in the default dialog flow", async () => {
    render(
      <RecipeBookSelector
        onBookSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "레시피북 선택" });
    const customRow = await within(dialog).findByTestId("recipebook-selector-row-book-custom");
    const customMiniCover = within(customRow).getByTestId(
      "recipebook-selector-mini-cover-book-custom",
    );
    const customMiniImage = within(customMiniCover).getByTestId(
      "recipebook-selector-mini-cover-image-book-custom",
    );

    expect(customRow.className).toContain("planner-recipebook-selector-row");
    expect(customRow.className).toContain("planner-recipebook-selector-row-sand");
    expect(customMiniCover.className).toContain("planner-recipebook-mini-cover");
    expect(customMiniImage.getAttribute("style")).toContain(
      'background-image: url("https://example.com/weekend-cover.jpg")',
    );
    expect(customRow.textContent).not.toContain("🍳");
  });

  it("shows the web empty state when no recipebooks are available", async () => {
    mockRecipeBooks([]);

    render(
      <RecipeBookSelector
        onBookSelect={vi.fn()}
        onClose={vi.fn()}
        presentation="web"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("레시피북이 없어요")).toBeTruthy();
    });
  });
});
