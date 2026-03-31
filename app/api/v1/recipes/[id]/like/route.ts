import { fail, ok } from "@/lib/api/response";
import { clampLikeCount, isRecipeLikeUniqueConflict } from "@/lib/recipe-like";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeLikeData } from "@/types/recipe";

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
  like_count: number;
}

interface RecipeLikeRow {
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

interface RecipeLikesSelectQuery {
  eq(column: string, value: string): RecipeLikesSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeLikeRow>;
}

interface RecipeLikesInsertQuery {
  select(columns: string): RecipeLikesInsertQuery;
  maybeSingle(): MaybeSingleResult<RecipeLikeRow>;
}

interface RecipeLikesDeleteQuery {
  eq(column: string, value: string): RecipeLikesDeleteQuery;
  select(columns: string): RecipeLikesDeleteQuery;
  maybeSingle(): MaybeSingleResult<RecipeLikeRow>;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface RecipeLikesTable {
  select(columns: string): RecipeLikesSelectQuery;
  insert(values: { user_id: string; recipe_id: string }): RecipeLikesInsertQuery;
  delete(): RecipeLikesDeleteQuery;
}

interface RecipeLikeDbClient {
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_likes"): RecipeLikesTable;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function readRecipeCount(dbClient: RecipeLikeDbClient, recipeId: string) {
  return dbClient
    .from("recipes")
    .select("id, like_count")
    .eq("id", recipeId)
    .maybeSingle();
}

async function readRecipeLikeSnapshot(dbClient: RecipeLikeDbClient, recipeId: string) {
  const recipeResult = await readRecipeCount(dbClient, recipeId);

  if (recipeResult.error || !recipeResult.data) {
    return null;
  }

  return {
    is_liked: true,
    like_count: clampLikeCount(recipeResult.data.like_count),
  } satisfies RecipeLikeData;
}

async function readExistingLike(
  dbClient: RecipeLikeDbClient,
  recipeId: string,
  userId: string,
) {
  return dbClient
    .from("recipe_likes")
    .select("id")
    .eq("recipe_id", recipeId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isUuid(id)) {
    return fail("NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as RecipeLikeDbClient;
  const recipeResult = await readRecipeCount(dbClient, id);

  if (recipeResult.error || !recipeResult.data) {
    return fail("NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const existingLikeResult = await readExistingLike(dbClient, id, user.id);

  if (existingLikeResult.error) {
    return fail("INTERNAL_ERROR", "좋아요 상태를 확인하지 못했어요.", 500);
  }

  if (existingLikeResult.data) {
    const deleteResult = await dbClient
      .from("recipe_likes")
      .delete()
      .eq("id", existingLikeResult.data.id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (deleteResult.error) {
      return fail("INTERNAL_ERROR", "좋아요를 해제하지 못했어요.", 500);
    }

    const updateResult = await readRecipeCount(dbClient, id);

    if (updateResult.error || !updateResult.data) {
      return fail("INTERNAL_ERROR", "좋아요 수를 갱신하지 못했어요.", 500);
    }

    const response: RecipeLikeData = {
      is_liked: false,
      like_count: clampLikeCount(updateResult.data.like_count),
    };

    return ok(response);
  }

  const insertResult = await dbClient
    .from("recipe_likes")
    .insert({
      user_id: user.id,
      recipe_id: id,
    })
    .select("id")
    .maybeSingle();

  if (isRecipeLikeUniqueConflict(insertResult.error)) {
    const currentSnapshot = await readRecipeLikeSnapshot(dbClient, id);

    if (!currentSnapshot) {
      return fail("INTERNAL_ERROR", "좋아요 상태를 확인하지 못했어요.", 500);
    }

    return ok(currentSnapshot);
  }

  if (insertResult.error) {
    return fail("INTERNAL_ERROR", "좋아요를 등록하지 못했어요.", 500);
  }

  const updateResult = await readRecipeCount(dbClient, id);

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "좋아요 수를 갱신하지 못했어요.", 500);
  }

  const response: RecipeLikeData = {
    is_liked: true,
    like_count: clampLikeCount(updateResult.data.like_count),
  };

  return ok(response);
}
