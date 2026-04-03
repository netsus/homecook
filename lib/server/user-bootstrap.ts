import type { User } from "@supabase/supabase-js";

interface QueryError {
  code?: string;
  message: string;
}

type MaybeSingleQueryResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface UserRow {
  id: string;
  nickname: string;
  email: string | null;
  profile_image_url: string | null;
  settings_json: Record<string, unknown> | null;
}

interface UsersSelectQuery {
  eq(column: string, value: string): UsersSelectQuery;
  maybeSingle(): MaybeSingleQueryResult<UserRow>;
}

interface UsersInsertQuery {
  select(columns: string): UsersInsertQuery;
  maybeSingle(): MaybeSingleQueryResult<UserRow>;
}

interface UsersUpdateQuery {
  eq(column: string, value: string): UsersUpdateQuery;
  select(columns: string): UsersUpdateQuery;
  maybeSingle(): MaybeSingleQueryResult<UserRow>;
}

interface UsersTable {
  select(columns: string): UsersSelectQuery;
  insert(values: {
    id: string;
    nickname: string;
    email: string | null;
    profile_image_url: string | null;
    social_provider: "kakao" | "naver" | "google";
    social_id: string | null;
    settings_json: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    deleted_at: null;
  }): UsersInsertQuery;
  update(values: Partial<{
    nickname: string;
    email: string | null;
    profile_image_url: string | null;
    settings_json: Record<string, unknown>;
    updated_at: string;
  }>): UsersUpdateQuery;
}

interface RecipeBookRow {
  id: string;
  name: string;
  book_type: string;
  sort_order: number;
}

interface RecipeBooksSelectQuery {
  eq(column: string, value: string): RecipeBooksSelectQuery;
  order(column: string, options: QueryOrderOption): RecipeBooksSelectQuery;
  then: ArrayQueryResult<RecipeBookRow>["then"];
}

interface RecipeBooksInsertQuery {
  select(columns: string): RecipeBooksInsertQuery;
  maybeSingle(): MaybeSingleQueryResult<RecipeBookRow>;
}

interface RecipeBooksTable {
  select(columns: string): RecipeBooksSelectQuery;
  insert(values: {
    id: string;
    user_id: string;
    name: string;
    book_type: "my_added" | "saved" | "liked";
    sort_order: number;
    created_at: string;
    updated_at: string;
  }): RecipeBooksInsertQuery;
}

interface PlannerColumnRow {
  id: string;
  name: string;
  sort_order: number;
}

interface PlannerColumnsSelectQuery {
  eq(column: string, value: string): PlannerColumnsSelectQuery;
  order(column: string, options: QueryOrderOption): PlannerColumnsSelectQuery;
  then: ArrayQueryResult<PlannerColumnRow>["then"];
}

interface PlannerColumnsInsertQuery {
  select(columns: string): PlannerColumnsInsertQuery;
  maybeSingle(): MaybeSingleQueryResult<PlannerColumnRow>;
}

interface PlannerColumnsTable {
  select(columns: string): PlannerColumnsSelectQuery;
  insert(values: {
    id: string;
    user_id: string;
    name: string;
    sort_order: number;
    created_at: string;
  }): PlannerColumnsInsertQuery;
}

export interface UserBootstrapDbClient {
  from(table: "users"): UsersTable;
  from(table: "recipe_books"): RecipeBooksTable;
  from(table: "meal_plan_columns"): PlannerColumnsTable;
}

export const USER_BOOTSTRAP_VERSION = 1;

const USER_BOOTSTRAP_VERSION_KEY = "user_bootstrap_version";
const DEFAULT_RECIPE_BOOKS = [
  { name: "내가 추가한 레시피", book_type: "my_added" as const, sort_order: 0 },
  { name: "저장한 레시피", book_type: "saved" as const, sort_order: 1 },
  { name: "좋아요한 레시피", book_type: "liked" as const, sort_order: 2 },
];
const DEFAULT_PLANNER_COLUMNS = [
  { name: "아침", sort_order: 0 },
  { name: "점심", sort_order: 1 },
  { name: "저녁", sort_order: 2 },
];

function normalizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function normalizeNickname(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeProfileImage(user: Pick<User, "user_metadata">) {
  const metadata = normalizeMetadata(user.user_metadata);
  const image = metadata.avatar_url ?? metadata.picture;

  return typeof image === "string" ? image : null;
}

function normalizeProvider(user: Pick<User, "app_metadata" | "user_metadata">) {
  const appMetadata = normalizeMetadata(user.app_metadata);
  const userMetadata = normalizeMetadata(user.user_metadata);
  const provider = appMetadata.provider ?? userMetadata.provider;

  if (provider === "kakao" || provider === "naver" || provider === "google") {
    return provider;
  }

  return "google";
}

function normalizeSocialId(user: Pick<User, "id" | "user_metadata">) {
  const metadata = normalizeMetadata(user.user_metadata);
  const socialId = metadata.sub ?? metadata.provider_id;

  if (typeof socialId === "string" && socialId.length > 0) {
    return socialId;
  }

  return user.id;
}

function normalizeSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return { ...(value as Record<string, unknown>) };
}

function getBootstrapVersion(settings: Record<string, unknown>) {
  const rawValue = settings[USER_BOOTSTRAP_VERSION_KEY];

  return typeof rawValue === "number" && Number.isFinite(rawValue)
    ? rawValue
    : 0;
}

function isDuplicateKeyConflict(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}

async function readUserRow(dbClient: UserBootstrapDbClient, userId: string) {
  const result = await dbClient
    .from("users")
    .select("id, nickname, email, profile_image_url, settings_json")
    .eq("id", userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data;
}

async function listRecipeBooks(dbClient: UserBootstrapDbClient, userId: string) {
  const result = await dbClient
    .from("recipe_books")
    .select("id, name, book_type, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

async function listPlannerColumns(dbClient: UserBootstrapDbClient, userId: string) {
  const result = await dbClient
    .from("meal_plan_columns")
    .select("id, name, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ?? [];
}

function getNextSortOrder(rows: Array<{ sort_order: number }>) {
  if (rows.length === 0) {
    return 0;
  }

  return rows.reduce((maxValue, row) => Math.max(maxValue, row.sort_order), -1) + 1;
}

export function formatBootstrapErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    if (
      error.message.includes("schema cache")
      || error.message.includes("Could not find the table 'public.")
      || error.message.includes("relation")
    ) {
      return "Supabase 스키마가 준비되지 않았어요. 마이그레이션을 먼저 적용해주세요.";
    }
  }

  return fallbackMessage;
}

export async function ensurePublicUserRow(
  dbClient: UserBootstrapDbClient,
  user: Pick<User, "id" | "email" | "app_metadata" | "user_metadata">,
) {
  const existingRow = await readUserRow(dbClient, user.id);

  if (existingRow) {
    return existingRow;
  }

  const now = new Date().toISOString();
  const insertResult = await dbClient
    .from("users")
    .insert({
      id: user.id,
      nickname: normalizeNickname(normalizeMetadata(user.user_metadata).nickname),
      email: user.email ?? null,
      profile_image_url: normalizeProfileImage(user),
      social_provider: normalizeProvider(user),
      social_id: normalizeSocialId(user),
      settings_json: {},
      created_at: now,
      updated_at: now,
      deleted_at: null,
    })
    .select("id, nickname, email, profile_image_url, settings_json")
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    throw new Error(insertResult.error?.message ?? "users row insert failed");
  }

  return insertResult.data;
}

export async function ensureUserBootstrapState(
  dbClient: UserBootstrapDbClient,
  userId: string,
) {
  const userRow = await readUserRow(dbClient, userId);

  if (!userRow) {
    throw new Error("public.users row is missing");
  }

  const settings = normalizeSettings(userRow.settings_json);

  if (getBootstrapVersion(settings) >= USER_BOOTSTRAP_VERSION) {
    return userRow;
  }

  const currentBooks = await listRecipeBooks(dbClient, userId);
  let nextBookSortOrder = getNextSortOrder(currentBooks);

  for (const defaultBook of DEFAULT_RECIPE_BOOKS) {
    const existing = currentBooks.find((book) => book.book_type === defaultBook.book_type);

    if (existing) {
      continue;
    }

    const createResult = await dbClient
      .from("recipe_books")
      .insert({
        id: crypto.randomUUID(),
        user_id: userId,
        name: defaultBook.name,
        book_type: defaultBook.book_type,
        sort_order: currentBooks.length === 0 ? defaultBook.sort_order : nextBookSortOrder,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id, name, book_type, sort_order")
      .maybeSingle();

    if (!isDuplicateKeyConflict(createResult.error) && (createResult.error || !createResult.data)) {
      throw new Error(createResult.error?.message ?? "recipe_books insert failed");
    }

    if (createResult.data) {
      currentBooks.push(createResult.data);
      nextBookSortOrder = getNextSortOrder(currentBooks);
    }
  }

  const currentColumns = await listPlannerColumns(dbClient, userId);

  if (currentColumns.length === 0) {
    for (const defaultColumn of DEFAULT_PLANNER_COLUMNS) {
      const createResult = await dbClient
        .from("meal_plan_columns")
        .insert({
          id: crypto.randomUUID(),
          user_id: userId,
          name: defaultColumn.name,
          sort_order: defaultColumn.sort_order,
          created_at: new Date().toISOString(),
        })
        .select("id, name, sort_order")
        .maybeSingle();

      if (createResult.error || !createResult.data) {
        throw new Error(createResult.error?.message ?? "meal_plan_columns insert failed");
      }
    }
  }

  const updateResult = await dbClient
    .from("users")
    .update({
      settings_json: {
        ...settings,
        [USER_BOOTSTRAP_VERSION_KEY]: USER_BOOTSTRAP_VERSION,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, nickname, email, profile_image_url, settings_json")
    .maybeSingle();

  if (updateResult.error || !updateResult.data) {
    throw new Error(updateResult.error?.message ?? "users settings update failed");
  }

  return updateResult.data;
}
