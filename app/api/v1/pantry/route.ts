import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import {
  normalizeIngredientIds,
  toPantryItems,
  type IngredientRow,
  type PantryIngredientRow,
  type PantryItemJoinedRow,
} from "@/lib/server/pantry";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { PantryMutationBody } from "@/types/pantry";

interface QueryError {
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface PantryItemsSelectQuery {
  eq(column: string, value: string): PantryItemsSelectQuery;
  ilike(column: string, value: string): PantryItemsSelectQuery;
  in(column: string, values: string[]): PantryItemsSelectQuery;
  order(column: string, options: QueryOrderOption): PantryItemsSelectQuery;
  then: ArrayResult<PantryItemJoinedRow>["then"];
}

interface PantryIngredientsSelectQuery {
  in(column: string, values: string[]): PantryIngredientsSelectQuery;
  then: ArrayResult<IngredientRow>["then"];
}

interface PantryExistingSelectQuery {
  eq(column: string, value: string): PantryExistingSelectQuery;
  in(column: string, values: string[]): PantryExistingSelectQuery;
  then: ArrayResult<PantryIngredientRow>["then"];
}

interface PantryInsertQuery {
  select(columns: string): ArrayResult<PantryItemJoinedRow>;
}

interface PantryDeleteQuery {
  eq(column: string, value: string): PantryDeleteQuery;
  in(column: string, values: string[]): PantryDeleteQuery;
  select(columns: string): ArrayResult<PantryIngredientRow>;
}

interface PantryItemsTable {
  select(columns: string): PantryItemsSelectQuery | PantryExistingSelectQuery;
  insert(values: Array<{ user_id: string; ingredient_id: string }>): PantryInsertQuery;
  delete(): PantryDeleteQuery;
}

interface IngredientsTable {
  select(columns: string): PantryIngredientsSelectQuery;
}

interface PantryDbClient {
  from(table: "pantry_items"): PantryItemsTable;
  from(table: "ingredients"): IngredientsTable;
}

const PANTRY_SELECT =
  "id, ingredient_id, created_at, ingredients!inner(standard_name, category)";

interface PantryAuthSuccess {
  dbClient: PantryDbClient & UserBootstrapDbClient;
  user: { id: string };
}

interface PantryAuthFailure {
  response: Response;
}

async function getAuthenticatedDb(
  fallbackMessage: string,
): Promise<PantryAuthSuccess | PantryAuthFailure> {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
    };
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    PantryDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, fallbackMessage),
        500,
      ),
    };
  }

  return {
    dbClient,
    user,
  };
}

async function readMutationBody(request: Request) {
  try {
    return (await request.json()) as PantryMutationBody;
  } catch {
    return null;
  }
}

function invalidIngredientIdsResponse() {
  return fail("VALIDATION_ERROR", "추가할 재료를 선택해주세요.", 422, [
    { field: "ingredient_ids", reason: "required_non_empty" },
  ]);
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedDb("팬트리 목록을 불러오지 못했어요.");

  if ("response" in auth) {
    return auth.response;
  }

  const q = request.nextUrl.searchParams.get("q")?.trim();
  const category = request.nextUrl.searchParams.get("category")?.trim();

  let query = auth.dbClient
    .from("pantry_items")
    .select(PANTRY_SELECT) as PantryItemsSelectQuery;

  query = query.eq("user_id", auth.user.id);

  if (q) {
    query = query.ilike("ingredients.standard_name", `%${q}%`);
  }

  if (category) {
    query = query.eq("ingredients.category", category);
  }

  const result = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (result.error || !result.data) {
    return fail("INTERNAL_ERROR", "팬트리 목록을 불러오지 못했어요.", 500);
  }

  return ok({ items: toPantryItems(result.data) });
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedDb("팬트리에 재료를 추가하지 못했어요.");

  if ("response" in auth) {
    return auth.response;
  }

  const body = await readMutationBody(request);
  const ingredientIds = normalizeIngredientIds(body?.ingredient_ids);

  if (!ingredientIds || ingredientIds.length === 0) {
    return invalidIngredientIdsResponse();
  }

  const ingredientsResult = await auth.dbClient
    .from("ingredients")
    .select("id, standard_name, category")
    .in("id", ingredientIds);

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const validIngredientIds = ingredientsResult.data.map((ingredient) => ingredient.id);

  if (validIngredientIds.length === 0) {
    return ok({ added: 0, items: [] }, { status: 201 });
  }

  const existingQuery = auth.dbClient
    .from("pantry_items")
    .select("ingredient_id") as PantryExistingSelectQuery;
  const existingResult = await existingQuery
    .eq("user_id", auth.user.id)
    .in("ingredient_id", validIngredientIds);

  if (existingResult.error || !existingResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const existingIngredientIds = new Set(existingResult.data.map((item) => item.ingredient_id));
  const ingredientIdsToInsert = validIngredientIds.filter(
    (ingredientId) => !existingIngredientIds.has(ingredientId),
  );

  if (ingredientIdsToInsert.length === 0) {
    return ok({ added: 0, items: [] }, { status: 201 });
  }

  const insertResult = await auth.dbClient
    .from("pantry_items")
    .insert(ingredientIdsToInsert.map((ingredientId) => ({
      user_id: auth.user.id,
      ingredient_id: ingredientId,
    })))
    .select(PANTRY_SELECT);

  if (insertResult.error || !insertResult.data) {
    return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
  }

  const items = toPantryItems(insertResult.data);

  return ok({ added: items.length, items }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await getAuthenticatedDb("팬트리 재료를 삭제하지 못했어요.");

  if ("response" in auth) {
    return auth.response;
  }

  const body = await readMutationBody(request);
  const ingredientIds = normalizeIngredientIds(body?.ingredient_ids);

  if (!ingredientIds || ingredientIds.length === 0) {
    return fail("VALIDATION_ERROR", "삭제할 재료를 선택해주세요.", 422, [
      { field: "ingredient_ids", reason: "required_non_empty" },
    ]);
  }

  const deleteResult = await auth.dbClient
    .from("pantry_items")
    .delete()
    .eq("user_id", auth.user.id)
    .in("ingredient_id", ingredientIds)
    .select("ingredient_id");

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 재료를 삭제하지 못했어요.", 500);
  }

  return ok({ removed: deleteResult.data.length });
}
