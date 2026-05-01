import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
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
  then: ArrayQueryResult<CookingMethodItem>["then"];
}

interface CookingMethodsTable {
  select(columns: string): CookingMethodsSelectQuery;
}

interface CookingMethodsDbClient {
  from(table: "cooking_methods"): CookingMethodsTable;
}

export async function GET(request: NextRequest) {
  void request;

  const dbClient = (createServiceRoleClient() ?? await createRouteHandlerClient()) as unknown as CookingMethodsDbClient;
  const result = await dbClient
    .from("cooking_methods")
    .select("id, code, label, color_key, is_system")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (result.error || !result.data) {
    return fail("INTERNAL_ERROR", "조리방법 목록을 불러오지 못했어요.", 500);
  }

  return ok({ methods: result.data } satisfies CookingMethodListData);
}
