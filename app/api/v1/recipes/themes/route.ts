import { ok } from "@/lib/api/response";
import {
  getMockRecipeThemes,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { createRecipeThemesFromCards } from "@/lib/recipe-themes";
import {
  readRecipeCardUserStatuses,
  type RecipeCardUserStatusDbClient,
} from "@/lib/server/recipe-card-user-status";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeCardItem, RecipeThemesData } from "@/types/recipe";

function createThemeResponse(items: RecipeCardItem[]): RecipeThemesData {
  return {
    themes: createRecipeThemesFromCards(
      items.length ? items : getMockRecipeThemes().themes[0].recipes,
    ),
  };
}

export async function GET() {
  if (isDiscoveryFilterManualMockEnabled()) {
    return ok(getMockRecipeThemes());
  }

  try {
    const routeClient = await createRouteHandlerClient();
    const supabase = createServiceRoleClient() ?? routeClient;
    const { data, error } = await supabase
      .from("recipes")
      .select(
        "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type",
      )
      .order("view_count", { ascending: false })
      .order("id", { ascending: true })
      .limit(60);

    if (error) {
      return ok(getMockRecipeThemes());
    }

    const rows = data ?? [];
    let userId: string | null = null;

    try {
      const authResult = typeof routeClient.auth?.getUser === "function"
        ? await routeClient.auth.getUser()
        : { data: { user: null } };
      userId = authResult.data.user?.id ?? null;
    } catch {
      userId = null;
    }

    const userStatusByRecipeId = await readRecipeCardUserStatuses({
      dbClient: supabase as unknown as RecipeCardUserStatusDbClient,
      recipeIds: rows.map((recipe) => recipe.id),
      userId,
    });
    const items: RecipeCardItem[] =
      rows.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        thumbnail_url: recipe.thumbnail_url,
        tags: recipe.tags ?? [],
        base_servings: recipe.base_servings,
        view_count: recipe.view_count,
        like_count: recipe.like_count,
        save_count: recipe.save_count,
        source_type: recipe.source_type,
        user_status: userStatusByRecipeId.get(recipe.id) ?? null,
      })) ?? [];

    return ok(createThemeResponse(items));
  } catch {
    return ok(getMockRecipeThemes());
  }
}
