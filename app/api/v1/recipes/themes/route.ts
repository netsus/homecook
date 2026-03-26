import { ok } from "@/lib/api/response";
import {
  getMockRecipeThemes,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { RecipeCardItem, RecipeThemesData } from "@/types/recipe";

function createThemeResponse(items: RecipeCardItem[]): RecipeThemesData {
  return {
    themes: [
      {
        id: "popular",
        title: "이번 주 인기 레시피",
        recipes: items.length ? items : getMockRecipeThemes().themes[0].recipes,
      },
    ],
  };
}

export async function GET() {
  if (isDiscoveryFilterManualMockEnabled()) {
    return ok(getMockRecipeThemes());
  }

  try {
    const supabase = await createRouteHandlerClient();
    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type",
      )
      .order("view_count", { ascending: false })
      .order("id", { ascending: true })
      .limit(10);

    if (error) {
      return ok(getMockRecipeThemes());
    }

    const items: RecipeCardItem[] =
      data?.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        thumbnail_url: recipe.thumbnail_url,
        tags: recipe.tags ?? [],
        base_servings: recipe.base_servings,
        view_count: recipe.view_count,
        like_count: recipe.like_count,
        save_count: recipe.save_count,
        source_type: recipe.source_type,
      })) ?? [];

    return ok(createThemeResponse(items));
  } catch {
    return ok(getMockRecipeThemes());
  }
}
