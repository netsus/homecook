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
import { canonicalizeIngredient, loadIngredientAliases, type IngredientAliases } from "@/lib/server/ingredient-canonical-search";
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
  ingredients: IngredientRow | null;
}

interface RankedIngredientItem {
  item: IngredientItem;
  normalizedName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIngredientRow(value: unknown): IngredientRow | null {
  if (
    !isRecord(value)
    || typeof value.id !== "string"
    || typeof value.standard_name !== "string"
    || typeof value.category !== "string"
    || (value.category_code !== undefined
      && value.category_code !== null
      && typeof value.category_code !== "string")
  ) {
    return null;
  }

  const row: IngredientRow = {
    id: value.id,
    standard_name: value.standard_name,
    category: value.category,
  };
  if (value.category_code !== undefined) {
    row.category_code = value.category_code;
  }
  return row;
}

function parseIngredientRows(value: unknown): IngredientRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: IngredientRow[] = [];
  for (const valueRow of value) {
    const row = parseIngredientRow(valueRow);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function parseSynonymIngredient(value: unknown): IngredientRow | null | undefined {
  if (value === undefined) return undefined;
  const selected = Array.isArray(value) ? value[0] : value;
  if (selected === null || selected === undefined) return null;
  return parseIngredientRow(selected) ?? undefined;
}

function parseIngredientSynonymRows(value: unknown): IngredientSynonymRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: IngredientSynonymRow[] = [];
  for (const valueRow of value) {
    if (
      !isRecord(valueRow)
      || typeof valueRow.ingredient_id !== "string"
      || typeof valueRow.synonym !== "string"
    ) {
      return null;
    }
    const ingredient = parseSynonymIngredient(valueRow.ingredients);
    if (ingredient === undefined) return null;
    rows.push({
      ingredient_id: valueRow.ingredient_id,
      synonym: valueRow.synonym,
      ingredients: ingredient,
    });
  }
  return rows;
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

function normalizeSynonymIngredient(row: IngredientSynonymRow, aliases: IngredientAliases) {
  return normalizeIngredientRow(
    row.ingredients ? canonicalizeIngredient(row.ingredients, aliases) : null,
  );
}

function collectRankedIngredientItems({
  ingredientRows,
  synonymRows,
  aliases,
  searchName,
}: {
  ingredientRows: IngredientRow[];
  synonymRows: IngredientSynonymRow[];
  aliases: IngredientAliases;
  searchName: string;
}) {
  const candidates = new Map<string, RankedIngredientItem>();
  const exactSynonymIds = new Set<string>();

  for (const row of ingredientRows) {
    const rowSearchName = normalizeIngredientSearchName(row.standard_name);
    if (!rowSearchName.includes(searchName)) continue;
    const representative = aliases.get(row.id);
    if (representative && rowSearchName === searchName) {
      exactSynonymIds.add(representative.id);
    }
    const canonical = canonicalizeIngredient(row, aliases);
    if (candidates.has(canonical.id)) continue;
    const item = normalizeIngredientRow(canonical);
    if (!item) continue;
    candidates.set(item.id, {
      item,
      normalizedName: normalizeIngredientSearchName(item.standard_name),
    });
  }

  for (const row of synonymRows) {
    const synonymSearchName = normalizeIngredientSearchName(row.synonym);
    if (!synonymSearchName.includes(searchName)) continue;
    const canonicalId = aliases.get(row.ingredient_id)?.id ?? row.ingredient_id;
    if (synonymSearchName === searchName) {
      exactSynonymIds.add(canonicalId);
    }
    const item = normalizeSynonymIngredient(row, aliases);
    if (!item || candidates.has(item.id)) continue;
    candidates.set(item.id, {
      item,
      normalizedName: normalizeIngredientSearchName(item.standard_name),
    });
  }

  const rank = (candidate: RankedIngredientItem) => {
    if (!searchName || candidate.normalizedName === searchName) return 0;
    if (exactSynonymIds.has(candidate.item.id)) return 1;
    if (candidate.normalizedName.startsWith(searchName)) return 2;
    return 3;
  };
  return Array.from(candidates.values())
    .sort((left, right) => rank(left) - rank(right) ||
      left.item.standard_name.localeCompare(right.item.standard_name, "ko") ||
      left.item.id.localeCompare(right.item.id))
    .map((candidate) => candidate.item);
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
        query.q,
        query.category_code || query.category_group_code ? undefined : query.category,
      );
      const items: IngredientItem[] = [];
      for (const mockItem of mockData.items) {
        const item = normalizeIngredientRow(mockItem);
        if (item && ingredientMatchesV2Filter(item, {
          categoryCode: query.category_code,
          categoryGroupCode: query.category_group_code,
        })) {
          items.push(item);
        }
      }
      return ok({
        items,
      });
    }

    const supabase = await createRouteHandlerClient({
      anonymousPublicReadScope: "ingredients",
    });

    const aliases = await loadIngredientAliases(supabase);
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

      // Filter after canonicalization: an old alias may have a stale category.

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
      const pageIngredientRows = ingredientResult.error
        ? null
        : parseIngredientRows(ingredientResult.data);
      const pageSynonymRows = synonymResult.error
        ? null
        : parseIngredientSynonymRows(synonymResult.data);
      if (!pageIngredientRows || !pageSynonymRows) {
        return fail("INTERNAL_ERROR", "재료 검색을 불러오지 못했어요. 다시 시도해 주세요.", 500);
      }
      ingredientRows.push(...pageIngredientRows);
      synonymRows.push(...pageSynonymRows);
      ingredientsFinished = pageIngredientRows.length < pageSize;
      synonymsFinished = pageSynonymRows.length < pageSize;
      if (ingredientsFinished && synonymsFinished) break;
    }

    const searchName = normalizeIngredientSearchName(query.q ?? "");
    const items: IngredientItem[] = [];
    for (const item of collectRankedIngredientItems({
      ingredientRows,
      synonymRows,
      aliases,
      searchName,
    })) {
      if (
        (!shouldApplyLegacyCategory || item.category === query.category)
        && ingredientMatchesV2Filter(item, {
        categoryCode: query.category_code,
        categoryGroupCode: query.category_group_code,
        })
      ) {
        items.push(item);
      }
    }
    return ok({ items });
  } catch {
    return fail("INTERNAL_ERROR", "재료 검색을 불러오지 못했어요. 다시 시도해 주세요.", 500);
  }
}
