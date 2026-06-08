import { NextRequest } from "next/server";

import { ok } from "@/lib/api/response";
import {
  ALL_INGREDIENT_CATEGORY,
  getFallbackIngredientSubcategoryCode,
  getIngredientTaxonomyMetadata,
  isValidIngredientCategory,
  isValidIngredientCategoryGroupCode,
  isValidIngredientSubcategoryCode,
} from "@/lib/ingredient-categories";
import {
  getMockIngredientList,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { IngredientItem, IngredientListData, IngredientListQuery } from "@/types/recipe";

interface IngredientRow {
  id: string;
  standard_name: string;
  category: string;
  category_code?: string | null;
}

interface IngredientSynonymRow {
  ingredient_id: string;
  ingredients:
    | IngredientRow
    | IngredientRow[]
    | null;
}

function normalizeIngredientRow(row: IngredientRow | null | undefined): IngredientItem | null {
  if (!row) {
    return null;
  }

  const taxonomy = getIngredientTaxonomyMetadata({
    category: row.category,
    categoryCode: row.category_code,
  });

  return {
    id: row.id,
    standard_name: row.standard_name,
    category: row.category,
    category_group_code: taxonomy.category_group_code,
    category_code: taxonomy.category_code,
    category_label: taxonomy.category_label,
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

function isSchemaCacheMiss(error: { message?: string } | null | undefined) {
  if (!error?.message) {
    return false;
  }

  return /category_code|schema cache|column .* does not exist/i.test(error.message);
}

function ingredientMatchesV2Filter(
  item: IngredientItem,
  {
    categoryCode,
    categoryGroupCode,
  }: {
    categoryCode?: string;
    categoryGroupCode?: string;
  },
) {
  if (categoryCode) {
    return item.category_code === categoryCode ||
      getFallbackIngredientSubcategoryCode(item.category) === categoryCode;
  }

  if (categoryGroupCode) {
    return item.category_group_code === categoryGroupCode;
  }

  return true;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawCategory = searchParams.get("category")?.trim() || undefined;
    const category = rawCategory && rawCategory !== ALL_INGREDIENT_CATEGORY
      ? rawCategory
      : undefined;
    const categoryCode = searchParams.get("category_code")?.trim() || undefined;
    const categoryGroupCode = searchParams.get("category_group_code")?.trim() || undefined;
    const query: IngredientListQuery = {
      q: searchParams.get("q")?.trim() || undefined,
      category,
      category_code: categoryCode,
      category_group_code: categoryGroupCode,
    };

    if (
      query.category &&
      !query.category_code &&
      !query.category_group_code &&
      !isValidIngredientCategory(query.category)
    ) {
      return ok(createEmptyIngredientList());
    }

    if (query.category_code && !isValidIngredientSubcategoryCode(query.category_code)) {
      return ok(createEmptyIngredientList());
    }

    if (
      query.category_group_code &&
      !isValidIngredientCategoryGroupCode(query.category_group_code)
    ) {
      return ok(createEmptyIngredientList());
    }

    if (isDiscoveryFilterManualMockEnabled()) {
      const mockData = getMockIngredientList(
        query.q,
        query.category_code || query.category_group_code ? undefined : query.category,
      );
      return ok({
        items: mockData.items
          .map((item) => normalizeIngredientRow(item))
          .filter((item): item is IngredientItem => item !== null)
          .filter((item) => ingredientMatchesV2Filter(item, {
            categoryCode: query.category_code,
            categoryGroupCode: query.category_group_code,
          })),
      });
    }

    const supabase = createServiceRoleClient() ?? await createRouteHandlerClient();

    const shouldApplyLegacyCategory = query.category &&
      !query.category_code &&
      !query.category_group_code;
    const buildQueries = (includeTaxonomyColumn: boolean) => {
      const ingredientColumns = includeTaxonomyColumn
        ? "id, standard_name, category, category_code"
        : "id, standard_name, category";
      const synonymColumns = includeTaxonomyColumn
        ? "ingredient_id, ingredients!inner(id, standard_name, category, category_code)"
        : "ingredient_id, ingredients!inner(id, standard_name, category)";

      let ingredientsQuery = supabase
        .from("ingredients")
        .select(ingredientColumns)
        .order("standard_name", { ascending: true });

      let synonymsQuery = supabase
        .from("ingredient_synonyms")
        .select(synonymColumns)
        .order("ingredient_id", { ascending: true });

      if (shouldApplyLegacyCategory) {
        ingredientsQuery = ingredientsQuery.eq("category", query.category);
        synonymsQuery = synonymsQuery.eq("ingredients.category", query.category);
      }

      if (query.q) {
        ingredientsQuery = ingredientsQuery.ilike("standard_name", `%${query.q}%`);
        synonymsQuery = synonymsQuery.ilike("synonym", `%${query.q}%`);
      }

      return [ingredientsQuery, synonymsQuery] as const;
    };

    let [ingredientsQuery, synonymsQuery] = buildQueries(true);
    let [{ data: ingredientRows, error: ingredientsError }, { data: synonymRows, error: synonymsError }] =
      await Promise.all([ingredientsQuery, synonymsQuery]);

    if (isSchemaCacheMiss(ingredientsError) || isSchemaCacheMiss(synonymsError)) {
      [ingredientsQuery, synonymsQuery] = buildQueries(false);
      const retryResult = await Promise.all([ingredientsQuery, synonymsQuery]);
      ingredientRows = retryResult[0].data;
      ingredientsError = retryResult[0].error;
      synonymRows = retryResult[1].data;
      synonymsError = retryResult[1].error;
    }

    if (ingredientsError && synonymsError) {
      return ok(createEmptyIngredientList());
    }

    const items = mergeIngredientItems(
      (ingredientsError ? [] : ((ingredientRows ?? []) as unknown as IngredientRow[]))
        .map((row) => normalizeIngredientRow(row))
        .filter((row): row is IngredientItem => row !== null),
      (synonymsError ? [] : ((synonymRows ?? []) as unknown as IngredientSynonymRow[]))
        .map((row) => normalizeSynonymIngredient(row))
        .filter((row): row is IngredientItem => row !== null),
    ).filter((item) => ingredientMatchesV2Filter(item, {
      categoryCode: query.category_code,
      categoryGroupCode: query.category_group_code,
    }));

    return ok({ items });
  } catch {
    return ok(createEmptyIngredientList());
  }
}
