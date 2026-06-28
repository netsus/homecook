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
      title: "조회 많은 레시피",
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
    expect(themes.some((theme) => theme.id === "saved-favorites")).toBe(false);
    expect(themes.some((theme) => theme.title === "실패 걱정 없는 메뉴")).toBe(false);
    expect(themes.some((theme) => theme.title === "불 없이 달달하게")).toBe(false);
  });

  it("only creates curated themes that can be inferred from card fields", () => {
    const themes = createRecipeThemesFromTagGroups([
      createRecipe({ id: "simple", title: "실패 없는 기본 달걀찜", tags: ["초간단"] }),
      createRecipe({ id: "main", title: "닭고기 메인 반찬", tags: ["든든한"] }),
      createRecipe({ id: "dessert", title: "불 없이 딸기 우유 푸딩", tags: ["디저트"] }),
      createRecipe({ id: "leftover", title: "냉털 볶음밥", tags: ["냉장고"] }),
      createRecipe({ id: "youtube", source_type: "youtube", title: "영상 레시피" }),
    ], []);

    expect(themes.map((theme) => theme.title)).toEqual([
      "조회 많은 레시피",
      "유튜브에서 가져온 레시피",
      "냉장고 비우는 한 끼",
      "실패 걱정 없는 메뉴",
      "밥상 든든한 메인",
      "불 없이 달달하게",
    ]);
  });
});
