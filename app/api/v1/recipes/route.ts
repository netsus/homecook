import { NextRequest } from "next/server";

import { ok } from "@/lib/api/response";
import { getMockRecipeList } from "@/lib/mock/recipes";
import { parseRecipeSortKey } from "@/lib/recipe";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { RecipeCardItem, RecipeListData } from "@/types/recipe";

function clampLimit(value: string | null) {
  if (!value) {
    return 20;
  }

  const parsed = Number(value);

  if (Number.isNaN(parsed)) {
    return 20;
  }

  return Math.min(Math.max(parsed, 1), 40);
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createRouteHandlerClient();
    const searchParams = request.nextUrl.searchParams;
    const sort = parseRecipeSortKey(searchParams.get("sort"));
    const q = searchParams.get("q")?.trim();
    const limit = clampLimit(searchParams.get("limit"));

    let query = supabase
      .from("recipes")
      .select(
        "id, title, thumbnail_url, tags, base_servings, view_count, like_count, save_count, source_type",
      )
      .order(sort, { ascending: false })
      .order("id", { ascending: true })
      .limit(limit);

    if (q) {
      query = query.ilike("title", `%${q}%`);
    }

    const { data, error } = await query;

    if (error) {
      return ok(getMockRecipeList(q));
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

    const response: RecipeListData =
      items.length > 0 ? { items, next_cursor: null, has_next: false } : getMockRecipeList(q);

    return ok(response);
  } catch {
    return ok(getMockRecipeList(request.nextUrl.searchParams.get("q")));
  }
}
