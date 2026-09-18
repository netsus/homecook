import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import {
  ALL_INGREDIENT_CATEGORY,
  getFallbackIngredientSubcategoryCode,
  getIngredientTaxonomyMetadata,
  isValidIngredientCategory,
  isValidIngredientCategoryGroupCode,
  isValidIngredientSubcategoryCode,
} from "@/lib/ingredient-categories";
import { isSelectableIngredientId } from "@/lib/ingredient-catalog-policy";
import { ingredientSearchPattern, normalizeIngredientSearchName } from "@/lib/ingredient-search";
import {
  getMockIngredientList,
  isDiscoveryFilterManualMockEnabled,
} from "@/lib/mock/recipes";
import {
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import type { IngredientItem, IngredientListData, IngredientListQuery } from "@/types/recipe";

interface IngredientRow {
  id: string;
  standard_name: string;
  category: string;
  category_code?: string | null;
}

interface IngredientSynonymRow {
  ingredient_id: string;
  synonym: string;
  ingredients:
    | IngredientRow
    | IngredientRow[]
    | null;
}

function normalizeIngredientRow(row: IngredientRow | null | undefined): IngredientItem | null {
  if (!row || !isSelectableIngredientId(row.id)) {
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

  return /category_code/i.test(error.message) &&
    /schema cache|column .* does not exist/i.test(error.message);
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

    if (query.q && query.q.length > 100) {
      return fail("VALIDATION_ERROR", "검색어는 100자 이하로 입력해 주세요.", 422, [
        { field: "q", reason: "too_long" },
      ]);
    }

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
        undefined,
        query.category_code || query.category_group_code ? undefined : query.category,
      );
      return ok({
        items: mockData.items
          .map((item) => normalizeIngredientRow(item))
          .filter((item): item is IngredientItem => item !== null)
          .filter((item) => !query.q || normalizeIngredientSearchName(item.standard_name)
            .includes(normalizeIngredientSearchName(query.q)))
          .filter((item) => ingredientMatchesV2Filter(item, {
            categoryCode: query.category_code,
            categoryGroupCode: query.category_group_code,
          })),
      });
    }

    const supabase = await createRouteHandlerClient({
      anonymousPublicReadScope: "ingredients",
    });

    const shouldApplyLegacyCategory = query.category &&
      !query.category_code &&
      !query.category_group_code;
    const pageSize = 1000;
    const buildQueries = (includeTaxonomyColumn: boolean, offset: number) => {
      const ingredientColumns = includeTaxonomyColumn
        ? "id, standard_name, category, category_code"
        : "id, standard_name, category";
      const synonymColumns = includeTaxonomyColumn
        ? "ingredient_id, synonym, ingredients!inner(id, standard_name, category, category_code)"
        : "ingredient_id, synonym, ingredients!inner(id, standard_name, category)";

      let ingredientsQuery = supabase
        .from("ingredients")
        .select(ingredientColumns)
        .order("standard_name", { ascending: true })
        .order("id", { ascending: true });

      let synonymsQuery = supabase
        .from("ingredient_synonyms")
        .select(synonymColumns)
        .order("ingredient_id", { ascending: true })
        .order("id", { ascending: true });

      if (shouldApplyLegacyCategory) {
        ingredientsQuery = ingredientsQuery.eq("category", query.category);
        synonymsQuery = synonymsQuery.eq("ingredients.category", query.category);
      }

      if (query.q) {
        const pattern = ingredientSearchPattern(query.q);
        ingredientsQuery = ingredientsQuery.like("search_name", pattern);
        synonymsQuery = synonymsQuery.like("search_name", pattern);
      }

      return [
        ingredientsQuery.range(offset, offset + pageSize - 1),
        synonymsQuery.range(offset, offset + pageSize - 1),
      ] as const;
    };

    const ingredientRows: IngredientRow[] = [];
    const synonymRows: IngredientSynonymRow[] = [];
    let includeTaxonomyColumn = true;
    let ingredientsFinished = false;
    let synonymsFinished = !query.q;
    const readPage = (includeTaxonomy: boolean, offset: number) => {
      const [ingredientsQuery, synonymsQuery] = buildQueries(includeTaxonomy, offset);
      const emptyPage = { data: [], error: null };
      return Promise.all([
        ingredientsFinished ? Promise.resolve(emptyPage) : ingredientsQuery,
        synonymsFinished ? Promise.resolve(emptyPage) : synonymsQuery,
      ]);
    };
    for (let offset = 0; ; offset += pageSize) {
      let [ingredientResult, synonymResult] = await readPage(includeTaxonomyColumn, offset);
      if (includeTaxonomyColumn &&
        (isSchemaCacheMiss(ingredientResult.error) || isSchemaCacheMiss(synonymResult.error))) {
        includeTaxonomyColumn = false;
        [ingredientResult, synonymResult] = await readPage(false, offset);
      }
      if (ingredientResult.error || synonymResult.error ||
        !ingredientResult.data || !synonymResult.data) {
        return fail("INTERNAL_ERROR", "재료 검색을 불러오지 못했어요. 다시 시도해 주세요.", 500);
      }
      ingredientRows.push(...ingredientResult.data as unknown as IngredientRow[]);
      synonymRows.push(...synonymResult.data as unknown as IngredientSynonymRow[]);
      ingredientsFinished = ingredientResult.data.length < pageSize;
      synonymsFinished = synonymResult.data.length < pageSize;
      if (ingredientsFinished && synonymsFinished) break;
    }

    const searchName = normalizeIngredientSearchName(query.q ?? "");
    const items = mergeIngredientItems(
      ingredientRows
        .filter((row) => normalizeIngredientSearchName(row.standard_name).includes(searchName))
        .map((row) => normalizeIngredientRow(row))
        .filter((row): row is IngredientItem => row !== null),
      synonymRows
        .filter((row) => normalizeIngredientSearchName(row.synonym).includes(searchName))
        .map((row) => normalizeSynonymIngredient(row))
        .filter((row): row is IngredientItem => row !== null),
    ).filter((item) => ingredientMatchesV2Filter(item, {
      categoryCode: query.category_code,
      categoryGroupCode: query.category_group_code,
    }));

    const exactSynonymIds = new Set(synonymRows
      .filter((row) => normalizeIngredientSearchName(row.synonym) === searchName)
      .map((row) => row.ingredient_id));
    const rank = (item: IngredientItem) => {
      if (!searchName) return 0;
      if (normalizeIngredientSearchName(item.standard_name) === searchName) return 0;
      if (exactSynonymIds.has(item.id)) return 1;
      if (normalizeIngredientSearchName(item.standard_name).startsWith(searchName)) return 2;
      return 3;
    };
    items.sort((left, right) => rank(left) - rank(right) ||
      left.standard_name.localeCompare(right.standard_name, "ko") || left.id.localeCompare(right.id));
    return ok({ items });
  } catch {
    return fail("INTERNAL_ERROR", "재료 검색을 불러오지 못했어요. 다시 시도해 주세요.", 500);
  }
}
