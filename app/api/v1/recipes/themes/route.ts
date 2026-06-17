import { ok } from "@/lib/api/response";
import {
  getMockRecipeThemes,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { createRecipeThemesFromTagGroups, type RecipeTagThemeGroup } from "@/lib/recipe-themes";
import {
  readRecipeCardUserStatuses,
  type RecipeCardUserStatusDbClient,
} from "@/lib/server/recipe-card-user-status";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeCardItem, RecipeThemesData } from "@/types/recipe";

interface ThemeRecipeRow {
  tag_normalized_key: string;
  tag_label: string;
  tag_slug: string | null;
  theme_rank: number;
  recipe_rank: number;
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}

interface ThemeDbClient extends RecipeCardUserStatusDbClient {
  rpc(
    functionName: "list_home_theme_recipes",
    args: {
      p_tag_limit: number;
      p_recipes_per_tag: number;
    },
  ): PromiseLike<{
    data: ThemeRecipeRow[] | null;
    error: { message: string } | null;
  }>;
}

function createThemeResponse(
  popularItems: RecipeCardItem[],
  tagGroups: RecipeTagThemeGroup[],
): RecipeThemesData {
  return {
    themes: createRecipeThemesFromTagGroups(
      popularItems.length ? popularItems : getMockRecipeThemes().themes[0].recipes,
      tagGroups,
    ),
  };
}

function mapRecipeCard(recipe: {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}, userStatus?: RecipeCardItem["user_status"]): RecipeCardItem {
  return {
    id: recipe.id,
    title: recipe.title,
    thumbnail_url: recipe.thumbnail_url,
    tags: recipe.tags ?? [],
    base_servings: recipe.base_servings,
    view_count: recipe.view_count,
    like_count: recipe.like_count,
    save_count: recipe.save_count,
    source_type: recipe.source_type,
    user_status: userStatus ?? null,
  };
}

function createTagGroups(
  rows: ThemeRecipeRow[],
  userStatusByRecipeId: Map<string, RecipeCardItem["user_status"]>,
) {
  const groupsByKey = new Map<string, RecipeTagThemeGroup>();

  rows
    .slice()
    .sort((left, right) => {
      if (left.theme_rank !== right.theme_rank) {
        return left.theme_rank - right.theme_rank;
      }

      if (left.recipe_rank !== right.recipe_rank) {
        return left.recipe_rank - right.recipe_rank;
      }

      return left.id.localeCompare(right.id);
    })
    .forEach((row) => {
      const group = groupsByKey.get(row.tag_normalized_key) ?? {
        id: row.tag_slug || row.tag_normalized_key,
        tag_key: row.tag_normalized_key,
        tag_label: row.tag_label,
        recipes: [],
      };

      group.recipes.push(mapRecipeCard(
        row,
        userStatusByRecipeId.get(row.id) ?? null,
      ));
      groupsByKey.set(row.tag_normalized_key, group);
    });

  return Array.from(groupsByKey.values());
}

export async function GET() {
  if (isDiscoveryFilterManualMockEnabled()) {
    return ok(getMockRecipeThemes());
  }

  try {
    const routeClient = await createRouteHandlerClient();
    const supabase = createServiceRoleClient() ?? routeClient;
    const themeDbClient = supabase as unknown as ThemeDbClient;
    const [{ data, error }, themeRowsResult] = await Promise.all([
      supabase
      .from("recipes")
      .select(
        "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type",
      )
      .order("view_count", { ascending: false })
      .order("id", { ascending: true })
        .limit(60),
      themeDbClient.rpc("list_home_theme_recipes", {
        p_tag_limit: 8,
        p_recipes_per_tag: 10,
      }),
    ]);

    if (error) {
      return ok(getMockRecipeThemes());
    }

    const rows = data ?? [];
    const themeRows = themeRowsResult.error ? [] : (themeRowsResult.data ?? []);
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
      recipeIds: [
        ...rows.map((recipe) => recipe.id),
        ...themeRows.map((recipe) => recipe.id),
      ],
      userId,
    });
    const items: RecipeCardItem[] =
      rows.map((recipe) => mapRecipeCard(
        recipe,
        userStatusByRecipeId.get(recipe.id) ?? null,
      )) ?? [];

    return ok(createThemeResponse(
      items,
      createTagGroups(themeRows, userStatusByRecipeId),
    ));
  } catch {
    return ok(getMockRecipeThemes());
  }
}
