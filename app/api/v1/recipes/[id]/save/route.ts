import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  isQaFixtureModeEnabled,
  MOCK_RECIPE_ID,
  saveQaFixtureRecipeToBook,
} from "@/lib/mock/recipes";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeBookType, RecipeSaveBody, RecipeSaveData, SaveableRecipeBookType } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface QueryError {
  code?: string;
  message: string;
}

interface RecipeCountRow {
  id: string;
  save_count: number;
}

interface RecipeBookRow {
  id: string;
  user_id: string;
  book_type: RecipeBookType;
}

interface RecipeBookItemRow {
  id: string;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface RecipesSelectQuery {
  eq(column: string, value: string): RecipesSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeCountRow>;
}

interface RecipesUpdateQuery {
  eq(column: string, value: string): RecipesUpdateQuery;
  select(columns: string): RecipesUpdateQuery;
  maybeSingle(): MaybeSingleResult<RecipeCountRow>;
}

interface RecipeBooksSelectQuery {
  eq(column: string, value: string): RecipeBooksSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeBookRow>;
}

interface RecipeBookItemsInsertQuery {
  select(columns: string): RecipeBookItemsInsertQuery;
  maybeSingle(): MaybeSingleResult<RecipeBookItemRow>;
}

type ManyResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface RecipeBookItemsSelectQuery {
  eq(column: string, value: string): RecipeBookItemsSelectQuery;
  then: ManyResult<RecipeBookItemRow>["then"];
}

interface RecipeBookItemsDeleteQuery {
  eq(column: string, value: string): RecipeBookItemsDeleteQuery;
  select(columns: string): RecipeBookItemsDeleteQuery;
  maybeSingle(): MaybeSingleResult<RecipeBookItemRow>;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
  update(values: { save_count: number }): RecipesUpdateQuery;
}

interface RecipeBooksTable {
  select(columns: string): RecipeBooksSelectQuery;
}

interface RecipeBookItemsTable {
  insert(values: { book_id: string; recipe_id: string }): RecipeBookItemsInsertQuery;
  select(columns: string): RecipeBookItemsSelectQuery;
  delete(): RecipeBookItemsDeleteQuery;
}

interface RecipeSaveDbClient {
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "recipe_book_items"): RecipeBookItemsTable;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isSaveableRecipeBookType(value: RecipeBookType): value is SaveableRecipeBookType {
  return value === "saved" || value === "custom";
}

function isDuplicateSaveConflict(error: QueryError | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}

function clampSaveCount(value: number) {
  return Math.max(0, value);
}

function parseBookId(body: RecipeSaveBody) {
  if (typeof body.book_id !== "string") {
    return null;
  }

  const bookId = body.book_id.trim();

  return isUuid(bookId) ? bookId : null;
}

async function rollbackSavedRecipeItem(
  dbClient: RecipeSaveDbClient,
  itemId: string,
  recipeId: string,
) {
  await dbClient
    .from("recipe_book_items")
    .delete()
    .eq("id", itemId)
    .eq("recipe_id", recipeId)
    .select("id")
    .maybeSingle();
}

export async function POST(request: Request, context: RouteContext) {
  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  if (!isQaFixtureModeEnabled()) {
    const routeClient = await createRouteHandlerClient();
    const authResult = await routeClient.auth.getUser();
    const user = authResult.data.user;

    if (!user) {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  }

  const { id } = await context.params;

  if (!isQaFixtureModeEnabled() && !isUuid(id)) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  let body: RecipeSaveBody;

  try {
    body = (await request.json()) as RecipeSaveBody;
  } catch {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  const bookId = parseBookId(body);

  if (!bookId) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (isQaFixtureModeEnabled()) {
    if (id !== MOCK_RECIPE_ID) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    const saveResult = saveQaFixtureRecipeToBook(bookId);

    if (!saveResult.ok) {
      return fail(saveResult.code, saveResult.message, saveResult.status);
    }

    return ok(saveResult.data);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as RecipeSaveDbClient;
  const recipeResult = await dbClient
    .from("recipes")
    .select("id, save_count")
    .eq("id", id)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const recipeBookResult = await dbClient
    .from("recipe_books")
    .select("id, user_id, book_type")
    .eq("id", bookId)
    .maybeSingle();

  if (recipeBookResult.error || !recipeBookResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (recipeBookResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 레시피북만 선택할 수 있어요.", 403);
  }

  if (!isSaveableRecipeBookType(recipeBookResult.data.book_type)) {
    return fail("CONFLICT", "저장 가능한 레시피북이 아니에요.", 409);
  }

  const saveResult = await dbClient
    .from("recipe_book_items")
    .insert({
      book_id: bookId,
      recipe_id: id,
    })
    .select("id")
    .maybeSingle();

  if (isDuplicateSaveConflict(saveResult.error)) {
    return fail("CONFLICT", "이미 저장된 레시피예요.", 409);
  }

  if (saveResult.error || !saveResult.data) {
    return fail("INTERNAL_ERROR", "레시피를 저장하지 못했어요.", 500);
  }

  const saveCountResult = await dbClient
    .from("recipe_book_items")
    .select("id")
    .eq("recipe_id", id);

  if (saveCountResult.error || !saveCountResult.data) {
    await rollbackSavedRecipeItem(dbClient, saveResult.data.id, id);
    return fail("INTERNAL_ERROR", "저장 수를 갱신하지 못했어요.", 500);
  }

  const nextSaveCount = clampSaveCount(saveCountResult.data.length);
  const updateResult = await dbClient
    .from("recipes")
    .update({
      save_count: nextSaveCount,
    })
    .eq("id", id)
    .select("id, save_count")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    await rollbackSavedRecipeItem(dbClient, saveResult.data.id, id);
    return fail("INTERNAL_ERROR", "저장 수를 갱신하지 못했어요.", 500);
  }

  const responseData: RecipeSaveData = {
    saved: true,
    save_count: clampSaveCount(updateResult.data.save_count),
    book_id: bookId,
  };

  return ok(responseData);
}
