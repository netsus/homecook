import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
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
      return fail(
        "INTERNAL_ERROR",
        "레시피 목록을 불러오지 못했어요.",
        500,
      );
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

    const response: RecipeListData = {
      items,
      next_cursor: null,
      has_next: false,
    };

    return ok(response);
  } catch (error) {
    return fail(
      "CONFIG_MISSING",
      error instanceof Error ? error.message : "Supabase 설정이 필요합니다.",
      500,
    );
  }
}
