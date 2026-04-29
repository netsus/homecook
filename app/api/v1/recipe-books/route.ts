import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { readQaFixtureFaultsHeader } from "@/lib/mock/qa-fixture-overrides";
import {
  createQaFixtureRecipeBook,
  getQaFixtureRecipeBooks,
  isQaFixtureModeEnabled,
} from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  RecipeBookCreateBody,
  RecipeBookCreateData,
  RecipeBookListData,
  RecipeBookType,
} from "@/types/recipe";

interface QueryError {
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

interface RecipeBookRow {
  id: string;
  name: string;
  book_type: RecipeBookType;
  sort_order: number;
}

interface RecipeBookItemRow {
  book_id: string;
}

interface RecipeLikeRow {
  recipe_id: string;
}

interface UserRecipeRow {
  id: string;
}

interface RecipeBookSortOrderRow {
  sort_order: number;
}

interface RecipeBookCreateRow {
  id: string;
  name: string;
  book_type: "custom";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleQueryResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface RecipeBooksSelectQuery {
  eq(column: string, value: string): RecipeBooksSelectQuery;
  in(column: string, values: string[]): RecipeBooksSelectQuery;
  order(column: string, options: QueryOrderOption): RecipeBooksSelectQuery;
  limit(value: number): RecipeBooksSelectQuery;
  then: ArrayQueryResult<RecipeBookRow>["then"];
}

interface RecipeBookItemsSelectQuery {
  in(column: string, values: string[]): RecipeBookItemsSelectQuery;
  then: ArrayQueryResult<RecipeBookItemRow>["then"];
}

interface RecipeLikesSelectQuery {
  eq(column: string, value: string): RecipeLikesSelectQuery;
  then: ArrayQueryResult<RecipeLikeRow>["then"];
}

interface RecipesSelectQuery {
  eq(column: string, value: string): RecipesSelectQuery;
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayQueryResult<UserRecipeRow>["then"];
}

interface RecipeBookSortOrderSelectQuery {
  eq(column: string, value: string): RecipeBookSortOrderSelectQuery;
  order(column: string, options: QueryOrderOption): RecipeBookSortOrderSelectQuery;
  limit(value: number): RecipeBookSortOrderSelectQuery;
  then: ArrayQueryResult<RecipeBookSortOrderRow>["then"];
}

interface RecipeBooksInsertQuery {
  select(columns: string): RecipeBooksInsertQuery;
  maybeSingle(): MaybeSingleQueryResult<RecipeBookCreateRow>;
}

interface RecipeBooksTable {
  select(columns: string): RecipeBooksSelectQuery | RecipeBookSortOrderSelectQuery;
  insert(values: {
    user_id: string;
    name: string;
    book_type: "custom";
    sort_order: number;
  }): RecipeBooksInsertQuery;
}

interface RecipeBookItemsTable {
  select(columns: string): RecipeBookItemsSelectQuery;
}

interface RecipeLikesTable {
  select(columns: string): RecipeLikesSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface RecipeBookDbClient {
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "recipe_book_items"): RecipeBookItemsTable;
  from(table: "recipe_likes"): RecipeLikesTable;
  from(table: "recipes"): RecipesTable;
}

function normalizeBookName(name: unknown) {
  return typeof name === "string" ? name.trim() : "";
}

function getCurrentMaxSortOrder(rows: RecipeBookSortOrderRow[] | null) {
  if (!rows || rows.length === 0) {
    return -1;
  }

  return rows.reduce((maxValue, row) => Math.max(maxValue, row.sort_order), -1);
}

function toRecipeBookListData({
  books,
  items,
  likes,
  userRecipes,
}: {
  books: RecipeBookRow[];
  items: RecipeBookItemRow[];
  likes: RecipeLikeRow[];
  userRecipes: UserRecipeRow[];
}): RecipeBookListData {
  const countByBookId = new Map<string, number>();

  items.forEach((item) => {
    countByBookId.set(item.book_id, (countByBookId.get(item.book_id) ?? 0) + 1);
  });

  return {
    books: books
      .map((book) => ({
        id: book.id,
        name: book.name,
        book_type: book.book_type,
        recipe_count: getRecipeBookCount({
          book,
          countByBookId,
          likedCount: likes.length,
          myAddedCount: userRecipes.length,
        }),
        sort_order: book.sort_order,
      })),
  };
}

function getRecipeBookCount({
  book,
  countByBookId,
  likedCount,
  myAddedCount,
}: {
  book: RecipeBookRow;
  countByBookId: Map<string, number>;
  likedCount: number;
  myAddedCount: number;
}) {
  if (book.book_type === "my_added") {
    return myAddedCount;
  }

  if (book.book_type === "liked") {
    return likedCount;
  }

  return countByBookId.get(book.id) ?? 0;
}

async function createAuthedRecipeBookDbClient(fallbackMessage: string) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      dbClient: null,
      user: null,
    };
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    RecipeBookDbClient & UserBootstrapDbClient;

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
      dbClient: null,
      user: null,
    };
  }

  return {
    response: null,
    dbClient,
    user,
  };
}

export async function GET(request: Request) {
  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);
    const faultOverrides = readQaFixtureFaultsHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    if (faultOverrides?.recipe_books_list === "internal_error") {
      return fail("INTERNAL_ERROR", "레시피북 목록을 불러오지 못했어요.", 500);
    }

    return ok(getQaFixtureRecipeBooks());
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    RecipeBookDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "레시피북 목록을 불러오지 못했어요."),
      500,
    );
  }

  const booksQuery = dbClient
    .from("recipe_books")
    .select("id, name, book_type, sort_order") as RecipeBooksSelectQuery;
  const booksResult = await booksQuery
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (booksResult.error || !booksResult.data) {
    return fail("INTERNAL_ERROR", "레시피북 목록을 불러오지 못했어요.", 500);
  }

  if (booksResult.data.length === 0) {
    return ok({ books: [] } satisfies RecipeBookListData);
  }

  const countedBookIds = booksResult.data
    .filter((book: RecipeBookRow) => book.book_type === "saved" || book.book_type === "custom")
    .map((book: RecipeBookRow) => book.id);
  const itemsResult = await dbClient
    .from("recipe_book_items")
    .select("book_id")
    .in("book_id", countedBookIds);

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "레시피북 목록을 불러오지 못했어요.", 500);
  }

  const likesResult = await dbClient
    .from("recipe_likes")
    .select("recipe_id")
    .eq("user_id", user.id);

  if (likesResult.error || !likesResult.data) {
    return fail("INTERNAL_ERROR", "레시피북 목록을 불러오지 못했어요.", 500);
  }

  const userRecipesResult = await dbClient
    .from("recipes")
    .select("id")
    .eq("created_by", user.id)
    .in("source_type", ["youtube", "manual"]);

  if (userRecipesResult.error || !userRecipesResult.data) {
    return fail("INTERNAL_ERROR", "레시피북 목록을 불러오지 못했어요.", 500);
  }

  return ok(toRecipeBookListData({
    books: booksResult.data,
    items: itemsResult.data,
    likes: likesResult.data,
    userRecipes: userRecipesResult.data,
  }));
}

export async function POST(request: Request) {
  const qaFixtureMode = isQaFixtureModeEnabled();
  let auth: Awaited<ReturnType<typeof createAuthedRecipeBookDbClient>> | null = null;

  if (qaFixtureMode) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }
  } else {
    auth = await createAuthedRecipeBookDbClient("레시피북을 만들지 못했어요.");

    if (auth.response || !auth.dbClient || !auth.user) {
      return auth.response;
    }
  }

  let body: RecipeBookCreateBody;

  try {
    body = (await request.json()) as RecipeBookCreateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const normalizedName = normalizeBookName(body.name);

  if (!normalizedName) {
    return fail("VALIDATION_ERROR", "레시피북 이름을 입력해주세요.", 422, [
      { field: "name", reason: "required" },
    ]);
  }

  if (normalizedName.length > 50) {
    return fail("VALIDATION_ERROR", "레시피북 이름은 50자를 넘길 수 없어요.", 422, [
      { field: "name", reason: "max_length" },
    ]);
  }

  if (qaFixtureMode) {
    const faultOverrides = readQaFixtureFaultsHeader(request.headers);

    if (faultOverrides?.recipe_books_create === "internal_error") {
      return fail("INTERNAL_ERROR", "레시피북을 만들지 못했어요.", 500);
    }

    return ok(createQaFixtureRecipeBook(normalizedName), { status: 201 });
  }

  if (!auth?.dbClient || !auth.user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const latestSortQuery = auth.dbClient
    .from("recipe_books")
    .select("sort_order") as RecipeBookSortOrderSelectQuery;
  const latestSortResult = await latestSortQuery
    .eq("user_id", auth.user.id)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (latestSortResult.error) {
    return fail("INTERNAL_ERROR", "레시피북을 만들지 못했어요.", 500);
  }

  const nextSortOrder = getCurrentMaxSortOrder(latestSortResult.data) + 1;
  const createResult = await auth.dbClient
    .from("recipe_books")
    .insert({
      user_id: auth.user.id,
      name: normalizedName,
      book_type: "custom",
      sort_order: nextSortOrder,
    })
    .select("id, name, book_type, sort_order, created_at, updated_at")
    .maybeSingle();

  if (createResult.error || !createResult.data) {
    return fail("INTERNAL_ERROR", "레시피북을 만들지 못했어요.", 500);
  }

  const responseData: RecipeBookCreateData = {
    id: createResult.data.id,
    name: createResult.data.name,
    book_type: "custom",
    recipe_count: 0,
    sort_order: createResult.data.sort_order,
    created_at: createResult.data.created_at,
    updated_at: createResult.data.updated_at,
  };

  return ok(responseData, { status: 201 });
}
