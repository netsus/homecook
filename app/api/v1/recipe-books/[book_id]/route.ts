import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  RecipeBookCoverColorKey,
  RecipeBookDeleteData,
  RecipeBookUpdateBody,
  RecipeBookUpdateData,
  RecipeBookType,
} from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    book_id: string;
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

interface RecipeBookUpdatedRow {
  id: string;
  name: string;
  book_type: "custom";
  sort_order: number;
  cover_color_key?: RecipeBookCoverColorKey | null;
  cover_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

interface RecipeBookItemRow {
  book_id: string;
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

interface RecipeBookUpdateValues {
  name?: string;
  cover_color_key?: RecipeBookCoverColorKey | null;
  cover_image_url?: string | null;
  updated_at: string;
}

interface RecipeBooksUpdateQuery {
  eq(column: string, value: string): RecipeBooksUpdateQuery;
  select(columns: string): RecipeBooksUpdateQuery;
  maybeSingle(): MaybeSingleResult<RecipeBookUpdatedRow>;
}

interface RecipeBooksDeleteQuery {
  eq(column: string, value: string): RecipeBooksDeleteQuery;
  then: ArrayResult<unknown>["then"];
}

interface RecipeBookItemsDeleteQuery {
  eq(column: string, value: string): RecipeBookItemsDeleteQuery;
  then: ArrayResult<unknown>["then"];
}

interface RecipeBookItemsSelectQuery {
  eq(column: string, value: string): RecipeBookItemsSelectQuery;
  then: ArrayResult<RecipeBookItemRow>["then"];
}

interface RecipeBooksTable {
  select(columns: string): RecipeBooksSelectQuery;
  update(values: RecipeBookUpdateValues): RecipeBooksUpdateQuery;
  delete(): RecipeBooksDeleteQuery;
}

interface RecipeBookItemsTable {
  select(columns: string): RecipeBookItemsSelectQuery;
  delete(): RecipeBookItemsDeleteQuery;
}

interface RecipeBookDetailDbClient {
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "recipe_book_items"): RecipeBookItemsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeBookName(name: unknown) {
  return typeof name === "string" ? name.trim() : "";
}

const RECIPE_BOOK_COVER_COLORS = [
  "sage",
  "sky",
  "coral",
  "lavender",
  "sand",
] as const satisfies readonly RecipeBookCoverColorKey[];

function isRecipeBookCoverColorKey(value: unknown): value is RecipeBookCoverColorKey {
  return typeof value === "string"
    && RECIPE_BOOK_COVER_COLORS.includes(value as RecipeBookCoverColorKey);
}

function normalizeOptionalCoverImageUrl(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > 2048) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return trimmed;
}

async function requireCustomBook({
  dbClient,
  bookId,
  userId,
}: {
  dbClient: RecipeBookDetailDbClient;
  bookId: string;
  userId: string;
}) {
  const bookResult = await dbClient
    .from("recipe_books")
    .select("id, user_id, book_type")
    .eq("id", bookId)
    .maybeSingle();

  if (bookResult.error || !bookResult.data) {
    return {
      response: fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404),
      book: null,
    };
  }

  if (bookResult.data.user_id !== userId) {
    return {
      response: fail("FORBIDDEN", "내 레시피북만 수정할 수 있어요.", 403),
      book: null,
    };
  }

  if (bookResult.data.book_type !== "custom") {
    return {
      response: fail("FORBIDDEN", "시스템 레시피북은 수정할 수 없어요.", 403),
      book: null,
    };
  }

  return {
    response: null,
    book: bookResult.data,
  };
}

async function createAuthedDbClient() {
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
    RecipeBookDetailDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return {
      response: fail(
        "INTERNAL_ERROR",
        formatBootstrapErrorMessage(bootstrapError, "레시피북을 수정하지 못했어요."),
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

export async function PATCH(request: Request, context: RouteContext) {
  const { book_id: bookId } = await context.params;

  if (!isUuid(bookId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  let body: RecipeBookUpdateBody;

  try {
    body = (await request.json()) as RecipeBookUpdateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const hasName = Object.prototype.hasOwnProperty.call(body, "name");
  const hasCoverColorKey = Object.prototype.hasOwnProperty.call(body, "cover_color_key");
  const hasCoverImageUrl = Object.prototype.hasOwnProperty.call(body, "cover_image_url");
  const name = hasName ? normalizeBookName(body.name) : undefined;

  if (hasName && !name) {
    return fail("VALIDATION_ERROR", "레시피북 이름을 입력해 주세요.", 422, [
      { field: "name", reason: "required" },
    ]);
  }

  if (name && name.length > 50) {
    return fail("VALIDATION_ERROR", "레시피북 이름은 50자를 넘길 수 없어요.", 422, [
      { field: "name", reason: "max_length" },
    ]);
  }

  if (
    hasCoverColorKey
    && body.cover_color_key !== null
    && !isRecipeBookCoverColorKey(body.cover_color_key)
  ) {
    return fail("VALIDATION_ERROR", "레시피북 색상을 확인해 주세요.", 422, [
      { field: "cover_color_key", reason: "invalid_enum" },
    ]);
  }

  const coverImageUrl = hasCoverImageUrl
    ? normalizeOptionalCoverImageUrl(body.cover_image_url)
    : undefined;

  if (hasCoverImageUrl && coverImageUrl === undefined) {
    return fail("VALIDATION_ERROR", "커버 이미지 주소를 확인해 주세요.", 422, [
      { field: "cover_image_url", reason: "invalid_url" },
    ]);
  }

  if (!hasName && !hasCoverColorKey && !hasCoverImageUrl) {
    return fail("VALIDATION_ERROR", "수정할 값을 입력해 주세요.", 422, [
      { field: "body", reason: "required" },
    ]);
  }

  const auth = await createAuthedDbClient();

  if (auth.response || !auth.dbClient || !auth.user) {
    return auth.response;
  }

  const customBook = await requireCustomBook({
    dbClient: auth.dbClient,
    bookId,
    userId: auth.user.id,
  });

  if (customBook.response) {
    return customBook.response;
  }

  const itemsResult = await auth.dbClient
    .from("recipe_book_items")
    .select("book_id")
    .eq("book_id", bookId);

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "레시피북을 수정하지 못했어요.", 500);
  }

  const updates: RecipeBookUpdateValues = {
    updated_at: new Date().toISOString(),
  };

  if (name) {
    updates.name = name;
  }

  if (hasCoverColorKey) {
    updates.cover_color_key = body.cover_color_key ?? null;
  }

  if (hasCoverImageUrl) {
    updates.cover_image_url = coverImageUrl ?? null;
  }

  const updateResult = await auth.dbClient
    .from("recipe_books")
    .update(updates)
    .eq("id", bookId)
    .select("id, name, book_type, sort_order, cover_color_key, cover_image_url, created_at, updated_at")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "레시피북을 수정하지 못했어요.", 500);
  }

  return ok({
    id: updateResult.data.id,
    name: updateResult.data.name,
    book_type: "custom",
    recipe_count: itemsResult.data.length,
    sort_order: updateResult.data.sort_order,
    cover_color_key: updateResult.data.cover_color_key ?? null,
    cover_image_url: updateResult.data.cover_image_url ?? null,
    created_at: updateResult.data.created_at,
    updated_at: updateResult.data.updated_at,
  } satisfies RecipeBookUpdateData);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { book_id: bookId } = await context.params;

  if (!isUuid(bookId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피북을 찾을 수 없어요.", 404);
  }

  const auth = await createAuthedDbClient();

  if (auth.response || !auth.dbClient || !auth.user) {
    return auth.response;
  }

  const customBook = await requireCustomBook({
    dbClient: auth.dbClient,
    bookId,
    userId: auth.user.id,
  });

  if (customBook.response) {
    return customBook.response;
  }

  const itemDeleteResult = await auth.dbClient
    .from("recipe_book_items")
    .delete()
    .eq("book_id", bookId);

  if (itemDeleteResult.error) {
    return fail("INTERNAL_ERROR", "레시피북을 삭제하지 못했어요.", 500);
  }

  const bookDeleteResult = await auth.dbClient
    .from("recipe_books")
    .delete()
    .eq("id", bookId);

  if (bookDeleteResult.error) {
    return fail("INTERNAL_ERROR", "레시피북을 삭제하지 못했어요.", 500);
  }

  return ok({ deleted: true } satisfies RecipeBookDeleteData);
}
