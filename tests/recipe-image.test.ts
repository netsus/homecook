import { describe, expect, it } from "vitest";

import { resolveRecipeImage } from "@/lib/recipe-image";

describe("recipe image resolver", () => {
  it("uses recipes.thumbnail_url when the recipe has a stored image", () => {
    expect(
      resolveRecipeImage({
        id: "recipe-with-thumbnail",
        thumbnail_url: "https://cdn.example.com/recipe.webp",
      }),
    ).toBe("https://cdn.example.com/recipe.webp");
  });

  it("returns the same fallback image for the same recipe id across surfaces", () => {
    const first = resolveRecipeImage({
      id: "recipe-without-thumbnail",
      thumbnail_url: null,
    });
    const second = resolveRecipeImage({
      id: "recipe-without-thumbnail",
      thumbnail_url: null,
    });
    const otherRecipe = resolveRecipeImage({
      id: "another-recipe-without-thumbnail",
      thumbnail_url: null,
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^https:\/\//);
    expect(otherRecipe).toMatch(/^https:\/\//);
  });

  it("falls back from recipe_id when the item does not expose id", () => {
    expect(
      resolveRecipeImage({
        recipe_id: "book-recipe",
        thumbnail_url: null,
      }),
    ).toBe(
      resolveRecipeImage({
        recipe_id: "book-recipe",
        thumbnail_url: "   ",
      }),
    );
  });
});
