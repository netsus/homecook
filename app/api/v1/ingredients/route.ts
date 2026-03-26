import { NextRequest } from "next/server";

import { ok } from "@/lib/api/response";
import {
  getMockIngredientList,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { IngredientItem, IngredientListData, IngredientListQuery } from "@/types/recipe";

interface IngredientRow {
  id: string;
  standard_name: string;
  category: string;
}

interface IngredientSynonymRow {
  ingredient_id: string;
  ingredients:
    | IngredientRow
    | IngredientRow[]
    | null;
}

function normalizeIngredientRow(row: IngredientRow | null | undefined) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    standard_name: row.standard_name,
    category: row.category,
  } satisfies IngredientItem;
}

function normalizeSynonymIngredient(row: IngredientSynonymRow) {
  const ingredient = Array.isArray(row.ingredients) ? row.ingredients[0] : row.ingredients;

  return normalizeIngredientRow(ingredient ?? null);
}

function mergeIngredientItems(
  directItems: IngredientItem[],
  synonymItems: IngredientItem[],
) {
  const merged = new Map<string, IngredientItem>();

  for (const item of [...directItems, ...synonymItems]) {
    if (!merged.has(item.id)) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values());
}

function createEmptyIngredientList(): IngredientListData {
  return {
    items: [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query: IngredientListQuery = {
      q: searchParams.get("q")?.trim() || undefined,
      category: searchParams.get("category")?.trim() || undefined,
    };

    if (isDiscoveryFilterManualMockEnabled()) {
      return ok(getMockIngredientList(query.q, query.category));
    }

    const supabase = await createRouteHandlerClient();

    let ingredientsQuery = supabase
      .from("ingredients")
      .select("id, standard_name, category")
      .order("standard_name", { ascending: true });

    let synonymsQuery = supabase
      .from("ingredient_synonyms")
      .select("ingredient_id, ingredients!inner(id, standard_name, category)")
      .order("ingredient_id", { ascending: true });

    if (query.category) {
      ingredientsQuery = ingredientsQuery.eq("category", query.category);
      synonymsQuery = synonymsQuery.eq("ingredients.category", query.category);
    }

    if (query.q) {
      ingredientsQuery = ingredientsQuery.ilike("standard_name", `%${query.q}%`);
      synonymsQuery = synonymsQuery.ilike("synonym", `%${query.q}%`);
    }

    const [{ data: ingredientRows, error: ingredientsError }, { data: synonymRows, error: synonymsError }] =
      await Promise.all([ingredientsQuery, synonymsQuery]);

    if (ingredientsError && synonymsError) {
      return ok(createEmptyIngredientList());
    }

    const items = mergeIngredientItems(
      (ingredientsError ? [] : ((ingredientRows ?? []) as IngredientRow[]))
        .map((row) => normalizeIngredientRow(row))
        .filter((row): row is IngredientItem => row !== null),
      (synonymsError ? [] : ((synonymRows ?? []) as IngredientSynonymRow[]))
        .map((row) => normalizeSynonymIngredient(row))
        .filter((row): row is IngredientItem => row !== null),
    );

    return ok({ items });
  } catch {
    return ok(createEmptyIngredientList());
  }
}
