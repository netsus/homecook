import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import {
  getQaFixtureRecipeBooks,
  getQaFixtureRecipeDetail,
  isQaFixtureModeEnabled,
} from "@/lib/mock/recipes";
import {
  normalizeRecipeIngredients,
  normalizeRecipeSteps,
} from "@/lib/recipe-detail";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  recordUserGrowthActivityEvent,
  type UserGrowthActivityDbClient,
} from "@/lib/server/user-growth-activity";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  RecipeBookDeleteData,
  RecipeBookReaderRecipeData,
  RecipeBookType,
  RecipeIngredient,
  RecipeStep,
} from "@/types/recipe";

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
  added_at?: string | null;
}

interface RecipeCountRow {
  id: string;
  like_count?: number;
  save_count?: number;
}

interface RecipeReaderRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  view_count: number | null;
  base_servings: number | null;
  created_by: string | null;
  source_type: "system" | "youtube" | "manual";
}

interface RecipeIngredientRow {
  id: string;
  ingredient_id: string;
  amount: number | string | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  component_label?: string | null;
  scalable: boolean;
  sort_order: number;
  ingredients:
    | { standard_name?: string | null }
    | Array<{ standard_name?: string | null }>
    | null;
}

interface RecipeStepRow {
  id: string;
  step_number: number;
  instruction: string;
  component_label?: string | null;
  ingredients_used: RecipeStep["ingredients_used"] | null;
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
  cooking_methods: RecipeStep["cooking_method"] | RecipeStep["cooking_method"][];
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

interface RecipesSelectQuery {
  eq(column: string, value: string): RecipesSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeReaderRow>;
}

interface RecipeIngredientsSelectQuery {
  eq(column: string, value: string): RecipeIngredientsSelectQuery;
  order(column: string, options: { ascending: boolean }): RecipeIngredientsSelectQuery;
  then: ArrayResult<RecipeIngredientRow>["then"];
}

interface RecipeStepsSelectQuery {
  eq(column: string, value: string): RecipeStepsSelectQuery;
  order(column: string, options: { ascending: boolean }): RecipeStepsSelectQuery;
  then: ArrayResult<RecipeStepRow>["then"];
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
  select(columns: string): RecipesSelectQuery;
  update(values: { like_count?: number; save_count?: number }): RecipesUpdateQuery;
}

interface RecipeIngredientsTable {
  select(columns: string): RecipeIngredientsSelectQuery;
}

interface RecipeStepsTable {
  select(columns: string): RecipeStepsSelectQuery;
}

interface RecipeBookRecipeRemoveDbClient {
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "recipe_book_items"): RecipeBookItemsTable;
  from(table: "recipe_likes"): RecipeLikesTable;
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "recipe_steps"): RecipeStepsTable;
}

type RecipeBookRecipeRemoveAuthedDbClient =
  RecipeBookRecipeRemoveDbClient & UserBootstrapDbClient & UserGrowthActivityDbClient;

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function formatDurationText(totalSeconds: number | null) {
  if (totalSeconds === null) {
    return null;
  }

  const minutes = Math.max(1, Math.round(totalSeconds / 60));
  return `${minutes}분`;
}

function sumStepDurationSeconds(steps: RecipeStep[]) {
  let hasDuration = false;
  const total = steps.reduce((sum, step) => {
    if (typeof step.duration_seconds !== "number") {
      return sum;
    }

    hasDuration = true;
    return sum + step.duration_seconds;
  }, 0);

  return hasDuration ? total : null;
}

function mapReaderData({
  recipe,
  addedAt,
  ingredients,
  steps,
}: {
  recipe: RecipeReaderRow;
  addedAt: string | null;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}): RecipeBookReaderRecipeData {
  const totalDurationSeconds = sumStepDurationSeconds(steps);

  return {
    recipe_id: recipe.id,
    title: recipe.title,
    thumbnail_url: recipe.thumbnail_url,
    tags: recipe.tags ?? [],
    view_count: recipe.view_count ?? 0,
    total_duration_seconds: totalDurationSeconds,
    total_duration_text: formatDurationText(totalDurationSeconds),
    base_servings: recipe.base_servings ?? 1,
    added_at: addedAt ?? "",
    ingredients,
    steps,
  };
}

function mapQaFixtureReaderData(addedAt: string | null): RecipeBookReaderRecipeData {
  const detail = getQaFixtureRecipeDetail();
  const totalDurationSeconds = sumStepDurationSeconds(detail.steps);

  return {
    recipe_id: detail.id,
    title: detail.title,
    thumbnail_url: detail.thumbnail_url,
    tags: detail.tags,
    view_count: detail.view_count,
    total_duration_seconds: totalDurationSeconds,
    total_duration_text: formatDurationText(totalDurationSeconds),
    base_servings: detail.base_servings,
    added_at: addedAt ?? new Date().toISOString(),
    ingredients: detail.ingredients,
    steps: detail.steps,
  };
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

async function readBookRecipeMembership({
  dbClient,
  book,
  recipeId,
  userId,
}: {
  dbClient: RecipeBookRecipeRemoveDbClient;
  book: RecipeBookRow;
  recipeId: string;
  userId: string;
}) {
  if (book.book_type === "liked") {
    const likeResult = await dbClient
      .from("recipe_likes")
      .select("id")
      .eq("user_id", userId)
      .eq("recipe_id", recipeId)
      .maybeSingle();

    return {
      belongs: !likeResult.error && Boolean(likeResult.data),
      addedAt: null,
      error: likeResult.error,
    };
  }

  if (book.book_type === "saved" || book.book_type === "custom") {
    const itemResult = await dbClient
      .from("recipe_book_items")
      .select("id, added_at")
      .eq("book_id", book.id)
      .eq("recipe_id", recipeId)
      .maybeSingle();

    return {
      belongs: !itemResult.error && Boolean(itemResult.data),
      addedAt: itemResult.data?.added_at ?? null,
      error: itemResult.error,
    };
  }

  return {
    belongs: true,
    addedAt: null,
    error: null,
  };
}

async function readReaderRecipe(
  dbClient: RecipeBookRecipeRemoveDbClient,
  recipeId: string,
) {
  return dbClient
    .from("recipes")
    .select("id, title, thumbnail_url, tags, view_count, base_servings, created_by, source_type")
    .eq("id", recipeId)
    .maybeSingle();
}

async function readReaderIngredients(
  dbClient: RecipeBookRecipeRemoveDbClient,
  recipeId: string,
) {
  const result = await dbClient
    .from("recipe_ingredients")
    .select(
      "id, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name)",
    )
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });

  if (result.error || !result.data) {
    return {
      data: null,
      error: result.error ?? { message: "missing ingredient rows" },
    };
  }

  return {
    data: normalizeRecipeIngredients(result.data),
    error: null,
  };
}

async function readReaderSteps(
  dbClient: RecipeBookRecipeRemoveDbClient,
  recipeId: string,
) {
  const result = await dbClient
    .from("recipe_steps")
    .select(
      "id, step_number, instruction, component_label, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(id, code, label, color_key)",
    )
    .eq("recipe_id", recipeId)
    .order("step_number", { ascending: true });

  if (result.error || !result.data) {
    return {
      data: null,
      error: result.error ?? { message: "missing step rows" },
    };
  }

  return {
    data: normalizeRecipeSteps(result.data),
    error: null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { book_id: bookId, recipe_id: recipeId } = await context.params;

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const selectedBook = getQaFixtureRecipeBooks().books.find((book) => book.id === bookId);
    const detail = getQaFixtureRecipeDetail();

    if (!selectedBook || selectedBook.recipe_count <= 0 || detail.id !== recipeId) {
      return fail("RESOURCE_NOT_FOUND", "레시피북 또는 레시피를 찾을 수 없어요.", 404);
    }

    return ok(mapQaFixtureReaderData(new Date().toISOString()));
  }

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
      formatBootstrapErrorMessage(bootstrapError, "레시피북 레시피 상세를 불러오지 못했어요."),
      500,
    );
  }

  const bookResult = await readRecipeBook(dbClient, bookId);

  if (bookResult.error || !bookResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (bookResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 레시피북만 조회할 수 있어요.", 403);
  }

  const membershipResult = await readBookRecipeMembership({
    dbClient,
    book: bookResult.data,
    recipeId,
    userId: user.id,
  });

  if (membershipResult.error || !membershipResult.belongs) {
    return fail("RESOURCE_NOT_FOUND", "레시피북에서 레시피를 찾을 수 없어요.", 404);
  }

  const recipeResult = await readReaderRecipe(dbClient, recipeId);

  if (recipeResult.error || !recipeResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  if (
    bookResult.data.book_type === "my_added"
    && (
      recipeResult.data.created_by !== user.id
      || !["youtube", "manual"].includes(recipeResult.data.source_type)
    )
  ) {
    return fail("RESOURCE_NOT_FOUND", "레시피북에서 레시피를 찾을 수 없어요.", 404);
  }

  const [ingredientsResult, stepsResult] = await Promise.all([
    readReaderIngredients(dbClient, recipeId),
    readReaderSteps(dbClient, recipeId),
  ]);

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "레시피 재료를 불러오지 못했어요.", 500);
  }

  if (stepsResult.error || !stepsResult.data) {
    return fail("INTERNAL_ERROR", "레시피 만들기를 불러오지 못했어요.", 500);
  }

  return ok(mapReaderData({
    recipe: recipeResult.data,
    addedAt: membershipResult.addedAt,
    ingredients: ingredientsResult.data,
    steps: stepsResult.data,
  }));
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
  bookId,
  recipeId,
  userId,
}: {
  dbClient: RecipeBookRecipeRemoveAuthedDbClient;
  bookId: string;
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

  await recordRecipebookRecipeRemoved({
    dbClient,
    userId,
    bookId,
    recipeId,
    sourceTable: "recipe_likes",
    sourceId: deleteResult.data.id,
  });

  return ok({ deleted: true } satisfies RecipeBookDeleteData);
}

async function removeSavedOrCustomRecipe({
  dbClient,
  bookId,
  recipeId,
  userId,
}: {
  dbClient: RecipeBookRecipeRemoveAuthedDbClient;
  bookId: string;
  recipeId: string;
  userId: string;
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

  await recordRecipebookRecipeRemoved({
    dbClient,
    userId,
    bookId,
    recipeId,
    sourceTable: "recipe_book_items",
    sourceId: deleteResult.data.id,
  });

  return ok({ deleted: true } satisfies RecipeBookDeleteData);
}

async function recordRecipebookRecipeRemoved({
  dbClient,
  userId,
  bookId,
  recipeId,
  sourceTable,
  sourceId,
}: {
  dbClient: RecipeBookRecipeRemoveAuthedDbClient;
  userId: string;
  bookId: string;
  recipeId: string;
  sourceTable: "recipe_book_items" | "recipe_likes";
  sourceId: string;
}) {
  const removedAtMs = Date.now();

  try {
    await recordUserGrowthActivityEvent(dbClient, {
      userId,
      activityType: "recipebook_recipe_removed",
      category: "recipebook",
      sourceKey: `recipebook_recipe_removed:${userId}:${bookId}:${recipeId}:${removedAtMs}`,
      sourceTable,
      sourceId,
      sourceMeta: {
        book_id: bookId,
        recipe_id: recipeId,
        removed_item_id: sourceId,
      },
      occurredAt: new Date(removedAtMs).toISOString(),
    });
  } catch {
    // Activity history is secondary; recipebook mutation remains authoritative.
  }
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
    RecipeBookRecipeRemoveAuthedDbClient;

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
      bookId,
      recipeId,
      userId: user.id,
    });
  }

  return removeSavedOrCustomRecipe({
    dbClient,
    bookId,
    recipeId,
    userId: user.id,
  });
}
