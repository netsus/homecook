import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import {
  getQaFixtureRecipeBooks,
  getQaFixtureRecipeDetail,
  isQaFixtureModeEnabled,
} from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeBookRecipeListData } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    book_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

interface RecipeBookRow {
  id: string;
  user_id: string;
}

interface RecipeBookItemRow {
  id: string;
  recipe_id: string;
  added_at: string;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[] | null;
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
  order(column: string, options: QueryOrderOption): RecipeBookItemsSelectQuery;
  then: ArrayResult<RecipeBookItemRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayResult<RecipeRow>["then"];
}

interface RecipeBooksTable {
  select(columns: string): RecipeBooksSelectQuery;
}

interface RecipeBookItemsTable {
  select(columns: string): RecipeBookItemsSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface RecipeBookRecipesDbClient {
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "recipe_book_items"): RecipeBookItemsTable;
  from(table: "recipes"): RecipesTable;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function clampLimit(value: string | null) {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function parseCursor(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function createEmptyData(): RecipeBookRecipeListData {
  return {
    items: [],
    next_cursor: null,
    has_next: false,
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { book_id: bookId } = await context.params;
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    const selectedBook = getQaFixtureRecipeBooks().books.find((book) => book.id === bookId);

    if (!selectedBook) {
      return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
    }

    const detail = getQaFixtureRecipeDetail();
    const allItems = selectedBook.recipe_count > 0
      ? [
          {
            recipe_id: detail.id,
            title: detail.title,
            thumbnail_url: detail.thumbnail_url,
            tags: detail.tags,
            added_at: new Date().toISOString(),
          },
        ]
      : [];
    const cursorIndex = cursor
      ? allItems.findIndex((item) => item.recipe_id === cursor)
      : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const pageItems = allItems.slice(startIndex, startIndex + limit);

    return ok({
      items: pageItems,
      next_cursor: null,
      has_next: false,
    } satisfies RecipeBookRecipeListData);
  }

  if (!isUuid(bookId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    RecipeBookRecipesDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "레시피북 레시피를 불러오지 못했어요."),
      500,
    );
  }

  const bookResult = await dbClient
    .from("recipe_books")
    .select("id, user_id")
    .eq("id", bookId)
    .maybeSingle();

  if (bookResult.error || !bookResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  if (bookResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 레시피북만 조회할 수 있어요.", 403);
  }

  const itemsResult = await dbClient
    .from("recipe_book_items")
    .select("id, recipe_id, added_at")
    .eq("book_id", bookId)
    .order("added_at", { ascending: false })
    .order("id", { ascending: false });

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "레시피북 레시피를 불러오지 못했어요.", 500);
  }

  if (itemsResult.data.length === 0) {
    return ok(createEmptyData());
  }

  const cursorIndex = cursor
    ? itemsResult.data.findIndex((item) => item.id === cursor)
    : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const pagedRowsWithExtra = itemsResult.data.slice(startIndex, startIndex + limit + 1);
  const hasNext = pagedRowsWithExtra.length > limit;
  const pagedRows = hasNext ? pagedRowsWithExtra.slice(0, limit) : pagedRowsWithExtra;

  if (pagedRows.length === 0) {
    return ok(createEmptyData());
  }

  const recipeIds = [...new Set(pagedRows.map((row) => row.recipe_id))];
  const recipesResult = await dbClient
    .from("recipes")
    .select("id, title, thumbnail_url, tags")
    .in("id", recipeIds);

  if (recipesResult.error || !recipesResult.data) {
    return fail("INTERNAL_ERROR", "레시피북 레시피를 불러오지 못했어요.", 500);
  }

  const recipeMap = new Map<string, RecipeRow>();
  recipesResult.data.forEach((recipe) => {
    recipeMap.set(recipe.id, recipe);
  });

  return ok({
    items: pagedRows.map((row) => {
      const recipe = recipeMap.get(row.recipe_id);

      return {
        recipe_id: row.recipe_id,
        title: recipe?.title ?? "",
        thumbnail_url: recipe?.thumbnail_url ?? null,
        tags: recipe?.tags ?? [],
        added_at: row.added_at,
      };
    }),
    next_cursor: hasNext ? pagedRows[pagedRows.length - 1]?.id ?? null : null,
    has_next: hasNext,
  } satisfies RecipeBookRecipeListData);
}
