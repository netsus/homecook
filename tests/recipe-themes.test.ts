import { describe, expect, it } from "vitest";

import { createRecipeThemesFromTagGroups } from "@/lib/recipe-themes";
import type { RecipeCardItem } from "@/types/recipe";

function createRecipe(overrides: Partial<RecipeCardItem> = {}): RecipeCardItem {
  return {
    id: "recipe-1",
    title: "김치찌개",
    thumbnail_url: null,
    tags: ["한식"],
    base_servings: 2,
    view_count: 10,
    like_count: 0,
    save_count: 0,
    source_type: "manual",
    user_status: null,
    ...overrides,
  };
}

describe("36c recipe tag themes", () => {
  it("creates popular plus tag-backed themes with exact tag metadata", () => {
    const popularRecipe = createRecipe({ id: "popular-recipe", view_count: 50 });
    const koreanRecipe = createRecipe({ id: "korean-recipe", title: "된장찌개" });

    const themes = createRecipeThemesFromTagGroups([popularRecipe], [
      {
        id: "korean",
        tag_key: "한식",
        tag_label: "한식",
        recipes: [koreanRecipe],
      },
      {
        id: "pending-user-tag",
        tag_key: "내메모",
        tag_label: "내메모",
        recipes: [],
      },
    ]);

    expect(themes[0]).toEqual({
      id: "popular",
      title: "이번 주 인기 레시피",
      recipes: [popularRecipe],
    });
    expect(themes).toContainEqual({
      id: "hearty-main",
      title: "밥상 든든한 메인",
      recipes: [popularRecipe],
    });
    expect(themes).toContainEqual({
      id: "korean",
      title: "한식",
      tag_key: "한식",
      tag_label: "한식",
      recipes: [koreanRecipe],
    });
    expect(themes.some((theme) => theme.id === "pending-user-tag")).toBe(false);
  });
});
