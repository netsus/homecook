import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import {
  getCookingMethodSynonyms,
  getCookingMethodTaxonomyMetadata,
} from "@/lib/cooking-method-taxonomy";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { CookingMethodItem, CookingMethodListData } from "@/types/recipe";

interface QueryError {
  code?: string;
  message: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface CookingMethodsSelectQuery {
  order(column: string, options: QueryOrderOption): CookingMethodsSelectQuery;
  then: ArrayQueryResult<CookingMethodRow>["then"];
}

interface CookingMethodsTable {
  select(columns: string): CookingMethodsSelectQuery;
}

interface CookingMethodSynonymsSelectQuery {
  eq(column: string, value: boolean): CookingMethodSynonymsSelectQuery;
  order(column: string, options: QueryOrderOption): CookingMethodSynonymsSelectQuery;
  then: ArrayQueryResult<CookingMethodSynonymRow>["then"];
}

interface CookingMethodSynonymsTable {
  select(columns: string): CookingMethodSynonymsSelectQuery;
}

interface CookingMethodsDbClient {
  from(table: "cooking_methods"): CookingMethodsTable;
  from(table: "cooking_method_synonyms"): CookingMethodSynonymsTable;
}

interface CookingMethodRow {
  id: string;
  code: string;
  label: string;
  color_key: string;
  category_code?: string | null;
  is_system: boolean;
}

interface CookingMethodSynonymRow {
  method_code: string;
  synonym: string;
}

function isSchemaCacheMiss(error: QueryError | null | undefined) {
  if (!error?.message) {
    return false;
  }

  return /category_code|cooking_method_synonyms|schema cache|column .* does not exist|relation .* does not exist/i
    .test(error.message);
}

function buildSynonymMap(rows: CookingMethodSynonymRow[]) {
  const synonymMap = new Map<string, string[]>();

  for (const row of rows) {
    const current = synonymMap.get(row.method_code) ?? [];
    current.push(row.synonym);
    synonymMap.set(row.method_code, current);
  }

  return synonymMap;
}

function normalizeCookingMethodRow(
  row: CookingMethodRow,
  synonymMap: Map<string, string[]>,
): CookingMethodItem {
  const taxonomy = getCookingMethodTaxonomyMetadata({
    methodCode: row.code,
    categoryCode: row.category_code,
  });
  const synonyms = Array.from(new Set([
    ...(synonymMap.get(row.code) ?? []),
    ...getCookingMethodSynonyms(row.code),
  ]));
  const item: CookingMethodItem = {
    id: row.id,
    code: row.code,
    label: row.label,
    color_key: row.color_key,
    is_system: row.is_system,
  };

  if (taxonomy.category_code) {
    item.category_code = taxonomy.category_code;
    item.category_label = taxonomy.category_label;
    item.synonyms = synonyms;
  }

  return item;
}

async function readCookingMethodSynonyms(dbClient: CookingMethodsDbClient) {
  try {
    const result = await dbClient
      .from("cooking_method_synonyms")
      .select("method_code, synonym")
      .eq("is_active", true)
      .order("synonym", { ascending: true });

    if (result.error || !result.data) {
      return [];
    }

    return result.data;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  void request;

  const dbClient = (createServiceRoleClient() ?? await createRouteHandlerClient()) as unknown as CookingMethodsDbClient;
  let result = await dbClient
    .from("cooking_methods")
    .select("id, code, label, color_key, category_code, is_system")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (isSchemaCacheMiss(result.error)) {
    result = await dbClient
      .from("cooking_methods")
      .select("id, code, label, color_key, is_system")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
  }

  if (result.error || !result.data) {
    return fail("INTERNAL_ERROR", "조리방법 목록을 불러오지 못했어요.", 500);
  }

  const synonymMap = buildSynonymMap(await readCookingMethodSynonyms(dbClient));
  const methods = result.data.map((row) => normalizeCookingMethodRow(row, synonymMap));

  return ok({ methods } satisfies CookingMethodListData);
}
