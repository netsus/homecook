import { describe, expect, it } from "vitest";

import {
  createRecipeThemes,
  selectHeartyMainThemeRecipes,
  selectNoFlameApplianceRecipeIds,
} from "@/lib/recipe-themes";
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
  it("creates explicit home themes without ambiguous popularity or fail-safe sections", () => {
    const recentPlannerRecipe = createRecipe({ id: "planner-recipe", view_count: 50 });
    const pantryRecipe = createRecipe({ id: "pantry-recipe", title: "팬트리 재료 김치찌개" });
    const youtubeRecipe = createRecipe({ id: "youtube-recipe", source_type: "youtube", title: "영상 레시피" });
    const noFlameRecipe = createRecipe({ id: "no-flame-recipe", title: "전자레인지 계란찜" });
    const sideDishTaggedRecipe = createRecipe({
      id: "side-dish-main-candidate",
      title: "단호박소고기롤",
      tags: ["한식", "밑반찬", "고단백"],
    });
    const heartyMainRecipe = createRecipe({
      id: "hearty-main-recipe",
      title: "연어오븐구이",
      tags: ["한그릇요리", "고단백"],
    });
    const koreanRecipe = createRecipe({ id: "korean-recipe", title: "된장찌개" });

    const themes = createRecipeThemes({
      recentPlannerItems: [recentPlannerRecipe],
      pantryItems: [pantryRecipe],
      youtubeItems: [youtubeRecipe],
      noFlameItems: [noFlameRecipe],
      heartyMainItems: selectHeartyMainThemeRecipes([
        sideDishTaggedRecipe,
        heartyMainRecipe,
      ]),
      tagGroups: [{
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
      }],
    });

    expect(themes.map((theme) => theme.title)).toEqual([
      "요즘 플래너에 많이 담은 메뉴",
      "냉장고 비우는 한 끼",
      "유튜브에서 가져온 레시피",
      "불 없이 만드는 요리",
      "밥상 든든한 메인",
      "한식",
    ]);
    expect(themes.some((theme) => theme.title === "조회 많은 레시피")).toBe(false);
    expect(themes.some((theme) => theme.title === "실패 걱정 없는 메뉴")).toBe(false);
    expect(themes.some((theme) => theme.title === "불 없이 달달하게")).toBe(false);
    expect(themes.find((theme) => theme.id === "hearty-main")?.recipes).toEqual([
      heartyMainRecipe,
    ]);
    expect(themes).toContainEqual({
      id: "korean",
      title: "한식",
      tag_key: "한식",
      tag_label: "한식",
      recipes: [koreanRecipe],
    });
    expect(themes.some((theme) => theme.id === "pending-user-tag")).toBe(false);
    expect(themes.some((theme) => theme.id === "saved-favorites")).toBe(false);
  });

  it("selects no-flame appliance recipes only when every method avoids stovetop heat and at least one appliance is used", () => {
    const recipeIds = selectNoFlameApplianceRecipeIds([
      { recipe_id: "oven-only", method_code: "slice" },
      { recipe_id: "oven-only", method_code: "oven_bake" },
      { recipe_id: "microwave-only", method_code: "mix" },
      { recipe_id: "microwave-only", method_code: "microwave" },
      { recipe_id: "mixed-flame", method_code: "oven_bake" },
      { recipe_id: "mixed-flame", method_code: "stir_fry" },
      { recipe_id: "raw-only", method_code: "mix" },
    ]);

    expect(recipeIds).toEqual(["oven-only", "microwave-only"]);
  });
});
