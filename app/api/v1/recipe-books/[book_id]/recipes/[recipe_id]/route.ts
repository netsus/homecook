import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeBookDeleteData, RecipeBookType } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    book_id: string;
    recipe_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface RecipeBookRow {
  id: string;
  user_id: string;
  book_type: RecipeBookType;
}

interface IdRow {
  id: string;
}

interface RecipeCountRow {
  id: string;
  like_count?: number;
  save_count?: number;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface RecipeBooksSelectQuery {
  eq(column: string, value: string): RecipeBooksSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeBookRow>;
}

interface RecipeBookItemsSelectQuery {
  eq(column: string, value: string): RecipeBookItemsSelectQuery;
  maybeSingle(): MaybeSingleResult<IdRow>;
  then: ArrayResult<IdRow>["then"];
}

interface RecipeBookItemsDeleteQuery {
  eq(column: string, value: string): RecipeBookItemsDeleteQuery;
  select(columns: string): RecipeBookItemsDeleteQuery;
  maybeSingle(): MaybeSingleResult<IdRow>;
}

interface RecipeLikesSelectQuery {
  eq(column: string, value: string): RecipeLikesSelectQuery;
  maybeSingle(): MaybeSingleResult<IdRow>;
  then: ArrayResult<IdRow>["then"];
}

interface RecipeLikesDeleteQuery {
  eq(column: string, value: string): RecipeLikesDeleteQuery;
  select(columns: string): RecipeLikesDeleteQuery;
  maybeSingle(): MaybeSingleResult<IdRow>;
}

interface RecipesUpdateQuery {
  eq(column: string, value: string): RecipesUpdateQuery;
  select(columns: string): RecipesUpdateQuery;
  maybeSingle(): MaybeSingleResult<RecipeCountRow>;
}

interface RecipeBooksTable {
  select(columns: string): RecipeBooksSelectQuery;
}

interface RecipeBookItemsTable {
  select(columns: string): RecipeBookItemsSelectQuery;
  delete(): RecipeBookItemsDeleteQuery;
}

interface RecipeLikesTable {
  select(columns: string): RecipeLikesSelectQuery;
  delete(): RecipeLikesDeleteQuery;
}

interface RecipesTable {
  update(values: { like_count?: number; save_count?: number }): RecipesUpdateQuery;
}

interface RecipeBookRecipeRemoveDbClient {
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "recipe_book_items"): RecipeBookItemsTable;
  from(table: "recipe_likes"): RecipeLikesTable;
  from(table: "recipes"): RecipesTable;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function readRecipeBook(
  dbClient: RecipeBookRecipeRemoveDbClient,
  bookId: string,
) {
  return dbClient
    .from("recipe_books")
    .select("id, user_id, book_type")
    .eq("id", bookId)
    .maybeSingle();
}

async function updateRecipeCount({
  dbClient,
  recipeId,
  column,
  value,
}: {
  dbClient: RecipeBookRecipeRemoveDbClient;
  recipeId: string;
  column: "like_count" | "save_count";
  value: number;
}) {
  return dbClient
    .from("recipes")
    .update({ [column]: Math.max(0, value) })
    .eq("id", recipeId)
    .select(`id, ${column}`)
    .maybeSingle();
}

async function removeLikedRecipe({
  dbClient,
  recipeId,
  userId,
}: {
  dbClient: RecipeBookRecipeRemoveDbClient;
  recipeId: string;
  userId: string;
}) {
  const likeResult = await dbClient
    .from("recipe_likes")
    .select("id")
    .eq("user_id", userId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (likeResult.error || !likeResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const deleteResult = await dbClient
    .from("recipe_likes")
    .delete()
    .eq("id", likeResult.data.id)
    .eq("user_id", userId)
    .eq("recipe_id", recipeId)
    .select("id")
    .maybeSingle();

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "좋아요를 해제하지 못했어요.", 500);
  }

  const remainingLikes = await dbClient
    .from("recipe_likes")
    .select("id")
    .eq("recipe_id", recipeId);

  if (remainingLikes.error || !remainingLikes.data) {
    return fail("INTERNAL_ERROR", "좋아요 수를 갱신하지 못했어요.", 500);
  }

  const updateResult = await updateRecipeCount({
    dbClient,
    recipeId,
    column: "like_count",
    value: remainingLikes.data.length,
  });

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "좋아요 수를 갱신하지 못했어요.", 500);
  }

  return ok({ deleted: true } satisfies RecipeBookDeleteData);
}

async function removeSavedOrCustomRecipe({
  dbClient,
  bookId,
  recipeId,
}: {
  dbClient: RecipeBookRecipeRemoveDbClient;
  bookId: string;
  recipeId: string;
}) {
  const itemResult = await dbClient
    .from("recipe_book_items")
    .select("id")
    .eq("book_id", bookId)
    .eq("recipe_id", recipeId)
    .maybeSingle();

  if (itemResult.error || !itemResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const deleteResult = await dbClient
    .from("recipe_book_items")
    .delete()
    .eq("id", itemResult.data.id)
    .eq("book_id", bookId)
    .eq("recipe_id", recipeId)
    .select("id")
    .maybeSingle();

  if (deleteResult.error || !deleteResult.data) {
    return fail("INTERNAL_ERROR", "레시피북에서 레시피를 제거하지 못했어요.", 500);
  }

  const remainingItems = await dbClient
    .from("recipe_book_items")
    .select("id")
    .eq("recipe_id", recipeId);

  if (remainingItems.error || !remainingItems.data) {
    return fail("INTERNAL_ERROR", "저장 수를 갱신하지 못했어요.", 500);
  }

  const updateResult = await updateRecipeCount({
    dbClient,
    recipeId,
    column: "save_count",
    value: remainingItems.data.length,
  });

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "저장 수를 갱신하지 못했어요.", 500);
  }

  return ok({ deleted: true } satisfies RecipeBookDeleteData);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { book_id: bookId, recipe_id: recipeId } = await context.params;

  if (!isUuid(bookId) || !isUuid(recipeId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피북 또는 레시피를 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    RecipeBookRecipeRemoveDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "레시피북에서 레시피를 제거하지 못했어요."),
      500,
    );
  }

  const bookResult = await readRecipeBook(dbClient, bookId);

  if (bookResult.error || !bookResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (bookResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 레시피북만 수정할 수 있어요.", 403);
  }

  if (bookResult.data.book_type === "my_added") {
    return fail("FORBIDDEN", "내가 추가한 레시피는 레시피북에서 제거할 수 없어요.", 403);
  }

  if (bookResult.data.book_type === "liked") {
    return removeLikedRecipe({
      dbClient,
      recipeId,
      userId: user.id,
    });
  }

  return removeSavedOrCustomRecipe({
    dbClient,
    bookId,
    recipeId,
  });
}
