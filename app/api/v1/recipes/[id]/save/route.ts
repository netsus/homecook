import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { readQaFixtureFaultsHeader } from "@/lib/mock/qa-fixture-overrides";
import {
  isQaFixtureModeEnabled,
  MOCK_RECIPE_ID,
  saveQaFixtureRecipeToBook,
} from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { awardUserProgressEvent, type UserProgressDbClient } from "@/lib/server/user-progress";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeBookType, RecipeSaveData, SaveableRecipeBookType } from "@/types/recipe";

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
  book_id?: string;
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
  in(column: string, values: string[]): RecipeBooksSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeBookRow>;
  then: ManyResult<RecipeBookRow>["then"];
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
  in(column: string, values: string[]): RecipeBookItemsSelectQuery;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBookIds(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const bookIds: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }

    const bookId = item.trim();

    if (!isUuid(bookId)) {
      return null;
    }

    if (!seen.has(bookId)) {
      seen.add(bookId);
      bookIds.push(bookId);
    }
  }

  return bookIds.length > 0 ? bookIds : null;
}

function parseBookIds(body: unknown) {
  if (!isRecord(body)) {
    return null;
  }

  const bookIds = normalizeBookIds(body.book_ids);

  if (bookIds) {
    return bookIds;
  }

  // Older local fixtures may still send `book_id`; the public response stays on
  // the v1.2.4 multi-save shape.
  if (typeof body.book_id === "string") {
    return normalizeBookIds([body.book_id]);
  }

  return null;
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  const bookIds = parseBookIds(body);

  if (!bookIds) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (isQaFixtureModeEnabled()) {
    const faultOverrides = readQaFixtureFaultsHeader(request.headers);

    if (faultOverrides?.recipe_save === "missing_recipe") {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    if (id !== MOCK_RECIPE_ID) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    if (faultOverrides?.recipe_save === "missing_book") {
      return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
    }

    if (faultOverrides?.recipe_save === "forbidden_book") {
      return fail("FORBIDDEN", "내 레시피북만 선택할 수 있어요.", 403);
    }

    if (faultOverrides?.recipe_save === "invalid_book_type") {
      return fail("CONFLICT", "저장 가능한 레시피북이 아니에요.", 409);
    }

    if (faultOverrides?.recipe_save === "duplicate_save") {
      return fail("CONFLICT", "이미 저장된 레시피예요.", 409);
    }

    if (faultOverrides?.recipe_save === "internal_error") {
      return fail("INTERNAL_ERROR", "레시피를 저장하지 못했어요.", 500);
    }

    const saveResult = saveQaFixtureRecipeToBook(bookIds);

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

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    RecipeSaveDbClient & UserBootstrapDbClient & UserProgressDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "레시피를 저장하지 못했어요."),
      500,
    );
  }

  const recipeResult = await dbClient
    .from("recipes")
    .select("id, save_count")
    .eq("id", id)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const recipeBooksResult = await dbClient
    .from("recipe_books")
    .select("id, user_id, book_type")
    .in("id", bookIds);

  if (recipeBooksResult.error || !recipeBooksResult.data || recipeBooksResult.data.length !== bookIds.length) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (recipeBooksResult.data.some((book) => book.user_id !== user.id)) {
    return fail("FORBIDDEN", "내 레시피북만 선택할 수 있어요.", 403);
  }

  if (recipeBooksResult.data.some((book) => !isSaveableRecipeBookType(book.book_type))) {
    return fail("CONFLICT", "저장 가능한 레시피북이 아니에요.", 409);
  }

  const saveableBooksResult = await dbClient
    .from("recipe_books")
    .select("id, user_id, book_type")
    .eq("user_id", user.id)
    .in("book_type", ["saved", "custom"]);

  if (saveableBooksResult.error || !saveableBooksResult.data) {
    return fail("INTERNAL_ERROR", "레시피를 저장하지 못했어요.", 500);
  }

  const saveableBookIds = saveableBooksResult.data.map((book) => book.id);
  const existingItemsResult = await dbClient
    .from("recipe_book_items")
    .select("id, book_id")
    .eq("recipe_id", id)
    .in("book_id", saveableBookIds);

  if (existingItemsResult.error || !existingItemsResult.data) {
    return fail("INTERNAL_ERROR", "레시피를 저장하지 못했어요.", 500);
  }

  const hadSavableMembershipBefore = existingItemsResult.data.length > 0;
  const existingBookIds = new Set(
    existingItemsResult.data
      .map((item) => item.book_id)
      .filter((bookId): bookId is string => typeof bookId === "string"),
  );
  const alreadySavedBookIds = bookIds.filter((bookId) => existingBookIds.has(bookId));
  const createdBookIds: string[] = [];
  const insertedItemIds: string[] = [];

  for (const bookId of bookIds) {
    if (existingBookIds.has(bookId)) {
      continue;
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
      alreadySavedBookIds.push(bookId);
      existingBookIds.add(bookId);
      continue;
    }

    if (saveResult.error || !saveResult.data) {
      for (const itemId of insertedItemIds) {
        await rollbackSavedRecipeItem(dbClient, itemId, id);
      }

      return fail("INTERNAL_ERROR", "레시피를 저장하지 못했어요.", 500);
    }

    createdBookIds.push(bookId);
    insertedItemIds.push(saveResult.data.id);
    existingBookIds.add(bookId);
  }

  const saveCountResult = await dbClient
    .from("recipe_book_items")
    .select("id")
    .eq("recipe_id", id);

  if (saveCountResult.error || !saveCountResult.data) {
    for (const itemId of insertedItemIds) {
      await rollbackSavedRecipeItem(dbClient, itemId, id);
    }
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
    for (const itemId of insertedItemIds) {
      await rollbackSavedRecipeItem(dbClient, itemId, id);
    }
    return fail("INTERNAL_ERROR", "저장 수를 갱신하지 못했어요.", 500);
  }

  const responseData: RecipeSaveData = {
    saved: true,
    save_count: clampSaveCount(updateResult.data.save_count),
    book_ids: bookIds,
    created_book_ids: createdBookIds,
    already_saved_book_ids: alreadySavedBookIds,
  };

  if (!hadSavableMembershipBefore && insertedItemIds[0]) {
    try {
      await awardUserProgressEvent(dbClient, {
        userId: user.id,
        eventType: "recipe_saved",
        sourceTable: "recipe_book_items",
        sourceId: insertedItemIds[0],
        recipeId: id,
      });
    } catch {
      // Progress is a secondary reward ledger; recipe save success remains authoritative.
    }
  }

  return ok(responseData);
}
