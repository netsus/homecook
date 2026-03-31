import { NextRequest } from "next/server";

import { ok } from "@/lib/api/response";
import {
  getMockRecipeList,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { parseRecipeSortKey } from "@/lib/recipe";
import {
  clampLimit,
  filterRecipeIdsByIngredients,
  parseIngredientIds,
} from "@/lib/recipe-list";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { RecipeCardItem, RecipeListData, RecipeListQuery } from "@/types/recipe";

interface RecipeIngredientMatchRow {
  recipe_id: string;
  ingredient_id: string;
}

function createEmptyRecipeList(): RecipeListData {
  return {
    items: [],
    next_cursor: null,
    has_next: false,
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
}): RecipeCardItem {
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
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const listQuery: RecipeListQuery = {
      q: searchParams.get("q")?.trim() || undefined,
      ingredient_ids: parseIngredientIds(searchParams.get("ingredient_ids")),
      sort: parseRecipeSortKey(searchParams.get("sort")),
      cursor: searchParams.get("cursor"),
      limit: clampLimit(searchParams.get("limit")),
    };
    const hasIngredientFilter = searchParams.has("ingredient_ids");
    const sort = listQuery.sort ?? "view_count";
    const limit = listQuery.limit ?? 20;

    if (hasIngredientFilter && listQuery.ingredient_ids?.length === 0) {
      return ok(createEmptyRecipeList());
    }

    if (isDiscoveryFilterManualMockEnabled()) {
      return ok(getMockRecipeList(listQuery.q, listQuery.ingredient_ids));
    }

    const supabase = await createRouteHandlerClient();
    let filteredRecipeIds: string[] | null = null;

    if (listQuery.ingredient_ids?.length) {
      const { data: ingredientMatches, error: ingredientError } = await supabase
        .from("recipe_ingredients")
        .select("recipe_id, ingredient_id")
        .in("ingredient_id", listQuery.ingredient_ids);

      if (ingredientError) {
        return ok(createEmptyRecipeList());
      }

      filteredRecipeIds = filterRecipeIdsByIngredients(
        (ingredientMatches ?? []) as RecipeIngredientMatchRow[],
        listQuery.ingredient_ids,
      );

      if (filteredRecipeIds.length === 0) {
        return ok(createEmptyRecipeList());
      }
    }

    let recipeQuery = supabase
      .from("recipes")
      .select(
        "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type",
      )
      .order(sort, { ascending: false })
      .order("id", { ascending: true })
      .limit(limit);

    if (filteredRecipeIds) {
      recipeQuery = recipeQuery.in("id", filteredRecipeIds);
    }

    if (listQuery.q) {
      recipeQuery = recipeQuery.ilike("title", `%${listQuery.q}%`);
    }

    const { data, error } = await recipeQuery;

    if (error) {
      return filteredRecipeIds ? ok(createEmptyRecipeList()) : ok(getMockRecipeList(listQuery.q));
    }

    const items: RecipeCardItem[] =
      data?.map((recipe) => mapRecipeCard(recipe)) ?? [];

    const response: RecipeListData =
      items.length > 0
        ? { items, next_cursor: null, has_next: false }
        : filteredRecipeIds
          ? createEmptyRecipeList()
          : getMockRecipeList(listQuery.q);

    return ok(response);
  } catch {
    const searchParams = request.nextUrl.searchParams;

    if (searchParams.has("ingredient_ids")) {
      return ok(createEmptyRecipeList());
    }

    return ok(getMockRecipeList(searchParams.get("q")));
  }
}
